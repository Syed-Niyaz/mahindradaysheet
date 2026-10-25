const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'daysheet.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            receipt_prefix TEXT NOT NULL,
            gstin TEXT,
            address TEXT,
            is_head_office INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL REFERENCES branches(id),
            receipt_no TEXT NOT NULL,
            receipt_date TEXT NOT NULL,
            receipt_type TEXT NOT NULL DEFAULT 'SERVICE',
            customer_name TEXT NOT NULL,
            vehicle_no TEXT,
            amount REAL NOT NULL,
            payment_mode TEXT NOT NULL,
            received_towards TEXT,
            utr_reference TEXT,
            narration TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            cancel_reason TEXT,
            source TEXT DEFAULT 'MANUAL',
            created_by TEXT DEFAULT 'Staff',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(branch_id, receipt_no, receipt_type)
        );

        CREATE TABLE IF NOT EXISTS day_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL REFERENCES branches(id),
            sheet_date TEXT NOT NULL,
            sheet_type TEXT NOT NULL DEFAULT 'SERVICE',
            opening_balance REAL DEFAULT 0,
            cash_sales REAL DEFAULT 0,
            less_vouchers REAL DEFAULT 0,
            status TEXT DEFAULT 'DRAFT',
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(branch_id, sheet_date, sheet_type)
        );

        CREATE TABLE IF NOT EXISTS day_sheet_deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_sheet_id INTEGER NOT NULL REFERENCES day_sheets(id) ON DELETE CASCADE,
            particulars TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS day_sheet_denominations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_sheet_id INTEGER NOT NULL REFERENCES day_sheets(id) ON DELETE CASCADE,
            note_label TEXT NOT NULL,
            note_value REAL NOT NULL,
            note_count INTEGER NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            user_name TEXT DEFAULT 'Accounts Staff',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS import_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            sync_type TEXT NOT NULL DEFAULT 'MANUAL_SYNC',
            total_rows INTEGER DEFAULT 0,
            inserted INTEGER DEFAULT 0,
            skipped_duplicates INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            error_details TEXT,
            receipt_details TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY NOT NULL,
            value TEXT
        );
    `);

    // Migration: add settings table if not present (safe on existing DB)
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT)`);
    } catch (e) { /* already exists */ }

    // Migration: add source column if not present (safe on existing DB)
    try {
        db.exec(`ALTER TABLE receipts ADD COLUMN source TEXT DEFAULT 'MANUAL'`);
    } catch (e) { /* column already exists — ignore */ }

    // Seed default branches if empty
    const branchCount = db.prepare('SELECT COUNT(*) as count FROM branches').get().count;
    if (branchCount === 0) {
        const ins = db.prepare(`
            INSERT INTO branches (code, name, receipt_prefix, gstin, address, is_head_office)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        ins.run('BLY', 'BALLARI', 'WSBLY-', '29AACCB6242J1ZK', 'Bellary Motors Sales Pvt. Ltd., H.O: BALLARI', 1);
        ins.run('HSP', 'HOSAPETE', 'WSHSP-', '29AACCB6242J1ZK', 'Bellary Motors Sales Pvt. Ltd., Branch: HOSAPETE', 0);
        ins.run('KDL', 'KUDLIGI', 'WSKDL-', '29AACCB6242J1ZK', 'Bellary Motors Sales Pvt. Ltd., Branch: KUDLIGI', 0);
        console.log('Seeded default branches.');
    }

    // On first run: seed from backup file if receipts table is empty
    const receiptCount = db.prepare('SELECT COUNT(*) as count FROM receipts').get().count;
    if (receiptCount === 0) {
        seedInitialBackupFile();
    }
}

/**
 * Parse date from various formats including Excel serial numbers.
 * Returns YYYY-MM-DD string.
 */
function parseDateStr(raw) {
    if (!raw && raw !== 0) return '';

    // Excel serial date number (e.g., 46317)
    if (typeof raw === 'number') {
        try {
            const d = XLSX.SSF.parse_date_code(raw);
            if (d && d.y > 1900) {
                return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
            }
        } catch (e) {}
    }

    const str = raw.toString().trim();

    // DD.MM.YYYY
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
        const [d, m, y] = str.split('.');
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // DD/MM/YYYY or MM/DD/YYYY or MM/DD/YY
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            // Assume DD/MM/YYYY (Indian format) if day > 12, else treat as MM/DD
            const first = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);
            let y = parts[2];
            if (y.length === 2) y = '20' + y;
            if (first > 12) {
                return `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            }
            return `${y}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
        }
    }
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    return str;
}

function seedInitialBackupFile() {
    const backupPath = path.join(__dirname, '..', 'Service_Data_Backup_22-10-2026.xlsx');
    if (!fs.existsSync(backupPath)) {
        console.log('No backup file found — starting with empty receipts table.');
        return;
    }
    try {
        const wb = XLSX.readFile(backupPath, { cellDates: false });
        const ws = wb.Sheets['Service Receipt Data'];
        if (!ws) { console.log('Sheet "Service Receipt Data" not found in backup.'); return; }

        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const bly = db.prepare("SELECT id FROM branches WHERE code = 'BLY'").get();
        if (!bly) return;

        const ins = db.prepare(`
            INSERT OR IGNORE INTO receipts
                (branch_id, receipt_no, receipt_date, receipt_type,
                 customer_name, vehicle_no, amount, payment_mode,
                 received_towards, utr_reference, narration, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let inserted = 0;
        db.transaction((list) => {
            for (const r of list) {
                const receiptNo = (r['SERVICE Receipt No.'] || '').toString().trim();
                if (!receiptNo) continue;
                const dateStr = parseDateStr(r['Date']) || '2026-10-22';
                const customer = (r['Customer Name'] || '').toString().trim();
                const amount   = parseFloat((r[' Amount '] || r['Amount'] || 0).toString().replace(/,/g, '')) || 0;
                const mode     = (r[' Column 6 '] || r['Payment Mode'] || 'Cash').toString().trim();
                const towards  = (r[' Column 4 '] || '').toString().trim();
                const utr      = (r['Column 8'] || '').toString().trim();
                const narr     = (r['Narration'] || '').toString().trim();
                let vehicle = '';
                const m = customer.match(/([A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4})/i);
                if (m) vehicle = m[0].replace(/\s+/g, '');
                const res = ins.run(bly.id, receiptNo, dateStr, 'SERVICE',
                    customer, vehicle, amount, mode, towards, utr, narr, 'EXCEL_SYNC');
                if (res.changes > 0) inserted++;
            }
        })(rows);

        console.log(`Auto-seeded ${inserted} receipts from Service_Data_Backup on first run.`);
    } catch (err) {
        console.error('Error seeding backup file:', err.message);
    }
}

initSchema();

// ─────────────────────────────────────────────────────────────────────────────
// Settings helpers — thin key/value store backed by the settings table
// ─────────────────────────────────────────────────────────────────────────────
function getSetting(key, defaultValue = null) {
    try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : defaultValue;
    } catch (e) { return defaultValue; }
}

function setSetting(key, value) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

module.exports = { db, parseDateStr, getSetting, setSetting };
