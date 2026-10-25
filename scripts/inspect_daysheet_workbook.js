/**
 * Deep inspection of DAY SHEET.xlsx
 * Dumps: sheet names, merged cells, raw cell data, formulas, print settings
 */
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'DAY SHEET.xlsx');
const wb = XLSX.readFile(filePath, { cellDates: true, cellStyles: true, cellFormula: true });

console.log('=== TARGET WORKBOOK: DAY SHEET.xlsx ===');
console.log('Sheet names:', wb.SheetNames);
console.log('');

for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    console.log(`\n======= Sheet: "${sheetName}" =======`);
    console.log(`Range: ${ws['!ref']}`);
    console.log(`Rows: ${range.e.r - range.s.r + 1}, Cols: ${range.e.c - range.s.c + 1}`);
    
    // Merged cells
    if (ws['!merges'] && ws['!merges'].length > 0) {
        console.log('\nMerged cells:');
        for (const m of ws['!merges']) {
            const from = XLSX.utils.encode_cell(m.s);
            const to = XLSX.utils.encode_cell(m.e);
            console.log(`  ${from}:${to}`);
        }
    }

    // Column widths
    if (ws['!cols']) {
        console.log('\nColumn widths:', ws['!cols'].map((c, i) => 
            c ? `${XLSX.utils.encode_col(i)}:${c.wch || c.width}` : null
        ).filter(Boolean));
    }

    // Row heights
    if (ws['!rows']) {
        console.log('\nRow heights (non-default):', 
            ws['!rows'].map((r, i) => r && r.hpt ? `Row${i+1}:${r.hpt}pt` : null).filter(Boolean)
        );
    }

    // Print settings
    if (ws['!print']) console.log('\nPrint settings:', ws['!print']);

    // Dump ALL cells row by row
    console.log('\n--- Full cell dump ---');
    for (let r = range.s.r; r <= range.e.r; r++) {
        const rowCells = {};
        let hasContent = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (cell) {
                hasContent = true;
                const info = { v: cell.v };
                if (cell.t) info.t = cell.t;
                if (cell.f) info.f = cell.f; // formula
                if (cell.w) info.w = cell.w; // formatted text
                rowCells[addr] = info;
            }
        }
        if (hasContent) {
            console.log(`  Row ${r + 1}:`, JSON.stringify(rowCells));
        }
    }

    // Also output as readable grid using sheet_to_json with header:1
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('\n--- Readable grid ---');
    for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const nonEmpty = row.some(v => v !== '' && v !== null && v !== undefined);
        if (nonEmpty) {
            console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`);
        }
    }
}
