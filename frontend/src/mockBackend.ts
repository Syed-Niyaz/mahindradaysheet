// frontend/src/mockBackend.ts
// Offline / Netlify Browser-Storage Mock API
// Automatically intercepts /api/* calls when running on Netlify (or when backend is offline)
// Stores data safely in browser localStorage for live demos and testing.

export interface StoredReceipt {
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
  status: string;
  cancel_reason?: string;
  created_at: string;
  updated_at?: string;
}

const STORAGE_KEYS = {
  RECEIPTS: 'bm_demo_receipts',
  PURPOSES: 'bm_demo_purposes',
  BRANCHES: 'bm_demo_branches',
  DAY_SHEETS: 'bm_demo_daysheets',
  AUDIT_LOGS: 'bm_demo_audit',
  INITIALIZED: 'bm_demo_initialized_v1'
};

const DEFAULT_BRANCHES = [
  {
    id: 1,
    code: 'BLY',
    name: 'BALLARI',
    receipt_prefix: 'WSBLY-',
    gstin: '29AACCB6242J1ZK',
    address: 'Bellary Motors Sales Pvt. Ltd., H.O: BALLARI',
    is_head_office: 1
  }
];

const DEFAULT_PURPOSES = [
  { id: 1, name: 'CREDIT BILL' },
  { id: 2, name: 'RSA' },
  { id: 3, name: 'EXTENDED WARRANTY & SHIELD' },
  { id: 4, name: 'SERVICE ADVANCE' },
  { id: 5, name: 'BODY SHOP ADVANCE' },
  { id: 6, name: 'PART ADVANCE' },
  { id: 7, name: 'ADVANCE RECOVERY' },
  { id: 8, name: 'INSURANCE RENEWAL' }
];

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CACHE_VERSION = 'bm_clean_slate_2026_11_03_v5';

export function clearAllClientTestData() {
  if (typeof window === 'undefined') return;
  // Clear all mock receipts, day sheets, and demo caches
  localStorage.removeItem(STORAGE_KEYS.RECEIPTS);
  localStorage.removeItem(STORAGE_KEYS.DAY_SHEETS);
  localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  localStorage.removeItem('bm_demo_receipts');
  localStorage.removeItem('bm_demo_daysheets');
  localStorage.removeItem('bm_demo_initialized_v1');
  localStorage.removeItem('bellary_dismissed_recorded_dates');

  // Purge any day sheet keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('bm_ds_') || k.startsWith('bm_demo_'))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  // Initialize clean blank slate
  localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify([]));
  localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(DEFAULT_BRANCHES));
  localStorage.setItem(STORAGE_KEYS.PURPOSES, JSON.stringify(DEFAULT_PURPOSES));
  localStorage.setItem('bm_cache_version', CACHE_VERSION);
  window.location.reload();
}

if (typeof window !== 'undefined') {
  (window as any).clearAllClientTestData = clearAllClientTestData;
}

function seedDemoDataIfEmpty() {
  if (typeof window === 'undefined') return;

  const currentVersion = localStorage.getItem('bm_cache_version');
  // If user opens a new deployment, auto-purge all old sample data once
  if (currentVersion !== CACHE_VERSION) {
    localStorage.removeItem(STORAGE_KEYS.RECEIPTS);
    localStorage.removeItem(STORAGE_KEYS.DAY_SHEETS);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
    localStorage.removeItem('bm_demo_receipts');
    localStorage.removeItem('bm_demo_daysheets');
    localStorage.removeItem('bm_demo_initialized_v1');
    localStorage.removeItem('bellary_dismissed_recorded_dates');

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('bm_ds_') || k.startsWith('bm_demo_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Store version marker
    localStorage.setItem('bm_cache_version', CACHE_VERSION);
    // 100% EMPTY receipts so client tests from scratch
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify([]));
  }

  // Ensure branches and purposes exist
  if (!localStorage.getItem(STORAGE_KEYS.BRANCHES)) {
    localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(DEFAULT_BRANCHES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.PURPOSES)) {
    localStorage.setItem(STORAGE_KEYS.PURPOSES, JSON.stringify(DEFAULT_PURPOSES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.RECEIPTS)) {
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify([]));
  }
}

function getStoredReceipts(): StoredReceipt[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIPTS) || '[]');
  } catch {
    return [];
  }
}

function saveStoredReceipts(receipts: StoredReceipt[]) {
  localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(receipts));
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function isNetlifyOrStaticDemo(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('netlify.app') || 
         host.includes('github.io') || 
         host.includes('vercel.app') ||
         window.location.search.includes('demo=true');
}

