const XLSX = require('xlsx');
const path = require('path');

function inspectWorkbook(filename) {
    console.log(`\n========================================`);
    console.log(`INSPECTING: ${filename}`);
    console.log(`========================================`);
    const wb = XLSX.readFile(path.join(__dirname, '..', filename), { cellFormula: true, cellStyles: true });
    console.log(`Sheet Names:`, wb.SheetNames);
    
    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        console.log(`\n--- Sheet: ${sheetName} ---`);
        console.log(`Range:`, ws['!ref']);
        console.log(`Merged cells count:`, (ws['!merges'] || []).length);
        if (ws['!merges'] && ws['!merges'].length > 0) {
            console.log(`First 10 merges:`, ws['!merges'].slice(0, 10).map(m => XLSX.utils.encode_range(m)));
        }

        const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        console.log(`Total rows:`, data.length);
        console.log(`Top 15 rows:`);
        for (let i = 0; i < Math.min(15, data.length); i++) {
            console.log(`Row ${i + 1}:`, JSON.stringify(data[i]));
        }

        // Check for formulas
        const formulas = [];
        for (const cell in ws) {
            if (cell[0] === '!') continue;
            if (ws[cell].f) {
                formulas.push({ cell, f: ws[cell].f, v: ws[cell].v });
            }
        }
        console.log(`Total formulas found:`, formulas.length);
        if (formulas.length > 0) {
            console.log(`Sample formulas (first 20):`, formulas.slice(0, 20));
        }
    }
}

try {
    inspectWorkbook('Service_Data_Backup_22-10-2026.xlsx');
    inspectWorkbook('DAY SHEET.xlsx');
} catch (err) {
    console.error(err);
}
