import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { 
  FileText, List, Upload, History, Printer, Download, 
  CheckCircle, AlertTriangle, RefreshCw, Search, ShieldCheck, 
  Building2, Calendar, Edit3, XCircle, Zap, Clock, FileCheck,
  WifiOff, Wifi, AlertCircle, Settings, ChevronDown, Trash2, RotateCcw,
  ExternalLink, FolderDown, X, Monitor, Shield, Lock, Unlock, Key, PlusCircle,
  Eye, Table2
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
  received_towards_purpose?: string;
  received_towards_reference?: string;
  utr_reference?: string;
  dated_on?: string;
  drawn_on?: string;
  narration?: string;
  status: string;
  cancel_reason?: string;
  created_at: string;
}

interface ReceivedTowardsPurpose {
  id: number;
  name: string;
  sort_order?: number;
  created_by?: string;
  created_at?: string;
}

// `received_towards` is stored/printed as "PURPOSE : REFERENCE".
// The two helpers below keep the separate purpose/reference fields in sync.
const splitTowards = (value?: string | null): { purpose: string; reference: string } => {
  const raw = (value || '').toString().trim();
  if (!raw) return { purpose: '', reference: '' };
  const idx = raw.indexOf(':');
  if (idx === -1) return { purpose: raw, reference: '' };
  return {
    purpose: raw.slice(0, idx).trim(),
    reference: raw.slice(idx + 1).trim()
  };
};

const composeTowards = (purpose?: string | null, reference?: string | null): string => {
  const p = (purpose || '').toString().trim();
  const r = (reference || '').toString().trim();
  if (!p) return r;
  return r ? `${p} : ${r}` : p;
};

interface Deposit {
  id?: number;
  particulars: string;
  amount: number;
}

