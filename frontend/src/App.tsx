import { useState, useEffect, useCallback } from 'react';
import { 
  FileText, List, Upload, History, Printer, Download, 
  CheckCircle, AlertTriangle, RefreshCw, Search, ShieldCheck, 
  Building2, Calendar, Edit3, XCircle, Zap, Clock, FileCheck,
  WifiOff, Wifi, AlertCircle, Settings, ChevronDown, Trash2
} from 'lucide-react';

interface Branch {
  id: number;
  code: string;
  name: string;
  receipt_prefix: string;
  gstin: string;
  address: string;
  is_head_office: number;
}

interface Receipt {
  id: number;
  branch_id: number;
  receipt_no: string;
  receipt_date: string;
  receipt_type: string;
  customer_name: string;
  vehicle_no?: string;
  amount: number;
  payment_mode: string;
  received_towards?: string;
  utr_reference?: string;
  narration?: string;
  status: string;
  cancel_reason?: string;
  created_at: string;
}

interface Deposit {
  id?: number;
  particulars: string;
  amount: number;
}

interface Denomination {
  id?: number;
  note_label: string;
  note_value: number;
  note_count: number;
  amount: number;
}

interface DaySheetData {
  id?: number;
  branch_id: number;
  sheet_date: string;
  sheet_type: string;
  opening_balance: number;
  cash_sales: number;
  less_vouchers: number;
  status: string;
  notes?: string;
  totalCashReceipts: number;
  totalNonCashReceipts: number;
  totalBankDeposits: number;
  totalDenominations: number;
  calculatedClosing: number;
  diff: number;
  isReconciled: boolean;
}

interface SyncStatus {
  watcherActive: boolean;
  sourceFile: string;
  sourceFileExists: boolean;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  lastInserted: number | null;
  lastDuplicates: number | null;
  lastFailed: number | null;
  lastSyncType: string | null;
  history: SyncHistoryEntry[];
}

interface SyncHistoryEntry {
  id: number;
  sync_type: string;
  total_rows: number;
  inserted: number;
  skipped_duplicates: number;
  failed: number;
  started_at: string;
  completed_at: string;
  error_details: string | null;
}

interface ReceiptSyncRow {
  receiptNo: string;
  customer?: string;
  amount?: number;
  mode?: string;
  date?: string;
  status: 'IMPORTED' | 'DUPLICATE' | 'FAILED';
  reason?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'daysheet' | 'receipts' | 'sync' | 'audit'>('daysheet');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-22');
  const [sheetType, setSheetType] = useState<'SERVICE' | 'SALES'>('SERVICE');
  const [loading, setLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Day Sheet State
  const [daySheet, setDaySheet] = useState<DaySheetData | null>(null);
  const [cashReceipts, setCashReceipts] = useState<Receipt[]>([]);
  const [nonCashReceipts, setNonCashReceipts] = useState<Receipt[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  
  // Receipts List State
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [receiptSearch, setReceiptSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<string>('all');


  // Cancellation Modal
  const [cancelModalReceipt, setCancelModalReceipt] = useState<Receipt | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Edit Receipt Modal
  const [editModalReceipt, setEditModalReceipt] = useState<Receipt | null>(null);

  // Delete Receipt Modal
  const [deleteModalReceipt, setDeleteModalReceipt] = useState<Receipt | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Delete ALL Modal
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllScope, setDeleteAllScope] = useState<'filtered'|'all'>('filtered');


  const [importFile, setImportFile] = useState<File | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ receipts: ReceiptSyncRow[]; inserted: number; skippedDuplicates: number; failed: number; totalRows: number } | null>(null);
  const [syncError, setSyncError] = useState<string>('');

  // File Path Settings State
  const [pathInput, setPathInput] = useState<string>('');
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSaveMsg, setPathSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPathSettings, setShowPathSettings] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Fetch branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  // Fetch Day Sheet when branch, date, or type changes
  useEffect(() => {
    if (selectedBranchId && selectedDate) {
      fetchDaySheet();
    }
  }, [selectedBranchId, selectedDate, sheetType]);

  // Fetch data when tab changes
  useEffect(() => {
    if (activeTab === 'receipts') {
      fetchReceipts();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'sync') {
      fetchSyncStatus();
    }
  }, [activeTab, selectedBranchId, selectedDate, sheetType, filterMode, receiptSearch]);

