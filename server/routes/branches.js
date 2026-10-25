const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/branches
router.get('/', (req, res) => {
    try {
        const branches = db.prepare('SELECT * FROM branches ORDER BY is_head_office DESC, id ASC').all();
        res.json({ success: true, data: branches });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/branches
router.post('/', (req, res) => {
    try {
        const { code, name, receipt_prefix, gstin, address, is_head_office = 0 } = req.body;
        if (!code || !name) {
            return res.status(400).json({ success: false, error: 'Code and Name are required' });
        }

        const stmt = db.prepare(`
            INSERT INTO branches (code, name, receipt_prefix, gstin, address, is_head_office)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(code.toUpperCase(), name.toUpperCase(), receipt_prefix || `${code}-`, gstin, address, is_head_office ? 1 : 0);

        const newBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, data: newBranch });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
