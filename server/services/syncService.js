/**
 * server/services/syncService.js
 *
 * Core sync logic: reads the backup Excel file, imports new receipts,
 * detects duplicates using (branch_id, receipt_no, receipt_type),
 * and logs every sync operation to the import_log table.
 *
 * The file watcher calls syncFromFile() automatically when the source
 * file is saved. The API routes call it for manual/on-demand sync.
 */
const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { db, parseDateStr, getSetting, setSetting } = require('../db');
const config = require('../config');

// ─────────────────────────────────────────────────────────────────────────────
// Internal state for watcher
// ─────────────────────────────────────────────────────────────────────────────
let watcherActive   = false;
let lastSyncTime    = null;
let lastSyncResult  = null;
let lastSyncError   = null;
let debounceTimer   = null;
// ─────────────────────────────────────────────────────────────────────────────
// Resolve which backup file path to use.
// Priority: DB setting "backup_file_path" → config.SOURCE_FILE_PATH
// ─────────────────────────────────────────────────────────────────────────────
function getActiveFilePath() {
    return getSetting('backup_file_path') || config.SOURCE_FILE_PATH;
}

// Change the backup file path at runtime (persists to DB, restarts watcher)
function setBackupFilePath(newPath) {
    setSetting('backup_file_path', newPath);
    // Restart watcher on the new path
    stopWatcher();
    setTimeout(() => startWatcher(), 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve branch_id from Excel "Branch" cell value
// ─────────────────────────────────────────────────────────────────────────────
function resolveBranchId(branchName) {
    const code = config.BRANCH_MAP[branchName?.toString().trim().toUpperCase()]
        || config.DEFAULT_BRANCH_CODE;
    const row = db.prepare('SELECT id FROM branches WHERE code = ?').get(code);
    return row ? row.id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse a single row from the backup sheet into a clean receipt object.
// Returns null if the row should be skipped.
// ─────────────────────────────────────────────────────────────────────────────
function parseRow(r) {
    const col = config.COLUMN_MAP;

    const receiptNo = (r[col.receiptNo] || '').toString().trim();
    if (!receiptNo) return null;                  // Skip blank rows

    const dateStr   = parseDateStr(r[col.date])  || new Date().toISOString().split('T')[0];
    const customer  = (r[col.customerName]  || '').toString().trim() || 'Unknown Customer';
    const amtRaw    = (r[col.amount] || r['Amount'] || 0).toString().replace(/,/g, '').trim();
    const amount    = parseFloat(amtRaw) || 0;
    const mode      = (r[col.paymentMode]  || 'Cash').toString().trim();
    const towards   = (r[col.receivedTowards] || '').toString().trim();
    const utr       = (r[col.utrReference] || '').toString().trim();
    const narration = (r[col.narration]    || '').toString().trim();
    const branchName= (r[col.branch]       || '').toString().trim();

    // Extract vehicle number from customer name if embedded
    let vehicleNo = '';
    const vmatch = customer.match(/([A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4})/i);
    if (vmatch) vehicleNo = vmatch[0].replace(/\s+/g, '');

    return { receiptNo, dateStr, customer, amount, mode, towards, utr, narration, branchName, vehicleNo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync function — reads the Excel file and upserts into the DB.
// Returns a detailed result object.
// ─────────────────────────────────────────────────────────────────────────────
function syncFromFile(syncType = 'MANUAL_SYNC', filePath = null) {
    const sourceFile = filePath || getActiveFilePath();
    const startedAt  = new Date().toISOString();

    const result = {
        syncType,
        sourceFile,
        totalRows:        0,
        inserted:         0,
        skippedDuplicates:0,
        failed:           0,
        errors:           [],
        receipts:         [],   // per-receipt status for UI
        startedAt,
        completedAt:      null,
        success:          false,
    };

    // ── Safety: is file accessible? ─────────────────────────────────────────
    if (!fs.existsSync(sourceFile)) {
        const msg = `Source file not found: ${sourceFile}`;
        result.errors.push(msg);
        result.completedAt = new Date().toISOString();
        _logImport(result);
        lastSyncError = msg;
        return result;
    }

    // ── Read Excel ──────────────────────────────────────────────────────────
    let wb;
    try {
        wb = XLSX.readFile(sourceFile, { cellDates: false, password: '' });
    } catch (e) {
        // File might be locked by Excel — report as error but don't crash
        const msg = `Cannot read file (may be locked by Excel): ${e.message}`;
        result.errors.push(msg);
        result.completedAt = new Date().toISOString();
        _logImport(result);
        lastSyncError = msg;
        return result;
    }

    const ws = wb.Sheets[config.SOURCE_SHEET_NAME];
    if (!ws) {
        const msg = `Sheet "${config.SOURCE_SHEET_NAME}" not found in the file. Available: ${wb.SheetNames.join(', ')}`;
        result.errors.push(msg);
        result.completedAt = new Date().toISOString();
        _logImport(result);
        lastSyncError = msg;
        return result;
    }

    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    result.totalRows = rows.length;

    // ── Prepared statements ─────────────────────────────────────────────────
    const checkDup = db.prepare(`
        SELECT id, amount, payment_mode FROM receipts
        WHERE branch_id = ? AND receipt_no = ? AND receipt_type = 'SERVICE'
    `);
    const insertR = db.prepare(`
        INSERT INTO receipts
            (branch_id, receipt_no, receipt_date, receipt_type,
             customer_name, vehicle_no, amount, payment_mode,
             received_towards, utr_reference, narration, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ── Process each row inside a transaction ───────────────────────────────
    db.transaction(() => {
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const parsed = parseRow(r);

            if (!parsed) continue;   // blank row

            const branchId = resolveBranchId(parsed.branchName) ||
                             resolveBranchId(config.DEFAULT_BRANCH_CODE);

            if (!branchId) {
                result.failed++;
                result.errors.push(`Row ${i + 2}: Cannot resolve branch "${parsed.branchName}"`);
                result.receipts.push({ receiptNo: parsed.receiptNo, status: 'FAILED', reason: 'Unknown branch' });
                continue;
            }

            try {
                const existing = checkDup.get(branchId, parsed.receiptNo);

                if (existing) {
                    result.skippedDuplicates++;
                    result.receipts.push({
                        receiptNo: parsed.receiptNo,
                        customer: parsed.customer,
                        amount: parsed.amount,
                        mode: parsed.mode,
                        date: parsed.dateStr,
                        status: 'DUPLICATE',
                        reason: 'Already in system',
                    });
                } else {
                    insertR.run(
                        branchId,
                        parsed.receiptNo,
                        parsed.dateStr,
                        'SERVICE',
                        parsed.customer,
                        parsed.vehicleNo,
                        parsed.amount,
                        parsed.mode,
                        parsed.towards,
                        parsed.utr,
                        parsed.narration,
                        'EXCEL_SYNC'
                    );
                    result.inserted++;
                    result.receipts.push({
                        receiptNo: parsed.receiptNo,
                        customer: parsed.customer,
                        amount: parsed.amount,
                        mode: parsed.mode,
                        date: parsed.dateStr,
                        status: 'IMPORTED',
                    });
                }
            } catch (e) {
                result.failed++;
                result.errors.push(`Row ${i + 2} (${parsed.receiptNo}): ${e.message}`);
                result.receipts.push({
                    receiptNo: parsed.receiptNo,
                    status: 'FAILED',
                    reason: e.message,
                });
            }
        }
    })();

    result.completedAt = new Date().toISOString();
    result.success = true;

    // ── Log to DB ────────────────────────────────────────────────────────────
    _logImport(result);

    // ── Also log to audit_logs for visibility in Audit Trail tab ─────────────
    try {
        db.prepare(`
            INSERT INTO audit_logs (entity_type, action, details, user_name)
            VALUES ('EXCEL_SYNC', ?, ?, 'System (File Watcher)')
        `).run(
            syncType,
            JSON.stringify({
                file: path.basename(sourceFile),
                totalRows: result.totalRows,
                inserted: result.inserted,
                duplicates: result.skippedDuplicates,
                failed: result.failed,
            })
        );
    } catch (e) { /* non-critical */ }

    lastSyncTime   = result.completedAt;
    lastSyncResult = result;
    lastSyncError  = result.errors.length ? result.errors[result.errors.length - 1] : null;

    console.log(`[Sync] ${syncType}: ${result.inserted} new, ${result.skippedDuplicates} dupes, ${result.failed} failed from ${path.basename(sourceFile)}`);
    return result;
}

function _logImport(result) {
    try {
        db.prepare(`
            INSERT INTO import_log
                (source_file, sync_type, total_rows, inserted, skipped_duplicates, failed,
                 error_details, receipt_details, started_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            path.basename(result.sourceFile),
            result.syncType,
            result.totalRows,
            result.inserted,
            result.skippedDuplicates,
            result.failed,
            result.errors.length ? result.errors.join('\n') : null,
            JSON.stringify(result.receipts.slice(0, 500)),   // cap at 500 for DB
            result.startedAt,
            result.completedAt
        );
    } catch (e) {
        console.error('[Sync] Failed to write import_log:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// File Watcher — uses fs.watchFile for compatibility with network drives
// ─────────────────────────────────────────────────────────────────────────────
function startWatcher() {
    if (!config.WATCH_ENABLED) {
        console.log('[Watcher] Disabled via config.WATCH_ENABLED = false');
        return;
    }

    const filePath = getActiveFilePath();
    if (!fs.existsSync(filePath)) {
        console.log(`[Watcher] Source file not found yet: ${filePath}`);
        console.log('[Watcher] Will retry every 10 seconds...');
        setTimeout(() => startWatcher(), 10000);
        return;
    }

    try {
        fs.watchFile(filePath, { interval: config.WATCH_POLL_INTERVAL_MS }, (curr, prev) => {
            if (curr.mtimeMs === prev.mtimeMs) return; // no change
            // Debounce: wait for Excel to finish writing
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log(`[Watcher] Detected change in ${path.basename(filePath)} — triggering auto-sync`);
                syncFromFile('AUTO_WATCH');
            }, config.WATCH_DEBOUNCE_MS);
        });

        watcherActive = true;
        console.log(`[Watcher] ✅ Watching: ${filePath}`);
        console.log(`[Watcher] Will auto-sync ${config.WATCH_DEBOUNCE_MS}ms after each save`);
    } catch (e) {
        console.error('[Watcher] Failed to start:', e.message);
        watcherActive = false;
    }
}

function stopWatcher() {
    const filePath = getActiveFilePath();
    try {
        fs.unwatchFile(filePath);
    } catch (e) {}
    if (debounceTimer) clearTimeout(debounceTimer);
    watcherActive = false;
    console.log('[Watcher] Stopped.');
}

function getStatus() {
    const lastLog = db.prepare(
        'SELECT * FROM import_log ORDER BY id DESC LIMIT 1'
    ).get();
    return {
        watcherActive,
        sourceFile: getActiveFilePath(),
        sourceFileExists: fs.existsSync(getActiveFilePath()),
        lastSyncTime,
        lastSyncError,
        lastInserted:   lastLog?.inserted ?? null,
        lastDuplicates: lastLog?.skipped_duplicates ?? null,
        lastFailed:     lastLog?.failed ?? null,
        lastSyncType:   lastLog?.sync_type ?? null,
    };
}

module.exports = { syncFromFile, startWatcher, stopWatcher, getStatus, getActiveFilePath, setBackupFilePath };