  // Auto-refresh sync status every 30s when on sync tab
  useEffect(() => {
    if (activeTab !== 'sync') return;
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setBranches(data.data);
        setSelectedBranchId(data.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDaySheet = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/daysheet?branch_id=${selectedBranchId}&date=${selectedDate}&type=${sheetType}`);
      const data = await res.json();
      if (data.success) {
        setDaySheet(data.daySheet);
        setCashReceipts(data.cashReceipts);
        setNonCashReceipts(data.nonCashReceipts);
        setDeposits(data.deposits);
        setDenominations(data.denominations);
      }
    } catch (err) {
      console.error(err);
      showNotification('Failed to load Day Sheet', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchReceipts = async () => {
    try {
      let url = `/api/receipts?branch_id=${selectedBranchId}&receipt_type=${sheetType}`;
      if (filterMode === 'cash') url += '&payment_mode=cash';
      if (filterMode === 'non-cash') url += '&payment_mode=non-cash';
      if (receiptSearch) url += `&search=${encodeURIComponent(receiptSearch)}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setReceiptsList(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // â”€â”€ Sync helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/receipts/sync-status');
      const data = await res.json();
      if (data.success) setSyncStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSyncFromDisk = async () => {
    setSyncLoading(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const res = await fetch('/api/receipts/sync-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(data.result);
        showNotification(`Sync complete â€” ${data.result.inserted} new receipts imported.`, 'success');
        fetchSyncStatus();
        fetchDaySheet();
      } else {
        setSyncError(data.error || 'Sync failed');
        showNotification(data.error || 'Sync failed', 'error');
      }
    } catch (err: any) {
      setSyncError(err.message);
      showNotification(err.message, 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUploadAndSync = async () => {
    if (!importFile) {
      showNotification('Please select an Excel (.xlsx) file to upload', 'error');
      return;
    }
    setSyncLoading(true);
    setSyncError('');
    setSyncResult(null);
    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('branch_id', selectedBranchId.toString());
    try {
      const res = await fetch('/api/receipts/import-excel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult({
          receipts: data.receipts || [],
          inserted: data.inserted,
          skippedDuplicates: data.skippedDuplicates,
          failed: data.errorsCount,
          totalRows: data.totalRows
        });
        showNotification(`Upload sync done â€” ${data.inserted} new, ${data.skippedDuplicates} duplicates skipped.`, 'success');
        fetchSyncStatus();
        fetchDaySheet();
      } else {
        setSyncError(data.error || 'Upload failed');
        showNotification(data.error || 'Upload failed', 'error');
      }
    } catch (err: any) {
      setSyncError(err.message);
      showNotification(err.message, 'error');
    } finally {
      setSyncLoading(false);
    }
  };


  // Convert number to Indian currency words
  const convertToWords = (nStr: string): string => {
    const n = parseFloat(nStr);
    if (isNaN(n) || n <= 0) return '';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(num: number): string {
      let strNum = ('000000000' + num).slice(-9);
      let match = strNum.match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!match) return '';
      let str = '';
      str += (Number(match[1]) !== 0) ? (a[Number(match[1])] || b[Number(match[1][0])] + ' ' + a[Number(match[1][1])]) + 'Crore ' : '';
      str += (Number(match[2]) !== 0) ? (a[Number(match[2])] || b[Number(match[2][0])] + ' ' + a[Number(match[2][1])]) + 'Lakh ' : '';
      str += (Number(match[3]) !== 0) ? (a[Number(match[3])] || b[Number(match[3][0])] + ' ' + a[Number(match[3][1])]) + 'Thousand ' : '';
      str += (Number(match[4]) !== 0) ? (a[Number(match[4])] || b[Number(match[4][0])] + ' ' + a[Number(match[4][1])]) + 'Hundred ' : '';
      str += (Number(match[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(match[5])] || b[Number(match[5][0])] + ' ' + a[Number(match[5][1])]) : '';
      return str.trim();
    }

    const whole = Math.floor(n);
    const fraction = Math.round((n - whole) * 100);
    let res = inWords(whole) + ' Rupees';
    if (fraction > 0) res += ' and ' + inWords(fraction) + ' Paise';
    return res + ' Only';
  };

  const handleDenominationChange = (index: number, countStr: string) => {
    const count = parseInt(countStr, 10) || 0;
    const updated = [...denominations];
    updated[index].note_count = count;
    updated[index].amount = count * updated[index].note_value;
    setDenominations(updated);
  };

  const handleDepositChange = (index: number, field: 'particulars' | 'amount', value: any) => {
    const updated = [...deposits];
    if (field === 'amount') {
      updated[index].amount = parseFloat(value) || 0;
    } else {
      updated[index].particulars = value;
    }
    setDeposits(updated);
  };

  const addDepositRow = () => {
    setDeposits([...deposits, { particulars: '', amount: 0 }]);
  };

  const removeDepositRow = (index: number) => {
    const updated = deposits.filter((_, i) => i !== index);
    setDeposits(updated);
  };

  // Save Day Sheet parameters
  const handleSaveDaySheet = async () => {
    if (!daySheet) return;
    setLoading(true);
    try {
      const res = await fetch('/api/daysheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_sheet_id: daySheet.id,
          branch_id: selectedBranchId,
          sheet_date: selectedDate,
          sheet_type: sheetType,
          opening_balance: daySheet.opening_balance,
          cash_sales: daySheet.cash_sales,
          less_vouchers: daySheet.less_vouchers,
          status: daySheet.status,
          notes: daySheet.notes,
          deposits,
          denominations
        })
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Day Sheet saved successfully with updated parameters', 'success');
        fetchDaySheet();
      } else {
        showNotification(data.error || 'Failed to save Day Sheet', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };


  // Cancel Receipt Action
  const handleCancelReceipt = async () => {
    if (!cancelModalReceipt || !cancelReason.trim()) {
      showNotification('Please enter a cancellation reason', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/receipts/${cancelModalReceipt.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Receipt ${cancelModalReceipt.receipt_no} cancelled. Day Sheet updated.`, 'success');
        setCancelModalReceipt(null);
        setCancelReason('');
        fetchReceipts();
        fetchDaySheet();
      } else {
        showNotification(data.error, 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Delete Receipt Action (permanent)
  const handleDeleteReceipt = async () => {
    if (!deleteModalReceipt) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/receipts/${deleteModalReceipt.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: 'Accounts Staff' }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Receipt ${deleteModalReceipt.receipt_no} permanently deleted.`, 'success');
        setDeleteModalReceipt(null);
        fetchReceipts();
        fetchDaySheet();
      } else {
        showNotification(data.error, 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete ALL Receipts
  const handleDeleteAllReceipts = async () => {
    setDeleteAllLoading(true);
    try {
      const body: Record<string, any> = { confirm: 'DELETE ALL', user_name: 'Accounts Staff' };
      // If "filtered" scope — pass current filters so only filtered receipts are deleted
      if (deleteAllScope === 'filtered') {
        if (selectedBranchId) body.branch_id = selectedBranchId;
        if (selectedDate) body.date = selectedDate;
        body.receipt_type = sheetType;
      }
      const res = await fetch('/api/receipts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`${data.deleted} receipt(s) permanently deleted.`, 'success');
        setShowDeleteAllModal(false);
        fetchReceipts();
        fetchDaySheet();
      } else {
        showNotification(data.error || 'Delete failed', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setDeleteAllLoading(false);
    }
  };

  // Update Receipt Action
  const handleUpdateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalReceipt) return;

    try {
      const res = await fetch(`/api/receipts/${editModalReceipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editModalReceipt)
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Receipt ${editModalReceipt.receipt_no} updated successfully.`, 'success');
        setEditModalReceipt(null);
        fetchReceipts();
        fetchDaySheet();
      } else {
        showNotification(data.error, 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };


  // Calculate live closing balance and differences
  const currentTotalDenom = denominations.reduce((acc, d) => acc + (d.amount || 0), 0);
  const currentTotalDeposits = deposits.reduce((acc, d) => acc + (d.amount || 0), 0);
  const openingBal = daySheet?.opening_balance || 0;
  const cashRecsTotal = daySheet?.totalCashReceipts || 0;
  const cashSalesAmt = daySheet?.cash_sales || 0;
  const lessVouchersAmt = daySheet?.less_vouchers || 0;
  const closingBalanceCalculated = openingBal + cashRecsTotal + cashSalesAmt - lessVouchersAmt - currentTotalDeposits;
  const cashDiff = closingBalanceCalculated - currentTotalDenom;
  const isReconciled = Math.abs(cashDiff) < 0.01;

  const currentBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 24px',
          borderRadius: '8px',
          backgroundColor: notification.type === 'success' ? '#10b981' : notification.type === 'error' ? '#ef4444' : '#1e293b',
          color: '#ffffff',
          fontWeight: 600,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* HEADER BAR (NO-PRINT) */}
      <header className="no-print" style={{
        backgroundColor: '#0f172a',
        color: '#ffffff',
        borderBottom: '3px solid #d32f2f',
        padding: '12px 24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          
          {/* Logo & Dealership Details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              backgroundColor: '#d32f2f',
              color: '#ffffff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '1.2rem',
              letterSpacing: '1px'
            }}>
              MAHINDRA
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>
                BELLARY MOTORS SALES PVT. LTD.
              </h1>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', gap: '16px', marginTop: '2px' }}>
                <span><strong>H.O:</strong> BALLARI</span>
                <span><strong>GSTIN:</strong> 29AACCB6242J1ZK</span>
                <span><strong>System:</strong> Day Sheet & Service Receipt Automation</span>
              </div>
            </div>
          </div>

          {/* Quick Context Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Branch Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
              <Building2 size={16} color="#ef4444" />
              <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Branch:</label>
              <select 
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                style={{ background: 'transparent', color: '#ffffff', border: 'none', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id} style={{ background: '#1e293b', color: '#fff' }}>
                    {b.name} {b.is_head_office ? '(H.O)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
              <Calendar size={16} color="#ef4444" />
              <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Date:</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ background: 'transparent', color: '#ffffff', border: 'none', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              />
            </div>

            {/* Service / Sales Switch */}
            <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px', border: '1px solid #334155' }}>
              <button
                onClick={() => setSheetType('SERVICE')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: sheetType === 'SERVICE' ? '#d32f2f' : 'transparent',
                  color: '#ffffff',
                  transition: '0.2s'
                }}
              >
                WORKSHOP (SERVICE)
              </button>
              <button
                onClick={() => setSheetType('SALES')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: sheetType === 'SALES' ? '#d32f2f' : 'transparent',
                  color: '#ffffff',
                  transition: '0.2s'
                }}
              >
                SHOWROOM (SALES)
              </button>
            </div>

            <button
              onClick={fetchDaySheet}
              title="Refresh Day Sheet"
              style={{
                background: '#334155',
                border: 'none',
                color: '#fff',
                padding: '8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>

        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px', marginTop: '14px', borderTop: '1px solid #334155', paddingTop: '10px', flexWrap: 'wrap' }}>
          {[
            { id: 'daysheet', label: 'Day Sheet', icon: FileText },
            { id: 'receipts', label: 'Receipts Register', icon: List },
            { id: 'sync', label: 'Backup Sync', icon: Zap },
            { id: 'audit', label: 'Audit Trail', icon: History }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = tab.id === 'sync' && syncStatus?.lastSyncError ? '!' : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#d32f2f' : '#1e293b',
                  color: '#ffffff',
                  transition: '0.2s',
                  position: 'relative'
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {badge && <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#f59e0b', borderRadius: '50%', width: '8px', height: '8px' }} />}
              </button>
            );
          })}
        </nav>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, padding: '20px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>

        {/* ========================================================================= */}
        {/* TAB 1: DAY SHEET (MATCHES DAY SHEET.xlsx EXACT SPECIFICATION)             */}
        {/* ========================================================================= */}
        {activeTab === 'daysheet' && (
          <div>
            {/* Top Operational Action Bar (No-Print) */}
            <div className="no-print" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              backgroundColor: '#ffffff',
              padding: '14px 20px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  {sheetType === 'SERVICE' ? 'CASH SHEET â€” WORKSHOP' : 'CASH SHEET â€” SALES'}
                </span>
                <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: '#64748b' }}>
                  Branch: <strong>{currentBranch?.name}</strong> | Date: <strong>{selectedDate}</strong>
                </span>
              </div>

              {/* Status Badge & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isReconciled ? '#ecfdf5' : '#fef2f2',
                  color: isReconciled ? '#059669' : '#dc2626',
                  border: `1px solid ${isReconciled ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {isReconciled ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                  <span>{isReconciled ? 'CASH RECONCILED (â‚¹0.00 Diff)' : `MISMATCH: Diff â‚¹${cashDiff.toFixed(2)}`}</span>
                </div>

                <button
                  onClick={handleSaveDaySheet}
                  disabled={loading}
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>Save Day Sheet</span>
                </button>

                <button
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: '#d32f2f',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={16} />
                  <span>Print Day Sheet (A4)</span>
                </button>

                <a
                  href={`/api/daysheet/export-excel?branch_id=${selectedBranchId}&date=${selectedDate}&type=${sheetType}`}
                  download
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={16} />
                  <span>Export Excel</span>
                </a>
              </div>
            </div>

            {/* Summary KPI Badges (No-Print) */}
            <div className="no-print" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Cash Receipts Today</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  â‚¹{cashRecsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px' }}>{cashReceipts.length} Cash Receipts</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>PhonePe / Digital Receipts</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
                  â‚¹{(daySheet?.totalNonCashReceipts || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '2px' }}>{nonCashReceipts.length} UPI/NEFT Receipts</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Bank Deposits / Vouchers</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
                  â‚¹{currentTotalDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Deposited into Bank / Expenses</div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Physical Cash Counted</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isReconciled ? '#059669' : '#dc2626', marginTop: '4px' }}>
                  â‚¹{currentTotalDenom.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: isReconciled ? '#059669' : '#dc2626', marginTop: '2px' }}>
                  {isReconciled ? 'âœ“ Matched Closing Cash' : `Difference: â‚¹${cashDiff.toFixed(2)}`}
                </div>
              </div>
            </div>

            {/* EXACT PRINTABLE DAY SHEET (CORRESPONDS 1:1 TO DAY SHEET.xlsx) */}
            <div className="print-page" style={{
              backgroundColor: '#ffffff',
              padding: '24px',
              borderRadius: '8px',
              border: '2px solid #0f172a',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}>
              
              {/* Sheet Title and Metadata */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '10px', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {sheetType === 'SERVICE' ? 'CASH SHEET- WORKSHOP' : 'CASH SHEET- SALES'}
                </h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.9rem', fontWeight: 700 }}>
                  <span>BRANCH: {currentBranch?.name}</span>
                  <span>DATE: {selectedDate}</span>
                </div>
              </div>

              {/* Two-Column Grid matching DAY SHEET.xlsx layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                
                {/* ===================== LEFT COLUMN ===================== */}
                <div>
                  
                  {/* SECTION 1: DETAILS OF CASH RECEIPTS */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase'
                    }}>
                      DETAILS OF CASH RECEIPTS
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', width: '55%' }}>CUSTOMER NAME</th>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', width: '25%' }}>RCP NO</th>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', width: '20%' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashReceipts.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                              No cash receipts recorded for this date
                            </td>
                          </tr>
                        ) : (
                          cashReceipts.map((r, i) => (
                            <tr key={r.id || i} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontWeight: 500 }}>
                                {r.customer_name}
                              </td>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
                                {r.receipt_no}
                              </td>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                                {r.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                        {/* TOTAL CASH ROW (Matches C30: SUM(C10:C25)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right' }}>TOTAL-</td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.85rem' }}>
                            {cashRecsTotal.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION 2: DETAILS OF CHEQUE/NEFT RECEIPTS (Row 33: DETAILS OF CHEQUE/NEFT RECEIPTS) */}
                  <div>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase'
                    }}>
                      DETAILS OF CHEQUE/NEFT RECEIPTS (PHONEPE / UPI / DIGITAL)
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', width: '55%' }}>CUSTOMER NAME</th>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', width: '25%' }}>REP NO</th>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', width: '20%' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonCashReceipts.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                              No non-cash receipts recorded for this date
                            </td>
                          </tr>
                        ) : (
                          nonCashReceipts.map((r, i) => (
                            <tr key={r.id || i} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontWeight: 500 }}>
                                <div>{r.customer_name}</div>
                                {r.utr_reference && (
                                  <div style={{ fontSize: '0.7rem', color: '#475569' }}>Ref: {r.utr_reference}</div>
                                )}
                              </td>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
                                {r.receipt_no}
                              </td>
                              <td style={{ padding: '5px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                                {r.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                        {/* TOTAL CHEQUE/NEFT ROW (Matches C59: SUM(C35:C58)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right' }}>Total</td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.85rem', color: '#1e40af' }}>
                            {(daySheet?.totalNonCashReceipts || 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* ===================== RIGHT COLUMN ===================== */}
                <div>
                  
                  {/* SECTION 3: DETAILS OF BANK DEPOSIT (Rows 8-13 in DAY SHEET.xlsx) */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>DETAILS OF BANK DEPOSIT</span>
                      <button 
                        className="no-print"
                        onClick={addDepositRow}
                        style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}
                      >
                        + Add Bank/Expense
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', width: '60%' }}>BANK NAME / PARTICULARS</th>
                          <th style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', width: '35%' }}>AMOUNT</th>
                          <th className="no-print" style={{ width: '5%', border: '1px solid #0f172a' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((d, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '4px 6px', border: '1px solid #0f172a' }}>
                              <input 
                                type="text"
                                value={d.particulars}
                                onChange={(e) => handleDepositChange(idx, 'particulars', e.target.value)}
                                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontWeight: 600, fontSize: '0.8rem' }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>
                              <input 
                                type="number"
                                step="any"
                                value={d.amount || ''}
                                onChange={(e) => handleDepositChange(idx, 'amount', e.target.value)}
                                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontWeight: 600, fontSize: '0.8rem' }}
                              />
                            </td>
                            <td className="no-print" style={{ textAlign: 'center', border: '1px solid #0f172a' }}>
                              {deposits.length > 1 && (
                                <button 
                                  onClick={() => removeDepositRow(idx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                                >
                                  Ã—
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* TOTAL BANK DEPOSIT (G13: SUM(G10:G12)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right' }}>TOTAL</td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.85rem' }}>
                            {currentTotalDeposits.toFixed(2)}
                          </td>
                          <td className="no-print" style={{ border: '1px solid #0f172a' }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION 4: CLOSING BALANCE DENOMINATIONS (Rows 15-28 in DAY SHEET.xlsx) */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase'
                    }}>
                      CLOSING BALANCE DENOMINATIONS
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '5px 6px', border: '1px solid #0f172a', width: '30%' }}>NOTE</th>
                          <th style={{ padding: '5px 6px', border: '1px solid #0f172a', width: '30%', textAlign: 'center' }}>COUNT</th>
                          <th style={{ padding: '5px 6px', border: '1px solid #0f172a', textAlign: 'right', width: '40%' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {denominations.map((denom, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 600 }}>
                              {denom.note_label}
                            </td>
                            <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'center' }}>
                              <input 
                                type="number"
                                min="0"
                                value={denom.note_count || ''}
                                onChange={(e) => handleDenominationChange(idx, e.target.value)}
                                style={{ width: '60px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '3px', padding: '2px', fontWeight: 600 }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                              {denom.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {/* TOTAL DENOMINATIONS ROW (G28: SUM(G20:G27)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '6px', border: '1px solid #0f172a' }}>TOTAL</td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.85rem' }}>
                            {currentTotalDenom.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION 5: BOTTOM RECONCILIATION SUMMARY (Rows 61-68 in DAY SHEET.xlsx) */}
                  <div>
                    <div style={{
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: '1px solid #0f172a',
                      textTransform: 'uppercase'
                    }}>
                      SUMMARY & CASH RECONCILIATION
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', border: '1px solid #0f172a' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', fontWeight: 700, width: '65%' }}>
                            OPENING BALANCE
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.opening_balance || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, opening_balance: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '120px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700 }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', fontWeight: 700 }}>
                            CASH RECEIPTS (Auto-derived)
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            {cashRecsTotal.toFixed(2)}
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', fontWeight: 700 }}>
                            CASH SALES
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.cash_sales || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, cash_sales: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '120px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700 }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', fontWeight: 700, color: '#dc2626' }}>
                            LESS: (Expenses / Vouchers)
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.less_vouchers || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, less_vouchers: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '120px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700, color: '#dc2626' }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', fontWeight: 700, color: '#dc2626' }}>
                            BANK DEPOSITS (Auto-derived)
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            {currentTotalDeposits.toFixed(2)}
                          </td>
                        </tr>

                        {/* FORMULA: C61 + C62 + C63 - C65 - C67 */}
                        <tr style={{ backgroundColor: '#f1f5f9', fontSize: '0.9rem' }}>
                          <td style={{ padding: '8px', border: '1px solid #0f172a', fontWeight: 800 }}>
                            CLOSING BALANCE
                          </td>
                          <td style={{ padding: '8px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 800, fontSize: '1rem' }}>
                            {closingBalanceCalculated.toFixed(2)}
                          </td>
                        </tr>

                        {/* DENOMINATIONS MATCH STATUS */}
                        <tr style={{ backgroundColor: isReconciled ? '#ecfdf5' : '#fef2f2' }}>
                          <td style={{ padding: '8px', border: '1px solid #0f172a', fontWeight: 800, color: isReconciled ? '#059669' : '#dc2626' }}>
                            DENOMINATIONS RECONCILIATION
                          </td>
                          <td style={{ padding: '8px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 800, color: isReconciled ? '#059669' : '#dc2626' }}>
                            {isReconciled ? 'BALANCED âœ“' : `DIFF: â‚¹${cashDiff.toFixed(2)}`}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>

              {/* Signatures Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #0f172a', fontSize: '0.85rem', fontWeight: 700 }}>
                <div>Cashier Signature</div>
                <div>Accountant Signature</div>
                <div>Branch Manager Signature</div>
              </div>

            </div>
          </div>
        )}


        {/* ========================================================================= */}
        {/* TAB 3: RECEIPTS REGISTER (SEARCH, FILTER, EDIT, CANCEL WITH AUDIT)       */}
        {/* ========================================================================= */}
        {activeTab === 'receipts' && (
          <div>
            {/* Filter Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              backgroundColor: '#ffffff',
              padding: '14px 20px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '16px'
            }}>
              {/* Search Box */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
                <Search size={18} color="#64748b" />
                <input 
                  type="text"
                  placeholder="Search receipt no, customer name, vehicle, or UTR..."
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Mode Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Filter Mode:</span>
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value)}
                  style={{ padding: '8px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600 }}
                >
                  <option value="all">All Modes</option>
                  <option value="cash">Cash Only</option>
                  <option value="non-cash">Non-Cash (PhonePe/UPI/Cheque)</option>
                </select>

                <button
                  onClick={fetchReceipts}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>

                {/* Delete All Button */}
                <button
                  id="delete-all-receipts-btn"
                  onClick={() => { setDeleteAllScope('filtered'); setShowDeleteAllModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: '#b91c1c', color: '#ffffff',
                    border: 'none', padding: '8px 14px', borderRadius: '6px',
                    fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Delete all receipts matching current filters"
                >
                  <Trash2 size={14} />
                  Delete All
                </button>
              </div>
            </div>

            {/* Receipts Table */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>Receipt No</th>
                    <th style={{ padding: '10px 12px' }}>Date</th>
                    <th style={{ padding: '10px 12px' }}>Customer & Vehicle</th>
                    <th style={{ padding: '10px 12px' }}>Payment Mode</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '10px 12px' }}>Towards / UTR</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        No receipts found matching criteria
                      </td>
                    </tr>
                  ) : (
                    receiptsList.map((r) => (
                      <tr key={r.id} style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: r.status === 'CANCELLED' ? '#fef2f2' : 'transparent',
                        opacity: r.status === 'CANCELLED' ? 0.75 : 1
                      }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', color: '#d32f2f' }}>
                          {r.receipt_no}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {r.receipt_date}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          <div>{r.customer_name}</div>
                          {r.vehicle_no && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.vehicle_no}</div>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: r.payment_mode.toLowerCase() === 'cash' ? '#ecfdf5' : '#eff6ff',
                            color: r.payment_mode.toLowerCase() === 'cash' ? '#065f46' : '#1d4ed8'
                          }}>
                            {r.payment_mode}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem' }}>
                          â‚¹{r.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#475569', maxWidth: '240px' }}>
                          <div>{r.received_towards}</div>
                          {r.utr_reference && <div style={{ fontFamily: 'monospace', color: '#2563eb' }}>Ref: {r.utr_reference}</div>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: r.status === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                            color: r.status === 'ACTIVE' ? '#047857' : '#b91c1c'
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {r.status === 'ACTIVE' ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={() => setEditModalReceipt({ ...r })}
                                title="Edit Receipt"
                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                              >
                                <Edit3 size={14} color="#0f172a" />
                              </button>
                              <button
                                onClick={() => setCancelModalReceipt(r)}
                                title="Cancel Receipt"
                                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                              >
                                <XCircle size={14} color="#dc2626" />
                              </button>
                              <button
                                onClick={() => setDeleteModalReceipt(r)}
                                title="Delete Receipt permanently"
                                style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                              >
                                <Trash2 size={14} color="#b91c1c" />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>{r.cancel_reason}</span>
                              <button
                                onClick={() => setDeleteModalReceipt(r)}
                                title="Delete Receipt permanently"
                                style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}
                              >
                                <Trash2 size={14} color="#b91c1c" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BACKUP SYNC TAB                                                           */}
        {/* ========================================================================= */}
        {activeTab === 'sync' && (
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>

            {/* â”€â”€ Watcher Status Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{
              backgroundColor: '#ffffff', borderRadius: '10px',
              border: '1px solid #e2e8f0', padding: '20px', marginBottom: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                    ðŸ“‚ Backup Excel Auto-Sync
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Connected to <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                      {syncStatus?.sourceFile ? syncStatus.sourceFile.split(/[/\\]/).pop() : 'Service_Data_Backup.xlsx'}
                    </code>
                    {' '}â€” the system reads new receipts from this file and populates the Day Sheet automatically.
                  </p>
                </div>
                <button
                  onClick={fetchSyncStatus}
                  style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <RefreshCw size={14} /> Refresh Status
                </button>
              </div>

              {/* Status indicators */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                {/* Watcher status */}
                <div style={{
                  padding: '12px 16px', borderRadius: '8px', border: '1px solid',
                  borderColor: syncStatus?.watcherActive ? '#a7f3d0' : '#fde68a',
                  backgroundColor: syncStatus?.watcherActive ? '#ecfdf5' : '#fffbeb'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {syncStatus?.watcherActive
                      ? <Wifi size={15} color="#059669" />
                      : <WifiOff size={15} color="#d97706" />}
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: syncStatus?.watcherActive ? '#059669' : '#d97706' }}>
                      File Watcher
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: syncStatus?.watcherActive ? '#065f46' : '#92400e' }}>
                    {syncStatus === null ? 'Checking...' : syncStatus.watcherActive ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                </div>

                {/* Source file status */}
                <div style={{
                  padding: '12px 16px', borderRadius: '8px', border: '1px solid',
                  borderColor: syncStatus?.sourceFileExists ? '#a7f3d0' : '#fecaca',
                  backgroundColor: syncStatus?.sourceFileExists ? '#ecfdf5' : '#fef2f2'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: syncStatus?.sourceFileExists ? '#059669' : '#dc2626', marginBottom: '4px' }}>Source File</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: syncStatus?.sourceFileExists ? '#065f46' : '#991b1b' }}>
                    {syncStatus === null ? '...' : syncStatus.sourceFileExists ? 'FOUND âœ“' : 'NOT FOUND âœ—'}
                  </div>
                </div>

                {/* Last sync time */}
                <div style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>Last Sync</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    {syncStatus?.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString() : 'Never'}
                  </div>
                </div>

                {/* Last result */}
                <div style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>Last Result</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                    {syncStatus?.lastInserted != null
                      ? `+${syncStatus?.lastInserted ?? 0} new · ${syncStatus?.lastDuplicates ?? 0} dup`
                      : 'â€”'}
                  </div>
                </div>
              </div>

              {/* Error display */}
              {syncStatus?.lastSyncError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ marginTop: '1px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', marginBottom: '2px' }}>Last Sync Error</div>
                    <div style={{ fontSize: '0.8rem', color: '#991b1b', fontFamily: 'monospace' }}>{syncStatus.lastSyncError}</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── File Path Settings Panel ─────────────────────────────────── */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              border: '2px solid #f59e0b',
              marginBottom: '20px',
              boxShadow: '0 2px 8px rgba(245,158,11,0.1)',
              overflow: 'hidden',
            }}>
              <button
                id="path-settings-toggle"
                onClick={() => {
                  setShowPathSettings(s => !s);
                  setPathSaveMsg(null);
                  if (!showPathSettings) {
                    fetch('/api/receipts/settings').then(r => r.json()).then(d => {
                      if (d.success) setPathInput(d.backupFilePath || '');
                    }).catch(() => {});
                  }
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '16px 20px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ backgroundColor: '#f59e0b', borderRadius: '8px', padding: '8px', display: 'flex', flexShrink: 0 }}>
                  <Settings size={18} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                    Change Backup File Path
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    If your Excel file moved to a different folder, update the path here
                  </div>
                </div>
                <ChevronDown
                  size={18} color="#64748b"
                  style={{ transition: 'transform 0.2s', transform: showPathSettings ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                />
              </button>

              {showPathSettings && (
                <div style={{ borderTop: '1px solid #fef3c7', padding: '20px' }}>
                  <div style={{ marginBottom: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#78350f' }}>
                    Full path to the Excel backup file:
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      id="backup-file-path-input"
                      type="text"
                      value={pathInput}
                      onChange={e => { setPathInput(e.target.value); setPathSaveMsg(null); }}
                      placeholder="e.g. D:\Backup\Service_Data_Backup.xlsx or \\Server\Share\file.xlsx"
                      style={{
                        flex: 1, minWidth: '280px', padding: '10px 14px',
                        border: '2px solid #fcd34d', borderRadius: '8px',
                        fontSize: '0.85rem', fontFamily: 'monospace',
                        outline: 'none', backgroundColor: '#fffbeb',
                      }}
                    />
                    <button
                      id="save-backup-path-btn"
                      disabled={pathSaving || !pathInput.trim()}
                      onClick={async () => {
                        setPathSaving(true);
                        setPathSaveMsg(null);
                        try {
                          const res = await fetch('/api/receipts/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ backupFilePath: pathInput.trim() }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            setPathSaveMsg({ text: data.message, ok: data.fileExists });
                            fetchSyncStatus();
                            showNotification(
                              data.fileExists ? 'File path saved & watcher restarted!' : 'Path saved, but file not found at that location.',
                              data.fileExists ? 'success' : 'error'
                            );
                          } else {
                            setPathSaveMsg({ text: data.error, ok: false });
                          }
                        } catch (err: any) {
                          setPathSaveMsg({ text: 'Save failed: ' + err.message, ok: false });
                        } finally {
                          setPathSaving(false);
                        }
                      }}
                      style={{
                        padding: '10px 22px', borderRadius: '8px', fontWeight: 700,
                        fontSize: '0.85rem', border: 'none', cursor: pathSaving || !pathInput.trim() ? 'not-allowed' : 'pointer',
                        backgroundColor: pathSaving ? '#e2e8f0' : '#f59e0b',
                        color: pathSaving ? '#94a3b8' : '#fff',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pathSaving ? 'Saving...' : '💾 Save & Apply'}
                    </button>
                  </div>

                  {pathSaveMsg && (
                    <div style={{
                      marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
                      backgroundColor: pathSaveMsg.ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${pathSaveMsg.ok ? '#86efac' : '#fecaca'}`,
                      fontSize: '0.82rem', fontWeight: 600,
                      color: pathSaveMsg.ok ? '#166534' : '#dc2626',
                    }}>
                      {pathSaveMsg.ok ? '✅ ' : '⚠️ '}{pathSaveMsg.text}
                    </div>
                  )}

                  <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#fffbeb', borderRadius: '8px', fontSize: '0.78rem', color: '#92400e', lineHeight: 1.6 }}>
                    <strong>💡 Tip:</strong> Use the <strong>full file path</strong> on this computer (where the server runs).<br/>
                    Network drive example: <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>\\Server01\Share\Backup\file.xlsx</code>
                  </div>
                </div>
              )}
            </div>
            {/* â”€â”€ Action Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

              {/* Card 1: Sync from disk */}
              <div style={{
                backgroundColor: '#ffffff', borderRadius: '10px',
                border: '2px solid #e2e8f0', padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px', display: 'flex' }}>
                    <Zap size={20} color="#ffffff" />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Sync from Server File</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Reads the configured backup path</div>
                  </div>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '16px', lineHeight: 1.5 }}>
                  Click to immediately read the backup Excel file on disk. New receipts are imported; duplicates are skipped automatically.
                  The file watcher does this automatically on every save.
                </p>
                <button
                  onClick={handleSyncFromDisk}
                  disabled={syncLoading}
                  style={{
                    width: '100%', padding: '11px', borderRadius: '8px',
                    border: 'none', backgroundColor: '#0f172a', color: '#fff',
                    fontWeight: 700, fontSize: '0.9rem', cursor: syncLoading ? 'not-allowed' : 'pointer',
                    opacity: syncLoading ? 0.7 : 1, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '8px', transition: '0.2s'
                  }}
                >
                  {syncLoading ? <RefreshCw size={16} className="spin" /> : <Zap size={16} />}
                  {syncLoading ? 'Syncing...' : 'Sync Now from Disk'}
                </button>
              </div>

              {/* Card 2: Upload file */}
              <div style={{
                backgroundColor: '#ffffff', borderRadius: '10px',
                border: '2px solid #e2e8f0', padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ backgroundColor: '#d32f2f', borderRadius: '8px', padding: '8px', display: 'flex' }}>
                    <Upload size={20} color="#ffffff" />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Upload Backup File</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Drag in a backup from another location</div>
                  </div>
                </div>
                <div style={{
                  border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '16px',
                  textAlign: 'center', backgroundColor: '#f8fafc', marginBottom: '12px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="file" accept=".xlsx,.xls"
                    onChange={(e) => setImportFile(e.target.files ? e.target.files[0] : null)}
                    style={{ fontSize: '0.82rem', width: '100%' }}
                  />
                  {importFile && (
                    <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                      âœ“ {importFile.name}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUploadAndSync}
                  disabled={syncLoading || !importFile}
                  style={{
                    width: '100%', padding: '11px', borderRadius: '8px',
                    border: 'none', backgroundColor: '#d32f2f', color: '#fff',
                    fontWeight: 700, fontSize: '0.9rem',
                    cursor: (syncLoading || !importFile) ? 'not-allowed' : 'pointer',
                    opacity: (syncLoading || !importFile) ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <ShieldCheck size={16} />
                  Upload & Sync (Duplicate Safe)
                </button>
              </div>
            </div>

            {/* â”€â”€ Sync Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {syncError && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 600, fontSize: '0.9rem' }}>
                âš  {syncError}
              </div>
            )}

            {syncResult && (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {/* Summary row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
                  {[
                    { label: 'TOTAL ROWS', val: syncResult.totalRows, bg: '#f8fafc', col: '#0f172a' },
                    { label: 'NEW IMPORTED', val: syncResult.inserted, bg: '#ecfdf5', col: '#059669' },
                    { label: 'DUPLICATES SKIPPED', val: syncResult.skippedDuplicates, bg: '#fffbeb', col: '#d97706' },
                    { label: 'FAILED', val: syncResult.failed, bg: syncResult.failed > 0 ? '#fef2f2' : '#f8fafc', col: syncResult.failed > 0 ? '#dc2626' : '#0f172a' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '14px 16px', textAlign: 'center', backgroundColor: s.bg }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{s.label}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.col }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Per-receipt table */}
                {syncResult.receipts.length > 0 && (
                  <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead style={{ position: 'sticky', top: 0 }}>
                        <tr style={{ backgroundColor: '#0f172a', color: '#fff' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Receipt No</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Customer</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Amount</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncResult.receipts.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '7px 12px' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700,
                                backgroundColor: r.status === 'IMPORTED' ? '#ecfdf5' : r.status === 'DUPLICATE' ? '#fffbeb' : '#fef2f2',
                                color: r.status === 'IMPORTED' ? '#059669' : r.status === 'DUPLICATE' ? '#d97706' : '#dc2626'
                              }}>{r.status}</span>
                            </td>
                            <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{r.receiptNo}</td>
                            <td style={{ padding: '7px 12px', color: '#334155', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || r.reason || 'â€”'}</td>
                            <td style={{ padding: '7px 12px', color: '#475569' }}>{r.date || 'â€”'}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>
                              {r.amount ? `â‚¹${r.amount.toLocaleString('en-IN')}` : 'â€”'}
                            </td>
                            <td style={{ padding: '7px 12px' }}>
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
                                backgroundColor: r.mode?.toLowerCase() === 'cash' ? '#ecfdf5' : '#f0f9ff',
                                color: r.mode?.toLowerCase() === 'cash' ? '#065f46' : '#0369a1'
                              }}>{r.mode || 'â€”'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* â”€â”€ Sync History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {syncStatus?.history && syncStatus.history.length > 0 && (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#64748b" />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Recent Sync History</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', color: '#475569' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Time</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Total</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>+New</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>Dups</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncStatus.history.map((h) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                            backgroundColor: h.sync_type === 'AUTO_WATCH' ? '#ede9fe' : h.sync_type === 'MANUAL_UPLOAD' ? '#dbeafe' : '#f1f5f9',
                            color: h.sync_type === 'AUTO_WATCH' ? '#7c3aed' : h.sync_type === 'MANUAL_UPLOAD' ? '#1d4ed8' : '#475569'
                          }}>{h.sync_type.replace('_', ' ')}</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.79rem' }}>{new Date(h.started_at).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{h.total_rows}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>+{h.inserted}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706' }}>{h.skipped_duplicates}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: h.failed > 0 ? '#dc2626' : '#94a3b8' }}>{h.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {/* ========================================================================= */}
        {/* TAB 5: AUDIT LOGS                                                        */}
        {/* ========================================================================= */}
        {activeTab === 'audit' && (
          <div>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>System Audit Trail</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Immutable log of all user activities, receipt edits, cancellations, and reconciliations.
                </p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>Timestamp</th>
                    <th style={{ padding: '10px 12px' }}>User</th>
                    <th style={{ padding: '10px 12px' }}>Entity</th>
                    <th style={{ padding: '10px 12px' }}>Action</th>
                    <th style={{ padding: '10px 12px' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                        No audit events recorded yet
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#475569' }}>
                          {log.timestamp}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {log.user_name}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9', fontWeight: 600, fontSize: '0.75rem' }}>
                            {log.entity_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: log.action === 'CANCEL' ? '#dc2626' : '#059669' }}>
                          {log.action}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#334155', fontFamily: 'monospace' }}>
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* CANCELLATION MODAL */}
      {cancelModalReceipt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', width: '450px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626', marginBottom: '8px' }}>
              Cancel Receipt: {cancelModalReceipt.receipt_no}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
              Financial records cannot be deleted silently. Please provide a mandatory cancellation reason for the audit trail.
            </p>
            <textarea
              required
              placeholder="e.g. Incorrect customer bill reference entered / duplicate voucher created by mistake"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ width: '100%', height: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '16px', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setCancelModalReceipt(null);
                  setCancelReason('');
                }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Back
              </button>
              <button
                onClick={handleCancelReceipt}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}


      {/* DELETE ALL RECEIPTS MODAL */}
      {showDeleteAllModal && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10001,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '14px', padding: '30px',
            width: '480px', maxWidth: '95vw',
            boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            border: '3px solid #b91c1c',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#fee2e2', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={26} color="#b91c1c" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b91c1c', margin: 0 }}>
                  Delete All Receipts
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px' }}>
                  This will permanently remove receipts from the database
                </div>
              </div>
            </div>

            {/* Scope Selector */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>
                Which receipts do you want to delete?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '8px', border: `2px solid ${deleteAllScope === 'filtered' ? '#b91c1c' : '#e2e8f0'}`, cursor: 'pointer', backgroundColor: deleteAllScope === 'filtered' ? '#fef2f2' : '#fff' }}>
                  <input type="radio" checked={deleteAllScope === 'filtered'} onChange={() => setDeleteAllScope('filtered')} style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                      Current filter only
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                      Delete receipts for: <strong>{selectedDate || 'all dates'}</strong> · Branch: <strong>{branches.find(b => b.id === Number(selectedBranchId))?.name || 'all'}</strong> · Type: <strong>{sheetType}</strong>
                    </div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '8px', border: `2px solid ${deleteAllScope === 'all' ? '#b91c1c' : '#e2e8f0'}`, cursor: 'pointer', backgroundColor: deleteAllScope === 'all' ? '#fef2f2' : '#fff' }}>
                  <input type="radio" checked={deleteAllScope === 'all'} onChange={() => setDeleteAllScope('all')} style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                      🚨 ALL receipts (entire database)
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#dc2626', marginTop: '2px', fontWeight: 600 }}>
                      Removes every receipt across all branches, all dates, all types
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '0.82rem', color: '#b91c1c', fontWeight: 600 }}>
              ⚠️ This action <strong>cannot be undone</strong>. Deletion will be logged in the Audit Trail.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={deleteAllLoading}
                style={{ padding: '10px 22px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-all-btn"
                onClick={handleDeleteAllReceipts}
                disabled={deleteAllLoading}
                style={{
                  padding: '10px 22px', borderRadius: '8px', border: 'none',
                  background: deleteAllLoading ? '#e2e8f0' : '#b91c1c',
                  color: deleteAllLoading ? '#94a3b8' : '#fff',
                  fontWeight: 800, fontSize: '0.88rem',
                  cursor: deleteAllLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '7px',
                }}
              >
                <Trash2 size={16} />
                {deleteAllLoading ? 'Deleting...' : 'Yes, Delete All Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE RECEIPT MODAL */}
      {deleteModalReceipt && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '440px', boxShadow: '0 20px 40px rgba(0,0,0,0.35)', border: '2px solid #fca5a5' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#fee2e2', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={22} color="#b91c1c" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#b91c1c', margin: 0 }}>
                  Permanently Delete Receipt
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                  This action cannot be undone
                </div>
              </div>
            </div>

            {/* Receipt Info */}
            <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', border: '1px solid #fecaca' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.82rem' }}>
                <div><span style={{ color: '#94a3b8' }}>Receipt No:</span> <strong>{deleteModalReceipt.receipt_no}</strong></div>
                <div><span style={{ color: '#94a3b8' }}>Date:</span> <strong>{deleteModalReceipt.receipt_date}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#94a3b8' }}>Customer:</span> <strong>{deleteModalReceipt.customer_name}</strong></div>
                <div><span style={{ color: '#94a3b8' }}>Amount:</span> <strong style={{ color: '#b91c1c' }}>₹{deleteModalReceipt.amount?.toLocaleString('en-IN')}</strong></div>
                <div><span style={{ color: '#94a3b8' }}>Mode:</span> <strong>{deleteModalReceipt.payment_mode}</strong></div>
              </div>
            </div>

            <p style={{ fontSize: '0.83rem', color: '#475569', marginBottom: '20px', lineHeight: 1.6 }}>
              ⚠️ This will <strong>permanently remove</strong> this receipt from the database. A deletion record will be saved in the Audit Trail.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDeleteModalReceipt(null)}
                disabled={deleteLoading}
                style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-receipt-btn"
                onClick={handleDeleteReceipt}
                disabled={deleteLoading}
                style={{
                  padding: '9px 22px', borderRadius: '8px', border: 'none',
                  background: deleteLoading ? '#e2e8f0' : '#b91c1c',
                  color: deleteLoading ? '#94a3b8' : '#fff',
                  fontWeight: 700, fontSize: '0.85rem',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Trash2 size={14} />
                {deleteLoading ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT RECEIPT MODAL */}
      {editModalReceipt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <form onSubmit={handleUpdateReceipt} style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>
              Edit Receipt: {editModalReceipt.receipt_no}
            </h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Customer Name:</label>
              <input 
                type="text"
                required
                value={editModalReceipt.customer_name}
                onChange={(e) => setEditModalReceipt({ ...editModalReceipt, customer_name: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Amount (â‚¹):</label>
                <input 
                  type="number"
                  step="any"
                  required
                  value={editModalReceipt.amount}
                  onChange={(e) => setEditModalReceipt({ ...editModalReceipt, amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Payment Mode:</label>
                <select
                  value={editModalReceipt.payment_mode}
                  onChange={(e) => setEditModalReceipt({ ...editModalReceipt, payment_mode: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                >
                  <option value="Cash">Cash</option>
                  <option value="PhonePe">PhonePe</option>
                  <option value="UPI">UPI / GPay</option>
                  <option value="NEFT">NEFT / RTGS</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Received Towards:</label>
              <input 
                type="text"
                value={editModalReceipt.received_towards || ''}
                onChange={(e) => setEditModalReceipt({ ...editModalReceipt, received_towards: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>UTR / Reference No:</label>
              <input 
                type="text"
                value={editModalReceipt.utr_reference || ''}
                onChange={(e) => setEditModalReceipt({ ...editModalReceipt, utr_reference: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditModalReceipt(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FOOTER */}
      <footer className="no-print" style={{
        backgroundColor: '#0f172a',
        color: '#94a3b8',
        padding: '12px 24px',
        textAlign: 'center',
        fontSize: '0.75rem',
        borderTop: '1px solid #334155',
        marginTop: 'auto'
      }}>
        Bellary Motors Sales Pvt. Ltd. â€” Automotive Accounting Day Sheet System | Connected to Persistent Local Database
      </footer>

    </div>
  );
}
