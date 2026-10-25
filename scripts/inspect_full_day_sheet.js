const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function dumpSheet(wbName, sheetName, maxRows = 100) {
    const wb = XLSX.readFile(path.join(__dirname, '..', wbName), { cellFormula: true, cellStyles: true });
    const ws = wb.Sheets[sheetName];
    console.log(`\n======================================================`);
    console.log(`WORKBOOK: ${wbName} | SHEET: ${sheetName}`);
    console.log(`======================================================`);
    
    // Dump cells with addresses and values
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    data.forEach((row, idx) => {
        if (row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
            console.log(`Row ${(idx + 1).toString().padStart(2, '0')}:`, JSON.stringify(row));
        }
    });

    console.log(`\n--- ALL FORMULAS IN ${sheetName} ---`);
    for (const cell in ws) {
        if (cell[0] === '!') continue;
        if (ws[cell].f) {
            console.log(`${cell}: formula = "${ws[cell].f}", value = "${ws[cell].v}"`);
        }
    }
}

console.log("DUMPING SERVICE SHEET:");
dumpSheet('DAY SHEET.xlsx', 'SERVICE');

console.log("\n\nDUMPING SERVICE DATA BACKUP HEADERS & FIRST 5 ROWS:");
const wbBackup = XLSX.readFile(path.join(__dirname, '..', 'Service_Data_Backup_22-10-2026.xlsx'));
const wsBackup = wbBackup.Sheets['Service Receipt Data'];
const backupData = XLSX.utils.sheet_to_json(wsBackup, { header: 1, raw: false });
for (let i = 0; i < Math.min(6, backupData.length); i++) {
    console.log(`Backup Row ${i + 1}:`, JSON.stringify(backupData[i]));
}
console.log(`Total rows in Service Receipt Data: ${backupData.length}`);
