/**
 * Deep inspection of Service_Data_Backup_22-10-2026.xlsx
 * Dumps: sheet names, headers, sample rows (first 5), column types, and row counts
 */
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'Service_Data_Backup_22-10-2026.xlsx');
const wb = XLSX.readFile(filePath, { cellDates: true, cellStyles: true });

console.log('=== SOURCE WORKBOOK: Service_Data_Backup_22-10-2026.xlsx ===');
console.log('Sheet names:', wb.SheetNames);
console.log('');

for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    console.log(`\n--- Sheet: "${sheetName}" ---`);
    console.log(`Range: ${ws['!ref']}`);
    console.log(`Rows: ${range.e.r - range.s.r + 1}, Cols: ${range.e.c - range.s.c + 1}`);

    // Dump raw cells for first 3 rows to see actual header structure
    console.log('\nRaw cells (first 5 rows):');
    for (let r = range.s.r; r <= Math.min(range.s.r + 4, range.e.r); r++) {
        const rowCells = {};
        for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (cell) {
                rowCells[addr] = { v: cell.v, t: cell.t, w: cell.w };
            }
        }
        console.log(`  Row ${r}:`, JSON.stringify(rowCells));
    }

    // Also try sheet_to_json with header:1 to get raw arrays
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    console.log('\nFirst row (raw array - potential headers):', JSON.stringify(rawRows[0]));
    if (rawRows.length > 1) {
        console.log('Second row:', JSON.stringify(rawRows[1]));
    }
    if (rawRows.length > 2) {
        console.log('Third row:', JSON.stringify(rawRows[2]));
    }

    // Try sheet_to_json with default header detection
    const jsonRows = XLSX.utils.sheet_to_json(ws);
    console.log(`\nTotal JSON rows (auto-header): ${jsonRows.length}`);
    if (jsonRows.length > 0) {
        console.log('Detected column keys:', Object.keys(jsonRows[0]));
        console.log('Sample row 1:', JSON.stringify(jsonRows[0]));
    }
    if (jsonRows.length > 1) {
        console.log('Sample row 2:', JSON.stringify(jsonRows[1]));
    }
    if (jsonRows.length > 2) {
        console.log('Sample row 3:', JSON.stringify(jsonRows[2]));
    }

    // Show last 2 rows (may contain totals)
    if (jsonRows.length > 5) {
        console.log(`Sample row ${jsonRows.length - 1}:`, JSON.stringify(jsonRows[jsonRows.length - 2]));
        console.log(`Sample row ${jsonRows.length} (LAST):`, JSON.stringify(jsonRows[jsonRows.length - 1]));
    }

    // Collect unique values for potential "payment mode" and "branch" columns
    if (jsonRows.length > 0) {
        const keys = Object.keys(jsonRows[0]);
        for (const key of keys) {
            const uniqueVals = [...new Set(jsonRows.map(r => (r[key] || '').toString().trim()).filter(Boolean))];
            if (uniqueVals.length <= 20 && uniqueVals.length > 0) {
                console.log(`\nUnique values for "${key}" (${uniqueVals.length}):`, uniqueVals);
            }
        }
    }
}
