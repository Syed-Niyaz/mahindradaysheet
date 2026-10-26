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

module.exports = router;
