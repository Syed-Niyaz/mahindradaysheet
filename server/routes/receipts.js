const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { db, parseDateStr, getSetting, setSetting } = require('../db');
const { syncFromFile, getStatus, getActiveFilePath, setBackupFilePath } = require('../services/syncService');
const config = require('../config');

const upload = multer({ storage: multer.memoryStorage() });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/receipts/sync-status
// Returns current watcher state, last sync time, last error, etc.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sync-status', (req, res) => {
    try {
        const status = getStatus();

        // Also get last 5 import_log entries for history
        const history = db.prepare(`
            SELECT id, sync_type, total_rows, inserted, skipped_duplicates, failed,
                   started_at, completed_at, error_details
            FROM import_log
            ORDER BY id DESC LIMIT 5
        `).all();

        res.json({ success: true, ...status, history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/receipts/sync-backup
// Trigger a manual sync from the configured source file on disk.
// Optional body: { filePath: '/custom/path.xlsx' }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync-backup', (req, res) => {
    try {
        const customPath = req.body?.filePath || null;
        const result = syncFromFile('MANUAL_SYNC', customPath);

        if (!result.success && result.errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: result.errors[0],
                result,
            });
        }

        res.json({ success: true, result });
    } catch (err) {
        console.error('[/sync-backup]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/receipts/import-history
// Last 20 sync/import operations with per-receipt detail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/import-history', (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT id, source_file, sync_type, total_rows, inserted, skipped_duplicates,
                   failed, error_details, receipt_details, started_at, completed_at
            FROM import_log
            ORDER BY id DESC LIMIT 20
        `).all();

        // Parse receipt_details JSON
        const enriched = logs.map(l => ({
            ...l,
            receipt_details: l.receipt_details ? JSON.parse(l.receipt_details) : []
        }));

        res.json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/receipts  — Delete ALL receipts (with optional filters)
// Body: { confirm: 'DELETE ALL', branch_id?, date?, receipt_type? }
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/', (req, res) => {
    try {
        const { confirm, branch_id, date, receipt_type, user_name = 'Accounts Staff' } = req.body || {};

        // Safety: require explicit confirmation string
        if (confirm !== 'DELETE ALL') {
            return res.status(400).json({ success: false, error: 'Send confirm: "DELETE ALL" in body to proceed.' });
        }

        // Count what will be deleted first
        let countQuery = 'SELECT COUNT(*) as cnt FROM receipts WHERE 1=1';
        let deleteQuery = 'DELETE FROM receipts WHERE 1=1';
        const params = [];
        if (branch_id) { countQuery += ' AND branch_id = ?'; deleteQuery += ' AND branch_id = ?'; params.push(branch_id); }
        if (date)      { countQuery += ' AND receipt_date = ?'; deleteQuery += ' AND receipt_date = ?'; params.push(date); }
        if (receipt_type) { countQuery += ' AND receipt_type = ?'; deleteQuery += ' AND receipt_type = ?'; params.push(receipt_type); }

        const { cnt } = db.prepare(countQuery).get(...params);

        // Log to audit before deleting
        db.prepare(`
            INSERT INTO audit_logs (entity_type, action, details, user_name)
            VALUES ('RECEIPT', 'DELETE_ALL', ?, ?)
        `).run(JSON.stringify({ count: cnt, branch_id, date, receipt_type, confirm }), user_name);

        // Execute bulk delete
        const result = db.prepare(deleteQuery).run(...params);

        res.json({
            success: true,
            deleted: result.changes,
            message: `${result.changes} receipt(s) permanently deleted.`,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/receipts
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const { branch_id, date, receipt_type, payment_mode, search, status } = req.query;
        let query = `
            SELECT r.*, b.name as branch_name, b.code as branch_code
            FROM receipts r
            JOIN branches b ON r.branch_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (branch_id) { query += ` AND r.branch_id = ?`; params.push(branch_id); }
        if (date)      { query += ` AND r.receipt_date = ?`; params.push(date); }
        if (receipt_type) { query += ` AND r.receipt_type = ?`; params.push(receipt_type); }
        if (payment_mode) {
            if (payment_mode.toLowerCase() === 'cash') {
                query += ` AND LOWER(r.payment_mode) = 'cash'`;
            } else if (payment_mode.toLowerCase() === 'non-cash') {
                query += ` AND LOWER(r.payment_mode) != 'cash'`;
            } else {
                query += ` AND r.payment_mode = ?`; params.push(payment_mode);
            }
        }
        if (status) { query += ` AND r.status = ?`; params.push(status); }
        if (search) {
            query += ` AND (r.receipt_no LIKE ? OR r.customer_name LIKE ? OR r.vehicle_no LIKE ? OR r.received_towards LIKE ? OR r.utr_reference LIKE ?)`;
            const term = `%${search}%`;
            params.push(term, term, term, term, term);
        }

        query += ` ORDER BY r.receipt_date DESC, r.id DESC LIMIT 500`;
        const receipts = db.prepare(query).all(...params);
        res.json({ success: true, count: receipts.length, data: receipts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/receipts/next-receipt-no
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next-receipt-no', (req, res) => {
    try {
        const { branch_id, receipt_type = 'SERVICE' } = req.query;
        if (!branch_id) return res.status(400).json({ success: false, error: 'branch_id is required' });

        const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branch_id);
        if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });

        const prefix = receipt_type === 'SERVICE' ? branch.receipt_prefix : `${branch.code}-`;
        const rows = db.prepare(`
            SELECT receipt_no FROM receipts
            WHERE branch_id = ? AND receipt_type = ? AND receipt_no LIKE ?
        `).all(branch_id, receipt_type, `${prefix}%`);

        let maxNum = 0;
        for (const row of rows) {
            const n = parseInt(row.receipt_no.replace(prefix, '').trim(), 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
        }

        const nextNum = maxNum > 0 ? maxNum + 1 : (receipt_type === 'SERVICE' ? 8320 : 2700);
        res.json({ success: true, nextReceiptNo: `${prefix}${nextNum}`, prefix, lastNum: maxNum });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/receipts (Create manual receipt)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const {
            branch_id, receipt_no, receipt_date, receipt_type = 'SERVICE',
            customer_name, vehicle_no, amount, payment_mode,
            received_towards, utr_reference, created_by = 'Staff'
        } = req.body;

        if (!branch_id) return res.status(400).json({ success: false, error: 'Branch is required' });
        if (!receipt_no?.trim()) return res.status(400).json({ success: false, error: 'Receipt Number is required' });
        if (!receipt_date)    return res.status(400).json({ success: false, error: 'Receipt Date is required' });
        if (!customer_name?.trim()) return res.status(400).json({ success: false, error: 'Customer Name is required' });
        if (!amount || isNaN(amount) || Number(amount) <= 0)
            return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
        if (!payment_mode?.trim()) return res.status(400).json({ success: false, error: 'Payment Mode is required' });

        const cleanNo = receipt_no.trim();
        const dup = db.prepare(`
            SELECT id FROM receipts WHERE branch_id = ? AND receipt_no = ? AND receipt_type = ?
        `).get(branch_id, cleanNo, receipt_type);
        if (dup) return res.status(409).json({ success: false, error: `Receipt '${cleanNo}' already exists.` });

        const narration = `Received From ${customer_name.trim()} Towards ${received_towards || ''} Mode: ${payment_mode} ${utr_reference ? 'UTR: ' + utr_reference : ''} Amt: ${amount} Dated: ${receipt_date}`;

        const r = db.prepare(`
            INSERT INTO receipts
                (branch_id, receipt_no, receipt_date, receipt_type,
                 customer_name, vehicle_no, amount, payment_mode,
                 received_towards, utr_reference, narration, source, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)
        `).run(branch_id, cleanNo, receipt_date, receipt_type,
               customer_name.trim(), vehicle_no?.trim() || null,
               Number(amount), payment_mode.trim(),
               received_towards?.trim() || null, utr_reference?.trim() || null,
               narration, created_by);

        db.prepare(`
            INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
            VALUES ('RECEIPT', ?, 'CREATE', ?, ?)
        `).run(r.lastInsertRowid,
               JSON.stringify({ receipt_no: cleanNo, amount, payment_mode, customer_name }),
               created_by);

        const newR = db.prepare(`
            SELECT r.*, b.name as branch_name, b.code as branch_code
            FROM receipts r JOIN branches b ON r.branch_id = b.id WHERE r.id = ?
        `).get(r.lastInsertRowid);

        res.status(201).json({ success: true, message: 'Receipt saved. Day Sheet updated.', data: newR });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/receipts/:id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const cur = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
        if (!cur) return res.status(404).json({ success: false, error: 'Receipt not found' });
        if (cur.status === 'CANCELLED') return res.status(400).json({ success: false, error: 'Cannot edit a cancelled receipt' });

        const { customer_name = cur.customer_name, vehicle_no = cur.vehicle_no,
                amount = cur.amount, payment_mode = cur.payment_mode,
                received_towards = cur.received_towards, utr_reference = cur.utr_reference,
                receipt_date = cur.receipt_date, updated_by = 'Staff' } = req.body;

        if (isNaN(amount) || Number(amount) <= 0)
            return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });

        db.prepare(`
            UPDATE receipts SET customer_name=?, vehicle_no=?, amount=?, payment_mode=?,
                received_towards=?, utr_reference=?, receipt_date=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        `).run(customer_name.trim(), vehicle_no?.trim() || null, Number(amount),
               payment_mode.trim(), received_towards?.trim() || null,
               utr_reference?.trim() || null, receipt_date, id);

        db.prepare(`
            INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
            VALUES ('RECEIPT', ?, 'UPDATE', ?, ?)
        `).run(id, JSON.stringify({ old: cur, updated: { customer_name, amount, payment_mode } }), updated_by);

        const updated = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
        res.json({ success: true, message: 'Receipt updated.', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/receipts/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', (req, res) => {
    try {
        const { id } = req.params;
        const { reason, user_name = 'Accounts Staff' } = req.body;
        if (!reason?.trim()) return res.status(400).json({ success: false, error: 'Cancellation reason is required' });

        const cur = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
        if (!cur) return res.status(404).json({ success: false, error: 'Receipt not found' });
        if (cur.status === 'CANCELLED') return res.status(400).json({ success: false, error: 'Already cancelled' });

        db.prepare(`
            UPDATE receipts SET status='CANCELLED', cancel_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).run(reason.trim(), id);

        db.prepare(`
            INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
            VALUES ('RECEIPT', ?, 'CANCEL', ?, ?)
        `).run(id, JSON.stringify({ receipt_no: cur.receipt_no, amount: cur.amount, reason }), user_name);

        res.json({ success: true, message: `Receipt ${cur.receipt_no} cancelled.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/receipts/:id
// Permanently removes a receipt. Logs the deletion to audit_logs.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { user_name = 'Accounts Staff' } = req.body || {};

        const cur = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
        if (!cur) return res.status(404).json({ success: false, error: 'Receipt not found' });

        // Log before deleting so we keep an audit trail
        db.prepare(`
            INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
            VALUES ('RECEIPT', ?, 'DELETE', ?, ?)
        `).run(id, JSON.stringify({
            receipt_no: cur.receipt_no,
            receipt_date: cur.receipt_date,
            customer_name: cur.customer_name,
            amount: cur.amount,
            payment_mode: cur.payment_mode,
        }), user_name);

        db.prepare('DELETE FROM receipts WHERE id = ?').run(id);

        res.json({ success: true, message: `Receipt ${cur.receipt_no} permanently deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/receipts/import-excel  (existing upload-based import — kept intact)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/import-excel', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Please upload an .xlsx file' });

        const branchId = parseInt(req.body.branch_id, 10);
        if (!branchId) return res.status(400).json({ success: false, error: 'Please select a branch' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
        const ws = wb.Sheets['Service Receipt Data'] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return res.status(400).json({ success: false, error: 'No valid sheet found' });

        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        let inserted = 0, skippedDuplicates = 0, deleted = 0, updated = 0;
        const errors = [];
        const receipts = [];
        const uploadedReceiptNos = new Set();

        const checkDup = db.prepare(`
            SELECT id, amount, payment_mode, customer_name, receipt_date FROM receipts
            WHERE branch_id = ? AND receipt_no = ? AND receipt_type = ?
        `);
        const insertS = db.prepare(`
            INSERT INTO receipts
                (branch_id, receipt_no, receipt_date, receipt_type,
                 customer_name, vehicle_no, amount, payment_mode,
                 received_towards, utr_reference, narration, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXCEL_UPLOAD')
        `);
        const updateS = db.prepare(`
            UPDATE receipts
            SET amount = ?, payment_mode = ?, customer_name = ?, vehicle_no = ?,
                received_towards = ?, utr_reference = ?, narration = ?, receipt_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const deleteR = db.prepare(`DELETE FROM receipts WHERE id = ?`);

        db.transaction(() => {
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const receiptNo = (r['SERVICE Receipt No.'] || r['Receipt No'] || r['RCP NO'] || '').toString().trim();
                if (!receiptNo) continue;

                uploadedReceiptNos.add(receiptNo.toUpperCase());

                const dateRaw = r['Date'] || r['receipt_date'];
                const receiptDate = parseDateStr(dateRaw) || new Date().toISOString().split('T')[0];
                const custRaw = (r['Customer Name'] || '').toString().trim();
                const amount  = parseFloat((r[' Amount '] || r['Amount'] || 0).toString().replace(/,/g, '')) || 0;
                const mode    = (r[' Column 6 '] || r['Payment Mode'] || 'Cash').toString().trim();
                const towards = (r[' Column 4 '] || '').toString().trim();
                const utr     = (r['Column 8'] || '').toString().trim();
                const narr    = (r['Narration'] || '').toString().trim();
                let vehicle = '';
                const mv = custRaw.match(/([A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4})/i);
                if (mv) vehicle = mv[0].replace(/\s+/g, '');

                const existing = checkDup.get(branchId, receiptNo, 'SERVICE');
                if (existing) {
                    const isChanged = (
                        Math.abs(existing.amount - amount) > 0.001 ||
                        (existing.payment_mode || '').toLowerCase() !== mode.toLowerCase() ||
                        existing.customer_name !== (custRaw || 'Customer') ||
                        existing.receipt_date !== receiptDate
                    );

                    if (isChanged) {
                        updateS.run(amount, mode, custRaw || 'Customer', vehicle, towards, utr, narr, receiptDate, existing.id);
                        updated++;
                        receipts.push({ receiptNo, customer: custRaw, amount, mode, date: receiptDate, status: 'UPDATED' });
                    } else {
                        skippedDuplicates++;
                        receipts.push({ receiptNo, status: 'DUPLICATE' });
                    }
                    continue;
                }

                try {
                    insertS.run(branchId, receiptNo, receiptDate, 'SERVICE',
                        custRaw || 'Customer', vehicle, amount, mode, towards, utr, narr);
                    inserted++;
                    receipts.push({ receiptNo, customer: custRaw, amount, mode, date: receiptDate, status: 'IMPORTED' });
                } catch (e) {
                    errors.push(`Row ${i + 2}: ${e.message}`);
                    receipts.push({ receiptNo, status: 'FAILED', reason: e.message });
                }
            }

            // Mirror Deletions: Delete receipts removed from uploaded Excel sheet
            if (uploadedReceiptNos.size > 0) {
                const dbSynced = db.prepare(`
                    SELECT id, receipt_no, customer_name, amount, payment_mode, receipt_date
                    FROM receipts
                    WHERE source IN ('EXCEL_SYNC', 'EXCEL_UPLOAD')
                      AND receipt_type = 'SERVICE'
                      AND branch_id = ?
                `).all(branchId);

                for (const dbR of dbSynced) {
                    const normR = (dbR.receipt_no || '').trim().toUpperCase();
                    if (!uploadedReceiptNos.has(normR)) {
                        deleteR.run(dbR.id);
                        deleted++;
                        receipts.push({
                            receiptNo: dbR.receipt_no,
                            customer: dbR.customer_name,
                            amount: dbR.amount,
                            mode: dbR.payment_mode,
                            date: dbR.receipt_date,
                            status: 'DELETED',
                            reason: 'Row was removed from uploaded Excel sheet',
                        });

                        try {
                            db.prepare(`
                                INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
                                VALUES ('RECEIPT', ?, 'EXCEL_SYNC_DELETE', ?, 'Accounts Staff (Upload)')
                            `).run(dbR.id, `Receipt ${dbR.receipt_no} (₹${dbR.amount}) automatically deleted: row was removed from uploaded Excel sheet`);
                        } catch (e) {}
                    }
                }
            }
        })();

        // Write to import_log
        db.prepare(`
            INSERT INTO import_log
                (source_file, sync_type, total_rows, inserted, skipped_duplicates, failed, deleted, updated,
                 receipt_details, completed_at)
            VALUES (?, 'MANUAL_UPLOAD', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(req.file.originalname, rows.length, inserted, skippedDuplicates,
               errors.length, deleted, updated, JSON.stringify(receipts));

        db.prepare(`
            INSERT INTO audit_logs (entity_type, action, details, user_name)
            VALUES ('EXCEL_SYNC', 'MANUAL_UPLOAD', ?, 'Accounts Staff')
        `).run(JSON.stringify({ file: req.file.originalname, inserted, updated, deleted, skippedDuplicates }));

        res.json({
            success: true,
            totalRows: rows.length, inserted, updated, deleted, skippedDuplicates,
            errorsCount: errors.length, errors: errors.slice(0, 5),
            receipts: receipts.slice(0, 100)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/receipts/settings
// Returns current backup file path and whether it exists on disk
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
    try {
        const fs = require('fs');
        const currentPath = getActiveFilePath();
        res.json({
            success: true,
            backupFilePath: currentPath,
            fileExists: fs.existsSync(currentPath),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/receipts/settings
// Body: { backupFilePath: "C:\\path\\to\\file.xlsx" }
// Saves the new path and restarts the file watcher
// ─────────────────────────────────────────────────────────────────────────────
router.post('/settings', (req, res) => {
    try {
        const fs = require('fs');
        const { backupFilePath } = req.body;
        if (!backupFilePath || typeof backupFilePath !== 'string') {
            return res.status(400).json({ success: false, error: 'backupFilePath is required' });
        }
        const trimmed = backupFilePath.trim();
        const exists = fs.existsSync(trimmed);

        // Save to DB (persists across restarts)
        setBackupFilePath(trimmed);

        // Also log to audit
        try {
            db.prepare(`INSERT INTO audit_logs (entity_type, action, details, user_name)
                        VALUES ('SETTINGS', 'BACKUP_PATH_CHANGED', ?, 'User')`)
              .run(JSON.stringify({ newPath: trimmed, fileExists: exists }));
        } catch(e) {}

        res.json({
            success: true,
            backupFilePath: trimmed,
            fileExists: exists,
            message: exists
                ? 'Path saved. Watcher restarted on new file.'
                : 'Path saved, but file not found at that location. Check the path.',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