interface Expense {
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
  totalExpenses: number;
  totalDenominations: number;
  calculatedClosing: number;
  diff: number;
  isReconciled: boolean;
  hasPreviousDay?: boolean;
  previousDayDate?: string | null;
  previousClosingBalance?: number | null;
  warning?: string | null;
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
  updated?: number;
  deleted?: number;
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
  status: 'IMPORTED' | 'DUPLICATE' | 'FAILED' | 'DELETED' | 'UPDATED';
  reason?: string;
}

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getYesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'daysheet' | 'receipt_entry' | 'receipts' | 'archive' | 'tally' | 'audit'>('daysheet');
  const [archiveBranchFilter, setArchiveBranchFilter] = useState<string>('ALL');
  
  // Desktop screen fit zoom scale (85% compact, 90% normal Windows fit, 100% standard)
  const [desktopScale, setDesktopScale] = useState<string>(() => {
    return localStorage.getItem('bellary_desktop_scale') || '90';
  });

  const handleScaleChange = (newScale: string) => {
    setDesktopScale(newScale);
    localStorage.setItem('bellary_desktop_scale', newScale);
  };

  // Settings & Admin Right Sidebar Drawer State
  const [showSettingsSidebar, setShowSettingsSidebar] = useState<boolean>(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number>(1);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayIso());
  const [sheetType, setSheetType] = useState<'SERVICE' | 'SALES'>('SERVICE');
  const [loading, setLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Day Sheet State
  const [daySheet, setDaySheet] = useState<DaySheetData | null>(null);
  const [cashReceipts, setCashReceipts] = useState<Receipt[]>([]);
  const [nonCashReceipts, setNonCashReceipts] = useState<Receipt[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dismissedRecordedDates, setDismissedRecordedDates] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bellary_dismissed_recorded_dates') || '[]');
    } catch {
      return [];
    }
  });

  const handleRemoveRecordedDateFromHeader = (dateToRemove: string) => {
    setDismissedRecordedDates(prev => {
      const next = prev.includes(dateToRemove) ? prev : [...prev, dateToRemove];
      try {
        localStorage.setItem('bellary_dismissed_recorded_dates', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    // If this date is currently selected in the header, reset to Today
    if (selectedDate === dateToRemove) {
      setSelectedDate(getTodayIso());
    }
    showNotification(`Removed ${dateToRemove} from header`, 'info');
  };

  // Received Towards master purpose list (admin can add new purposes at runtime)
  const [towardsPurposes, setTowardsPurposes] = useState<ReceivedTowardsPurpose[]>([]);
  const [showPurposeModal, setShowPurposeModal] = useState<boolean>(false);
  const [newPurposeName, setNewPurposeName] = useState<string>('');
  const [purposeSaving, setPurposeSaving] = useState<boolean>(false);

  // Quick Add Receipt Modal for Day Sheet
  const [showAddReceiptModal, setShowAddReceiptModal] = useState<boolean>(false);
  const [newReceiptMode, setNewReceiptMode] = useState<'Cash' | 'Cheque/NEFT'>('Cash');
  const [newReceiptNo, setNewReceiptNo] = useState<string>('');
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newTowardsPurpose, setNewTowardsPurpose] = useState<string>('');
  const [newTowardsRef, setNewTowardsRef] = useState<string>('');
  const [newVehicleNo, setNewVehicleNo] = useState<string>('');
  const [addReceiptLoading, setAddReceiptLoading] = useState<boolean>(false);
  
  // New Receipt Form State (Full Mahindra Format)
  const [showNewReceiptForm, setShowNewReceiptForm] = useState<boolean>(false);
  const [nrReceiptNo, setNrReceiptNo] = useState<string>('');
  const [nrDate, setNrDate] = useState<string>(() => getTodayIso());
  const [nrDated, setNrDated] = useState<string>('');
  const [nrDrawnOn, setNrDrawnOn] = useState<string>('');
  const [nrCustomerName, setNrCustomerName] = useState<string>('');
  const [nrVehicleNo, setNrVehicleNo] = useState<string>('');
  const [nrTowardsPurpose, setNrTowardsPurpose] = useState<string>('');
  const [nrTowardsRef, setNrTowardsRef] = useState<string>('');
  const [nrPaymentMode, setNrPaymentMode] = useState<string>('Cash');
  const [nrUtrRef, setNrUtrRef] = useState<string>('');
  const [nrAmount, setNrAmount] = useState<string>('');
  const [nrSaving, setNrSaving] = useState<boolean>(false);
  const [nrSaved, setNrSaved] = useState<boolean>(false);

  // Print Receipt State
  const [printReceipt, setPrintReceipt] = useState<Receipt | null>(null);

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

  // Reset Entire System Modal
  const [showResetSystemModal, setShowResetSystemModal] = useState(false);
  const [resetSystemLoading, setResetSystemLoading] = useState(false);


  const [importFile, setImportFile] = useState<File | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ receipts: ReceiptSyncRow[]; inserted: number; updated?: number; deleted?: number; skippedDuplicates: number; failed: number; totalRows: number } | null>(null);
  const [syncError, setSyncError] = useState<string>('');

  // Tally XML Export State
  const [tallyExportLoading, setTallyExportLoading] = useState(false);
  const [tallyExportList, setTallyExportList] = useState<any[]>([]);
  const [receiptBackupList, setReceiptBackupList] = useState<any[]>([]);
  const [tallyExportDate, setTallyExportDate] = useState<string>(() => getTodayIso());
  const [tallyPreview, setTallyPreview] = useState<{ receiptCount: number; totalAmount: number; columns: any[] } | null>(null);
  const [tallyPreviewLoading, setTallyPreviewLoading] = useState(false);
  const [tallyPreviewError, setTallyPreviewError] = useState('');

  // A preview only belongs to the date/branch it was generated for.
  useEffect(() => {
    setTallyPreview(null);
    setTallyPreviewError('');
  }, [tallyExportDate, selectedBranchId]);

  // File Path Settings State
  const [pathInput, setPathInput] = useState<string>('');
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSaveMsg, setPathSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPathSettings, setShowPathSettings] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Permanent Day Sheet Excel Archive & Downloader State
  const [excelBackupsList, setExcelBackupsList] = useState<any[]>([]);
  const [excelBackupsLoading, setExcelBackupsLoading] = useState(false);
  const [createExcelBackupLoading, setCreateExcelBackupLoading] = useState(false);
  const [availableDatesList, setAvailableDatesList] = useState<string[]>([]);

  // Admin Authentication State (Protects Admin Panel & Archive Management)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('bellary_admin_logged_in') === 'true';
  });
  const [adminName, setAdminName] = useState<string>(() => {
    return localStorage.getItem('bellary_admin_name') || 'Admin';
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(false);
  const [adminLoginName, setAdminLoginName] = useState<string>('admin');
  const [adminLoginPassword, setAdminLoginPassword] = useState<string>('');
  const [adminLoginError, setAdminLoginError] = useState<string>('');
  const [adminLoginLoading, setAdminLoginLoading] = useState<boolean>(false);
  const [adminPendingTab, setAdminPendingTab] = useState<'tally' | 'archive' | null>(null);

  // Archive Delete Modal State
  const [deleteArchiveFile, setDeleteArchiveFile] = useState<string | null>(null);
  const [deleteArchiveLoading, setDeleteArchiveLoading] = useState<boolean>(false);

  // Export Excel Confirmation Modal State
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportModalStep, setExportModalStep] = useState<1 | 2>(1);

  const handleExportConfirmed = async () => {
    try {
      showNotification('Generating Day Sheet Excel...', 'info');
      const res = await fetch(`/api/daysheet/export-excel?branch_id=${selectedBranchId}&date=${selectedDate}&type=${sheetType}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WORKSHOP_DAY_SHEET_BLY_${selectedDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showNotification(`Day Sheet Excel downloaded for ${selectedDate}`, 'success');
      fetchBackups();
    } catch (err: any) {
      showNotification(`Export failed: ${err.message}`, 'error');
    } finally {
      setShowExportModal(false);
      setExportModalStep(1);
    }
  };

  const [downloadCalendarDate, setDownloadCalendarDate] = useState<string>(() => getTodayIso());
  const [downloadBranchId, setDownloadBranchId] = useState<number | 'ALL'>(1);
  const [excelSearch, setExcelSearch] = useState<string>('');

  const fetchBackups = async () => {
    setExcelBackupsLoading(true);
    try {
      const res = await fetch('/api/backup/excel-list');
      const data = await res.json();
      if (data.success) {
        setExcelBackupsList(data.backups || []);
      }
    } catch (e) {
      // ignore
    } finally {
      setExcelBackupsLoading(false);
    }
  };

  const fetchBackupAvailableDates = async () => {
    try {
      const res = await fetch('/api/backup/available-dates');
      const data = await res.json();
      if (data.success && data.dates) {
        setAvailableDatesList(data.dates);
        if (data.dates.length > 0 && !downloadCalendarDate) {
          setDownloadCalendarDate(data.dates[0]);
        }
      }
    } catch (e) {}
  };

  const handleCreateManualBackup = async (dateToBackup?: string, branchToBackup?: number | 'ALL') => {
    setCreateExcelBackupLoading(true);
    const targetDate = dateToBackup || downloadCalendarDate || selectedDate;
    const targetBranch = branchToBackup !== undefined ? branchToBackup : downloadBranchId;

    try {
      if (targetBranch === 'ALL') {
        const res = await fetch('/api/backup/create-all-branches-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: targetDate }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification(`Saved Day Sheet Excel files for all branches (${targetDate})!`, 'success');
          fetchBackups();
          fetchBackupAvailableDates();
        } else {
          showNotification(`Archive failed: ${data.error}`, 'error');
        }
      } else {
        const res = await fetch('/api/backup/create-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: targetBranch,
            date: targetDate,
            type: sheetType
          }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification(`Permanent Day Sheet archived: ${data.fileName} (${data.sizeKB} KB)`, 'success');
          fetchBackups();
          fetchBackupAvailableDates();
        } else {
          showNotification(`Archive failed: ${data.error}`, 'error');
        }
      }
    } catch (e: any) {
      showNotification(`Archive error: ${e.message}`, 'error');
    } finally {
      setCreateExcelBackupLoading(false);
    }
  };

  const handleDownloadDaySheetExcel = async (dateParam?: string, branchParam?: number | 'ALL') => {
    const targetDate = dateParam || downloadCalendarDate || selectedDate;
    const targetBranch = branchParam !== undefined ? branchParam : downloadBranchId;

    try {
      showNotification(`Downloading Day Sheet Excel (${targetDate})...`, 'info');
      const res = await fetch(`/api/backup/download-day-sheet?branch_id=${targetBranch === 'ALL' ? 1 : targetBranch}&date=${targetDate}&type=${sheetType}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WORKSHOP_DAY_SHEET_BLY_${targetDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showNotification(`Downloaded Day Sheet Excel (${targetDate})`, 'success');
    } catch (err: any) {
      showNotification(`Download failed: ${err.message}`, 'error');
    }
  };

  const handleAdminLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminLoginName.trim() || !adminLoginPassword.trim()) {
      setAdminLoginError('Please enter both Admin Name and Password.');
      return;
    }
    setAdminLoginLoading(true);
    setAdminLoginError('');
    try {
      const res = await fetch('/api/backup/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminLoginName.trim(),
          password: adminLoginPassword.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdminAuthenticated(true);
        const authedUser = data.adminName || adminLoginName.trim();
        setAdminName(authedUser);
        localStorage.setItem('bellary_admin_logged_in', 'true');
        localStorage.setItem('bellary_admin_name', authedUser);
        setShowAdminLoginModal(false);
        setAdminLoginPassword('');
        showNotification(`Welcome, ${authedUser}! Admin full access granted.`, 'success');
        if (adminPendingTab) {
          setActiveTab(adminPendingTab);
          setAdminPendingTab(null);
        } else {
          setActiveTab('archive');
        }
      } else {
        setAdminLoginError(data.error || 'Invalid Admin Name or Password. Access denied.');
      }
    } catch (err: any) {
      setAdminLoginError(err.message || 'Server error verifying credentials.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('bellary_admin_logged_in');
    localStorage.removeItem('bellary_admin_name');
    showNotification('Admin logged out successfully. Returned to normal employee workspace.', 'info');
    setActiveTab('daysheet');
  };

  const handleDeleteArchiveConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deleteArchiveFile) return;

    // If not authenticated yet, check admin credentials first
    if (!isAdminAuthenticated) {
      if (!adminLoginName.trim() || !adminLoginPassword.trim()) {
        setAdminLoginError('Please enter both Admin Name and Password to authorize deletion.');
        return;
      }
      setDeleteArchiveLoading(true);
      setAdminLoginError('');
      try {
        const loginRes = await fetch('/api/backup/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: adminLoginName.trim(),
            password: adminLoginPassword.trim()
          })
        });
        const loginData = await loginRes.json();
        if (!loginData.success) {
          setAdminLoginError(loginData.error || 'Invalid Admin Name or Password. Deletion denied.');
          setDeleteArchiveLoading(false);
          return;
        }
        setIsAdminAuthenticated(true);
        const authed = loginData.adminName || adminLoginName.trim();
        setAdminName(authed);
        localStorage.setItem('bellary_admin_logged_in', 'true');
        localStorage.setItem('bellary_admin_name', authed);
      } catch (err: any) {
        setAdminLoginError(err.message || 'Error verifying admin credentials.');
        setDeleteArchiveLoading(false);
        return;
      }
    }

    setDeleteArchiveLoading(true);
    try {
      const res = await fetch(`/api/backup/delete-excel/${encodeURIComponent(deleteArchiveFile)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Archived file ${deleteArchiveFile} deleted successfully by Admin.`, 'success');
        setDeleteArchiveFile(null);
        setAdminLoginPassword('');
        setAdminLoginError('');
        fetchBackups();
      } else {
        showNotification(data.error || 'Failed to delete file.', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error deleting file.', 'error');
    } finally {
      setDeleteArchiveLoading(false);
    }
  };

  // Fetch branches on mount
  useEffect(() => {
    fetchBranches();
    fetchTowardsPurposes();
  }, []);

  // Fetch Day Sheet when branch, date, or type changes
  useEffect(() => {
    if (selectedBranchId && selectedDate) {
      fetchDaySheet();
    }
  }, [selectedBranchId, selectedDate, sheetType]);

  // Fetch data when tab changes
  useEffect(() => {
    if (activeTab === 'receipt_entry') {
      if (!nrReceiptNo) openNewReceiptForm();
    } else if (activeTab === 'receipts') {
      fetchReceipts();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'tally' || activeTab === 'archive') {
      if (activeTab === 'tally') { fetchTallyExports(); fetchReceiptBackups(); }
      fetchBackups();
      fetchBackupAvailableDates();
    }
  }, [activeTab, selectedBranchId, selectedDate, sheetType, filterMode, receiptSearch]);


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

  const fetchAvailableDates = async () => {
    try {
      const res = await fetch(`/api/daysheet/dates?branch_id=${selectedBranchId}&type=${sheetType}`);
      const data = await res.json();
      if (data.success && data.dates) {
        setAvailableDates(data.dates);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchTowardsPurposes = async () => {
    try {
      const res = await fetch('/api/purposes');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTowardsPurposes(data.data);
      }
    } catch (e) {
      // ignore — dropdown still shows legacy values from receipts
    }
  };

  const handleAddPurpose = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPurposeName.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!clean) {
      showNotification('Please enter a purpose name.', 'error');
      return;
    }
    setPurposeSaving(true);
    try {
      const res = await fetch('/api/purposes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, created_by: adminName || 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Received Towards purpose "${clean}" is ready to use.`, 'success');
        setShowPurposeModal(false);
        setNewPurposeName('');
        await fetchTowardsPurposes();
      } else {
        showNotification(data.error || 'Failed to add purpose', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setPurposeSaving(false);
    }
  };

  const handleAddQuickReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceiptNo.trim() || !newCustomerName.trim() || !newAmount) {
      showNotification('Please fill receipt number, customer name and amount.', 'error');
      return;
    }
    setAddReceiptLoading(true);
    try {
      const res = await fetch('/api/daysheet/add-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: selectedBranchId,
          receipt_date: selectedDate,
          receipt_type: sheetType,
          receipt_no: newReceiptNo.trim(),
          customer_name: newCustomerName.trim(),
          amount: parseFloat(newAmount) || 0,
          payment_mode: newReceiptMode,
          vehicle_no: newVehicleNo.trim(),
          received_towards_purpose: newTowardsPurpose.trim(),
          received_towards_reference: newTowardsRef.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Receipt recorded successfully.', 'success');
        setShowAddReceiptModal(false);
        setNewReceiptNo('');
        setNewCustomerName('');
        setNewAmount('');
        setNewVehicleNo('');
        setNewTowardsPurpose('');
        setNewTowardsRef('');
        fetchDaySheet();
        fetchAvailableDates();
      } else {
        showNotification(data.error || 'Failed to add receipt', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setAddReceiptLoading(false);
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
        setExpenses(data.expenses || []);
        setDenominations(data.denominations);
        fetchAvailableDates();
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

  // ── Sync helpers ──────────────────────────────────────────────────────────
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
        const delMsg = data.result.deleted ? `, ${data.result.deleted} deleted` : '';
        const updMsg = data.result.updated ? `, ${data.result.updated} updated` : '';
        showNotification(`Sync complete — ${data.result.inserted} new${delMsg}${updMsg}.`, 'success');
        fetchSyncStatus();
        fetchDaySheet();
        fetchReceipts();
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
          updated: data.updated || 0,
          deleted: data.deleted || 0,
          skippedDuplicates: data.skippedDuplicates,
          failed: data.errorsCount,
          totalRows: data.totalRows
        });
        const delMsg = data.deleted ? `, ${data.deleted} deleted` : '';
        showNotification(`Upload done — ${data.inserted} new${delMsg}, ${data.skippedDuplicates} duplicates skipped.`, 'success');
        fetchSyncStatus();
        fetchDaySheet();
        fetchReceipts();
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


  // ── Tally Export Helpers ──────────────────────────────────────────────────

  const fetchTallyExports = async () => {
    try {
      const res = await fetch('/api/tally/exports');
      const data = await res.json();
      if (data.success) setTallyExportList(data.data || []);
    } catch (e) { /* ignore */ }
  };

  const fetchReceiptBackups = async () => {
    try {
      const res = await fetch('/api/tally/receipt-backup-list');
      const data = await res.json();
      if (data.success) setReceiptBackupList(data.data || []);
    } catch (e) { /* ignore */ }
  };

  const handleExportTallyXml = async () => {
    try {
      const res = await fetch(`/api/tally/export-xml?branch_id=${selectedBranchId}&date=${tallyExportDate}`);
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `TALLY_${tallyExportDate}_BLY.xml`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showNotification(`Tally XML downloaded for ${tallyExportDate}`, 'success');
    } catch (err: any) {
      showNotification('Export failed: ' + err.message, 'error');
    }
  };

  const handleSaveTallyXml = async () => {
    setTallyExportLoading(true);
    try {
      const res = await fetch('/api/tally/save-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: selectedBranchId, date: tallyExportDate })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Tally XML saved!', 'success');
        fetchTallyExports();
      } else {
        showNotification(data.error || 'Export failed', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setTallyExportLoading(false);
    }
  };

  const handlePreviewTallyXml = async () => {
    setTallyPreviewLoading(true);
    setTallyPreviewError('');
    try {
      const res = await fetch(`/api/tally/preview-xml?branch_id=${selectedBranchId}&date=${tallyExportDate}`);
      const data = await res.json();
      if (data.success) {
        setTallyPreview({
          receiptCount: data.receiptCount || 0,
          totalAmount: Number(data.totalAmount) || 0,
          columns: data.columns || [],
        });
      } else {
        setTallyPreview(null);
        setTallyPreviewError(data.error || 'Preview failed');
        showNotification(data.error || 'Preview failed', 'error');
      }
    } catch (err: any) {
      setTallyPreview(null);
      setTallyPreviewError(err.message);
      showNotification(err.message, 'error');
    } finally {
      setTallyPreviewLoading(false);
    }
  };

  const handleRegenerateReceiptBackup = async (date: string) => {
    try {
      const res = await fetch('/api/tally/regenerate-receipt-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, branch_id: selectedBranchId })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Receipt backup regenerated for ${date}`, 'success');
        fetchReceiptBackups();
      } else {
        showNotification(data.error || 'Regeneration failed', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };


  // -- Receipt Form Helpers --------------------------------------------------

  // Helper to render a single compact receipt copy for print or screen
  const renderSingleReceiptCard = (data: {
    receiptNo: string;
    branchName?: string;
    date: string;
    customerName: string;
    vehicleNo?: string;
    receivedTowards?: string;
    paymentMode?: string;
    utrRef?: string;
    amount: number | string;
    copyLabel?: string;
    dated?: string;
    drawnOn?: string;
  }, isPrintOnly = false) => {
    const formattedDate = data.date ? data.date.split('-').reverse().join('-') : '—';
    const receiptDateText = data.dated !== undefined ? data.dated : formattedDate;
    const drawnOnText = data.drawnOn || '';
    const numAmount = typeof data.amount === 'string' ? parseFloat(data.amount) || 0 : data.amount || 0;
    const formattedAmount = numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const wordsAmount = numAmount > 0 ? convertToWords(String(numAmount)) : '—';

    return (
      <div
        className={isPrintOnly ? "receipt-copy-item" : ""}
        style={{
          backgroundColor: '#ffffff',
          border: '1.2px solid #000000',
          borderRadius: '4px',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: isPrintOnly ? '11px' : '14px',
          color: '#000000',
          boxSizing: 'border-box',
          overflow: 'hidden',
          marginBottom: isPrintOnly ? '0' : '0',
          position: 'relative'
        }}
      >
        {/* Optional Copy Indicator (e.g. Original / Customer / Accounts Copy) */}
        {data.copyLabel && (
          <div style={{
            position: 'absolute',
            top: '2px',
            right: '8px',
            fontSize: '9px',
            fontWeight: 800,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {data.copyLabel}
          </div>
        )}

        {/* ── HEADER: LOGO | COMPANY | PILL RECEIPT NO ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: isPrintOnly ? '6px 14px' : '12px 20px',
          borderBottom: '1.2px solid #000000',
          backgroundColor: '#ffffff'
        }}>
          {/* Logo */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: isPrintOnly ? '14px' : '22px',
            borderRight: '1.2px solid #000000',
            minWidth: isPrintOnly ? '100px' : '140px'
          }}>
            <img
              src="/Mahindra-Logo.png"
              alt="Mahindra"
              style={{
                width: isPrintOnly ? '72px' : '110px',
                height: 'auto',
                maxHeight: isPrintOnly ? '42px' : '64px',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>

          {/* Company Name & GSTIN */}
          <div style={{ flex: 1, paddingLeft: isPrintOnly ? '14px' : '22px' }}>
            <div style={{
              fontWeight: 900,
              fontSize: isPrintOnly ? '15px' : '20px',
              letterSpacing: '0.3px',
              color: '#000000',
              lineHeight: '1.15'
            }}>
              BELLARY MOTORS SALES PVT LTD.,
            </div>
            <div style={{
              fontSize: isPrintOnly ? '10px' : '12.5px',
              fontWeight: 800,
              color: '#000000',
              marginTop: isPrintOnly ? '2px' : '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>H.O : BALLARI</span>
              <span style={{ color: '#000000', fontWeight: 900 }}>|</span>
              <span>GSTIN : 29AACCB6242J1ZK</span>
            </div>
          </div>

          {/* Right: Pill Badge (SERVICE | RECEIPT NO.) */}
          <div style={{
            border: '1.2px solid #94a3b8',
            borderRadius: '10px',
            backgroundColor: '#e2e8f0',
            padding: isPrintOnly ? '3px 12px' : '5px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: isPrintOnly ? '140px' : '180px'
          }}>
            <span style={{
              fontSize: isPrintOnly ? '8.5px' : '10.5px',
              fontWeight: 800,
              color: '#000000',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}>
              SERVICE | RECEIPT NO.
            </span>
            <div style={{
              color: '#dc2626',
              fontWeight: 900,
              fontSize: isPrintOnly ? '15px' : '19px',
              fontFamily: 'inherit',
              textAlign: 'center',
              width: '100%',
              letterSpacing: '0.5px',
              lineHeight: 1.15
            }}>
              {data.receiptNo}
            </div>
          </div>
        </div>

        {/* ── SUB-HEADER: BRANCH & DATE WITH CALENDAR ICON ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isPrintOnly ? '4px 16px' : '8px 20px',
          borderBottom: '1.2px solid #000000',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ fontSize: isPrintOnly ? '11px' : '14px', color: '#000000' }}>
            <span style={{ fontWeight: 600 }}>Branch :</span>&nbsp;&nbsp;
            <span style={{ fontWeight: 900 }}>{data.branchName || 'BALLARI'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isPrintOnly ? '11px' : '14px' }}>
            <svg width={isPrintOnly ? "14" : "18"} height={isPrintOnly ? "14" : "18"} viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span style={{ fontWeight: 600 }}>Date :</span>&nbsp;
            <span style={{ fontWeight: 900, color: '#000000' }}>
              {formattedDate}
            </span>
          </div>
        </div>

        {/* ── MAIN RECEIPT BORDERED TABLE ── */}
        <div style={{ padding: isPrintOnly ? '6px 12px' : '12px 18px' }}>
          <div style={{
            border: '1.2px solid #000000',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            {/* Row 1: Received From and Thanks to */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1.2px solid #000000',
              minHeight: isPrintOnly ? '28px' : '38px'
            }}>
              <div style={{
                width: isPrintOnly ? '160px' : '200px',
                flexShrink: 0,
                backgroundColor: '#e2e8f0',
                borderRight: '1.2px solid #000000',
                padding: isPrintOnly ? '4px 8px' : '8px 12px',
                fontSize: isPrintOnly ? '10px' : '12.5px',
                fontWeight: 600,
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                Received From and Thanks to
              </div>
              <div style={{
                flex: 1,
                padding: isPrintOnly ? '4px 10px' : '8px 14px',
                fontWeight: 900,
                fontSize: isPrintOnly ? '12px' : '15px',
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                {data.customerName || '—'}
              </div>
              <div style={{
                width: isPrintOnly ? '140px' : '170px',
                borderLeft: '1.2px solid #000000',
                padding: isPrintOnly ? '4px 8px' : '8px 12px',
                fontWeight: 900,
                fontSize: isPrintOnly ? '12px' : '15px',
                color: '#000000',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center'
              }}>
                {data.vehicleNo || '—'}
              </div>
            </div>

            {/* Row 2: Received Towards | Description | Payment Mode */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1.2px solid #000000',
              minHeight: isPrintOnly ? '28px' : '38px'
            }}>
              <div style={{
                width: isPrintOnly ? '160px' : '200px',
                flexShrink: 0,
                backgroundColor: '#e2e8f0',
                borderRight: '1.2px solid #000000',
                padding: isPrintOnly ? '4px 8px' : '8px 12px',
                fontSize: isPrintOnly ? '10px' : '12.5px',
                fontWeight: 600,
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                Received Towards
              </div>
              <div style={{
                flex: 1,
                padding: isPrintOnly ? '4px 10px' : '8px 14px',
                fontWeight: 900,
                fontSize: isPrintOnly ? '12px' : '15px',
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                {data.receivedTowards || '—'}
              </div>
              <div style={{
                width: isPrintOnly ? '180px' : '220px',
                borderLeft: '1.2px solid #000000',
                padding: isPrintOnly ? '3px 8px' : '5px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}>
                <span style={{ fontSize: isPrintOnly ? '10px' : '12.5px', color: '#000000', fontWeight: 600 }}>Payment Mode :</span>
                <span style={{
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  fontWeight: 900,
                  fontSize: isPrintOnly ? '11px' : '13px',
                  padding: isPrintOnly ? '1px 8px' : '2px 10px',
                  borderRadius: '10px'
                }}>
                  {data.paymentMode || 'Cash'}
                </span>
              </div>
            </div>

            {/* Row 3: UTR / NEFT NO. */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1.2px solid #000000',
              minHeight: isPrintOnly ? '24px' : '34px'
            }}>
              <div style={{
                width: isPrintOnly ? '160px' : '200px',
                flexShrink: 0,
                backgroundColor: '#e2e8f0',
                borderRight: '1.2px solid #000000',
                padding: isPrintOnly ? '3px 8px' : '6px 12px',
                fontSize: isPrintOnly ? '10px' : '12.5px',
                fontWeight: 600,
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                UTR / NEFT NO.
              </div>
              <div style={{
                flex: 1,
                padding: isPrintOnly ? '3px 10px' : '6px 14px',
                fontWeight: 900,
                fontSize: isPrintOnly ? '11px' : '14px',
                backgroundColor: '#ffffff',
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                {data.utrRef || '—'}
              </div>
            </div>

            {/* Row 4: a Sum of Rupees */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              minHeight: isPrintOnly ? '26px' : '36px'
            }}>
              <div style={{
                width: isPrintOnly ? '160px' : '200px',
                flexShrink: 0,
                backgroundColor: '#e2e8f0',
                borderRight: '1.2px solid #000000',
                padding: isPrintOnly ? '4px 8px' : '8px 12px',
                fontSize: isPrintOnly ? '10px' : '12.5px',
                fontWeight: 600,
                color: '#000000',
                display: 'flex',
                alignItems: 'center'
              }}>
                a Sum of Rupees
              </div>
              <div style={{
                flex: 1,
                padding: isPrintOnly ? '4px 10px' : '8px 14px',
                fontWeight: 900,
                fontSize: isPrintOnly ? '11px' : '14px',
                fontStyle: 'italic',
                color: '#000000',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1.2
              }}>
                {wordsAmount}
              </div>
            </div>
          </div>
        </div>

        {/* ── BAR: DATED / DRAWN ON ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: isPrintOnly ? '4px 16px' : '6px 20px',
          borderTop: '1.2px solid #000000',
          borderBottom: '1.2px solid #000000',
          fontSize: isPrintOnly ? '10px' : '13px',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ width: isPrintOnly ? '180px' : '220px', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>Dated :</span>&nbsp;&nbsp;
            <span style={{
              fontWeight: 900,
              color: '#000000',
              display: 'inline-block',
              flex: 1,
              minWidth: isPrintOnly ? '90px' : '130px',
              minHeight: '1em'
            }}>{receiptDateText}</span>
          </div>
          <div style={{ paddingLeft: isPrintOnly ? '10px' : '16px', flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#000000' }}>Drawn on :</span>&nbsp;&nbsp;
            <span style={{
              fontWeight: 900,
              color: '#000000',
              display: 'inline-block',
              flex: 1,
              minWidth: isPrintOnly ? '120px' : '160px',
              minHeight: '1em'
            }}>{drawnOnText}</span>
          </div>
        </div>

        {/* ── FOOTER: AMOUNT BOX & CASHIER SIGNATURE AREA (bottom right) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: isPrintOnly ? '4px 16px 6px 16px' : '8px 20px 10px 20px',
          minHeight: isPrintOnly ? '88px' : '120px',
          backgroundColor: '#ffffff'
        }}>
          {/* Left: Rounded Amount Box (₹ Amount) */}
          <div style={{
            border: '1.2px solid #cbd5e1',
            borderRadius: isPrintOnly ? '8px' : '10px',
            backgroundColor: '#e2e8f0',
            padding: isPrintOnly ? '3px 14px' : '5px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: isPrintOnly ? '6px' : '8px',
            minWidth: isPrintOnly ? '160px' : '220px'
          }}>
            <span style={{ fontSize: isPrintOnly ? '1.4rem' : '1.8rem', fontWeight: 900, color: '#000000', lineHeight: 1 }}>₹</span>
            <span style={{
              fontWeight: 900,
              fontSize: isPrintOnly ? '1.3rem' : '1.7rem',
              color: '#000000',
              fontFamily: 'inherit',
              lineHeight: 1
            }}>
              {formattedAmount}
            </span>
          </div>

          {/* Right: Company signatory, blank signature space, Cashier at the bottom */}
          <div style={{
            alignSelf: 'stretch',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: isPrintOnly ? '20px' : '30px'
          }}>
            <div style={{
              fontWeight: 800,
              fontSize: isPrintOnly ? '9.5px' : '12px',
              color: '#000000',
              textAlign: 'center',
              lineHeight: 1.2
            }}>
              for Bellary Motors Sales Pvt Ltd.,
            </div>
            {/* Blank space for the cashier's signature */}
            <div style={{ flex: 1, minHeight: isPrintOnly ? '28px' : '46px' }} />
            <div style={{
              width: isPrintOnly ? '110px' : '140px',
              borderTop: '1.2px solid #000000',
              paddingTop: isPrintOnly ? '3px' : '5px',
              textAlign: 'center',
              fontWeight: 900,
              fontSize: isPrintOnly ? '11px' : '13px',
              color: '#000000'
            }}>
              Cashier
            </div>
          </div>
        </div>

        {/* ── DISCLAIMER LINE ── */}
        <div style={{
          padding: isPrintOnly ? '1px 16px 4px 16px' : '2px 20px 6px 20px',
          fontSize: isPrintOnly ? '9px' : '11px',
          color: '#000000',
          backgroundColor: '#ffffff'
        }}>
          *Cheques subject to Realisation
        </div>
      </div>
    );
  };

  // Helper to render the A4 print sheet containing 3 exact receipts
  const renderThreeReceiptsPrintSheet = (containerId: string, data: {
    receiptNo: string;
    branchName?: string;
    date: string;
    customerName: string;
    vehicleNo?: string;
    receivedTowards?: string;
    paymentMode?: string;
    utrRef?: string;
    amount: number | string;
    dated?: string;
    drawnOn?: string;
  }) => {
    return (
      <div id={containerId} className="receipt-print-sheet" style={{ display: 'none' }}>
        <div className="receipt-print-stack" style={{ display: 'flex', flexDirection: 'column', gap: '2mm', height: '100%', width: '100%' }}>
          {renderSingleReceiptCard(data, true)}
          {renderSingleReceiptCard(data, true)}
          {renderSingleReceiptCard(data, true)}
        </div>
      </div>
    );
  };
  const openNewReceiptForm = async () => {
    setNrReceiptNo('');
    setNrDate(getTodayIso());
    setNrDated('');
    setNrDrawnOn('');
    setNrCustomerName('');
    setNrVehicleNo('');
    setNrTowardsPurpose('');
    setNrTowardsRef('');
    setNrPaymentMode('Cash');
    setNrUtrRef('');
    setNrAmount('');
    setNrSaved(false);
    setActiveTab('receipt_entry');
    try {
      const res = await fetch(
`/api/receipts/next-receipt-no?branch_id=${selectedBranchId}&receipt_type=${sheetType}`
);
      const data = await res.json();
      if (data.success && data.nextReceiptNo) {
        setNrReceiptNo(data.nextReceiptNo);
      }
    } catch (e) { /* ignore */ }
  };

  const handleCreateNewReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nrCustomerName.trim()) { showNotification('Customer name is required', 'error'); return; }
    if (!nrAmount || parseFloat(nrAmount) <= 0) { showNotification('Valid amount is required', 'error'); return; }
    setNrSaving(true);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: selectedBranchId,
          receipt_no: nrReceiptNo.trim(),
          receipt_date: nrDate,
          receipt_type: sheetType,
          customer_name: nrCustomerName.trim(),
          vehicle_no: nrVehicleNo.trim(),
          amount: parseFloat(nrAmount),
          payment_mode: nrPaymentMode,
          received_towards: composeTowards(nrTowardsPurpose, nrTowardsRef),
          received_towards_purpose: nrTowardsPurpose.trim(),
          received_towards_reference: nrTowardsRef.trim(),
          utr_reference: nrUtrRef.trim(),
          dated_on: nrDated.trim(),
          drawn_on: nrDrawnOn.trim(),
          status: 'ACTIVE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(
`Receipt ${nrReceiptNo} created successfully!`
, 'success');
        setNrSaved(true);
        fetchReceipts();
        fetchDaySheet();
        const createdReceipt: Receipt = {
          id: data.id || data.receipt?.id || 0,
          branch_id: selectedBranchId,
          receipt_no: nrReceiptNo.trim(),
          receipt_date: nrDate,
          receipt_type: sheetType,
          customer_name: nrCustomerName.trim(),
          vehicle_no: nrVehicleNo.trim(),
          amount: parseFloat(nrAmount),
          payment_mode: nrPaymentMode,
          received_towards: composeTowards(nrTowardsPurpose, nrTowardsRef),
          received_towards_purpose: nrTowardsPurpose.trim(),
          received_towards_reference: nrTowardsRef.trim(),
          utr_reference: nrUtrRef.trim(),
          dated_on: nrDated.trim(),
          drawn_on: nrDrawnOn.trim(),
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        };
        // setPrintReceipt(createdReceipt);
      } else {
        showNotification(data.error || 'Failed to create receipt', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setNrSaving(false);
    }
  };

  const handlePrintReceipt = (receipt: Receipt) => {
    setPrintReceipt(receipt);
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

  const handleExpenseChange = (index: number, field: 'particulars' | 'amount', value: any) => {
    const updated = [...expenses];
    if (field === 'amount') {
      updated[index].amount = parseFloat(value) || 0;
    } else {
      updated[index].particulars = value;
    }
    setExpenses(updated);
  };

  const addExpenseRow = () => {
    setExpenses([...expenses, { particulars: '', amount: 0 }]);
  };

  const removeExpenseRow = (index: number) => {
    const updated = expenses.filter((_, i) => i !== index);
    setExpenses(updated);
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
          expenses,
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

  // Reset Entire System to Factory Scratch
  const handleResetSystem = async () => {
    setResetSystemLoading(true);
    try {
      const res = await fetch('/api/backup/reset-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'System completely reset to scratch!', 'success');
        setShowResetSystemModal(false);
        setPathInput('');
        setPathSaveMsg(null);
        fetchReceipts();
        fetchDaySheet();
        fetchSyncStatus();
        fetchBackups();
      } else {
        showNotification(data.error || 'Reset failed', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setResetSystemLoading(false);
    }
  };

  // Open the edit modal with purpose/reference resolved. Receipts saved before
  // the split are parsed from their combined `received_towards` text.
  const openEditReceipt = (r: Receipt) => {
    const split = splitTowards(r.received_towards);
    setEditModalReceipt({
      ...r,
      received_towards_purpose: r.received_towards_purpose || split.purpose,
      received_towards_reference: r.received_towards_reference || split.reference
    });
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
  const currentTotalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const openingBal = daySheet?.opening_balance || 0;
  const cashRecsTotal = cashReceipts.reduce((acc, r) => acc + (r.amount || 0), 0);
  const nonCashRecsTotal = nonCashReceipts.reduce((acc, r) => acc + (r.amount || 0), 0);
  const cashSalesAmt = daySheet?.cash_sales || 0;
  const lessVouchersAmt = daySheet?.less_vouchers || 0;
  const closingBalanceCalculated = openingBal + cashRecsTotal + cashSalesAmt - lessVouchersAmt - currentTotalDeposits - currentTotalExpenses;
  // Cash Difference = Physical Cash Count - Calculated Closing Cash Balance
  const cashDiff = currentTotalDenom - closingBalanceCalculated;
  const isReconciled = Math.abs(cashDiff) < 0.01;

  const currentBranch = branches.find(b => b.id === selectedBranchId);

  // Received Towards options for new entries = the master purpose list only.
  // A legacy value is added only while editing the receipt that already uses it,
  // so old receipts keep their original wording without polluting the dropdown.
  const purposeOptions = (() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (raw?: string | null) => {
      const value = (raw || '').toString().trim();
      if (!value) return;
      const key = value.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(value);
    };
    towardsPurposes.forEach(p => push(p.name));
    push(nrTowardsPurpose);
    push(newTowardsPurpose);
    if (editModalReceipt) push(editModalReceipt.received_towards_purpose || splitTowards(editModalReceipt.received_towards).purpose);
    return list;
  })();

  // Spreadsheet-style Tally XML preview styles
  const tallySheetHeaderStyle: CSSProperties = {
    padding: '8px 10px',
    backgroundColor: '#217346',
    color: '#ffffff',
    fontWeight: 800,
    fontSize: '0.76rem',
    textAlign: 'left',
    border: '1px solid #1a5c37',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };
  const tallySheetCellStyle: CSSProperties = {
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    color: '#334155',
    verticalAlign: 'top',
  };
  const tallySheetIndexStyle: CSSProperties = {
    ...tallySheetCellStyle,
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontWeight: 700,
    textAlign: 'center',
    width: '42px',
  };

  return (
    <>
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      zoom: desktopScale !== '100' ? `${Number(desktopScale) / 100}` : undefined
    }}>
      
      {/* NOTIFICATION TOAST */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 9999,
          padding: '10px 20px',
          borderRadius: '8px',
          backgroundColor: notification.type === 'success' ? '#10b981' : notification.type === 'error' ? '#ef4444' : '#1e293b',
          color: '#ffffff',
          fontWeight: 600,
          boxShadow: '0 8px 16px -2px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.85rem'
        }}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* HEADER BAR (NO-PRINT) */}
      <header className="no-print glass-header" style={{
        padding: '0',
        position: 'relative'
      }}>
        {/* ROW 1: Premium Dealership Branding */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px 8px 24px',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.94) 100%)',
          borderBottom: '1px solid #e2e8f0',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Logo Container with subtle glow */}
            <div style={{
              background: '#f1f5f9',
              borderRadius: '10px',
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
            }}>
              <img
                src="/Mahindra-Logo.png"
                alt="Mahindra"
                style={{
                  height: '34px',
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
            </div>
            {/* Vertical Separator */}
            <div style={{
              width: '1px',
              height: '32px',
              background: 'linear-gradient(180deg, transparent 0%, #cbd5e1 50%, transparent 100%)'
            }} />
            {/* Company Info */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h1 style={{
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: '1.5px',
                  color: '#0f172a',
                  textTransform: 'uppercase'
                }}>
                  BELLARY MOTORS
                </h1>
                <span style={{
                  fontSize: '0.72rem',
                  color: '#64748b',
                  fontWeight: 500,
                  letterSpacing: '0.3px'
                }}>
                  Sales Pvt. Ltd.
                </span>
              </div>
              {/* Elegant dual-tone pinstripe design */}
              <div style={{
                width: '100%',
                height: '2px',
                background: 'linear-gradient(90deg, #e11d48 0%, #cbd5e1 45%, #f1f5f9 90%, transparent 100%)',
                borderRadius: '2px',
                margin: '4px 0 3px 0'
              }} />
              <div style={{
                fontSize: '0.68rem',
                color: '#64748b',
                display: 'flex',
                gap: '8px',
                marginTop: '3px',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="live-dot" style={{ width: '5px', height: '5px' }} />
                  <strong style={{ color: '#10b981', fontSize: '0.67rem' }}>
                    {typeof window !== 'undefined' && window.location.hostname.includes('netlify.app') ? 'Demo Mode' : 'Online'}
                  </strong>
                  <span style={{ color: '#94a3b8' }}>
                    {typeof window !== 'undefined' && window.location.hostname.includes('netlify.app') ? '(Browser Storage)' : '(Multi-PC LAN :5173)'}
                  </span>
                </span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span><strong style={{ color: '#475569' }}>H.O:</strong> BALLARI</span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span><strong style={{ color: '#475569' }}>GSTIN:</strong> 29AACCB6242J1ZK</span>
              </div>
            </div>
          </div>

          {/* Right Side: Red Mahindra Wordmark Logo with metallic accent divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <div style={{
              width: '1px',
              height: '32px',
              background: 'linear-gradient(180deg, transparent 0%, #cbd5e1 50%, transparent 100%)'
            }} />
            <img
              src="/Red Mahindra Wordmark Logo.png"
              alt="Mahindra"
              style={{
                height: '40px',
                width: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
        </div>

        {/* ROW 2: Context Controls (Left) & Settings Gear Button (Pinned to Far Right) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '6px 24px',
          width: '100%',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0'
        }}>
          {/* Controls on Left */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap'
          }}>
            {/* Branch Selector */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#ffffff',
              padding: '5px 12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backdropFilter: 'none',
              flexShrink: 0
            }}>
              <Building2 size={14} color="#2563eb" />
              <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.3px' }}>Branch:</label>
              <select 
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                style={{ background: 'transparent', color: '#0f172a', border: 'none', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                    {b.name} {b.is_head_office ? '(H.O)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selector */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#ffffff',
              padding: '5px 12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backdropFilter: 'none',
              flexShrink: 0
            }}>
              <Calendar size={14} color="#2563eb" />
              <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.3px' }}>Date:</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ background: 'transparent', color: '#0f172a', border: 'none', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
              />
            </div>

            {/* Separate Active Date Chip when selected from Calendar (if not already in recorded list) */}
            {selectedDate !== getTodayIso() && !availableDates.filter(d => !dismissedRecordedDates.includes(d)).slice(0, 4).includes(selectedDate) && (
              <div className="no-print" style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                flexShrink: 0
              }}>
                <button
                  type="button"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    borderRadius: '5px',
                    padding: '2px 7px',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>{selectedDate}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRecordedDateFromHeader(selectedDate);
                    }}
                    title={`Cancel & remove ${selectedDate} from header`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '13px',
                      height: '13px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                      marginLeft: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                      e.currentTarget.style.transform = 'scale(1.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <X size={9} color="#ffffff" strokeWidth={3} />
                  </span>
                </button>
              </div>
            )}

            {/* Quick Historical Dates */}
            {availableDates.filter(d => !dismissedRecordedDates.includes(d)).length > 0 && (
              <div className="no-print" style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#f1f5f9',
                padding: '3px 8px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                flexShrink: 0
              }}>
                <span style={{ fontSize: '0.66rem', color: '#475569', fontWeight: 600, letterSpacing: '0.3px' }}>Recorded:</span>
                {availableDates
                  .filter(d => !dismissedRecordedDates.includes(d))
                  .slice(0, 4)
                  .map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      if (selectedDate === d) {
                        setSelectedDate(getTodayIso());
                      } else {
                        setSelectedDate(d);
                      }
                    }}
                    title={selectedDate === d ? `Active: ${d} (Click to reset to Today, or ✕ to remove from header)` : `Switch to ${d}`}
                    style={{
                      background: selectedDate === d
                        ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                        : 'rgba(255, 255, 255, 0.05)',
                      color: selectedDate === d ? '#ffffff' : 'rgba(203, 213, 225, 0.8)',
                      border: selectedDate === d
                        ? '1px solid rgba(59, 130, 246, 0.5)'
                        : '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '0.66rem',
                      fontWeight: selectedDate === d ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: selectedDate === d ? '0 2px 6px rgba(37, 99, 235, 0.3)' : 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>{d}</span>
                    {selectedDate === d && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRecordedDateFromHeader(d);
                        }}
                        title={`Cancel & remove ${d} from header`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '13px',
                          height: '13px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          marginLeft: '2px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                          e.currentTarget.style.transform = 'scale(1.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <X size={9} color="#ffffff" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Service / Sales Switch */}
            <div style={{
              display: 'flex',
              background: '#e2e8f0',
              borderRadius: '8px',
              padding: '3px',
              border: '1px solid #cbd5e1',
              flexShrink: 0,
              gap: '2px'
            }}>
              <button
                onClick={() => setSheetType('SERVICE')}
                style={{
                  padding: '4px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.3px',
                  background: sheetType === 'SERVICE'
                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                    : 'transparent',
                  color: sheetType === 'SERVICE' ? '#ffffff' : '#334155',
                  boxShadow: sheetType === 'SERVICE' ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                WORKSHOP (SERVICE)
              </button>
              <button
                onClick={() => setSheetType('SALES')}
                style={{
                  padding: '4px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.3px',
                  background: sheetType === 'SALES'
                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                    : 'transparent',
                  color: sheetType === 'SALES' ? '#ffffff' : '#334155',
                  boxShadow: sheetType === 'SALES' ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                SHOWROOM (SALES)
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchDaySheet}
              title="Refresh Day Sheet"
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                color: '#475569',
                padding: '6px 8px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {/* Settings Sidebar Toggle Icon Button (Pinned to Far Right of Row 2) */}
          <button
            id="settings-sidebar-toggle-btn"
            type="button"
            onClick={() => setShowSettingsSidebar(true)}
            title="Settings & System Fit"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#475569',
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              marginLeft: 'auto'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.background = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = '#ffffff';
            }}
          >
            <Settings size={18} color="#64748b" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav style={{
          display: 'flex',
          gap: '6px',
          padding: '6px 24px 8px 24px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f1f5f9',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'daysheet', label: 'Day Sheet', icon: FileText },
              { id: 'receipt_entry', label: 'New Receipt', icon: PlusCircle },
              { id: 'receipts', label: 'Receipts Register', icon: List },
              { id: 'tally', label: 'Tally Export', icon: Zap },
              { id: 'archive', label: 'Day Sheet Excel Archive', icon: FileCheck },
              { id: 'audit', label: 'Audit Trail', icon: History }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isArchive = tab.id === 'archive';
              const badge = null;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: isActive
                      ? '1px solid transparent'
                      : isArchive
                        ? '1px solid #a7f3d0'
                        : '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    fontWeight: isActive ? 700 : 600,
                    letterSpacing: '0.2px',
                    cursor: 'pointer',
                    background: isActive
                      ? (isArchive
                        ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                        : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)')
                      : (isArchive
                        ? '#ecfdf5'
                        : '#ffffff'),
                    color: isActive ? '#ffffff' : (isArchive ? '#065f46' : '#1e293b'),
                    boxShadow: isActive
                      ? (isArchive
                        ? '0 2px 8px rgba(5, 150, 105, 0.3)'
                        : '0 2px 8px rgba(37, 99, 235, 0.35)')
                      : '0 1px 3px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  <Icon size={14} color={isActive ? '#ffffff' : (isArchive ? '#059669' : '#475569')} />
                  <span>{tab.label}</span>
                  {isArchive && excelBackupsList.length > 0 && (
                    <span style={{
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#059669',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '10px',
                      marginLeft: '2px'
                    }}>
                      {excelBackupsList.length}
                    </span>
                  )}
                  {badge && (
                    <span style={{
                      position: 'absolute', top: '4px', right: '4px',
                      background: '#f59e0b', borderRadius: '50%',
                      width: '6px', height: '6px',
                      boxShadow: '0 0 5px #f59e0b'
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* If Admin is logged in, show prominent Logout button in header nav bar */}
          {isAdminAuthenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: '#15803d', fontWeight: 700 }}>
                ● Admin Active: {adminName}
              </span>
              <button
                type="button"
                id="nav-admin-logout-btn"
                onClick={handleAdminLogout}
                title="Logout Admin and return to normal employee workspace"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#b91c1c',
                  border: '1px solid #ef4444',
                  color: '#ffffff',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(185, 28, 28, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Lock size={12} />
                <span>Logout Admin</span>
              </button>
            </div>
          )}
        </nav>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, padding: '10px 16px', maxWidth: '1560px', width: '100%', margin: '0 auto' }}>
        {/* ========================================================================= */}
        {/* TAB 1: DAY SHEET (MATCHES DAY SHEET.xlsx EXACT SPECIFICATION)             */}
        {/* ========================================================================= */}
        {activeTab === 'daysheet' && (
          <div>
            {/* Top Operational Action Bar (No-Print) */}
            <div className="no-print premium-card" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              padding: '8px 14px',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.2px' }}>
                  {sheetType === 'SERVICE' ? 'CASH SHEET — WORKSHOP' : 'CASH SHEET — SALES'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '1px' }}>
                  Branch: <strong style={{ color: '#0f172a' }}>{currentBranch?.name}</strong> | Date: <strong style={{ color: '#0f172a' }}>{selectedDate}</strong>
                </div>
              </div>

              {/* Status Badge & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isReconciled ? '#ecfdf5' : '#fef2f2',
                  color: isReconciled ? '#059669' : '#dc2626',
                  border: `1.5px solid ${isReconciled ? '#a7f3d0' : '#fecaca'}`,
                  boxShadow: isReconciled ? '0 1px 4px rgba(16, 185, 129, 0.12)' : '0 1px 4px rgba(239, 68, 68, 0.12)'
                }}>
                  {isReconciled ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  <span>{isReconciled ? 'CASH RECONCILED (₹0.00 Diff)' : `MISMATCH: Diff ${cashDiff < 0 ? '-' : '+'}₹${Math.abs(cashDiff).toFixed(2)}`}</span>
                </div>



                <button
                  onClick={() => window.print()}
                  style={{
                    background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 13px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(225, 29, 72, 0.25)'
                  }}
                >
                  <Printer size={14} />
                  <span>Print (A4)</span>
                </button>

                <button
                  id="export-current-excel-btn"
                  onClick={() => { setExportModalStep(1); setShowExportModal(true); }}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 13px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  <Download size={14} />
                  <span>Export Excel</span>
                </button>

                <button
                  id="export-tally-xml-btn"
                  onClick={() => { setTallyExportDate(selectedDate); handleExportTallyXml(); }}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 13px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)'
                  }}
                >
                  <Zap size={14} />
                  <span>Export Tally XML</span>
                </button>

              </div>
            </div>

            {/* Warning if previous working day Day Sheet is missing */}
            {(!daySheet?.hasPreviousDay || daySheet?.warning) && (
              <div className="no-print" style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '6px',
                padding: '6px 12px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#92400e',
                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.08)'
              }}>
                <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '0.78rem' }}>
                  <strong>Notice: No Previous Working Day Sheet Found.</strong>{' '}
                  {daySheet?.warning || `No previous Day Sheet was found for ${currentBranch?.name} prior to ${selectedDate}. Please enter and verify initial physical opening cash balance.`}
                </div>
              </div>
            )}

            {/* Info badge when opening balance is carried forward from previous day */}
            {daySheet?.hasPreviousDay && (
              <div className="no-print" style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '6px 12px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#166534',
                fontSize: '0.78rem',
                boxShadow: '0 1px 3px rgba(16, 185, 129, 0.08)'
              }}>
                <CheckCircle size={15} color="#16a34a" style={{ flexShrink: 0 }} />
                <span>
                  Physical opening cash balance carried forward from previous working day (<strong>{daySheet.previousDayDate}</strong>): <strong>₹{daySheet.previousClosingBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
              </div>
            )}

            {/* Summary KPI Cards (No-Print) */}
            <div className="no-print" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '10px',
              marginBottom: '10px'
            }}>
              <div className="kpi-card" style={{ ['--kpi-accent' as any]: '#10b981' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Cash Receipts Today
                </div>
                <div className="num-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  ₹{cashRecsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>✓</span> {cashReceipts.length} Physical Cash Receipts
                </div>
              </div>

              <div className="kpi-card" style={{ ['--kpi-accent' as any]: '#6366f1' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Digital / Cheque Receipts (Bank)
                </div>
                <div className="num-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4338ca', marginTop: '2px' }}>
                  ₹{nonCashRecsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#4338ca', fontWeight: 700, marginTop: '2px' }}>
                  {nonCashReceipts.length} PhonePe / NEFT Receipts
                </div>
              </div>

              <div className="kpi-card" style={{ ['--kpi-accent' as any]: '#f59e0b' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Bank Deposits (Cash-to-Bank)
                </div>
                <div className="num-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                  ₹{currentTotalDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                  {deposits.length} Bank Deposits (Reduces Cash)
                </div>
              </div>

              <div className="kpi-card" style={{ ['--kpi-accent' as any]: isReconciled ? '#10b981' : '#ef4444' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Physical Cash Counted
                </div>
                <div className="num-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: isReconciled ? '#059669' : '#dc2626', marginTop: '2px' }}>
                  ₹{currentTotalDenom.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: isReconciled ? '#059669' : '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                  {isReconciled ? '✓ Matched Closing Cash' : cashDiff < 0 ? `Shortage: -₹${Math.abs(cashDiff).toFixed(2)}` : `Excess: +₹${cashDiff.toFixed(2)}`}
                </div>
              </div>
            </div>

            {/* EXACT PRINTABLE DAY SHEET (CORRESPONDS 1:1 TO DAY SHEET.xlsx) */}
            <div id="day-sheet-print-area" className="print-page" style={{
              backgroundColor: '#ffffff',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1.5px solid #0f172a',
              boxShadow: '0 2px 5px rgba(0,0,0,0.06)'
            }}>

              {/* Print-only branding header: hidden on screen, visible when printing */}
              <div className="day-sheet-print-header">
                <img
                  src="/Bellary Motor Sales Logo.png"
                  alt="Bellary Motors Sales"
                  className="day-sheet-print-logo-left"
                />
                <div className="day-sheet-print-company">
                  <div className="day-sheet-print-company-name">BELLARY MOTORS SALES PVT LTD.</div>
                  <div className="day-sheet-print-company-details">
                    H.O : BALLARI&nbsp;&nbsp;|&nbsp;&nbsp;GSTIN : 29AACCB6242J1ZK&nbsp;&nbsp;|&nbsp;&nbsp;Authorised Mahindra Dealer
                  </div>
                </div>
                <img
                  src="/mahindra-new-vector-logo.png"
                  alt="Mahindra Rise"
                  className="day-sheet-print-logo-right"
                />
              </div>

              {/* Sheet Title and Metadata */}
              <div style={{ textAlign: 'center', borderBottom: '1.5px solid #0f172a', paddingBottom: '6px', marginBottom: '8px' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', margin: 0 }}>
                  {sheetType === 'SERVICE' ? 'CASH SHEET- WORKSHOP' : 'CASH SHEET- SALES'}
                </h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                  <span>BRANCH: {currentBranch?.name}</span>
                  <span>DATE: {selectedDate}</span>
                </div>
              </div>

              {/* Two-Column Grid matching DAY SHEET.xlsx layout */}
              <div className="print-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                
                {/* ===================== LEFT COLUMN ===================== */}
                <div>
                  
                  {/* SECTION 1: DETAILS OF CASH RECEIPTS */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>DETAILS OF CASH RECEIPTS</span>
                      <button
                        className="no-print"
                        onClick={() => {
                          setNewReceiptMode('Cash');
                          setShowAddReceiptModal(true);
                        }}
                        style={{
                          background: '#059669',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Add Cash Receipt
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '55%', fontSize: '0.74rem' }}>CUSTOMER NAME</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '25%', fontSize: '0.74rem' }}>RCP NO</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', width: '20%', fontSize: '0.74rem' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashReceipts.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '6px', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                              No cash receipts recorded for this date
                            </td>
                          </tr>
                        ) : (
                          cashReceipts.map((r, i) => (
                            <tr key={r.id || i} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', fontWeight: 500 }}>
                                <div>{r.customer_name}</div>
                              </td>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
                                {r.receipt_no}
                              </td>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                                {r.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                        {/* TOTAL CASH ROW (Matches C30: SUM(C10:C25)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.76rem' }}>TOTAL-</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.8rem' }}>
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
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>DETAILS OF CHEQUE/NEFT RECEIPTS (DIGITAL)</span>
                      <button
                        className="no-print"
                        onClick={() => {
                          setNewReceiptMode('Cheque/NEFT');
                          setShowAddReceiptModal(true);
                        }}
                        style={{
                          background: '#4338ca',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Add Digital Receipt
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '55%', fontSize: '0.74rem' }}>CUSTOMER NAME</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '25%', fontSize: '0.74rem' }}>REP NO</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', width: '20%', fontSize: '0.74rem' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonCashReceipts.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '6px', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                              No non-cash receipts recorded for this date
                            </td>
                          </tr>
                        ) : (
                          nonCashReceipts.map((r, i) => (
                            <tr key={r.id || i} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', fontWeight: 500 }}>
                                <div>{r.customer_name}</div>
                                {r.utr_reference && (
                                  <div className="receipt-ref" style={{ fontSize: '0.68rem', color: '#475569' }}>Ref: {r.utr_reference}</div>
                                )}
                              </td>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
                                {r.receipt_no}
                              </td>
                              <td style={{ padding: '3px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                                {r.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                        {/* TOTAL CHEQUE/NEFT ROW */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.76rem' }}>TOTAL-</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.8rem', color: '#1e40af' }}>
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
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
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
                        style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 7px', fontSize: '0.68rem', cursor: 'pointer' }}
                      >
                        + Add Bank/Expense
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '60%', fontSize: '0.74rem' }}>BANK NAME / PARTICULARS</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', width: '35%', fontSize: '0.74rem' }}>AMOUNT</th>
                          <th className="no-print" style={{ width: '5%', border: '1px solid #0f172a' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((d, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '2px 5px', border: '1px solid #0f172a' }}>
                              <input 
                                type="text"
                                value={d.particulars}
                                onChange={(e) => handleDepositChange(idx, 'particulars', e.target.value)}
                                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontWeight: 600, fontSize: '0.78rem', padding: '1px 2px' }}
                              />
                            </td>
                            <td style={{ padding: '2px 5px', border: '1px solid #0f172a', textAlign: 'right' }}>
                              <input 
                                type="number"
                                step="any"
                                value={d.amount || ''}
                                onChange={(e) => handleDepositChange(idx, 'amount', e.target.value)}
                                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', padding: '1px 2px' }}
                              />
                            </td>
                            <td className="no-print" style={{ textAlign: 'center', border: '1px solid #0f172a', padding: 0 }}>
                              {deposits.length > 1 && (
                                <button 
                                  onClick={() => removeDepositRow(idx)}
                                  title="Delete row"
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1 }}
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* TOTAL BANK DEPOSIT (G13: SUM(G10:G12)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.76rem' }}>TOTAL</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.8rem' }}>
                            {currentTotalDeposits.toFixed(2)}
                          </td>
                          <td className="no-print" style={{ border: '1px solid #0f172a' }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION 3B: DETAILS OF EXPENSES (below Bank Deposit) */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>DETAILS OF EXPENSES</span>
                      <button
                        className="no-print"
                        onClick={addExpenseRow}
                        style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 7px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 700 }}
                      >
                        + Add Expense
                      </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', width: '60%', fontSize: '0.74rem' }}>EXPENSE PARTICULARS</th>
                          <th style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', width: '35%', fontSize: '0.74rem' }}>AMOUNT</th>
                          <th className="no-print" style={{ width: '5%', border: '1px solid #0f172a' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ padding: '5px 6px', border: '1px solid #0f172a', color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic' }}>
                              No expenses recorded for this date
                            </td>
                            <td className="no-print" style={{ border: '1px solid #0f172a' }}></td>
                          </tr>
                        ) : (
                          expenses.map((exp, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '2px 5px', border: '1px solid #0f172a' }}>
                                <input
                                  type="text"
                                  value={exp.particulars}
                                  placeholder="Expense details"
                                  onChange={(e) => handleExpenseChange(idx, 'particulars', e.target.value)}
                                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontWeight: 600, fontSize: '0.78rem', padding: '1px 2px' }}
                                />
                              </td>
                              <td style={{ padding: '2px 5px', border: '1px solid #0f172a', textAlign: 'right' }}>
                                <input
                                  type="number"
                                  step="any"
                                  value={exp.amount || ''}
                                  onChange={(e) => handleExpenseChange(idx, 'amount', e.target.value)}
                                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', padding: '1px 2px' }}
                                />
                              </td>
                              <td className="no-print" style={{ textAlign: 'center', border: '1px solid #0f172a', padding: 0 }}>
                                <button
                                  onClick={() => removeExpenseRow(idx)}
                                  title="Delete expense row"
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1 }}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                        {/* TOTAL EXPENSES */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.76rem' }}>TOTAL</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.8rem', color: '#b91c1c' }}>
                            {currentTotalExpenses.toFixed(2)}
                          </td>
                          <td className="no-print" style={{ border: '1px solid #0f172a' }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SECTION 4: CLOSING BALANCE DENOMINATIONS (Rows 15-28 in DAY SHEET.xlsx) */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{
                      backgroundColor: '#f1f5f9',
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      border: '1px solid #0f172a',
                      borderBottom: 'none',
                      textTransform: 'uppercase'
                    }}>
                      CLOSING BALANCE DENOMINATIONS
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '3px 5px', border: '1px solid #0f172a', width: '32%', fontSize: '0.74rem' }}>NOTE</th>
                          <th style={{ padding: '3px 5px', border: '1px solid #0f172a', width: '28%', textAlign: 'center', fontSize: '0.74rem' }}>COUNT</th>
                          <th style={{ padding: '3px 5px', border: '1px solid #0f172a', textAlign: 'right', width: '40%', fontSize: '0.74rem' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {denominations.map((denom, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '2px 5px', border: '1px solid #0f172a', fontWeight: 600 }}>
                              {denom.note_label}
                            </td>
                            <td style={{ padding: '2px 5px', border: '1px solid #0f172a', textAlign: 'center' }}>
                              <input 
                                type="number"
                                min="0"
                                value={denom.note_count || ''}
                                onChange={(e) => handleDenominationChange(idx, e.target.value)}
                                style={{ width: '48px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '3px', padding: '1px', fontWeight: 600, fontSize: '0.76rem' }}
                              />
                            </td>
                            <td style={{ padding: '2px 5px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 600 }}>
                              {denom.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {/* TOTAL DENOMINATIONS ROW (G28: SUM(G20:G27)) */}
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontSize: '0.76rem' }}>TOTAL</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a' }}></td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontSize: '0.8rem' }}>
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
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      border: '1px solid #0f172a',
                      textTransform: 'uppercase'
                    }}>
                      SUMMARY & CASH RECONCILIATION
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #0f172a' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700, width: '65%' }}>
                            <div>OPENING BALANCE</div>
                            <div style={{ fontSize: '0.68rem', color: daySheet?.hasPreviousDay ? '#059669' : '#b45309', fontWeight: 600 }}>
                              {daySheet?.hasPreviousDay 
                                ? `(Carried forward from ${daySheet.previousDayDate})` 
                                : '(Initial physical opening balance)'}
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.opening_balance || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, opening_balance: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '100px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700, fontSize: '0.78rem' }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700 }}>
                            <div>CASH RECEIPTS (Auto-derived)</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
                              Sum of physical cash receipts from workshop
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            {cashRecsTotal.toFixed(2)}
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700 }}>
                            CASH SALES
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.cash_sales || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, cash_sales: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '100px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700, fontSize: '0.78rem' }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700, color: '#dc2626' }}>
                            <div>LESS: CASH PAYMENTS / VOUCHERS</div>
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>
                              Manual voucher payments &mdash; reduces physical cash
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>
                            <input 
                              type="number"
                              step="any"
                              value={daySheet?.less_vouchers || ''}
                              onChange={(e) => setDaySheet(prev => prev ? ({ ...prev, less_vouchers: parseFloat(e.target.value) || 0 }) : null)}
                              style={{ width: '100px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '2px 4px', fontWeight: 700, color: '#dc2626', fontSize: '0.78rem' }}
                            />
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700, color: '#dc2626' }}>
                            <div>BANK DEPOSITS (Auto-derived)</div>
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>
                              Cash deposited to bank — reduces physical cash
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            {currentTotalDeposits.toFixed(2)}
                          </td>
                        </tr>

                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700, color: '#dc2626' }}>
                            <div>LESS: EXPENSES (Itemized)</div>
                            <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>
                              From Details of Expenses below Bank Deposit
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            {currentTotalExpenses.toFixed(2)}
                          </td>
                        </tr>

                        {/* FORMULA: OPENING + CASH RECEIPTS + CASH SALES - LESS - BANK DEPOSITS - EXPENSES */}
                        <tr style={{ backgroundColor: '#f1f5f9', fontSize: '0.82rem' }}>
                          <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontWeight: 800 }}>
                            <div>CLOSING CASH BALANCE</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
                              Opening + Cash Receipts + Cash Sales - Less Payments - Bank Deposits - Expenses
                            </div>
                          </td>
                          <td style={{ padding: '5px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                            ₹{closingBalanceCalculated.toFixed(2)}
                          </td>
                        </tr>

                        {/* PHYSICAL CASH COUNT */}
                        <tr>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', fontWeight: 700 }}>
                            <div>PHYSICAL CASH COUNT</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
                              Total counted from cash denominations
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 700, fontSize: '0.88rem' }}>
                            ₹{currentTotalDenom.toFixed(2)}
                          </td>
                        </tr>

                        {/* DENOMINATIONS MATCH STATUS */}
                        <tr style={{ backgroundColor: isReconciled ? '#ecfdf5' : '#fef2f2' }}>
                          <td style={{ padding: '5px 6px', border: '1px solid #0f172a', fontWeight: 800, color: isReconciled ? '#059669' : '#dc2626' }}>
                            <div>CASH DIFFERENCE</div>
                            <div style={{ fontSize: '0.68rem', fontWeight: 500 }}>
                              Physical Cash Count - Calculated Closing Balance
                            </div>
                          </td>
                          <td style={{ padding: '5px 6px', border: '1px solid #0f172a', textAlign: 'right', fontWeight: 800, fontSize: '0.85rem', color: isReconciled ? '#059669' : '#dc2626' }}>
                            {isReconciled ? 'BALANCED (₹0.00 Diff) ✓' : `${cashDiff < 0 ? '-' : '+'}₹${Math.abs(cashDiff).toFixed(2)} (${cashDiff < 0 ? 'Cash Shortage' : 'Cash Excess'})`}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>

              {/* Signatures Footer */}
              <div className="print-signatures" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginTop: '28px',
                paddingTop: '8px',
                paddingLeft: '12px',
                paddingRight: '12px'
              }}>
                <div className="print-sig-col" style={{ textAlign: 'center', width: '28%' }}>
                  <div className="print-sig-space" style={{ height: '36px' }}></div>
                  <div className="print-sig-line" style={{ borderTop: '1.5px solid #0f172a', paddingTop: '4px', fontWeight: 800, fontSize: '0.76rem', color: '#0f172a', textTransform: 'uppercase' }}>
                    Cashier Signature
                  </div>
                </div>

                <div className="print-sig-col" style={{ textAlign: 'center', width: '28%' }}>
                  <div className="print-sig-space" style={{ height: '36px' }}></div>
                  <div className="print-sig-line" style={{ borderTop: '1.5px solid #0f172a', paddingTop: '4px', fontWeight: 800, fontSize: '0.76rem', color: '#0f172a', textTransform: 'uppercase' }}>
                    Accountant Signature
                  </div>
                </div>

                <div className="print-sig-col" style={{ textAlign: 'center', width: '28%' }}>
                  <div className="print-sig-space" style={{ height: '36px' }}></div>
                  <div className="print-sig-line" style={{ borderTop: '1.5px solid #0f172a', paddingTop: '4px', fontWeight: 800, fontSize: '0.76rem', color: '#0f172a', textTransform: 'uppercase' }}>
                    Branch Manager Signature
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}


        {/* ========================================================================= */}
        {/* TAB 3: RECEIPTS REGISTER (SEARCH, FILTER, EDIT, CANCEL WITH AUDIT)       */}
        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* TAB 1.5: SEPARATE FULL-PAGE MAHINDRA RECEIPT ENTRY & PRINT               */}
        {/* ========================================================================= */}
        {activeTab === 'receipt_entry' && (
          <div style={{ maxWidth: '1020px', margin: '0 auto', paddingBottom: '40px' }}>

            {/* Top Toolbar (No-Print) */}
            <div className="no-print premium-card" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              padding: '12px 20px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Mahindra Service Receipt Generator
                </h2>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  Fill details directly on the receipt below, click Save, and print.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {nrSaved && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: '#dcfce7', color: '#15803d',
                    border: '1.5px solid #86efac', borderRadius: '7px',
                    padding: '7px 16px', fontWeight: 800, fontSize: '0.88rem'
                  }}>
                    ✅ Details Saved Successfully!
                  </span>
                )}
                {nrSaved && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      padding: '8px 18px', background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                      color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 800,
                      fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                      boxShadow: '0 2px 8px rgba(37,99,235,0.35)'
                    }}
                  >
                    <Printer size={15} /> Print Receipt
                  </button>
                )}
                <button
                  type="submit"
                  form="new-receipt-form"
                  disabled={nrSaving || nrSaved}
                  style={{
                    padding: '8px 20px',
                    background: nrSaved ? '#475569' : 'linear-gradient(135deg, #059669, #10b981)',
                    color: '#fff', border: 'none',
                    borderRadius: '7px', fontWeight: 800, fontSize: '0.88rem',
                    cursor: nrSaved ? 'default' : 'pointer', opacity: nrSaving ? 0.6 : 1,
                    boxShadow: nrSaved ? 'none' : '0 2px 8px rgba(16,185,129,0.35)',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <FileText size={15} /> {nrSaving ? 'Saving…' : nrSaved ? '✔ Saved' : '✔ Save Receipt'}
                </button>
                {nrSaved && (
                  <button
                    type="button"
                    onClick={openNewReceiptForm}
                    style={{
                      padding: '8px 16px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                      color: '#fff', border: 'none',
                      borderRadius: '7px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                    }}
                  >
                    + New Receipt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('receipts')}
                  style={{
                    padding: '8px 16px', backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '7px', fontWeight: 600, fontSize: '0.88rem',
                    cursor: 'pointer', color: '#475569'
                  }}
                >
                  View Receipts Register
                </button>
              </div>
            </div>

            {/* ════ EXACT RECEIPT CARD CONTAINER ════ */}
            <form
              id="new-receipt-form"
              onSubmit={handleCreateNewReceipt}
              style={{
                backgroundColor: '#ffffff',
                border: '1.5px solid #0f172a',
                borderRadius: '8px',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                fontSize: '14px',
                color: '#000000',
                boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                boxSizing: 'border-box',
                overflow: 'hidden'
              }}
            >

              {/* ── HEADER: LOGO | COMPANY | PILL RECEIPT NO ── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 24px',
                borderBottom: '1.5px solid #000000',
                backgroundColor: '#ffffff'
              }}>
                {/* 1. Official Red Twin-Peaks Logo & mahindra text */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingRight: '28px',
                  borderRight: '1.5px solid #000000',
                  minWidth: '150px'
                }}>
                  {/* Official Mahindra Logo */}
                  <img
                    src="/Mahindra-Logo.png"
                    alt="Mahindra"
                    style={{
                      width: '120px',
                      height: 'auto',
                      maxHeight: '70px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                </div>

                {/* 2. Company Name & GSTIN */}
                <div style={{ flex: 1, paddingLeft: '28px' }}>
                  <div style={{
                    fontWeight: 900,
                    fontSize: '22px',
                    letterSpacing: '0.4px',
                    color: '#000000',
                    lineHeight: '1.2'
                  }}>
                    BELLARY MOTORS SALES PVT LTD.,
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#000000',
                    marginTop: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span>H.O : BALLARI</span>
                    <span style={{ color: '#000000', fontWeight: 900 }}>|</span>
                    <span>GSTIN : 29AACCB6242J1ZK</span>
                  </div>
                </div>

                {/* 3. Right: Pill Badge (SERVICE | RECEIPT NO.) */}
                <div style={{
                  border: '1.5px solid #94a3b8',
                  borderRadius: '12px',
                  backgroundColor: '#e2e8f0',
                  padding: '6px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '190px'
                }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#000000',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                  }}>
                    SERVICE | RECEIPT NO.
                  </span>
                  <input
                    type="text"
                    value={nrReceiptNo}
                    onChange={e => setNrReceiptNo(e.target.value)}
                    required
                    readOnly={nrSaved}
                    style={{
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      color: '#dc2626',
                      fontWeight: 900,
                      fontSize: '20px',
                      fontFamily: 'inherit',
                      textAlign: 'center',
                      width: '100%',
                      padding: '2px 0 0 0',
                      letterSpacing: '0.5px'
                    }}
                  />
                </div>
              </div>

              {/* ── SUB-HEADER: BRANCH & DATE WITH CALENDAR ICON ── */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 24px',
                borderBottom: '1.5px solid #000000',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ fontSize: '15px', color: '#000000' }}>
                  <span style={{ fontWeight: 600 }}>Branch :</span>&nbsp;&nbsp;
                  <span style={{ fontWeight: 900, fontSize: '16px' }}>BALLARI</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                  {/* Calendar Icon SVG */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span style={{ fontWeight: 600 }}>Date :</span>
                  <input
                    type="date"
                    value={nrDate}
                    onChange={e => setNrDate(e.target.value)}
                    required
                    readOnly={nrSaved}
                    style={{
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      fontWeight: 900,
                      fontSize: '15px',
                      color: '#000000',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>

              {/* ── MAIN RECEIPT BORDERED TABLE ── */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{
                  border: '1.5px solid #000000',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>

                  {/* Row 1: Received From and Thanks to | Customer Name | Vehicle No */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    borderBottom: '1.5px solid #000000',
                    minHeight: '44px'
                  }}>
                    <div style={{
                      width: '210px',
                      flexShrink: 0,
                      backgroundColor: '#e2e8f0',
                      borderRight: '1.5px solid #000000',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      Received From and Thanks to
                    </div>
                    <input
                      type="text"
                      placeholder="Customer Name"
                      value={nrCustomerName}
                      onChange={e => setNrCustomerName(e.target.value)}
                      required
                      readOnly={nrSaved}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        padding: '10px 16px',
                        fontWeight: 900,
                        fontSize: '16px',
                        color: '#000000'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Vehicle No"
                      value={nrVehicleNo}
                      onChange={e => setNrVehicleNo(e.target.value.toUpperCase())}
                      readOnly={nrSaved}
                      style={{
                        width: '180px',
                        border: 'none',
                        borderLeft: '1.5px solid #000000',
                        outline: 'none',
                        padding: '10px 14px',
                        fontWeight: 900,
                        fontSize: '16px',
                        color: '#000000',
                        backgroundColor: '#ffffff'
                      }}
                    />
                  </div>

                  {/* Row 2: Received Towards | Description | Payment Mode */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    borderBottom: '1.5px solid #000000',
                    minHeight: '44px'
                  }}>
                    <div style={{
                      width: '210px',
                      flexShrink: 0,
                      backgroundColor: '#e2e8f0',
                      borderRight: '1.5px solid #000000',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      Received Towards
                    </div>
                    <select
                      value={nrTowardsPurpose}
                      onChange={e => setNrTowardsPurpose(e.target.value)}
                      disabled={nrSaved}
                      style={{
                        width: '250px',
                        flexShrink: 0,
                        border: 'none',
                        borderRight: '1.5px solid #000000',
                        outline: 'none',
                        padding: '10px 12px',
                        fontWeight: 800,
                        fontSize: '13.5px',
                        color: '#000000',
                        backgroundColor: '#ffffff',
                        cursor: nrSaved ? 'default' : 'pointer'
                      }}
                    >
                      <option value="">-- Select Purpose --</option>
                      {purposeOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={nrTowardsPurpose ? 'Reference / Bill / Job No.' : 'Select purpose, then enter reference'}
                      value={nrTowardsRef}
                      onChange={e => setNrTowardsRef(e.target.value.toUpperCase())}
                      readOnly={nrSaved}
                      disabled={!nrTowardsPurpose}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        padding: '10px 16px',
                        fontWeight: 900,
                        fontSize: '15px',
                        color: '#000000',
                        backgroundColor: nrTowardsPurpose ? '#ffffff' : '#f8fafc'
                      }}
                    />
                    {isAdminAuthenticated && !nrSaved && (
                      <button
                        type="button"
                        onClick={() => setShowPurposeModal(true)}
                        title="Add a new Received Towards purpose"
                        style={{
                          border: 'none',
                          borderLeft: '1px solid #cbd5e1',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontWeight: 800,
                          fontSize: '12px',
                          padding: '0 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0
                        }}
                      >
                        <PlusCircle size={15} /> Add
                      </button>
                    )}
                    <div style={{
                      width: '230px',
                      borderLeft: '1.5px solid #000000',
                      padding: '6px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#ffffff',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}>
                      <span style={{ fontSize: '13px', color: '#000000', fontWeight: 600, whiteSpace: 'nowrap' }}>Payment Mode :</span>
                      {nrSaved ? (
                        <span style={{
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          fontWeight: 900,
                          fontSize: '14px',
                          padding: '3px 14px',
                          borderRadius: '12px'
                        }}>
                          {nrPaymentMode}
                        </span>
                      ) : (
                        <select
                          value={nrPaymentMode}
                          onChange={e => setNrPaymentMode(e.target.value)}
                          style={{
                            border: 'none',
                            borderRadius: '12px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 900,
                            fontSize: '14px',
                            padding: '3px 12px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Cheque">Cheque</option>
                          <option value="NEFT">NEFT</option>
                          <option value="PhonePe">PhonePe</option>
                          <option value="UPI">UPI</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Row 3: UTR / NEFT NO. */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    borderBottom: '1.5px solid #000000',
                    minHeight: '40px'
                  }}>
                    <div style={{
                      width: '210px',
                      flexShrink: 0,
                      backgroundColor: '#e2e8f0',
                      borderRight: '1.5px solid #000000',
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      UTR / NEFT NO.
                    </div>
                    <input
                      type="text"
                      placeholder={nrPaymentMode === 'Cash' ? '—' : 'Enter UTR / NEFT reference'}
                      value={nrUtrRef}
                      onChange={e => setNrUtrRef(e.target.value)}
                      disabled={nrPaymentMode === 'Cash' || nrSaved}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        padding: '8px 16px',
                        fontWeight: 900,
                        fontSize: '15px',
                        backgroundColor: '#ffffff',
                        color: nrPaymentMode === 'Cash' ? '#94a3b8' : '#000000'
                      }}
                    />
                  </div>

                  {/* Row 4: a Sum of Rupees */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    minHeight: '42px'
                  }}>
                    <div style={{
                      width: '210px',
                      flexShrink: 0,
                      backgroundColor: '#e2e8f0',
                      borderRight: '1.5px solid #000000',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      a Sum of Rupees
                    </div>
                    <div style={{
                      flex: 1,
                      padding: '10px 16px',
                      fontWeight: 900,
                      fontSize: '15px',
                      fontStyle: 'italic',
                      color: nrAmount && parseFloat(nrAmount) > 0 ? '#000000' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      {nrAmount && parseFloat(nrAmount) > 0
                        ? convertToWords(nrAmount)
                        : 'Amount in words will appear here…'}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── BAR: DATED / DRAWN ON ── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 24px',
                borderTop: '1.5px solid #000000',
                borderBottom: '1.5px solid #000000',
                fontSize: '14px',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ width: '260px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Dated :</span>
                  <input
                    type="text"
                    value={nrDated}
                    onChange={e => setNrDated(e.target.value)}
                    readOnly={nrSaved}
                    style={{
                      border: 'none',
                      borderBottom: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      fontWeight: 900,
                      fontSize: '14px',
                      color: '#000000',
                      fontFamily: 'inherit',
                      flex: 1,
                      minWidth: 0
                    }}
                  />
                </div>
                <div style={{ paddingLeft: '20px', flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#000000' }}>Drawn on :</span>
                  <input
                    type="text"
                    value={nrDrawnOn}
                    onChange={e => setNrDrawnOn(e.target.value)}
                    readOnly={nrSaved}
                    style={{
                      border: 'none',
                      borderBottom: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#000000',
                      fontFamily: 'inherit',
                      flex: 1,
                      minWidth: 0
                    }}
                  />
                </div>
              </div>

              {/* ── FOOTER: ROUNDED AMOUNT CARD & CASHIER SIGNATURE AREA ── */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                padding: '10px 24px 14px 24px',
                minHeight: '140px',
                backgroundColor: '#ffffff'
              }}>
                {/* Left: Rounded Amount Box (₹ Amount) */}
                <div style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  backgroundColor: '#e2e8f0',
                  padding: '6px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minWidth: '260px'
                }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#000000', lineHeight: 1 }}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={nrAmount}
                    onChange={e => setNrAmount(e.target.value)}
                    required
                    readOnly={nrSaved}
                    style={{
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      fontWeight: 900,
                      fontSize: '2rem',
                      color: '#000000',
                      width: '100%',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Right: Company signatory, signature space, Cashier at the bottom */}
                <div style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '40px'
                }}>
                  <div style={{
                    fontWeight: 800,
                    fontSize: '13px',
                    color: '#000000',
                    textAlign: 'center',
                    lineHeight: 1.2
                  }}>
                    for Bellary Motors Sales Pvt Ltd.,
                  </div>
                  {/* Blank space for the cashier's signature */}
                  <div style={{ flex: 1, minHeight: '60px' }} />
                  <div style={{
                    width: '160px',
                    borderTop: '1.5px solid #000000',
                    paddingTop: '6px',
                    textAlign: 'center',
                    fontWeight: 900,
                    fontSize: '14px',
                    color: '#000000'
                  }}>
                    Cashier
                  </div>
                </div>
              </div>

              {/* ── DISCLAIMER LINE ── */}
              <div style={{
                padding: '2px 24px 10px 24px',
                fontSize: '11px',
                color: '#000000',
                backgroundColor: '#ffffff'
              }}>
                *Cheques subject to Realisation
              </div>

            </form>

            {/* GREEN CONFIRMATION STRIP ONCE SAVED */}
            {nrSaved && (
              <div className="no-print" style={{
                marginTop: '16px',
                padding: '16px 24px',
                background: 'linear-gradient(135deg, #dcfce7, #f0fdf4)',
                border: '1.5px solid #86efac',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.8rem' }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15803d' }}>
                      Receipt Saved Successfully!
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#166534', marginTop: '2px' }}>
                      Receipt <strong>{nrReceiptNo}</strong> saved. You can print it or create another receipt.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      padding: '9px 20px',
                      background: '#15803d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Printer size={15} /> Print Receipt
                  </button>
                  <button
                    type="button"
                    onClick={openNewReceiptForm}
                    style={{
                      padding: '9px 18px',
                      background: '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    + New Receipt
                  </button>
                </div>
              </div>
            )}

            {/* Hidden A4 print sheet — 3 copies (Original / Duplicate / Triplicate) */}
            {renderThreeReceiptsPrintSheet('receipt-print-sheet-entry', {
              receiptNo: nrReceiptNo,
              branchName: currentBranch?.name,
              date: nrDate,
              dated: nrDated,
              drawnOn: nrDrawnOn,
              customerName: nrCustomerName,
              vehicleNo: nrVehicleNo,
              receivedTowards: composeTowards(nrTowardsPurpose, nrTowardsRef),
              paymentMode: nrPaymentMode,
              utrRef: nrUtrRef,
              amount: nrAmount
            })}

          </div>
        )}
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

                <button
                  id="create-new-receipt-btn"
                  onClick={openNewReceiptForm}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#ffffff', border: 'none', padding: '8px 16px',
                    borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                  }}
                >
                  <PlusCircle size={15} />
                  New Receipt
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
                          ₹{r.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#475569', maxWidth: '240px' }}>
                          <div>{r.received_towards || composeTowards(r.received_towards_purpose, r.received_towards_reference)}</div>
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
                                onClick={() => setPrintReceipt(r)}
                                title="Print Receipt"
                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                              >
                                <Printer size={14} color="#2563eb" />
                              </button>
                              <button
                                onClick={() => openEditReceipt(r)}
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
        {/* TALLY EXPORT TAB                                                          */}
        {/* ========================================================================= */}
        {activeTab === 'tally' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Header Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #090e1a 0%, #111a2e 50%, #1e293b 100%)',
              borderRadius: '14px',
              padding: '20px 26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.35)',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.35) 0%, rgba(37, 99, 235, 0.12) 100%)',
                  padding: '12px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
                }}>
                  <Zap size={22} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 800, fontSize: '1.12rem', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Tally XML Export &amp; ERP Integration
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '3px' }}>
                    Generate standard 7-column voucher XML for seamless import into TallyPrime and Tally.ERP 9
                  </div>
                </div>
              </div>

              {/* Status Pills on Right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '999px',
                  color: '#34d399',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  TallyPrime &amp; ERP 9
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '999px',
                  color: '#38bdf8',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  7-Column Format
                </span>
              </div>
            </div>

            {/* Export Generation Card */}
            <div className="premium-card" style={{ padding: '24px 28px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Download size={18} color="#2563eb" />
                    Generate Tally XML Voucher
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                    Choose the day sheet date to prepare active receipts for Tally import
                  </div>
                </div>
              </div>

              {/* Controls Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                background: '#f8fafc',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={14} color="#64748b" />
                    Date:
                  </label>
                  <input
                    type="date"
                    value={tallyExportDate}
                    onChange={e => setTallyExportDate(e.target.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '7px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setTallyExportDate(getTodayIso())}
                    style={{
                      padding: '6px 10px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#ffffff'; }}
                  >
                    Today
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button
                    onClick={handlePreviewTallyXml}
                    disabled={tallyPreviewLoading}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#ffffff',
                      color: '#2563eb',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: tallyPreviewLoading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: tallyPreviewLoading ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={(e) => { if (!tallyPreviewLoading) { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.backgroundColor = '#eff6ff'; } }}
                    onMouseLeave={(e) => { if (!tallyPreviewLoading) { e.currentTarget.style.borderColor = '#bfdbfe'; e.currentTarget.style.backgroundColor = '#ffffff'; } }}
                  >
                    <Eye size={15} color="#2563eb" />
                    {tallyPreviewLoading ? 'Loading...' : 'Preview (7-Col)'}
                  </button>

                  <button
                    onClick={handleExportTallyXml}
                    style={{
                      padding: '8px 18px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 3px 10px rgba(37, 99, 235, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 5px 14px rgba(37, 99, 235, 0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(37, 99, 235, 0.3)'; }}
                  >
                    <Download size={15} />
                    Download XML
                  </button>

                  <button
                    onClick={handleSaveTallyXml}
                    disabled={tallyExportLoading}
                    style={{
                      padding: '8px 18px',
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: tallyExportLoading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: tallyExportLoading ? 0.6 : 1,
                      boxShadow: '0 3px 10px rgba(5, 150, 105, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { if (!tallyExportLoading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 5px 14px rgba(5, 150, 105, 0.4)'; } }}
                    onMouseLeave={(e) => { if (!tallyExportLoading) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(5, 150, 105, 0.3)'; } }}
                  >
                    <FileCheck size={15} />
                    {tallyExportLoading ? 'Saving...' : 'Save to Server'}
                  </button>
                </div>
              </div>

              {/* Step-by-Step Instructions Card */}
              <div style={{
                marginTop: '16px',
                padding: '14px 18px',
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#334155' }}>Workflow:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#475569' }}>
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', color: '#1e293b', fontWeight: 800, fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                    Select Date
                  </div>
                  <span style={{ color: '#cbd5e1' }}>&rarr;</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#475569' }}>
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', color: '#1e293b', fontWeight: 800, fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                    Download XML or Save
                  </div>
                  <span style={{ color: '#cbd5e1' }}>&rarr;</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#475569' }}>
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#e2e8f0', color: '#1e293b', fontWeight: 800, fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
                    Open Tally &rarr; <em>Import Data &rarr; Vouchers</em>
                  </div>
                </div>

                <div style={{
                  padding: '3px 9px',
                  background: '#f1f5f9',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#64748b'
                }}>
                  Active Receipts Only
                </div>
              </div>

              {tallyPreviewError && (
                <div style={{
                  marginTop: '14px',
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  fontSize: '0.82rem',
                  color: '#b91c1c',
                  fontWeight: 600
                }}>
                  {tallyPreviewError}
                </div>
              )}

              {/* Interactive XML Preview Table */}
              {tallyPreview && (
                <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '2px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.96rem', color: '#0f172a' }}>
                      <Table2 size={18} color="#059669" />
                      XML Preview &mdash; Standard 7-Column Format
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #dbeafe' }}>
                      {tallyPreview.receiptCount} receipt(s)
                    </span>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #bbf7d0' }}>
                      Total &#x20B9;{tallyPreview.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => setTallyPreview(null)}
                      title="Close preview"
                      style={{
                        marginLeft: 'auto',
                        width: '28px',
                        height: '28px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f8fafc',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '12px' }}>
                    Spreadsheet view of what will be written into the XML file for <strong>{tallyExportDate}</strong>.
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'auto', maxHeight: '420px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)' }}>
                    <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr>
                          <th style={{ ...tallySheetHeaderStyle, width: '42px', textAlign: 'center' }}>#</th>
                          {['Date', 'Voucher Type', 'Voucher No.', 'Debit', 'Credit', 'Amount', 'Narration'].map(header => (
                            <th
                              key={header}
                              style={{
                                ...tallySheetHeaderStyle,
                                textAlign: header === 'Amount' ? 'right' : 'left',
                                minWidth: header === 'Narration' ? '380px' : header === 'Debit' ? '190px' : undefined,
                              }}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tallyPreview.columns.map((row: any, index: number) => (
                          <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={tallySheetIndexStyle}>{index + 1}</td>
                            <td style={tallySheetCellStyle}>{row['Date']}</td>
                            <td style={tallySheetCellStyle}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                backgroundColor: row['Voucher Type'] === 'Cash' ? '#dcfce7' : '#dbeafe',
                                color: row['Voucher Type'] === 'Cash' ? '#166534' : '#1e40af',
                                border: row['Voucher Type'] === 'Cash' ? '1px solid #bbf7d0' : '1px solid #bfdbfe'
                              }}>
                                {row['Voucher Type']}
                              </span>
                            </td>
                            <td style={{ ...tallySheetCellStyle, fontFamily: 'monospace', whiteSpace: 'nowrap', fontWeight: 600 }}>{row['Voucher No.']}</td>
                            <td style={{ ...tallySheetCellStyle, fontWeight: 700, color: '#0f172a' }}>{row['Debit']}</td>
                            <td style={{ ...tallySheetCellStyle, color: '#334155' }}>{row['Credit']}</td>
                            <td style={{ ...tallySheetCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', color: '#0f172a' }}>
                              &#x20B9;{Number(row['Amount']).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ ...tallySheetCellStyle, minWidth: '380px', lineHeight: 1.5, color: '#475569' }}>{row['Narration']}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6} style={{ ...tallySheetCellStyle, backgroundColor: '#f1f5f9', fontWeight: 800, textAlign: 'right', color: '#1e293b' }}>
                            Total ({tallyPreview.receiptCount} receipts)
                          </td>
                          <td style={{ ...tallySheetCellStyle, backgroundColor: '#f1f5f9', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                            &#x20B9;{tallyPreview.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...tallySheetCellStyle, backgroundColor: '#f1f5f9' }} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                    <button
                      onClick={handleExportTallyXml}
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Download size={14} /> Download XML
                    </button>
                    <button
                      onClick={handleSaveTallyXml}
                      disabled={tallyExportLoading}
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: tallyExportLoading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: tallyExportLoading ? 0.6 : 1
                      }}
                    >
                      <FileCheck size={14} /> {tallyExportLoading ? 'Saving...' : 'Save to Server'}
                    </button>
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Includes active receipts for {tallyExportDate}.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Saved XML Exports List */}
            <div className="premium-card" style={{ padding: '24px 28px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#2563eb" />
                  Saved Tally XML Files
                </div>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#475569'
                }}>
                  {tallyExportList.length} file(s)
                </span>
              </div>

              {tallyExportList.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto'
                  }}>
                    <FileText size={22} color="#64748b" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#334155' }}>
                    No Tally XML files saved on server
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                    Select a date above and click &ldquo;Save to Server&rdquo; to archive XML exports.
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>DATE</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>FILE NAME</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>SIZE</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.76rem', width: '130px' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tallyExportList.map((f: any, i: number) => (
                        <tr key={f.fileName} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{f.date}</td>
                          <td style={{ padding: '10px 14px', color: '#334155', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            <span style={{
                              padding: '2px 6px',
                              backgroundColor: '#eff6ff',
                              border: '1px solid #dbeafe',
                              borderRadius: '4px',
                              color: '#1d4ed8',
                              fontWeight: 700,
                              fontSize: '0.68rem',
                              marginRight: '6px'
                            }}>
                              XML
                            </span>
                            {f.fileName}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.8rem' }}>{(f.size / 1024).toFixed(1)} KB</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <a
                              href={`/api/tally/download/${encodeURIComponent(f.fileName)}`}
                              download
                              style={{
                                padding: '5px 12px',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                color: '#ffffff',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                              }}
                            >
                              <Download size={13} /> Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Receipt Backup Excel Files */}
            <div className="premium-card" style={{ padding: '24px 28px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} color="#059669" />
                  Receipt Backup Excel Files
                </div>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#475569'
                }}>
                  {receiptBackupList.length} file(s)
                </span>
              </div>

              <div style={{
                marginBottom: '16px',
                fontSize: '0.78rem',
                color: '#475569',
                backgroundColor: '#f0fdf4',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', flexShrink: 0 }} />
                <span>These files are <strong>automatically synchronized</strong> whenever a receipt is entered, updated, or deleted.</span>
              </div>

              {receiptBackupList.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto'
                  }}>
                    <FileCheck size={22} color="#64748b" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#334155' }}>
                    No receipt backup Excel files available yet
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                    Files are auto-created when receipts are created or saved in the register.
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>DATE</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>FILE NAME</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.76rem' }}>SIZE</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '0.76rem', width: '220px' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptBackupList.map((f: any, i: number) => (
                        <tr key={f.fileName} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{f.date}</td>
                          <td style={{ padding: '10px 14px', color: '#334155', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            <span style={{
                              padding: '2px 6px',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              borderRadius: '4px',
                              color: '#047857',
                              fontWeight: 700,
                              fontSize: '0.68rem',
                              marginRight: '6px'
                            }}>
                              XLSX
                            </span>
                            {f.fileName}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.8rem' }}>{(f.size / 1024).toFixed(1)} KB</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                              <a
                                href={`/api/tally/download-receipt-backup/${encodeURIComponent(f.fileName)}`}
                                download
                                style={{
                                  padding: '5px 12px',
                                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                  color: '#ffffff',
                                  borderRadius: '6px',
                                  textDecoration: 'none',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                                }}
                              >
                                <Download size={13} /> Download
                              </a>
                              <button
                                onClick={() => handleRegenerateReceiptBackup(f.date)}
                                style={{
                                  padding: '5px 12px',
                                  backgroundColor: '#ffffff',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                              >
                                <RefreshCw size={12} /> Regenerate
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}



        {/* ========================================================================= */}
        {/* TAB 4: DAY SHEET EXCEL ARCHIVE & DOWNLOADER                               */}
        {/* ========================================================================= */}
        {activeTab === 'archive' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* If Admin is logged in, show Admin Action Banner */}
            {isAdminAuthenticated && (
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ backgroundColor: '#059669', padding: '8px', borderRadius: '8px', color: '#ffffff', display: 'flex' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                      Admin Active: <span style={{ color: '#38bdf8' }}>{adminName}</span> — Delete & Add Access Enabled
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '2px' }}>
                      You can permanently delete archives and create on-demand Day Sheet backups.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    id="archive-header-logout-btn"
                    onClick={handleAdminLogout}
                    title="Logout Admin"
                    style={{
                      backgroundColor: '#dc2626',
                      border: 'none',
                      color: '#ffffff',
                      padding: '8px 16px',
                      borderRadius: '7px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
                    }}
                  >
                    <Lock size={13} /> Logout Admin
                  </button>
                </div>
              </div>
            )}

            {/* Clean, Simple Top Action Bar with Yesterday, Today, Calendar, and Admin Archive */}
            <div className="premium-card" style={{
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                  Day Sheet Excel Archive & Downloader
                </h2>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  Branch: <strong style={{ color: '#0f172a' }}>{currentBranch?.name || 'BALLARI'}</strong> | Quick download yesterday, today, or pick any calendar date.
                </div>
              </div>

              {/* Yesterday, Today, and Calendar Quick Download */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* 1. Yesterday Date Button */}
                <button
                  type="button"
                  id="archive-quick-yesterday-btn"
                  onClick={() => handleDownloadDaySheetExcel(getYesterdayIso(), selectedBranchId)}
                  title={`Download Yesterday's Day Sheet (${getYesterdayIso()}) as Excel`}
                  style={{
                    background: '#f0fdf4',
                    color: '#065f46',
                    border: '1.5px solid #a7f3d0',
                    padding: '8px 14px',
                    borderRadius: '7px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Calendar size={15} color="#059669" />
                  <span>Yesterday ({getYesterdayIso()})</span>
                </button>

                {/* 2. Today Date Button */}
                <button
                  type="button"
                  id="archive-quick-today-btn"
                  onClick={() => handleDownloadDaySheetExcel(getTodayIso(), selectedBranchId)}
                  title={`Download Today's Day Sheet (${getTodayIso()}) as Excel`}
                  style={{
                    background: '#f8fafc',
                    color: '#1e293b',
                    border: '1.5px solid #cbd5e1',
                    padding: '8px 14px',
                    borderRadius: '7px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Calendar size={15} color="#64748b" />
                  <span>Today ({getTodayIso()})</span>
                </button>

                {/* 3. Calendar Date Picker with Download */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #059669',
                  borderRadius: '7px',
                  padding: '3px 6px'
                }}>
                  <input
                    id="dedicated-archive-calendar-date"
                    type="date"
                    value={downloadCalendarDate}
                    onChange={e => setDownloadCalendarDate(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      backgroundColor: 'transparent'
                    }}
                  />
                  <button
                    type="button"
                    id="dedicated-download-daysheet-btn"
                    onClick={() => handleDownloadDaySheetExcel(downloadCalendarDate, selectedBranchId)}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: '5px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
                    }}
                  >
                    <Download size={14} />
                    <span>Download Excel</span>
                  </button>
                </div>

                {/* Admin Add / Store Day Sheet to Permanent Archive */}
                {isAdminAuthenticated && (
                  <button
                    type="button"
                    id="dedicated-archive-create-btn"
                    onClick={() => handleCreateManualBackup(downloadCalendarDate, selectedBranchId)}
                    disabled={createExcelBackupLoading}
                    title="Generate and permanently save Day Sheet Excel file to system"
                    style={{
                      background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: '7px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(29, 78, 216, 0.3)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <PlusCircle size={14} />
                    <span>{createExcelBackupLoading ? 'Archiving...' : '+ Archive & Store to System'}</span>
                  </button>
                )}

                {/* Refresh list */}
                <button
                  type="button"
                  onClick={() => { fetchBackups(); fetchBackupAvailableDates(); }}
                  disabled={excelBackupsLoading}
                  className="premium-btn-secondary"
                  title="Refresh archive file list"
                  style={{ padding: '8px 11px', borderRadius: '7px', fontSize: '0.8rem' }}
                >
                  <RefreshCw size={14} className={excelBackupsLoading ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* SECTION 2: Permanent Excel Archives Repository */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px 28px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Permanent Excel Archives Repository
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Browse and 1-click download archived Day Sheet Excel workbooks stored permanently in <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>data/daysheets_backup/</code>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    id="archive-search-input"
                    type="text"
                    value={excelSearch}
                    onChange={e => setExcelSearch(e.target.value)}
                    placeholder="Search by date, branch, or filename..."
                    style={{
                      padding: '9px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.84rem',
                      outline: 'none',
                      minWidth: '280px'
                    }}
                  />
                  {excelSearch && (
                    <button
                      onClick={() => setExcelSearch('')}
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#64748b'
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Branch Filter Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  { key: 'ALL', label: 'All Records', count: excelBackupsList.length },
                  ...branches.map(b => ({
                    key: b.code,
                    label: `${b.name} (${b.code})`,
                    count: excelBackupsList.filter(eb => eb.branchCode === b.code).length
                  }))
                ].map(tab => {
                  const isSelected = archiveBranchFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setArchiveBranchFilter(tab.key)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: isSelected ? 'none' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#059669' : '#f8fafc',
                        color: isSelected ? '#ffffff' : '#475569',
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 8px rgba(5, 150, 105, 0.3)' : 'none'
                      }}
                    >
                      <span>{tab.label}</span>
                      <span style={{
                        backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#e2e8f0',
                        color: isSelected ? '#ffffff' : '#334155',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.72rem',
                        fontWeight: 800
                      }}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Table of Archived Excel Files */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800 }}>Sheet Date</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800 }}>Branch</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800 }}>Excel Workbook File</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>Specification</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }}>Size</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800 }}>Archived At</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = excelBackupsList.filter(b => {
                        if (archiveBranchFilter !== 'ALL' && b.branchCode !== archiveBranchFilter) {
                          return false;
                        }
                        if (!excelSearch) return true;
                        const s = excelSearch.toLowerCase();
                        return (b.fileName || '').toLowerCase().includes(s) ||
                               (b.date || '').toLowerCase().includes(s) ||
                               (b.branchName || '').toLowerCase().includes(s) ||
                               (b.branchCode || '').toLowerCase().includes(s);
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <FileCheck size={36} color="#cbd5e1" />
                                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#475569' }}>
                                  No Archived Excel Day Sheets Found
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '420px' }}>
                                  {excelSearch
                                    ? `No files matching "${excelSearch}". Try clearing your search.`
                                    : 'Use the date picker in section 1 above and click "Save to Permanent Archive" to create individual Excel backups.'}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((b, i) => {
                        const branchBadgeColor = 
                          b.branchCode === 'BLY' ? '#e11d48' : 
                          b.branchCode === 'HSP' ? '#2563eb' : '#d97706';
                        const branchBadgeBg = 
                          b.branchCode === 'BLY' ? '#fff1f2' : 
                          b.branchCode === 'HSP' ? '#eff6ff' : '#fffbeb';

                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={15} color="#059669" />
                                <span>{b.date || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                backgroundColor: branchBadgeBg,
                                color: branchBadgeColor,
                                border: `1px solid ${branchBadgeColor}40`,
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '0.78rem'
                              }}>
                                {b.branchCode} — {(b.branchName || b.branchCode || 'Branch').replace(' Branch', '').replace(' (Main Branch)', '')}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#065f46', fontWeight: 700 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <FileCheck size={16} color="#059669" />
                                <span>{b.fileName}</span>
                                {b.versionLabel && b.versionLabel !== 'Latest' ? (
                                  <span style={{
                                    backgroundColor: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe',
                                    padding: '1px 7px',
                                    borderRadius: '8px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    fontFamily: 'sans-serif'
                                  }}>
                                    ⏱ {b.versionLabel}
                                  </span>
                                ) : (
                                  <span style={{
                                    backgroundColor: '#ecfdf5',
                                    color: '#047857',
                                    border: '1px solid #a7f3d0',
                                    padding: '1px 7px',
                                    borderRadius: '8px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    fontFamily: 'sans-serif'
                                  }}>
                                    ★ Latest Master
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span style={{
                                backgroundColor: '#f0fdf4',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '0.72rem',
                                fontWeight: 800
                              }}>
                                WORKSHOP (.xlsx)
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              {b.sizeKB || 0} KB
                            </td>
                            <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.78rem' }}>
                              {b.modifiedAt ? new Date(b.modifiedAt).toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                <a
                                  href={b.downloadUrl}
                                  download={b.fileName}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    try {
                                      showNotification(`Downloading ${b.fileName}...`, 'info');
                                      const res = await fetch(b.downloadUrl);
                                      if (!res.ok) throw new Error(`Status ${res.status}`);
                                      const blob = await res.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const link = document.createElement('a');
                                      link.href = url;
                                      link.download = b.fileName;
                                      document.body.appendChild(link);
                                      link.click();
                                      window.URL.revokeObjectURL(url);
                                      document.body.removeChild(link);
                                      showNotification(`Downloaded ${b.fileName}`, 'success');
                                    } catch (err: any) {
                                      showNotification(`Download error: ${err.message}`, 'error');
                                    }
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: '#059669',
                                    color: '#ffffff',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <Download size={13} /> Download .xlsx
                                </a>
                                <button
                                  type="button"
                                  id={`archive-delete-btn-${b.fileName}`}
                                  title={`Delete permanently from system (Admin): ${b.fileName}`}
                                  onClick={() => {
                                    setDeleteArchiveFile(b.fileName);
                                    setAdminLoginError('');
                                    setAdminLoginPassword('');
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '6px 9px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fee2e2',
                                    color: '#b91c1c',
                                    border: '1.5px solid #fca5a5',
                                    cursor: 'pointer',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    boxShadow: '0 1px 3px rgba(185, 28, 28, 0.15)',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <Trash2 size={13} color="#dc2626" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Architecture & Guarantee Card */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '18px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  🔒 Non-Destructive Local Storage
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                  Day Sheet Excel workbooks are stored directly in <code style={{ color: '#0f172a' }}>data/daysheets_backup/</code>. They are permanent, protected, and will never be overwritten or deleted by synchronization.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  ⚡ Exact WORKSHOP Formulas Preserved
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                  Every exported file includes active Excel formulas for Cash SUM, Cheque SUM, Denomination Counts (<code style={{ color: '#0f172a' }}>=C*E</code>), and Closing Balance reconciliation.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  📅 Historical Retrievability
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                  Client and auditors can pull yesterday's or any past day's Day Sheet on-demand via the calendar picker without affecting current live data.
                </div>
              </div>
            </div>
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

      {/* RESET SYSTEM TO SCRATCH MODAL */}
      {showResetSystemModal && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10002,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '14px', padding: '30px',
            width: '500px', maxWidth: '95vw',
            boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            border: '3px solid #dc2626',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{ backgroundColor: '#fee2e2', borderRadius: '50%', width: '54px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <RotateCcw size={28} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991b1b', margin: 0 }}>
                  Reset System to Scratch
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px' }}>
                  Complete factory reset of all data, paths, and settings
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px', marginBottom: '18px', fontSize: '0.83rem', color: '#991b1b', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>🚨 What will be cleared:</div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>All <strong>Receipts</strong> (Service and Sales)</li>
                <li>All <strong>Day Sheets, Denominations & Deposits</strong></li>
                <li>All <strong>Sync History & Audit Logs</strong></li>
                <li>Connected <strong>Excel Backup File Paths</strong> completely removed (vanished)</li>
              </ul>
            </div>

            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '22px', fontSize: '0.8rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0 }} />
              <span>A safety snapshot backup will be created automatically in <code>data/backups/</code> before clearing.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowResetSystemModal(false)}
                disabled={resetSystemLoading}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                id="confirm-reset-system-btn"
                onClick={handleResetSystem}
                disabled={resetSystemLoading}
                style={{
                  padding: '10px 22px', borderRadius: '8px', border: 'none',
                  background: resetSystemLoading ? '#e2e8f0' : '#dc2626',
                  color: resetSystemLoading ? '#94a3b8' : '#fff',
                  fontWeight: 800, fontSize: '0.88rem',
                  cursor: resetSystemLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '7px',
                }}
              >
                <RotateCcw size={16} className={resetSystemLoading ? 'spin' : ''} />
                {resetSystemLoading ? 'Resetting Everything...' : 'Yes, Reset to Scratch'}
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
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Amount (₹):</label>
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={editModalReceipt.received_towards_purpose || ''}
                  onChange={(e) => setEditModalReceipt({
                    ...editModalReceipt,
                    received_towards_purpose: e.target.value,
                    received_towards: composeTowards(e.target.value, editModalReceipt.received_towards_reference)
                  })}
                  style={{ flex: '0 0 45%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600, backgroundColor: '#fff' }}
                >
                  <option value="">-- Select Purpose --</option>
                  {purposeOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Reference / Bill / Job No."
                  value={editModalReceipt.received_towards_reference || ''}
                  onChange={(e) => {
                    const ref = e.target.value.toUpperCase();
                    setEditModalReceipt({
                      ...editModalReceipt,
                      received_towards_reference: ref,
                      received_towards: composeTowards(editModalReceipt.received_towards_purpose, ref)
                    });
                  }}
                  style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                Prints as: <strong>{composeTowards(editModalReceipt.received_towards_purpose, editModalReceipt.received_towards_reference) || '—'}</strong>
              </div>
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


      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* NEW RECEIPT — PIXEL PERFECT REPLICA OF CLIENT IMAGE */}
      {/* ========================================================================= */}
      {/* PRINT RECEIPT MODAL — 3 RECEIPTS PER A4 SHEET (EXACT 1:1 REPLICA)          */}
      {/* ========================================================================= */}
      {printReceipt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          padding: '24px 16px', overflowY: 'auto'
        }}>
          <div style={{ width: '100%', maxWidth: '1020px' }}>

            {/* Action bar (no-print) */}
            <div className="no-print" style={{
              display: 'flex', justifyContent: 'space-between',
              marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
            }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ffffff' }}>
                  Print Receipt Preview (3 Copies per A4 Sheet)
                </span>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                  A4 print will include Original (Customer), Duplicate (Accounts), and Triplicate (Office/Gate).
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: '8px 20px', background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                    color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 800,
                    fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.35)'
                  }}
                >
                  <Printer size={15} /> Print (3 on A4)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintReceipt(null)}
                  style={{
                    padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '7px',
                    fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', color: '#cbd5e1'
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Screen Preview (single preview on screen, no-print) */}
            <div className="no-print">
              {renderSingleReceiptCard({
                receiptNo: printReceipt.receipt_no,
                branchName: 'BALLARI',
                date: printReceipt.receipt_date,
                customerName: printReceipt.customer_name,
                vehicleNo: printReceipt.vehicle_no,
                receivedTowards: printReceipt.received_towards || composeTowards(printReceipt.received_towards_purpose, printReceipt.received_towards_reference),
                paymentMode: printReceipt.payment_mode,
                utrRef: printReceipt.utr_reference,
                amount: printReceipt.amount,
                copyLabel: 'Screen Preview'
              }, false)}
            </div>

            {/* Print Container: EXACT 3 COPIES ON A4 SHEET */}
            {renderThreeReceiptsPrintSheet('receipt-print-sheet-modal', {
              receiptNo: printReceipt.receipt_no,
              branchName: 'BALLARI',
              date: printReceipt.receipt_date,
              dated: printReceipt.dated_on ?? undefined,
              drawnOn: printReceipt.drawn_on ?? undefined,
              customerName: printReceipt.customer_name,
              vehicleNo: printReceipt.vehicle_no,
              receivedTowards: printReceipt.received_towards || composeTowards(printReceipt.received_towards_purpose, printReceipt.received_towards_reference),
              paymentMode: printReceipt.payment_mode,
              utrRef: printReceipt.utr_reference,
              amount: printReceipt.amount
            })}

          </div>
        </div>
      )}
      {/* QUICK ADD RECEIPT MODAL FOR DAY SHEET */}
      {showAddReceiptModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', backgroundColor: '#0f172a', color: '#ffffff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                Add Workshop Receipt ({newReceiptMode})
              </div>
              <button
                type="button"
                onClick={() => setShowAddReceiptModal(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddQuickReceipt} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Payment Mode
                  </label>
                  <select
                    value={newReceiptMode}
                    onChange={(e: any) => setNewReceiptMode(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                  >
                    <option value="Cash">Cash (Increases Physical Cash)</option>
                    <option value="Cheque/NEFT">Cheque/NEFT / PhonePe / Digital</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Receipt No. *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WSBLY-8200"
                    value={newReceiptNo}
                    onChange={(e) => setNewReceiptNo(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Customer Name & Vehicle details"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 500 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.01"
                    placeholder="0.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Vehicle No (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KA34D4632"
                    value={newVehicleNo}
                    onChange={(e) => setNewVehicleNo(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Received Towards
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={newTowardsPurpose}
                    onChange={(e) => setNewTowardsPurpose(e.target.value)}
                    style={{ flex: '0 0 45%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600, backgroundColor: '#fff' }}
                  >
                    <option value="">-- Select Purpose --</option>
                    {purposeOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Reference / Bill / Job No."
                    value={newTowardsRef}
                    onChange={(e) => setNewTowardsRef(e.target.value.toUpperCase())}
                    disabled={!newTowardsPurpose}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                  Prints as: <strong>{composeTowards(newTowardsPurpose, newTowardsRef) || '—'}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddReceiptModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addReceiptLoading}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {addReceiptLoading ? 'Saving...' : 'Record Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD RECEIVED TOWARDS PURPOSE MODAL (ADMIN)                                 */}
      {/* ========================================================================= */}
      {showPurposeModal && (
        <div className="no-print" style={{
          position: 'fixed', inset: 0, zIndex: 100001,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlusCircle size={18} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Add Received Towards Purpose</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowPurposeModal(false); setNewPurposeName(''); }}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddPurpose} style={{ padding: '20px' }}>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                The new purpose appears in the dropdown immediately and prints as
                <strong> PURPOSE : REFERENCE</strong>.
              </p>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Purpose Name *
              </label>
              <input
                type="text"
                autoFocus
                required
                maxLength={80}
                placeholder="e.g. KSA"
                value={newPurposeName}
                onChange={(e) => setNewPurposeName(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '9px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, textTransform: 'uppercase' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => { setShowPurposeModal(false); setNewPurposeName(''); }}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={purposeSaving}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {purposeSaving ? 'Adding...' : 'Add Purpose'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADMIN LOGIN MODAL                                                         */}
      {/* ========================================================================= */}
      {showAdminLoginModal && (
        <div className="no-print" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ backgroundColor: '#2563eb', padding: '7px', borderRadius: '8px', color: '#fff', display: 'flex' }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                    Admin Authentication
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>
                    Restricted Area • Bellary Motors Management
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdminLoginModal(false);
                  setAdminLoginError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAdminLoginSubmit} style={{ padding: '22px' }}>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Please enter your Admin Name and Password to unlock the Admin Panel and Day Sheet Archive management.
              </p>

              {adminLoginError && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} />
                  <span>{adminLoginError}</span>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Admin Name *
                </label>
                <input
                  id="admin-login-name-input"
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. admin"
                  value={adminLoginName}
                  onChange={e => setAdminLoginName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Admin Password *
                </label>
                <input
                  id="admin-login-password-input"
                  type="password"
                  required
                  placeholder="Enter admin password"
                  value={adminLoginPassword}
                  onChange={e => setAdminLoginPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '5px' }}>
                  Default admin credentials: <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>admin</code> / <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>admin123</code>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminLoginModal(false);
                    setAdminLoginError('');
                  }}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="admin-login-submit-btn"
                  disabled={adminLoginLoading}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)'
                  }}
                >
                  <Unlock size={15} />
                  <span>{adminLoginLoading ? 'Verifying...' : 'Unlock Admin Panel'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE ARCHIVE CONFIRMATION MODAL                                         */}
      {/* ========================================================================= */}
      {deleteArchiveFile && (
        <div className="no-print" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid #fecaca'
          }}>
            {/* Modal Header */}
            <div style={{
              backgroundColor: '#b91c1c',
              color: '#ffffff',
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ backgroundColor: '#ffffff', padding: '6px', borderRadius: '8px', color: '#b91c1c', display: 'flex' }}>
                  <Trash2 size={20} color="#b91c1c" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                    Delete Day Sheet Archive
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#fecaca', marginTop: '1px' }}>
                    Admin Permission Only • Irreversible
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteArchiveFile(null);
                  setAdminLoginError('');
                  setAdminLoginPassword('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fecaca',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleDeleteArchiveConfirm} style={{ padding: '22px' }}>
              <div style={{ fontSize: '0.86rem', color: '#0f172a', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                {isAdminAuthenticated ? (
                  <span>Are you sure you want to permanently delete this archived Day Sheet Excel workbook?</span>
                ) : (
                  <span><strong>Admin Authorization Required:</strong> Only an administrator can delete archived Day Sheets from the system. Please enter Admin credentials to authorize deletion:</span>
                )}
              </div>

              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '12px 14px',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                color: '#991b1b',
                fontWeight: 700,
                wordBreak: 'break-all',
                marginBottom: '16px'
              }}>
                📄 {deleteArchiveFile}
              </div>

              {/* If already authenticated, show logged-in admin badge */}
              {isAdminAuthenticated ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '16px',
                  fontSize: '0.8rem',
                  color: '#065f46',
                  fontWeight: 700
                }}>
                  <ShieldCheck size={16} color="#059669" />
                  <span>Authenticated as Admin: <strong>{adminName}</strong></span>
                </div>
              ) : (
                /* Admin Login Inputs if not yet authenticated */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                      Admin Name:
                    </label>
                    <input
                      type="text"
                      id="admin-delete-auth-name"
                      value={adminLoginName}
                      onChange={(e) => setAdminLoginName(e.target.value)}
                      placeholder="admin"
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                      Admin Password:
                    </label>
                    <input
                      type="password"
                      id="admin-delete-auth-password"
                      value={adminLoginPassword}
                      onChange={(e) => setAdminLoginPassword(e.target.value)}
                      placeholder="Enter Admin password..."
                      required
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  {adminLoginError && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      color: '#b91c1c',
                      fontWeight: 700
                    }}>
                      ⚠️ {adminLoginError}
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5, marginBottom: '20px' }}>
                ⚠️ This file will be permanently removed from <code style={{ backgroundColor: '#f1f5f9', padding: '2px 5px', borderRadius: '4px' }}>data/daysheets_backup/</code>. This action is recorded in the Audit Trail.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteArchiveFile(null);
                    setAdminLoginError('');
                    setAdminLoginPassword('');
                  }}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-delete-archive-btn"
                  disabled={deleteArchiveLoading}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)'
                  }}
                >
                  <Trash2 size={15} />
                  <span>{deleteArchiveLoading ? 'Verifying & Deleting...' : (isAdminAuthenticated ? 'Delete Permanently' : 'Authorize & Delete')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RIGHT-SIDE SETTINGS & ADMIN SIDEBAR DRAWER                                */}
      {/* ========================================================================= */}
      {showSettingsSidebar && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
          {/* Backdrop overlay */}
          <div
            id="settings-sidebar-backdrop"
            onClick={() => setShowSettingsSidebar(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(2px)',
              transition: 'opacity 0.2s ease'
            }}
          />

          {/* Clean Simple Sidebar Menu */}
          <aside
            id="settings-sidebar-panel"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '290px',
              maxWidth: '85vw',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              borderLeft: '1px solid #cbd5e1',
              animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              zIndex: 1
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#0f172a',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.95rem' }}>
                <Settings size={16} color="#38bdf8" />
                <span>Settings</span>
              </div>
              <button
                id="settings-sidebar-close-btn"
                type="button"
                onClick={() => setShowSettingsSidebar(false)}
                title="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Simple Menu Buttons */}
            <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              
              {/* 1. Screen View Scale Buttons (85, 90, 100) */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Screen View
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: '85', label: '85%' },
                    { id: '90', label: '90% Fit' },
                    { id: '100', label: '100%' }
                  ].map(s => {
                    const isSelected = desktopScale === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        id={`settings-scale-btn-${s.id}`}
                        onClick={() => handleScaleChange(s.id)}
                        style={{
                          padding: '8px 0',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid #059669' : '1px solid #cbd5e1',
                          backgroundColor: isSelected ? '#ecfdf5' : '#f8fafc',
                          color: isSelected ? '#065f46' : '#334155',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day Sheet Excel Archive */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Archive Repository
                </div>
                <button
                  type="button"
                  id="settings-open-archive-page-btn"
                  onClick={() => {
                    setActiveTab('archive');
                    setShowSettingsSidebar(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '7px',
                    border: '1px solid #a7f3d0',
                    backgroundColor: '#f0fdf4',
                    color: '#065f46',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileCheck size={16} color="#059669" />
                  <span>📂 Day Sheet Excel Archive</span>
                </button>
              </div>

              {/* Reset / Clear Test Data (For Client Testing From Scratch) */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Testing & Demo Reset
                </div>
                <button
                  type="button"
                  id="settings-reset-all-test-data-btn"
                  onClick={() => {
                    if (window.confirm('Clear all test data? All receipts and day sheets in browser storage will be reset to 0 so you can test fresh from scratch.')) {
                      if (typeof (window as any).clearAllClientTestData === 'function') {
                        (window as any).clearAllClientTestData();
                      } else {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '7px',
                    border: '1px solid #fecdd3',
                    backgroundColor: '#fff1f2',
                    color: '#be123c',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffe4e6';
                    e.currentTarget.style.borderColor = '#fda4af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff1f2';
                    e.currentTarget.style.borderColor = '#fecdd3';
                  }}
                >
                  <Trash2 size={16} color="#e11d48" />
                  <span>Clear Test Data (Start from Scratch)</span>
                </button>
              </div>

              {/* Auto-Sync Settings */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Automation Engine
                </div>
                <button
                  type="button"
                  id="settings-open-sync-page-btn"
                  onClick={() => {
                    setActiveTab('tally');
                    setShowSettingsSidebar(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Shield size={16} color="#2563eb" />
                  <span>Tally Export</span>
                </button>
              </div>

              {/* Admin Access Controls */}
              {isAdminAuthenticated ? (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Admin Active ({adminName})
                  </div>
                  <button
                    type="button"
                    id="settings-logout-admin-btn"
                    onClick={() => {
                      setShowSettingsSidebar(false);
                      handleAdminLogout();
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '7px',
                      border: '1px solid #f87171',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Lock size={16} color="#dc2626" />
                    <span>🚪 Logout Admin</span>
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Admin Controls
                  </div>
                  <button
                    type="button"
                    id="settings-open-admin-panel-btn"
                    onClick={() => {
                      setShowSettingsSidebar(false);
                      setAdminPendingTab('archive');
                      setShowAdminLoginModal(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '7px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Lock size={16} color="#f87171" />
                    <span>Admin Login</span>
                  </button>
                </div>
              )}

              {/* 4. Reset Entire System */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', marginBottom: '8px' }}>
                  System Reset
                </div>
                <button
                  type="button"
                  id="settings-reset-system-btn"
                  onClick={() => {
                    setShowSettingsSidebar(false);
                    setShowResetSystemModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '7px',
                    border: '1px solid #fecaca',
                    backgroundColor: '#fef2f2',
                    color: '#b91c1c',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <RotateCcw size={16} color="#dc2626" />
                  <span>Reset All</span>
                </button>
              </div>

            </div>

            {/* Close footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setShowSettingsSidebar(false)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>

          </aside>
        </div>
      )}

      {/* FOOTER */}
      <footer className="no-print" style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
        color: '#94a3b8',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        marginTop: 'auto',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: '#f1f5f9' }}>Bellary Motors Sales Pvt. Ltd.</span>
          <span style={{ color: '#475569' }}>|</span>
          <span>Automotive Accounting & Day Sheet Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
            <span className="live-dot" style={{ backgroundColor: '#10b981', width: '6px', height: '6px' }} />
            SQLite Persistent Engine Active
          </span>
          <span style={{ color: '#475569' }}>•</span>
          <span>Port: 5000 / 5173 LAN</span>
        </div>
      </footer>

    </div>

      {/* ── Export Excel Double-Confirmation Modal ── */}
      {showExportModal && (
        <div
          onClick={() => { setShowExportModal(false); setExportModalStep(1); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '10px',
              padding: '24px',
              width: '360px',
              maxWidth: '92vw',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
              fontFamily: 'inherit'
            }}
          >
            {exportModalStep === 1 ? (
              <>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111', marginBottom: '6px' }}>
                  Export Day Sheet Excel?
                </div>
                <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '14px', lineHeight: 1.6 }}>
                  <strong>{selectedDate}</strong> — {currentBranch?.name || ''} ({sheetType})
                </div>
                <div style={{
                  fontSize: '0.78rem', color: '#92400e',
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: '6px', padding: '8px 10px', marginBottom: '20px'
                }}>
                  ⚠️ Export only once at end of day to avoid duplicates.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowExportModal(false); setExportModalStep(1); }}
                    style={{
                      padding: '7px 16px', borderRadius: '6px', fontSize: '0.82rem',
                      fontWeight: 600, cursor: 'pointer',
                      border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setExportModalStep(2)}
                    style={{
                      padding: '7px 16px', borderRadius: '6px', fontSize: '0.82rem',
                      fontWeight: 600, cursor: 'pointer',
                      border: 'none', background: '#d97706', color: '#fff'
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111', marginBottom: '6px' }}>
                  Confirm Download
                </div>
                <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '14px', lineHeight: 1.6 }}>
                  This will download the Excel file for <strong>{selectedDate}</strong> — {currentBranch?.name || ''}. Are you sure?
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setExportModalStep(1)}
                    style={{
                      padding: '7px 16px', borderRadius: '6px', fontSize: '0.82rem',
                      fontWeight: 600, cursor: 'pointer',
                      border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151'
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleExportConfirmed}
                    style={{
                      padding: '7px 16px', borderRadius: '6px', fontSize: '0.82rem',
                      fontWeight: 600, cursor: 'pointer',
                      border: 'none', background: '#059669', color: '#fff',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <Download size={13} /> Download
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

    </>
  );
}