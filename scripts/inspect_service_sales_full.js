const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'DAY SHEET.xlsx'), { cellFormula: true, cellStyles: true });

['SERVICE', 'SALES'].forEach(sheetName => {
    console.log(`\n=================== ${sheetName} SHEET DETAILS ===================`);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    data.forEach((r, idx) => {
        // print if row has something in rows 55-68 or row 1-35
        console.log(`Row ${(idx+1).toString().padStart(2, '0')}: ${JSON.stringify(r)}`);
    });
});
