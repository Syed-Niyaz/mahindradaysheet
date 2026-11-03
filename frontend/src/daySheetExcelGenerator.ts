// frontend/src/daySheetExcelGenerator.ts
// In-browser Excel Day Sheet generator powered by SheetJS (xlsx)
// Generates authentic, fully structured .xlsx Day Sheet workbooks directly in browser
// Used on Netlify and offline demo environments.

import * as XLSX from 'xlsx';

export interface DaySheetData {
  branchName?: string;
  branchCode?: string;
  date: string;
  type?: string;
  opening_balance?: number;
  cash_sales?: number;
  less_vouchers?: number;
  status?: string;
  notes?: string;
  cashReceipts: any[];
  nonCashReceipts: any[];
  denominations: any[];
  expenses: any[];
  deposits: any[];
}

export function generateDaySheetExcelBlob(data: DaySheetData): Blob {
  const wb = XLSX.utils.book_new();

  const branchName = data.branchName || 'BALLARI (H.O)';
  const dateStr = data.date;
  const sheetType = (data.type || 'SERVICE').toUpperCase();

  const rows: any[][] = [];

  // Title & Header Block
  rows.push(['BELLARY MOTORS SALES PVT. LTD.']);
  rows.push([`DAILY CASH & COLLECTION SHEET — ${sheetType}`]);
  rows.push([`BRANCH: ${branchName}`, '', `DATE: ${dateStr}`, '', `STATUS: ${data.status || 'VERIFIED'}`]);
  rows.push([]); // blank

  // SECTION 1: CASH RECEIPTS
  rows.push(['SECTION 1: CASH RECEIPTS']);
  rows.push(['Sl No', 'Receipt No', 'Customer Name', 'Vehicle No', 'Purpose', 'Ref/Bill No', 'Amount (₹)']);
  let cashTotal = 0;
  if (data.cashReceipts && data.cashReceipts.length > 0) {
    data.cashReceipts.forEach((r, idx) => {
      const amt = Number(r.amount) || 0;
      cashTotal += amt;
      rows.push([
        idx + 1,
        r.receipt_no || '',
        r.customer_name || '',
        r.vehicle_no || '',
        r.received_towards_purpose || r.received_towards || 'CASH SALE',
        r.received_towards_reference || '',
        amt
      ]);
    });
  } else {
    rows.push(['—', '—', 'No Cash Receipts Recorded', '—', '—', '—', 0]);
  }
  rows.push(['', '', '', '', 'TOTAL CASH RECEIPTS:', '', cashTotal]);
  rows.push([]); // blank

  // SECTION 2: CHEQUE / NEFT / ONLINE RECEIPTS
  rows.push(['SECTION 2: CHEQUE / NEFT / ONLINE RECEIPTS']);
  rows.push(['Sl No', 'Receipt No', 'Customer Name', 'Vehicle No', 'Payment Mode', 'UTR / Ref No', 'Amount (₹)']);
  let nonCashTotal = 0;
  if (data.nonCashReceipts && data.nonCashReceipts.length > 0) {
    data.nonCashReceipts.forEach((r, idx) => {
      const amt = Number(r.amount) || 0;
      nonCashTotal += amt;
      rows.push([
        idx + 1,
        r.receipt_no || '',
        r.customer_name || '',
        r.vehicle_no || '',
        r.payment_mode || 'Online',
        r.utr_reference || '—',
        amt
      ]);
    });
  } else {
    rows.push(['—', '—', 'No Online/Cheque Receipts Recorded', '—', '—', '—', 0]);
  }
  rows.push(['', '', '', '', 'TOTAL CHEQUE/NEFT RECEIPTS:', '', nonCashTotal]);
  rows.push([]); // blank

  // SECTION 3: DENOMINATIONS & EXPENSES (Side-by-side or stacked)
  rows.push(['SECTION 3: CASH DENOMINATIONS']);
  rows.push(['Note Value', 'Count', 'Amount (₹)']);
  let denomTotal = 0;
  const denoms = data.denominations && data.denominations.length > 0 ? data.denominations : [
    { note_label: '2000', note_value: 2000, note_count: 0 },
    { note_label: '500', note_value: 500, note_count: 0 },
    { note_label: '200', note_value: 200, note_count: 0 },
    { note_label: '100', note_value: 100, note_count: 0 },
    { note_label: '50', note_value: 50, note_count: 0 },
    { note_label: '20', note_value: 20, note_count: 0 },
    { note_label: '10', note_value: 10, note_count: 0 },
    { note_label: 'Coins', note_value: 1, note_count: 0 }
  ];
  denoms.forEach(d => {
    const count = Number(d.note_count) || 0;
    const val = Number(d.note_value) || 0;
    const sub = count * val;
    denomTotal += sub;
    rows.push([d.note_label || String(val), count, sub]);
  });
  rows.push(['TOTAL PHYSICAL CASH:', '', denomTotal]);
  rows.push([]); // blank

  // SECTION 4: EXPENSES & CASH VOUCHERS
  rows.push(['SECTION 4: EXPENSES / CASH VOUCHERS']);
  rows.push(['Sl No', 'Voucher No', 'Particulars / Head', 'Remarks', 'Amount (₹)']);
  let expTotal = 0;
  if (data.expenses && data.expenses.length > 0) {
    data.expenses.forEach((e, idx) => {
      const amt = Number(e.amount) || 0;
      expTotal += amt;
      rows.push([idx + 1, e.voucher_no || '', e.expense_head || e.particulars || '', e.remarks || '', amt]);
    });
  } else {
    rows.push(['—', '—', 'No Expenses Recorded', '—', 0]);
  }
  rows.push(['', '', 'TOTAL EXPENSES / VOUCHERS:', '', expTotal]);
  rows.push([]); // blank

  // SECTION 5: BANK DEPOSITS
  rows.push(['SECTION 5: CASH BANK DEPOSITS']);
  rows.push(['Sl No', 'Bank Name', 'Challan / A/C Ref', 'Amount (₹)']);
  let depTotal = 0;
  if (data.deposits && data.deposits.length > 0) {
    data.deposits.forEach((d, idx) => {
      const amt = Number(d.amount) || 0;
      depTotal += amt;
      rows.push([idx + 1, d.bank_name || '', d.challan_no || d.reference || '', amt]);
    });
  } else {
    rows.push(['—', '—', 'No Bank Deposits Recorded', 0]);
  }
  rows.push(['', 'TOTAL BANK DEPOSITS:', '', depTotal]);
  rows.push([]); // blank

  // SECTION 6: RECONCILIATION SUMMARY
  const openingBal = Number(data.opening_balance) || 0;
  const cashSalesAmt = cashTotal || (Number(data.cash_sales) || 0);
  const totalInflow = openingBal + cashSalesAmt;
  const closingBal = totalInflow - expTotal - depTotal;

  rows.push(['SECTION 6: CASH RECONCILIATION SUMMARY']);
  rows.push(['Item Description', '', '', 'Amount (₹)']);
  rows.push(['Opening Cash Balance', '', '', openingBal]);
  rows.push(['Add: Cash Sales (Section 1)', '', '', cashSalesAmt]);
  rows.push(['Gross Cash Available', '', '', totalInflow]);
  rows.push(['Less: Expenses / Vouchers (Section 4)', '', '', -expTotal]);
  rows.push(['Less: Bank Deposits (Section 5)', '', '', -depTotal]);
  rows.push(['NET CLOSING CASH BALANCE', '', '', closingBal]);
  rows.push(['PHYSICAL CASH COUNT (Denominations)', '', '', denomTotal]);
  rows.push(['Cash Difference (Physical - Closing)', '', '', denomTotal - closingBal]);
  rows.push([]);

  rows.push(['Prepared By: Cashier', '', 'Checked By: Accountant', '', 'Approved By: Manager']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column width formatting
  ws['!cols'] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 28 },
    { wch: 18 },
    { wch: 24 },
    { wch: 20 },
    { wch: 16 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `DaySheet_${dateStr}`);

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
