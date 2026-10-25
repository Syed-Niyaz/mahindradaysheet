const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/audit-logs
router.get('/', (req, res) => {
    try {
        const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