export function initBrowserStorageMock() {
  if (typeof window === 'undefined') return;

  seedDemoDataIfEmpty();

  const originalFetch = window.fetch;
  const isDemo = isNetlifyOrStaticDemo();

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept /api/ calls
    if (!urlStr.includes('/api/')) {
      return originalFetch.apply(this, [input as any, init]);
    }

    // If on localhost and not forced demo, try real backend first
    if (!isDemo && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      try {
        const res = await originalFetch.apply(this, [input as any, init]);
        const contentType = res.headers.get('content-type') || '';
        // If real backend responds with JSON, return it
        if (!contentType.includes('text/html')) {
          return res;
        }
      } catch (err) {
        // Backend offline, fallback to mock below
      }
    }

    // Normalize path
    const parsed = new URL(urlStr, window.location.origin);
    const pathname = parsed.pathname;
    const method = (init?.method || 'GET').toUpperCase();

    // 1. GET /api/branches
    if (pathname === '/api/branches') {
      const branches = JSON.parse(localStorage.getItem(STORAGE_KEYS.BRANCHES) || JSON.stringify(DEFAULT_BRANCHES));
      return jsonResponse({ success: true, data: branches });
    }

    // 2. GET /api/purposes
    if (pathname === '/api/purposes' && method === 'GET') {
      const purposes = JSON.parse(localStorage.getItem(STORAGE_KEYS.PURPOSES) || JSON.stringify(DEFAULT_PURPOSES));
      return jsonResponse({ success: true, data: purposes });
    }

    // 3. POST /api/purposes
    if (pathname === '/api/purposes' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      const purposes = JSON.parse(localStorage.getItem(STORAGE_KEYS.PURPOSES) || JSON.stringify(DEFAULT_PURPOSES));
      const newPurpose = { id: Date.now(), name: (body.name || '').toUpperCase().trim() };
      purposes.push(newPurpose);
      localStorage.setItem(STORAGE_KEYS.PURPOSES, JSON.stringify(purposes));
      return jsonResponse({ success: true, purpose: newPurpose });
    }

    // 4. GET /api/receipts/next-receipt-no
    if (pathname === '/api/receipts/next-receipt-no') {
      const receipts = getStoredReceipts();
      const numbers = receipts
        .map(r => parseInt(r.receipt_no.replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
      const maxNo = numbers.length > 0 ? Math.max(...numbers) : 55500;
      return jsonResponse({ success: true, nextReceiptNo: String(maxNo + 1) });
    }

    // 5. POST /api/receipts
    if (pathname === '/api/receipts' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      const receipts = getStoredReceipts();
      const newReceipt: StoredReceipt = {
        id: Date.now(),
        branch_id: Number(body.branch_id) || 1,
        receipt_no: String(body.receipt_no || (55540 + receipts.length + 1)),
        receipt_date: body.receipt_date || getTodayIso(),
        receipt_type: body.receipt_type || 'SERVICE',
        customer_name: body.customer_name || 'Customer',
        vehicle_no: body.vehicle_no || '',
        amount: Number(body.amount) || 0,
        payment_mode: body.payment_mode || 'Cash',
        received_towards: body.received_towards || '',
        received_towards_purpose: body.received_towards_purpose || '',
        received_towards_reference: body.received_towards_reference || '',
        utr_reference: body.utr_reference || '',
        dated_on: body.dated_on || '',
        drawn_on: body.drawn_on || '',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };
      receipts.unshift(newReceipt);
      saveStoredReceipts(receipts);
      return jsonResponse({ success: true, id: newReceipt.id, receipt: newReceipt });
    }

    // 6. GET /api/receipts
    if (pathname === '/api/receipts' && method === 'GET') {
      let receipts = getStoredReceipts();
      const search = parsed.searchParams.get('search')?.toLowerCase() || '';
      const filter = parsed.searchParams.get('filter') || 'ALL';
      const branchId = parsed.searchParams.get('branch_id');
      const date = parsed.searchParams.get('date');
      const type = parsed.searchParams.get('type');

      if (branchId) receipts = receipts.filter(r => r.branch_id === Number(branchId));
      if (type) receipts = receipts.filter(r => r.receipt_type === type);
      if (date) receipts = receipts.filter(r => r.receipt_date === date);
      if (filter === 'ACTIVE') receipts = receipts.filter(r => r.status === 'ACTIVE');
      if (filter === 'CANCELLED') receipts = receipts.filter(r => r.status === 'CANCELLED');
      if (search) {
        receipts = receipts.filter(r =>
          r.receipt_no.toLowerCase().includes(search) ||
          r.customer_name.toLowerCase().includes(search) ||
          (r.vehicle_no && r.vehicle_no.toLowerCase().includes(search))
        );
      }
      return jsonResponse({ success: true, data: receipts, count: receipts.length });
    }

    // 7. POST /api/receipts/:id/cancel
    if (pathname.match(/^\/api\/receipts\/\d+\/cancel$/) && method === 'POST') {
      const idMatch = pathname.match(/\/api\/receipts\/(\d+)\/cancel/);
      const id = idMatch ? Number(idMatch[1]) : 0;
      const receipts = getStoredReceipts();
      const item = receipts.find(r => r.id === id);
      if (item) {
        item.status = 'CANCELLED';
        saveStoredReceipts(receipts);
      }
      return jsonResponse({ success: true });
    }

    // 8. PUT /api/receipts/:id
    if (pathname.match(/^\/api\/receipts\/\d+$/) && method === 'PUT') {
      const idMatch = pathname.match(/\/api\/receipts\/(\d+)$/);
      const id = idMatch ? Number(idMatch[1]) : 0;
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      const receipts = getStoredReceipts();
      const idx = receipts.findIndex(r => r.id === id);
      if (idx !== -1) {
        receipts[idx] = { ...receipts[idx], ...body, updated_at: new Date().toISOString() };
        saveStoredReceipts(receipts);
      }
      return jsonResponse({ success: true });
    }

    // 9. DELETE /api/receipts/:id
    if (pathname.match(/^\/api\/receipts\/\d+$/) && method === 'DELETE') {
      const idMatch = pathname.match(/\/api\/receipts\/(\d+)$/);
      const id = idMatch ? Number(idMatch[1]) : 0;
      let receipts = getStoredReceipts();
      receipts = receipts.filter(r => r.id !== id);
      saveStoredReceipts(receipts);
      return jsonResponse({ success: true });
    }

    // 10. GET /api/daysheet
    if (pathname === '/api/daysheet' && method === 'GET') {
      const branchId = Number(parsed.searchParams.get('branch_id')) || 1;
      const date = parsed.searchParams.get('date') || getTodayIso();
      const type = parsed.searchParams.get('type') || 'SERVICE';

      const receipts = getStoredReceipts().filter(r =>
        r.branch_id === branchId &&
        r.receipt_date === date &&
        r.receipt_type === type &&
        r.status === 'ACTIVE'
      );

      const cashReceipts = receipts.filter(r => r.payment_mode === 'Cash');
      const nonCashReceipts = receipts.filter(r => r.payment_mode !== 'Cash');
      const cashSales = cashReceipts.reduce((sum, r) => sum + r.amount, 0);

      // Load saved expenses/deposits from localStorage if any
      const dsKey = `bm_ds_${branchId}_${date}_${type}`;
      const savedDs = JSON.parse(localStorage.getItem(dsKey) || '{}');

      const defaultDenominations = [
        { note_label: '2000', note_value: 2000, note_count: 0, amount: 0 },
        { note_label: '500', note_value: 500, note_count: 0, amount: 0 },
        { note_label: '200', note_value: 200, note_count: 0, amount: 0 },
        { note_label: '100', note_value: 100, note_count: 0, amount: 0 },
        { note_label: '50', note_value: 50, note_count: 0, amount: 0 },
        { note_label: '20', note_value: 20, note_count: 0, amount: 0 },
        { note_label: '10', note_value: 10, note_count: 0, amount: 0 },
        { note_label: 'Coins', note_value: 1, note_count: 0, amount: 0 }
      ];

      return jsonResponse({
        success: true,
        daySheet: {
          id: savedDs.id || 1,
          branch_id: branchId,
          sheet_date: date,
          sheet_type: type,
          opening_balance: savedDs.opening_balance || 0,
          cash_sales: cashSales,
          less_vouchers: savedDs.less_vouchers || 0,
          status: savedDs.status || 'DRAFT',
          notes: savedDs.notes || ''
        },
        cashReceipts,
        nonCashReceipts,
        expenses: savedDs.expenses || [],
        deposits: savedDs.deposits || [],
        denominations: savedDs.denominations || defaultDenominations,
        allReceiptsCount: receipts.length
      });
    }

    // 11. POST /api/daysheet
    if (pathname === '/api/daysheet' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      const dsKey = `bm_ds_${body.branch_id || 1}_${body.sheet_date || getTodayIso()}_${body.sheet_type || 'SERVICE'}`;
      localStorage.setItem(dsKey, JSON.stringify(body));
      return jsonResponse({ success: true, message: 'Saved successfully in browser storage' });
    }

    // 12. GET /api/daysheet/dates
    if (pathname === '/api/daysheet/dates' || pathname === '/api/daysheet/available-dates') {
      const receipts = getStoredReceipts();
      const dates = Array.from(new Set(receipts.map(r => r.receipt_date))).sort().reverse();
      return jsonResponse({ success: true, dates });
    }

    // 13. GET /api/audit-logs
    if (pathname === '/api/audit-logs') {
      return jsonResponse({ success: true, data: [] });
    }

    // 14. GET /api/receipts/sync-status
    if (pathname === '/api/receipts/sync-status') {
      return jsonResponse({ success: true, connected: true, isDemo: true, message: 'Netlify Browser Storage Mode' });
    }

    // 15. Tally & Backup mock endpoints
    if (pathname === '/api/tally/preview-xml') {
      const date = parsed.searchParams.get('date') || getTodayIso();
      const receipts = getStoredReceipts().filter(r => r.receipt_date === date && r.status === 'ACTIVE');
      const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0);
      const columns = receipts.map((r) => {
        const customer = r.vehicle_no ? `${r.customer_name} ${r.vehicle_no}` : r.customer_name;
        const isCash = (r.payment_mode || '').toUpperCase() === 'CASH';
        const creditLedger = isCash ? 'Cash Ballari' : (r.payment_mode ? `${r.payment_mode} BM` : 'PhonePe BM');
        const displayDate = r.receipt_date.split('-').reverse().join('.');
        return {
          'Date': displayDate,
          'Voucher Type': isCash ? 'Cash' : 'Non Cash',
          'Voucher No.': r.receipt_no,
          'Debit': customer, // DEBIT IS ALWAYS CUSTOMER NAME
          'Credit': creditLedger, // CREDIT IS PAYMENT LEDGER
          'Amount': r.amount,
          'Narration': `Received From and Thanks to ${customer} Received Towards ${r.received_towards_purpose || r.received_towards || 'SERVICE'}${r.received_towards_reference ? `:${r.received_towards_reference}` : ''} Payment Mode :${r.payment_mode || 'Cash'} UTR/NEFT No. ${r.utr_reference || '-'} a Sum of Rupees ${r.amount} DATED ${displayDate}`
        };
      });
      return jsonResponse({ success: true, receiptCount: receipts.length, totalAmount, columns });
    }

    if (pathname === '/api/tally/export-xml') {
      const date = parsed.searchParams.get('date') || getTodayIso();
      const receipts = getStoredReceipts().filter(r => r.receipt_date === date && r.status === 'ACTIVE');
      const tallyDate = date.replace(/-/g, '');
      const escape = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const vouchersXml = receipts.map(r => {
        const customer = escape(r.vehicle_no ? `${r.customer_name} ${r.vehicle_no}` : r.customer_name);
        const isCash = (r.payment_mode || '').toUpperCase() === 'CASH';
        const voucherType = isCash ? 'Cash' : 'Non Cash';
        const creditLedger = escape(isCash ? 'Cash Ballari' : (r.payment_mode ? `${r.payment_mode} BM` : 'PhonePe BM'));
        const amt = (Number(r.amount) || 0).toFixed(2);
        const displayDate = r.receipt_date.split('-').reverse().join('.');
        const narration = escape(`Received From and Thanks to ${customer} Received Towards ${r.received_towards_purpose || r.received_towards || 'SERVICE'}${r.received_towards_reference ? `:${r.received_towards_reference}` : ''} Payment Mode :${r.payment_mode || 'Cash'} UTR/NEFT No. ${r.utr_reference || '-'} a Sum of Rupees ${amt} DATED ${displayDate}`);
        return `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${r.receipt_no}</VOUCHERNUMBER>
            <NARRATION>${narration}</NARRATION>
            <PARTYLEDGERNAME>${customer}</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${creditLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amt}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${customer}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amt}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
      }).join('\n');

      const xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Bellary Motors Sales Pvt Ltd</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="TALLY_${date}_BLY.xml"`
        }
      });
    }

    if (pathname === '/api/tally/exports' || pathname === '/api/tally/receipt-backup-list' || pathname === '/api/backup/excel-list') {
      return jsonResponse({ success: true, files: [] });
    }

    if (pathname === '/api/backup/available-dates') {
      const receipts = getStoredReceipts();
      const dates = Array.from(new Set(receipts.map(r => r.receipt_date))).sort().reverse();
      return jsonResponse({ success: true, dates: dates.length > 0 ? dates : [getTodayIso()] });
    }

    if (pathname === '/api/backup/admin-login') {
      return jsonResponse({ success: true, authenticated: true, user: { name: 'Admin' } });
    }

    if (pathname === '/api/health') {
      return jsonResponse({ status: 'ok', mode: 'browser_storage', time: new Date().toISOString() });
    }

    // Fallback default response
    return jsonResponse({ success: true, message: 'OK (Browser Storage Mode)' });
  };
}

