/**
 * server/config.js
 * Central configuration for Bellary Motors Day Sheet Automation.
 * Edit SOURCE_FILE_PATH to point to where the client saves the backup Excel.
 */
const path = require('path');

module.exports = {
    // ──────────────────────────────────────────────────────────────────────
    // SOURCE BACKUP FILE
    // This is the Excel file the client's receipt software saves into.
    // Change this path to wherever the file lives on the server/shared drive.
    // ──────────────────────────────────────────────────────────────────────
    SOURCE_FILE_PATH: path.join(__dirname, '..', 'Service_Data_Backup_22-10-2026.xlsx'),

    // Sheet name inside the backup file that contains receipt rows
    SOURCE_SHEET_NAME: 'Service Receipt Data',

    // ──────────────────────────────────────────────────────────────────────
    // COLUMN MAPPING
    // Maps the actual Excel column headers to Day Sheet fields.
    // ──────────────────────────────────────────────────────────────────────
    COLUMN_MAP: {
        date:          'Date',
        receiptNo:     'SERVICE Receipt No.',
        branch:        'Branch',
        customerName:  'Customer Name',
        amount:        ' Amount ',          // has leading/trailing spaces in header
        paymentMode:   ' Column 6 ',        // 'Cash' or 'PhonePe' etc.
        receivedTowards: ' Column 4 ',      // CREDIT BILL reference
        utrReference:  'Column 8',          // UTR/NEFT number
        narration:     'Narration',
    },

    // ──────────────────────────────────────────────────────────────────────
    // BRANCH MAPPING
    // Maps branch names from the Excel file to DB branch codes.
    // ──────────────────────────────────────────────────────────────────────
    BRANCH_MAP: {
        'BALLARI': 'BLY',
        'HOSAPETE': 'HSP',
        'KUDLIGI': 'KDL',
    },

    // Default branch code if the Excel row doesn't specify one
    DEFAULT_BRANCH_CODE: 'BLY',

    // ──────────────────────────────────────────────────────────────────────
    // PAYMENT MODE ROUTING
    // Any mode in CASH_MODES goes to the Cash Receipts section.
    // Everything else goes to the Cheque/NEFT Receipts section.
    // ──────────────────────────────────────────────────────────────────────
    CASH_MODES: ['cash'],

    // ──────────────────────────────────────────────────────────────────────
    // FILE WATCHER
    // ──────────────────────────────────────────────────────────────────────
    WATCH_ENABLED: true,
    WATCH_DEBOUNCE_MS: 1500,   // Wait this long after a save before re-reading
    WATCH_POLL_INTERVAL_MS: 2000, // fs.watchFile polling interval (for network drives)
};
