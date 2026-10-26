const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createBackup, listBackups, verifyBackup, backupDir } = require('../services/backupService');
const { db } = require('../db');

// GET /api/backup/list - returns list of backups
router.get('/list', (req, res) => {
    try {
        const backups = listBackups();
        res.json({ success: true, count: backups.length, backups, backupDir });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/backup/create - triggers immediate backup
router.post('/create', async (req, res) => {
    try {
        const reason = req.body?.reason || 'manual';
        const result = await createBackup(reason);
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/backup/verify/:fileName - tests backup validity
router.get('/verify/:fileName', (req, res) => {
    try {
        const check = verifyBackup(req.params.fileName);
        res.json(check);
    } catch (e) {
        res.status(500).json({ valid: false, error: e.message });
    }
});

// POST /api/backup/restore - restores from a backup
router.post('/restore', async (req, res) => {
    const { backupFile } = req.body;
    if (!backupFile) {
        return res.status(400).json({ success: false, error: 'backupFile is required' });
    }

    const check = verifyBackup(backupFile);
    if (!check.valid) {
        return res.status(400).json({ success: false, error: `Invalid backup: ${check.error}` });
    }

    try {
        // Step 1: create safety backup of current state
        await createBackup('pre_restore_safety');

        const sourceFile = path.join(backupDir, path.basename(backupFile));
        const activeDbPath = path.join(__dirname, '..', '..', 'data', 'daysheet.db');

        // Checkpoint active WAL before closing/replacing
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
        } catch (e) { /* ignore */ }

        // Use sqlite backup API in reverse: restore from source into active db
        const Database = require('better-sqlite3');
        const sourceDb = new Database(sourceFile, { readonly: true });
        await sourceDb.backup(activeDbPath);
        sourceDb.close();

        // Log restore to audit trail
        try {
            db.prepare(`
                INSERT INTO audit_logs (entity_type, action, details, user_name)
                VALUES ('BACKUP', 'RESTORE_BACKUP', ?, 'Accounts Admin')
            `).run(JSON.stringify({ restoredFrom: backupFile, recordsRestored: check.receiptCount }));
        } catch (e) {}

        res.json({
            success: true,
            message: `Successfully restored database from ${backupFile}`,
            receiptCount: check.receiptCount,
            daysheetCount: check.daysheetCount
        });
    } catch (e) {
        res.status(500).json({ success: false, error: `Restore failed: ${e.message}` });
    }
});

// POST /api/backup/reset-system - deletes all data, resets paths, starts from scratch
router.post('/reset-system', async (req, res) => {
    try {
        // Step 1: Create a safety backup first so data is never permanently lost
        await createBackup('pre_system_reset');

        // Step 2: Delete all business data and reset sequences in a single transaction
        db.transaction(() => {
            db.exec(`
                DELETE FROM receipts;
                DELETE FROM day_sheet_deposits;
                DELETE FROM day_sheet_denominations;
                DELETE FROM day_sheets;
                DELETE FROM import_log;
                DELETE FROM audit_logs;
                DELETE FROM settings;
                DELETE FROM sqlite_sequence WHERE name IN (
                    'receipts', 'day_sheets', 'day_sheet_deposits', 
                    'day_sheet_denominations', 'import_log', 'audit_logs'
                );
                INSERT INTO settings (key, value) VALUES ('initial_seed_completed', 'true');
            `);
        })();

        // Step 3: Restart watcher with clean default config
        try {
            const { stopWatcher, startWatcher } = require('../services/syncService');
            stopWatcher();
            setTimeout(() => startWatcher(), 200);
        } catch (e) { /* non-critical */ }

        res.json({
            success: true,
            message: 'All data, receipts, Day Sheets, logs, and paths have been completely reset to scratch.'
        });
    } catch (err) {
        console.error('[Reset System Error]', err);
        res.status(500).json({ success: false, error: `Reset failed: ${err.message}` });
    }
});

module.exports = router;
