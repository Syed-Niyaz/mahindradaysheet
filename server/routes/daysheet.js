const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { db } = require('../db');

// GET /api/daysheet
router.get('/', (req, res) => {
    try {
        const { branch_id, date, type = 'SERVICE' } = req.query;
        if (!branch_id || !date) {
            return res.status(400).json({ success: false, error: 'branch_id and date are required' });
        }

        const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branch_id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        // Fetch active receipts for this branch, date, type
        const receipts = db.prepare(`
            SELECT * FROM receipts 
            WHERE branch_id = ? AND receipt_date = ? AND receipt_type = ? AND status = 'ACTIVE'
            ORDER BY id ASC
        `).all(branch_id, date, type);

        const cashReceipts = [];
        const nonCashReceipts = [];
        let totalCashReceipts = 0;
        let totalNonCashReceipts = 0;

        for (const r of receipts) {
            const isCash = r.payment_mode && r.payment_mode.toLowerCase().includes('cash');
            if (isCash) {
                cashReceipts.push(r);
                totalCashReceipts += r.amount;
            } else {
                nonCashReceipts.push(r);
                totalNonCashReceipts += r.amount;
            }
        }

        // Fetch or create Day Sheet record
        let daySheet = db.prepare(`
            SELECT * FROM day_sheets 
            WHERE branch_id = ? AND sheet_date = ? AND sheet_type = ?
        `).get(branch_id, date, type);

        if (!daySheet) {
            // Check previous day closing balance for opening balance
            const prevSheet = db.prepare(`
                SELECT * FROM day_sheets 
                WHERE branch_id = ? AND sheet_type = ? AND sheet_date < ?
                ORDER BY sheet_date DESC LIMIT 1
            `).get(branch_id, type, date);

            const initialOpening = prevSheet ? (prevSheet.opening_balance + totalCashReceipts) : 0;

            const insertResult = db.prepare(`
                INSERT INTO day_sheets (branch_id, sheet_date, sheet_type, opening_balance, cash_sales, less_vouchers, status)
                VALUES (?, ?, ?, ?, 0, 0, 'DRAFT')
            `).run(branch_id, date, type, initialOpening);

            const newId = insertResult.lastInsertRowid;

            // Insert default deposits
            const insertDep = db.prepare(`
                INSERT INTO day_sheet_deposits (day_sheet_id, particulars, amount, sort_order)
                VALUES (?, ?, ?, ?)
            `);
            insertDep.run(newId, 'AXIS BANK 639', 0, 1);
            insertDep.run(newId, 'EXPENSES', 0, 2);
            insertDep.run(newId, 'Incentive on Workshop', 0, 3);

            // Insert default denominations
            const insertDenom = db.prepare(`
                INSERT INTO day_sheet_denominations (day_sheet_id, note_label, note_value, note_count, amount)
                VALUES (?, ?, ?, ?, ?)
            `);
            const defaultDenoms = [
                { label: '2000', value: 2000 },
                { label: '500', value: 500 },
                { label: '200', value: 200 },
                { label: '100', value: 100 },
                { label: '50', value: 50 },
                { label: '20', value: 20 },
                { label: '10', value: 10 },
                { label: 'COINS', value: 1 }
            ];
            for (const d of defaultDenoms) {
                insertDenom.run(newId, d.label, d.value, 0, 0);
            }

            daySheet = db.prepare('SELECT * FROM day_sheets WHERE id = ?').get(newId);
        }

        // Fetch deposits and denominations
        const deposits = db.prepare(`
            SELECT * FROM day_sheet_deposits WHERE day_sheet_id = ? ORDER BY sort_order ASC, id ASC
        `).all(daySheet.id);

        const denominations = db.prepare(`
            SELECT * FROM day_sheet_denominations WHERE day_sheet_id = ? ORDER BY id ASC
        `).all(daySheet.id);

        let totalBankDeposits = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
        let totalDenominations = denominations.reduce((sum, d) => sum + (d.amount || 0), 0);

        // Accounting formula:
        // Closing Balance = Opening Balance + Cash Receipts + Cash Sales - Less Vouchers - Total Bank Deposits
        const openingBalance = daySheet.opening_balance || 0;
        const cashSales = daySheet.cash_sales || 0;
        const lessVouchers = daySheet.less_vouchers || 0;

        const calculatedClosing = Number((openingBalance + totalCashReceipts + cashSales - lessVouchers - totalBankDeposits).toFixed(2));
        const denominationTotal = Number(totalDenominations.toFixed(2));
        const diff = Number((calculatedClosing - denominationTotal).toFixed(2));
        const isReconciled = Math.abs(diff) < 0.01;

        res.json({
            success: true,
            branch,
            daySheet: {
                ...daySheet,
                totalCashReceipts,
                totalNonCashReceipts,
                totalBankDeposits,
                totalDenominations: denominationTotal,
                calculatedClosing,
                diff,
                isReconciled
            },
            cashReceipts,
            nonCashReceipts,
            deposits,
            denominations
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/daysheet (Save Day Sheet parameters)
router.post('/', (req, res) => {
    try {
        const {
            day_sheet_id,
            branch_id,
            sheet_date,
            sheet_type = 'SERVICE',
            opening_balance = 0,
            cash_sales = 0,
            less_vouchers = 0,
            status = 'DRAFT',
            notes = '',
            deposits = [],
            denominations = []
        } = req.body;

        const updateTx = db.transaction(() => {
            let sheetId = day_sheet_id;

            if (sheetId) {
                db.prepare(`
                    UPDATE day_sheets SET
                        opening_balance = ?,
                        cash_sales = ?,
                        less_vouchers = ?,
                        status = ?,
                        notes = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(opening_balance, cash_sales, less_vouchers, status, notes, sheetId);
            } else {
                const insertRes = db.prepare(`
                    INSERT INTO day_sheets (branch_id, sheet_date, sheet_type, opening_balance, cash_sales, less_vouchers, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(branch_id, sheet_date, sheet_type, opening_balance, cash_sales, less_vouchers, status, notes);
                sheetId = insertRes.lastInsertRowid;
            }

            // Update deposits
            if (Array.isArray(deposits)) {
                db.prepare('DELETE FROM day_sheet_deposits WHERE day_sheet_id = ?').run(sheetId);
                const insertDep = db.prepare(`
                    INSERT INTO day_sheet_deposits (day_sheet_id, particulars, amount, sort_order)
                    VALUES (?, ?, ?, ?)
                `);
                deposits.forEach((dep, idx) => {
                    if (dep.particulars && dep.particulars.trim()) {
                        insertDep.run(sheetId, dep.particulars.trim(), Number(dep.amount) || 0, idx + 1);
                    }
                });
            }

            // Update denominations
            if (Array.isArray(denominations)) {
                db.prepare('DELETE FROM day_sheet_denominations WHERE day_sheet_id = ?').run(sheetId);
                const insertDenom = db.prepare(`
                    INSERT INTO day_sheet_denominations (day_sheet_id, note_label, note_value, note_count, amount)
                    VALUES (?, ?, ?, ?, ?)
                `);
                denominations.forEach(d => {
                    const count = parseInt(d.note_count, 10) || 0;
                    const val = Number(d.note_value) || 0;
                    const amt = count * val;
                    insertDenom.run(sheetId, d.note_label, val, count, amt);
                });
            }

            // Audit log
            db.prepare(`
                INSERT INTO audit_logs (entity_type, entity_id, action, details, user_name)
                VALUES (?, ?, ?, ?, ?)
            `).run('DAY_SHEET', sheetId, 'SAVE', JSON.stringify({ sheet_date, sheet_type, opening_balance, status }), 'Accounts Staff');

            return sheetId;
        });

        const updatedSheetId = updateTx();
        res.json({ success: true, message: 'Day Sheet saved successfully.', day_sheet_id: updatedSheetId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/daysheet/export-excel
router.get('/export-excel', (req, res) => {
    try {
        const { branch_id, date, type = 'SERVICE' } = req.query;
        if (!branch_id || !date) {
            return res.status(400).json({ success: false, error: 'branch_id and date required' });
        }

        const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branch_id);
        const daySheet = db.prepare('SELECT * FROM day_sheets WHERE branch_id = ? AND sheet_date = ? AND sheet_type = ?').get(branch_id, date, type);
        const receipts = db.prepare(`SELECT * FROM receipts WHERE branch_id = ? AND receipt_date = ? AND receipt_type = ? AND status = 'ACTIVE'`).all(branch_id, date, type);
        const deposits = daySheet ? db.prepare('SELECT * FROM day_sheet_deposits WHERE day_sheet_id = ?').all(daySheet.id) : [];
        const denominations = daySheet ? db.prepare('SELECT * FROM day_sheet_denominations WHERE day_sheet_id = ?').all(daySheet.id) : [];

        const cashReceipts = receipts.filter(r => r.payment_mode.toLowerCase().includes('cash'));
        const nonCashReceipts = receipts.filter(r => !r.payment_mode.toLowerCase().includes('cash'));

        const wb = XLSX.utils.book_new();
        const wsData = [];

        // Header
        wsData.push(['']);
        wsData.push(['']);
        wsData.push(['']);
        wsData.push(['']);
        wsData.push([type === 'SERVICE' ? 'CASH SHEET- WORKSHOP' : 'CASH SHEET- SALES']);
        wsData.push([`BRANCH: ${branch.name}`, null, null, null, 'DATE:', null, date]);
        wsData.push(['']);

        // Section Headers
        wsData.push(['DETAILS OF CASH RECEIPTS', null, null, null, 'DETAILS OF BANK DEPOSIT']);
        wsData.push(['CUSTOMER NAME', 'RCP NO', 'AMOUNT', null, 'BANK NAME', null, 'AMOUNT']);

        const maxRows = Math.max(cashReceipts.length, deposits.length, 10);
        let cashTotal = 0;
        let depositTotal = 0;

        for (let i = 0; i < maxRows; i++) {
            const c = cashReceipts[i];
            const d = deposits[i];
            const row = [
                c ? c.customer_name : null,
                c ? c.receipt_no : null,
                c ? c.amount : null,
                null,
                d ? d.particulars : null,
                null,
                d ? d.amount : null
            ];
            if (c) cashTotal += c.amount;
            if (d) depositTotal += d.amount;
            wsData.push(row);
        }

        wsData.push([null, 'TOTAL-', cashTotal, null, 'TOTAL', null, depositTotal]);
        wsData.push(['']);

        // Denominations
        wsData.push([null, null, null, null, 'CLOSING BALANCE DENOMINATIONS']);
        wsData.push([null, null, null, null, 'NOTE', 'COUNT', 'AMOUNT']);
        let denomTotal = 0;
        for (const denom of denominations) {
            denomTotal += denom.amount;
            wsData.push([null, null, null, null, denom.note_label, denom.note_count, denom.amount]);
        }
        wsData.push([null, null, null, null, 'TOTAL', null, denomTotal]);
        wsData.push(['']);

        // Cheque/NEFT Receipts
        wsData.push(['DETAILS OF CHEQUE/NEFT RECEIPTS']);
        wsData.push(['CUSTOMER NAME', 'REP NO', 'AMOUNT']);
        let nonCashTotal = 0;
        for (const nc of nonCashReceipts) {
            nonCashTotal += nc.amount;
            wsData.push([nc.customer_name, nc.receipt_no, nc.amount]);
        }
        wsData.push([null, 'Total', nonCashTotal]);
        wsData.push(['']);

        // Reconciliation Summary
        const opening = daySheet ? daySheet.opening_balance : 0;
        const sales = daySheet ? daySheet.cash_sales : 0;
        const less = daySheet ? daySheet.less_vouchers : 0;
        const closing = opening + cashTotal + sales - less - depositTotal;

        wsData.push(['OPENING BALANCE', null, opening]);
        wsData.push(['CASH RECEIPTS', null, cashTotal]);
        wsData.push(['CASH SALES ', null, sales]);
        wsData.push(['LESS:', null, less]);
        wsData.push(['BANK DEPOSITS', null, depositTotal]);
        wsData.push(['CLOSING BALANCE', null, closing]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, type);

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="DAY_SHEET_${branch.code}_${date}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
