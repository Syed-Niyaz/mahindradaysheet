const XLSX = require('xlsx');
const path = require('path');

const wbBackup = XLSX.readFile(path.join(__dirname, '..', 'Service_Data_Backup_22-10-2026.xlsx'));
const wsBackup = wbBackup.Sheets['Service Receipt Data'];
const rows = XLSX.utils.sheet_to_json(wsBackup);

console.log("Total rows in Service_Data_Backup:", rows.length);
console.log("Unique dates in backup (last 10):");
const dates = [...new Set(rows.map(r => r['Date']))];
console.log(dates.slice(-10));

// Filter for 22.10.2026
const rows22 = rows.filter(r => (r['Date'] || '').trim() === '22.10.2026');
console.log(`\nFound ${rows22.length} receipts on 22.10.2026:`);

const cashReceipts = [];
const nonCashReceipts = [];

rows22.forEach(r => {
    const rcpNo = (r['SERVICE Receipt No.'] || '').trim();
    const cust = (r['Customer Name'] || '').trim();
    const amtStr = (r[' Amount '] || r['Amount'] || '').toString().replace(/,/g, '').trim();
    const amt = parseFloat(amtStr) || 0;
    const mode = (r[' Column 6 '] || r['Payment Mode'] || '').trim();
    const branch = (r['Branch'] || '').trim();
    const bill = (r[' Column 4 '] || '').trim();
    const utr = (r['Column 8'] || '').toString().trim();

    const item = { rcpNo, cust, amt, mode, branch, bill, utr };
    if (mode.toLowerCase().includes('cash')) {
        cashReceipts.push(item);
    } else {
        nonCashReceipts.push(item);
    }
});

console.log(`Cash receipts count on 22.10.2026: ${cashReceipts.length}`);
let totalCash = 0;
cashReceipts.forEach(c => {
    console.log(`  CASH: ${c.rcpNo} | ${c.cust} | ${c.amt}`);
    totalCash += c.amt;
});
console.log(`TOTAL CASH: ${totalCash}`);

console.log(`\nNon-Cash receipts count on 22.10.2026: ${nonCashReceipts.length}`);
let totalNonCash = 0;
nonCashReceipts.forEach(c => {
    console.log(`  ${c.mode}: ${c.rcpNo} | ${c.cust} | ${c.amt} | UTR: ${c.utr}`);
    totalNonCash += c.amt;
});
console.log(`TOTAL NON-CASH: ${totalNonCash}`);
