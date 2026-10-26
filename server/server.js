const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { startWatcher } = require('./services/syncService');
const { startBackupSchedule } = require('./services/backupService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/daysheet', require('./routes/daysheet'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/audit-logs', require('./routes/audit'));
app.use('/api/backup', require('./routes/backup'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend static if built
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(frontendDist, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(200).send('Bellary Motors Day Sheet Automation Backend is running on port ' + PORT);
        }
    });
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Bellary Motors Day Sheet Backend on port ${PORT}`);
    console.log(` API: http://localhost:${PORT}/api/daysheet`);
    console.log(`=======================================================`);

    // Start file watcher and automated backup schedule AFTER server is up
    startWatcher();
    startBackupSchedule(6);
});
