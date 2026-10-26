const path = require('path');
const fs = require('fs');
const { db } = require('../db');

const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const MAX_BACKUPS = 30;

/**
 * Creates a safe, point-in-time SQLite online backup.
 * WAL-consistent, non-blocking, safe even while reading/writing.
 * @param {string} reason - 'scheduled', 'manual', 'startup', 'pre_migration', 'pre_restore'
 * @returns {Promise<{success: boolean, backupFile?: string, error?: string, fullPath?: string, size?: number}>}
 */
async function createBackup(reason = 'manual') {
    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const fileName = `daysheet_backup_${timestamp}_${reason}.db`;
        const destPath = path.join(backupDir, fileName);

        // SQLite online backup API: WAL-consistent, non-blocking
        await db.backup(destPath);

        // Verify the backup was created and has non-zero size
        const stat = fs.statSync(destPath);
        if (stat.size === 0) {
            throw new Error('Backup file was created with 0 bytes.');
        }

        // Clean up older backups (keep last MAX_BACKUPS)
        cleanOldBackups(MAX_BACKUPS);

        // Log to audit trail
        try {
            db.prepare(`
                INSERT INTO audit_logs (entity_type, action, details, user_name)
                VALUES ('BACKUP', 'CREATE_BACKUP', ?, 'System Backup Service')
            `).run(JSON.stringify({ fileName, sizeBytes: stat.size, reason }));
        } catch (e) { /* non-critical */ }

        console.log(`[Backup] Successfully created backup: ${fileName} (${(stat.size / 1024).toFixed(1)} KB) [Reason: ${reason}]`);
        return { success: true, backupFile: fileName, fullPath: destPath, size: stat.size, createdAt: now.toISOString() };
    } catch (err) {
        console.error(`[Backup] Failed to create backup: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Clean up older backups in data/backups/ keeping up to maxKeep files.
 * NEVER deletes the active database or non-backup files!
 */
function cleanOldBackups(maxKeep = MAX_BACKUPS) {
    try {
        if (!fs.existsSync(backupDir)) return;
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('daysheet_backup_') && f.endsWith('.db'))
            .map(f => {
                const fullPath = path.join(backupDir, f);
                return { name: f, path: fullPath, time: fs.statSync(fullPath).mtimeMs };
            })
            .sort((a, b) => b.time - a.time);

        if (files.length > maxKeep) {
            const toDelete = files.slice(maxKeep);
            for (const f of toDelete) {
                if (f.name.startsWith('daysheet_backup_')) {
                    fs.unlinkSync(f.path);
                    console.log(`[Backup] Rotated old backup: ${f.name}`);
                }
            }
        }
    } catch (e) {
        console.error('[Backup] Error cleaning old backups:', e.message);
    }
}

/**
 * List available backups sorted newest first
 */
function listBackups() {
    try {
        if (!fs.existsSync(backupDir)) return [];
        return fs.readdirSync(backupDir)
            .filter(f => f.startsWith('daysheet_backup_') && f.endsWith('.db'))
            .map(f => {
                const fullPath = path.join(backupDir, f);
                const stat = fs.statSync(fullPath);
                return {
                    fileName: f,
                    sizeBytes: stat.size,
                    sizeKB: (stat.size / 1024).toFixed(1),
                    modifiedAt: stat.mtime.toISOString(),
                };
            })
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    } catch (e) {
        return [];
    }
}

/**
 * Verifies a backup file is readable and valid SQLite.
 */
function verifyBackup(backupFileName) {
    const targetPath = path.join(backupDir, path.basename(backupFileName));
    if (!fs.existsSync(targetPath)) {
        return { valid: false, error: `Backup file not found: ${backupFileName}` };
    }
    const Database = require('better-sqlite3');
    try {
        const testDb = new Database(targetPath, { readonly: true });
        const receipts = testDb.prepare('SELECT count(*) as count FROM receipts').get();
        const daysheets = testDb.prepare('SELECT count(*) as count FROM day_sheets').get();
        testDb.close();
        return {
            valid: true,
            receiptCount: receipts.count,
            daysheetCount: daysheets.count
        };
    } catch (e) {
        return { valid: false, error: `Invalid or corrupt backup file: ${e.message}` };
    }
}

let backupScheduleTimer = null;
function startBackupSchedule(intervalHours = 6) {
    if (backupScheduleTimer) clearInterval(backupScheduleTimer);
    // Run an initial backup 5 seconds after startup
    setTimeout(() => {
        createBackup('startup');
    }, 5000);

    // Schedule regular backups
    const intervalMs = intervalHours * 60 * 60 * 1000;
    backupScheduleTimer = setInterval(() => {
        createBackup('scheduled');
    }, intervalMs);
    console.log(`[Backup] Automated backup schedule active (every ${intervalHours} hours)`);
}

module.exports = {
    createBackup,
    listBackups,
    verifyBackup,
    cleanOldBackups,
    startBackupSchedule,
    backupDir
};
