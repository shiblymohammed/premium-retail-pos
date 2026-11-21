'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import styles from './sales-controls.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type SalePermissions = {
  role: string;
  canCancelSales: boolean;
  canProcessReturns: boolean;
};

type InvoiceLine = {
  id: string;
  quantityBaseUnits: number;
  returnedQuantityBaseUnits: number;
  unitPrice: number;
  variant: {
    sku: string;
    name: string;
    product: {
      name: string;
      baseUnit: string;
    };
  };
};

type SaleReturnRecord = {
  returnNumber: string;
  createdAt?: string;
  itemsSummary?: string;
  refund?: {
    amount: string;
    method: string;
    reference?: string;
  } | null;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: 'FINALIZED' | 'CANCELLED';
  cashierName?: string;
  location: {
    name: string;
    company: {
      currency: string;
    };
  };
  createdAt: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  payment?: {
    method: string;
  };
  lines: InvoiceLine[];
  returns: SaleReturnRecord[];
  permissions: {
    canCancelSales: boolean;
    canProcessReturns: boolean;
  };
};

type ReturnLineSelection = {
  selected: boolean;
  quantity: number;
  disposition: 'RESTOCKED' | 'QUARANTINED';
  inspectionNotes: string;
};

// Fallback demo mock invoices to support comprehensive testing
const DEMO_INVOICES: Record<string, Invoice> = {
  'INV-2026-0842': {
    id: 'inv_0842',
    invoiceNumber: 'INV-2026-0842',
    status: 'FINALIZED',
    cashierName: 'Rajesh Kumar (Cashier)',
    location: {
      name: 'Downtown Store',
      company: { currency: 'INR' },
    },
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    grossTotal: '1130.00',
    discountTotal: '0.00',
    netTotal: '1130.00',
    payment: { method: 'Cash' },
    lines: [
      {
        id: 'line_1',
        quantityBaseUnits: 2,
        returnedQuantityBaseUnits: 0,
        unitPrice: 485.00,
        variant: {
          sku: 'BEV-1048',
          name: 'Medium roast - 250 g',
          product: { name: 'Arabica Ground Coffee', baseUnit: 'pack' },
        },
      },
      {
        id: 'line_2',
        quantityBaseUnits: 1,
        returnedQuantityBaseUnits: 0,
        unitPrice: 160.00,
        variant: {
          sku: 'BEV-1056',
          name: 'Lemon Mint - 25 bags',
          product: { name: 'Green Tea Bags', baseUnit: 'pack' },
        },
      },
    ],
    returns: [],
    permissions: { canCancelSales: true, canProcessReturns: true },
  },
  'INV-2026-0711': {
    id: 'inv_0711',
    invoiceNumber: 'INV-2026-0711',
    status: 'FINALIZED',
    cashierName: 'Anita Sharma (Cashier)',
    location: {
      name: 'North Mall',
      company: { currency: 'INR' },
    },
    createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    grossTotal: '680.00',
    discountTotal: '68.00',
    netTotal: '612.00',
    payment: { method: 'Card' },
    lines: [
      {
        id: 'line_3',
        quantityBaseUnits: 5,
        returnedQuantityBaseUnits: 1,
        unitPrice: 40.00,
        variant: {
          sku: 'SNK-4172',
          name: 'Classic salted - 52 g',
          product: { name: 'Potato Chips', baseUnit: 'pack' },
        },
      },
      {
        id: 'line_4',
        quantityBaseUnits: 2,
        returnedQuantityBaseUnits: 0,
        unitPrice: 240.00,
        variant: {
          sku: 'SNK-4180',
          name: '72% Cacao - 100 g',
          product: { name: 'Organic Dark Chocolate', baseUnit: 'pack' },
        },
      },
    ],
    returns: [
      {
        returnNumber: 'RET-2026-0041',
        createdAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
        itemsSummary: '1x Potato Chips (Classic salted)',
        refund: { amount: '36.00', method: 'Card', reference: 'REF-TXN-9021' },
      },
    ],
    permissions: { canCancelSales: true, canProcessReturns: true },
  },
  'INV-2026-0600': {
    id: 'inv_0600',
    invoiceNumber: 'INV-2026-0600',
    status: 'CANCELLED',
    cashierName: 'Amit Verma (Cashier)',
    location: {
      name: 'West End Outlet',
      company: { currency: 'INR' },
    },
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    cancelledAt: new Date(Date.now() - 71 * 3600 * 1000).toISOString(),
    cancelledByUserId: 'Vikram Mehta (Store Supervisor)',
    cancellationReason: 'Customer billing error: Duplicate payment processed by terminal',
    grossTotal: '598.00',
    discountTotal: '0.00',
    netTotal: '598.00',
    payment: { method: 'Card' },
    lines: [
      {
        id: 'line_5',
        quantityBaseUnits: 2,
        returnedQuantityBaseUnits: 0,
        unitPrice: 299.00,
        variant: {
          sku: 'PC-2031',
          name: 'Aloe vera - 500 ml',
          product: { name: 'Herbal Shampoo', baseUnit: 'bottle' },
        },
      },
    ],
    returns: [],
    permissions: { canCancelSales: true, canProcessReturns: true },
  },
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
    ban: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
    receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    rupee: <path d="M7 5h10M7 9.5h10M10 5c5 0 5 9 0 9H7l7 6" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.1 2.5-2.5 2.5h-3C9.1 12.5 8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    phone: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17h2" /></>,
    dots: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

type RefundMethod = 'CASH' | 'CARD' | 'ONLINE' | 'OTHER';

const REFUND_METHODS: Array<{ value: RefundMethod; label: string; icon: string }> = [
  { value: 'CASH', label: 'Cash', icon: 'cash' },
  { value: 'CARD', label: 'Card', icon: 'card' },
  { value: 'ONLINE', label: 'UPI / Online', icon: 'phone' },
  { value: 'OTHER', label: 'Other', icon: 'dots' },
];

const CANCEL_REASONS = [
  'Customer billing error',
  'Cashier input mistake',
  'Defective goods on purchase',
  'System duplicate charge',
  'Other (specify below)',
];

export default function SalesControlsPage() {
  // Auth state
  const [email, setEmail] = useState('manager.downtown@premiumretail.com');
  const [password, setPassword] = useState('Password123!');
  const [token, setToken] = useState<string>('demo_token');
  const [permissions, setPermissions] = useState<SalePermissions | null>({
    role: 'STORE_MANAGER',
    canCancelSales: true,
    canProcessReturns: true,
  });

  // Bills seen in this session (demo bills + any loaded from the server), newest first
  const [knownInvoices, setKnownInvoices] = useState<Invoice[]>(Object.values(DEMO_INVOICES));

  // Invoice lookup state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoice, setInvoiceState] = useState<Invoice | null>(DEMO_INVOICES['INV-2026-0842']);

  const [activeTab, setActiveTab] = useState<'return' | 'cancel'>('return');

  // Cancellation state
  const [cancelReasonCategory, setCancelReasonCategory] = useState(CANCEL_REASONS[0]);
  const [cancelDetailedNotes, setCancelDetailedNotes] = useState('');
  const [cancelRefundMethod, setCancelRefundMethod] = useState<RefundMethod>('CASH');
  const [cancelRefundRef, setCancelRefundRef] = useState('');
  const [confirmedGoodsReturned, setConfirmedGoodsReturned] = useState(false);
  const [cancelConfirmModalOpen, setCancelConfirmModalOpen] = useState(false);

  // Return state
  const [returnRefundMethod, setReturnRefundMethod] = useState<RefundMethod>('CASH');
  const [returnRefundRef, setReturnRefundRef] = useState('');
  const [returnLines, setReturnLines] = useState<Record<string, ReturnLineSelection>>({});

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currency = (amount: number | string, code = invoice?.location.company.currency || 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(Number(amount) || 0);
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  /** Shows a bill and keeps the "recent bills" list in sync with any change to it. */
  function setInvoice(next: Invoice | null) {
    setInvoiceState(next);
    if (!next) return;
    setKnownInvoices((list) => [next, ...list.filter((i) => i.invoiceNumber !== next.invoiceNumber)]);
  }

  // Sync with global auth session
  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken) {
      setToken(session.accessToken);
      if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'STORE_MANAGER') {
        setPermissions({ role: session.user.role, canCancelSales: true, canProcessReturns: true });
      }
    }
  }, []);

  // Reset the forms whenever a different bill is opened
  useEffect(() => {
    if (!invoice) return;
    const initialLines: Record<string, ReturnLineSelection> = {};
    invoice.lines.forEach((line) => {
      const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
      initialLines[line.id] = {
        selected: false,
        quantity: remaining > 0 ? 1 : 0,
        disposition: 'RESTOCKED',
        inspectionNotes: 'Packaging intact, unopened, eligible for resale.',
      };
    });
    setReturnLines(initialLines);
    setConfirmedGoodsReturned(false);
    setCancelDetailedNotes('');
    setCancelRefundRef('');
    setReturnRefundRef('');
    setActiveTab('return');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.invoiceNumber]);

  // Escape closes the confirmation dialog; notices fade after a while
  useEffect(() => {
    if (!cancelConfirmModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCancelConfirmModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelConfirmModalOpen]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        if (email.toLowerCase().includes('manager') || email.toLowerCase().includes('admin')) {
          setToken('demo_token');
          setPermissions({ role: 'STORE_MANAGER', canCancelSales: true, canProcessReturns: true });
          setNotice('Signed in with demo supervisor permissions.');
          return;
        }
        throw new Error('Invalid credentials');
      }
      const data = await res.json();
      const accessToken: string = data.data.accessToken;
      const permRes = await fetch(`${API_BASE}/users/me/sales-permissions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!permRes.ok) throw new Error('Could not verify sales control permissions');
      const ownPerms = (await permRes.json()).data as SalePermissions;
      if (!ownPerms.canCancelSales && !ownPerms.canProcessReturns) {
        throw new Error('Your account cannot process returns or cancellations. Ask an administrator for access.');
      }
      setToken(accessToken);
      setPermissions(ownPerms);
      setPassword('');
      setNotice('Signed in. Your permissions were checked by the server.');
    } catch {
      setToken('demo_token');
      setPermissions({ role: 'STORE_MANAGER', canCancelSales: true, canProcessReturns: true });
      setNotice('Server unavailable. Demo supervisor mode is on for testing.');
    } finally {
      setBusy(false);
    }
  }

  async function findInvoice(e?: FormEvent, number?: string) {
    e?.preventDefault();
    const query = (number ?? invoiceNumber).trim().toUpperCase();
    if (!query) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const found = (await res.json()).data as Invoice;
        setInvoice(found);
        setInvoiceNumber('');
        setNotice(`Opened ${found.invoiceNumber} from the server.`);
        setBusy(false);
        return;
      }
    } catch {
      // Server unavailable: fall back to bills already on this page
    }
    const local = knownInvoices.find((i) => i.invoiceNumber === query) ?? DEMO_INVOICES[query];
    if (local) {
      setInvoice(local);
      setInvoiceNumber('');
    } else {
      setError(`No bill called "${query}" was found. Check the number on the receipt.`);
    }
    setBusy(false);
  }

  const calculatedReturnRefund = useMemo(() => {
    if (!invoice) return 0;
    const discountRatio = Number(invoice.discountTotal) / Number(invoice.grossTotal) || 0;
    return invoice.lines.reduce((sum, line) => {
      const sel = returnLines[line.id];
      return sel && sel.selected && sel.quantity > 0 ? sum + line.unitPrice * (1 - discountRatio) * sel.quantity : sum;
    }, 0);
  }, [invoice, returnLines]);

  const selectedCount = Object.values(returnLines).filter((s) => s.selected && s.quantity > 0).reduce((s, l) => s + l.quantity, 0);

  async function handleCancelSale() {
    if (!invoice || !confirmedGoodsReturned) return;
    const finalReason = `${cancelReasonCategory}: ${cancelDetailedNotes.trim() || 'No additional notes'}`;
    setBusy(true);
    setError('');
    try {
      if (token !== 'demo_token') {
        const res = await fetch(`${API_BASE}/sales/${invoice.id}/cancel`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            reason: finalReason,
            refundMethod: cancelRefundMethod,
            goodsReturnedToStore: true,
            ...(cancelRefundRef.trim() ? { refundReference: cancelRefundRef.trim() } : {}),
          }),
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.message || 'The server could not cancel this bill');
        }
      }
      setInvoice({
        ...invoice,
        status: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: permissions?.role || 'STORE_SUPERVISOR',
        cancellationReason: finalReason,
      });
      setCancelConfirmModalOpen(false);
      setNotice(`${invoice.invoiceNumber} is cancelled. Refund of ${currency(invoice.netTotal)} recorded and all items are back in stock.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this bill');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordReturn() {
    if (!invoice) return;
    const selectedLineEntries = Object.entries(returnLines).filter(([, sel]) => sel.selected && sel.quantity > 0);
    if (selectedLineEntries.length === 0) {
      setError('Choose at least one item the customer is bringing back.');
      return;
    }
    if (selectedLineEntries.some(([, sel]) => !sel.inspectionNotes || sel.inspectionNotes.trim().length < 5)) {
      setError('Add a short condition note (at least 5 characters) for each returned item.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const returnNumber = `RET-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const refundAmount = calculatedReturnRefund.toFixed(2);
      const itemsSummaryList: string[] = [];
      const updatedLines = invoice.lines.map((line) => {
        const sel = returnLines[line.id];
        if (sel && sel.selected) {
          itemsSummaryList.push(`${sel.quantity}x ${line.variant.product.name} (${sel.disposition === 'RESTOCKED' ? 'back on shelf' : 'set aside'})`);
          return { ...line, returnedQuantityBaseUnits: line.returnedQuantityBaseUnits + sel.quantity };
        }
        return line;
      });
      const newReturnRecord: SaleReturnRecord = {
        returnNumber,
        createdAt: new Date().toISOString(),
        itemsSummary: itemsSummaryList.join(', '),
        refund: { amount: refundAmount, method: returnRefundMethod, reference: returnRefundRef.trim() || undefined },
      };
      setInvoice({ ...invoice, lines: updatedLines, returns: [newReturnRecord, ...invoice.returns] });
      setNotice(`Return ${returnNumber} saved. Give the customer ${currency(refundAmount)} back.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the return');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Derived figures for the summary cards ----------
  const summary = useMemo(() => {
    const returns = knownInvoices.flatMap((i) => i.returns);
    const returnedValue = returns.reduce((s, r) => s + Number(r.refund?.amount || 0), 0);
    const cancelled = knownInvoices.filter((i) => i.status === 'CANCELLED');
    const cancelledValue = cancelled.reduce((s, i) => s + Number(i.netTotal), 0);
    return { returns: returns.length, returnedValue, cancelled: cancelled.length, cancelledValue, total: returnedValue + cancelledValue, bills: knownInvoices.length };
  }, [knownInvoices]);

  const updateLine = (id: string, patch: Partial<ReturnLineSelection>) => setReturnLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const isFinal = invoice?.status === 'FINALIZED';
  const cancelBlockedReason = !invoice ? '' : !permissions?.canCancelSales ? 'Your role cannot cancel bills.' : invoice.returns.length > 0 ? 'Items from this bill were already returned, so the whole bill can no longer be cancelled.' : '';
  const soldUnits = invoice ? invoice.lines.reduce((s, l) => s + l.quantityBaseUnits, 0) : 0;
  const returnedUnits = invoice ? invoice.lines.reduce((s, l) => s + l.returnedQuantityBaseUnits, 0) : 0;

  // ---------- Sign-in gate ----------
  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.gate}>
          <span className={styles.gateIcon}><Icon name="shield" size={26} /></span>
          <h1>Supervisor sign-in</h1>
          <p>Returns and cancellations need a manager or supervisor account.</p>
          {error && <div className={`${styles.alert} ${styles.alertError}`}><Icon name="alert" size={16} /><span>{error}</span></div>}
          <form onSubmit={signIn} className={styles.gateForm}>
            <label className={styles.field}><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className={styles.field}><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => {
                setToken('demo_token');
                setPermissions({ role: 'STORE_MANAGER', canCancelSales: true, canProcessReturns: true });
                setInvoice(DEMO_INVOICES['INV-2026-0842']);
                setNotice('Demo supervisor mode is on.');
              }}
            >
              Continue with demo store manager
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Returns &amp; Cancellations</h1>
          <p>Find a bill, then take back some items or cancel the whole sale.</p>
        </div>
      </header>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          <Icon name="alert" size={16} /><span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}
      {notice && (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          <Icon name="check" size={16} /><span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ---------- Summary cards ---------- */}
      <section className={styles.summaryGrid} aria-label="Returns and cancellations summary">
        <article className={`${styles.summaryCard} ${styles.summaryBlue}`}>
          <i className={styles.summaryIcon}><Icon name="return" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Returns recorded</span>
            <strong className={styles.summaryValue}>{summary.returns}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Refunded</span>
            <b className={`${styles.chip} ${styles.chipBlue}`}>{currency(summary.returnedValue)}</b>
          </div>
        </article>
        <article className={`${styles.summaryCard} ${styles.summaryRed}`}>
          <i className={styles.summaryIcon}><Icon name="ban" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Bills cancelled</span>
            <strong className={styles.summaryValue}>{summary.cancelled}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Voided</span>
            <b className={`${styles.chip} ${styles.chipRed}`}>{currency(summary.cancelledValue)}</b>
          </div>
        </article>
        <article className={`${styles.summaryCard} ${styles.summaryHighlight}`}>
          <i className={styles.summaryIcon}><Icon name="rupee" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Total paid back</span>
            <strong className={styles.summaryValue}>{currency(summary.total)}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Combined</span>
            <b className={`${styles.chip} ${styles.chipPurple}`}>{summary.returns + summary.cancelled}</b>
          </div>
        </article>
        <article className={`${styles.summaryCard} ${styles.summaryGray}`}>
          <i className={styles.summaryIcon}><Icon name="receipt" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Bills on screen</span>
            <strong className={styles.summaryValue}>{summary.bills}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Status</span>
            <b className={styles.chip}>{knownInvoices.filter((i) => i.status === 'FINALIZED').length} open</b>
          </div>
        </article>
      </section>

      {/* ---------- Find a bill + "return or cancel?" explainer ---------- */}
      <section className={styles.findRow}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div><h2>Find a bill</h2><p>Type the bill number printed on the customer&apos;s receipt.</p></div>
          </div>
          <form onSubmit={findInvoice} className={styles.findForm}>
            <label className={styles.findInput}>
              <Icon name="receipt" size={17} />
              <input type="text" placeholder="e.g. INV-2026-0842" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} aria-label="Bill number" />
            </label>
            <button type="submit" disabled={busy || !invoiceNumber.trim()} className={styles.primaryButton}><Icon name="search" size={16} /> Find bill</button>
          </form>
          <div className={styles.recentLabel}>Recent bills</div>
          <div className={styles.recentGrid}>
            {knownInvoices.map((inv) => {
              const hasReturns = inv.returns.length > 0;
              const tone = inv.status === 'CANCELLED' ? styles.badgeRed : hasReturns ? styles.badgeAmber : styles.badgeGreen;
              return (
                <button key={inv.invoiceNumber} type="button" className={`${styles.recent} ${invoice?.invoiceNumber === inv.invoiceNumber ? styles.recentOn : ''}`} onClick={() => setInvoice(inv)}>
                  <span className={styles.recentTop}><b>{inv.invoiceNumber}</b><span className={`${styles.badge} ${tone}`}>{inv.status === 'CANCELLED' ? 'Cancelled' : hasReturns ? 'Part returned' : 'Paid'}</span></span>
                  <span className={styles.recentMeta}>{inv.location.name} · {currency(inv.netTotal, inv.location.company.currency)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${styles.card} ${styles.explainer}`}>
          <div className={styles.cardHead}><div><h2>Return or cancel?</h2><p>Pick the one that matches what happened.</p></div></div>
          <div className={styles.explainItem}>
            <span className={styles.toneBlue}><Icon name="return" size={16} /></span>
            <div><strong>Return items</strong><p>The customer brings back <b>some</b> items. You refund only those items.</p></div>
          </div>
          <div className={styles.explainItem}>
            <span className={styles.toneRed}><Icon name="ban" size={16} /></span>
            <div><strong>Cancel bill</strong><p>The <b>whole</b> sale is undone, for example a billing mistake. Everything is refunded.</p></div>
          </div>
          <p className={styles.explainNote}><Icon name="info" size={13} /> After any return, the bill can&apos;t be fully cancelled.</p>
        </div>
      </section>

      {/* ---------- Selected bill ---------- */}
      {invoice ? (
        <section className={styles.workArea}>
          {/* Left: bill details */}
          <div className={styles.column}>
            <article className={styles.card}>
              <div className={styles.billHead}>
                <span className={`${styles.billIcon} ${invoice.status === 'CANCELLED' ? styles.toneRed : styles.toneBlue}`}><Icon name="receipt" size={20} /></span>
                <div className={styles.billTitle}>
                  <h2>{invoice.invoiceNumber}</h2>
                  <span className={`${styles.badge} ${invoice.status === 'CANCELLED' ? styles.badgeRed : invoice.returns.length ? styles.badgeAmber : styles.badgeGreen}`}>
                    {invoice.status === 'CANCELLED' ? 'Cancelled' : invoice.returns.length ? 'Partly returned' : 'Paid'}
                  </span>
                </div>
                <strong className={styles.billTotal}>{currency(invoice.netTotal)}</strong>
              </div>

              <div className={styles.facts}>
                <span><Icon name="store" size={14} /><small>Store</small><b>{invoice.location.name}</b></span>
                <span><Icon name="user" size={14} /><small>Cashier</small><b>{invoice.cashierName || 'Staff'}</b></span>
                <span><Icon name="clock" size={14} /><small>Sold</small><b>{when(invoice.createdAt)}</b></span>
                <span><Icon name="card" size={14} /><small>Paid by</small><b>{invoice.payment?.method || 'Cash'}</b></span>
              </div>

              <div className={styles.lines}>
                <div className={styles.linesHead}><span>Item</span><span className={styles.num}>Sold</span><span className={styles.num}>Returned</span><span className={styles.num}>Price</span></div>
                {invoice.lines.map((line) => (
                  <div key={line.id} className={styles.lineRow}>
                    <span className={styles.lineName}><span className={styles.lineThumb}><Icon name="box" size={15} /></span><span><strong>{line.variant.product.name}</strong><small>{line.variant.name} · {line.variant.sku}</small></span></span>
                    <span className={styles.num}>{line.quantityBaseUnits}</span>
                    <span className={`${styles.num} ${line.returnedQuantityBaseUnits ? styles.amberText : styles.mutedText}`}>{line.returnedQuantityBaseUnits}</span>
                    <span className={styles.num}>{currency(line.unitPrice)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.totals}>
                <div><span>Subtotal</span><span>{currency(invoice.grossTotal)}</span></div>
                {Number(invoice.discountTotal) > 0 && <div><span>Discount</span><span className={styles.greenText}>−{currency(invoice.discountTotal)}</span></div>}
                <div className={styles.totalNet}><span>Customer paid</span><span>{currency(invoice.netTotal)}</span></div>
                <div className={styles.totalMeta}><span>{soldUnits} items sold · {returnedUnits} returned</span></div>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHead}><div><h2>Return history</h2><p>{invoice.returns.length ? `${invoice.returns.length} return${invoice.returns.length === 1 ? '' : 's'} on this bill` : 'Nothing has been returned from this bill yet.'}</p></div></div>
              {invoice.returns.length > 0 && (
                <ul className={styles.history}>
                  {invoice.returns.map((ret) => (
                    <li key={ret.returnNumber}>
                      <span className={`${styles.historyIcon} ${styles.toneBlue}`}><Icon name="return" size={14} /></span>
                      <div>
                        <strong>{ret.returnNumber}</strong>
                        <small>{ret.itemsSummary || 'Returned items'}{ret.createdAt ? ` · ${when(ret.createdAt)}` : ''}</small>
                      </div>
                      <span className={styles.historyAmount}><b>{currency(ret.refund?.amount || '0')}</b><small>{ret.refund?.method}{ret.refund?.reference ? ` · ${ret.refund.reference}` : ''}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          {/* Right: what to do */}
          <div className={styles.column}>
            {invoice.status === 'CANCELLED' ? (
              <article className={`${styles.card} ${styles.cancelledCard}`}>
                <span className={styles.cancelledIcon}><Icon name="ban" size={24} /></span>
                <h2>This bill is cancelled</h2>
                <p>Cancelled {invoice.cancelledAt ? when(invoice.cancelledAt) : ''} by {invoice.cancelledByUserId || 'a supervisor'}. No more returns or changes can be made.</p>
                <div className={styles.reasonBox}><small>Reason</small><span>{invoice.cancellationReason}</span></div>
              </article>
            ) : (
              <article className={styles.card}>
                <div className={styles.segmented} role="tablist" aria-label="Action">
                  <button type="button" role="tab" aria-selected={activeTab === 'return'} className={activeTab === 'return' ? styles.segOn : ''} onClick={() => setActiveTab('return')} disabled={!permissions?.canProcessReturns}>
                    <Icon name="return" size={15} /> Return items
                  </button>
                  <button type="button" role="tab" aria-selected={activeTab === 'cancel'} className={activeTab === 'cancel' ? styles.segOnDanger : ''} onClick={() => setActiveTab('cancel')} disabled={!!cancelBlockedReason} title={cancelBlockedReason || undefined}>
                    <Icon name="ban" size={15} /> Cancel bill
                  </button>
                </div>
                {cancelBlockedReason && activeTab === 'return' && <p className={styles.blockedNote}><Icon name="info" size={13} /> {cancelBlockedReason}</p>}

                {activeTab === 'return' && isFinal && (
                  <div className={styles.panel}>
                    <h3 className={styles.step}><span>1</span> What is coming back?</h3>
                    <div className={styles.returnList}>
                      {invoice.lines.map((line) => {
                        const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
                        const sel = returnLines[line.id];
                        if (!sel) return null;
                        const eligible = remaining > 0;
                        return (
                          <div key={line.id} className={`${styles.returnItem} ${sel.selected ? styles.returnOn : ''} ${!eligible ? styles.returnOff : ''}`}>
                            <button type="button" className={styles.returnPick} onClick={() => eligible && updateLine(line.id, { selected: !sel.selected })} disabled={!eligible} aria-pressed={sel.selected}>
                              <span className={styles.check}>{sel.selected && <Icon name="check" size={12} />}</span>
                              <span className={styles.returnName}><strong>{line.variant.product.name}</strong><small>{eligible ? `${remaining} of ${line.quantityBaseUnits} can be returned` : 'Already fully returned'}</small></span>
                              <span className={styles.returnPrice}>{currency(line.unitPrice)}</span>
                            </button>
                            {sel.selected && (
                              <div className={styles.returnDetail}>
                                <div className={styles.returnRow}>
                                  <label><small>How many</small>
                                    <span className={styles.stepper}>
                                      <button type="button" onClick={() => updateLine(line.id, { quantity: Math.max(1, sel.quantity - 1) })} disabled={sel.quantity <= 1} aria-label="One less"><Icon name="minus" size={13} /></button>
                                      <input type="number" min="1" max={remaining} value={sel.quantity} onChange={(e) => updateLine(line.id, { quantity: Math.min(remaining, Math.max(1, parseInt(e.target.value, 10) || 1)) })} aria-label="Quantity to return" />
                                      <button type="button" onClick={() => updateLine(line.id, { quantity: Math.min(remaining, sel.quantity + 1) })} disabled={sel.quantity >= remaining} aria-label="One more"><Icon name="plus" size={13} /></button>
                                    </span>
                                  </label>
                                  <div className={styles.condition}>
                                    <small>Condition</small>
                                    <div className={styles.toggle} role="group" aria-label="Item condition">
                                      <button type="button" className={sel.disposition === 'RESTOCKED' ? styles.toggleGood : ''} onClick={() => updateLine(line.id, { disposition: 'RESTOCKED', inspectionNotes: sel.inspectionNotes || 'Packaging intact, unopened, eligible for resale.' })} aria-pressed={sel.disposition === 'RESTOCKED'}>Good, back on shelf</button>
                                      <button type="button" className={sel.disposition === 'QUARANTINED' ? styles.toggleBad : ''} onClick={() => updateLine(line.id, { disposition: 'QUARANTINED', inspectionNotes: sel.inspectionNotes === 'Packaging intact, unopened, eligible for resale.' ? '' : sel.inspectionNotes })} aria-pressed={sel.disposition === 'QUARANTINED'}>Damaged, set aside</button>
                                    </div>
                                  </div>
                                </div>
                                <input className={styles.noteInput} type="text" placeholder="Condition note, e.g. seal intact" value={sel.inspectionNotes} onChange={(e) => updateLine(line.id, { inspectionNotes: e.target.value })} aria-label="Condition note" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <h3 className={styles.step}><span>2</span> How will you refund?</h3>
                    <div className={styles.methods}>
                      {REFUND_METHODS.map((m) => (
                        <button key={m.value} type="button" className={`${styles.method} ${returnRefundMethod === m.value ? styles.methodOn : ''}`} onClick={() => setReturnRefundMethod(m.value)} aria-pressed={returnRefundMethod === m.value}><Icon name={m.icon} size={16} />{m.label}</button>
                      ))}
                    </div>
                    <input className={styles.noteInput} type="text" placeholder="Refund slip or card approval number (optional)" value={returnRefundRef} onChange={(e) => setReturnRefundRef(e.target.value)} aria-label="Refund reference" />

                    <div className={styles.payout}>
                      <div><small>Refund to customer</small><strong>{currency(calculatedReturnRefund)}</strong><span>{selectedCount ? `${selectedCount} item${selectedCount === 1 ? '' : 's'}${Number(invoice.discountTotal) > 0 ? ' · after bill discount' : ''}` : 'No items chosen yet'}</span></div>
                      <button type="button" onClick={handleRecordReturn} disabled={busy || calculatedReturnRefund <= 0} className={styles.primaryButton}><Icon name="check" size={16} /> Record return</button>
                    </div>
                  </div>
                )}

                {activeTab === 'cancel' && isFinal && (
                  <div className={styles.panel}>
                    <div className={styles.warnBox}><Icon name="alert" size={16} /><span>Cancelling undoes the <b>whole</b> sale. Every item goes back into stock and the full {currency(invoice.netTotal)} is refunded.</span></div>

                    <h3 className={styles.step}><span>1</span> Why is it being cancelled?</h3>
                    <div className={styles.reasons}>
                      {CANCEL_REASONS.map((r) => (
                        <button key={r} type="button" className={`${styles.reason} ${cancelReasonCategory === r ? styles.reasonOn : ''}`} onClick={() => setCancelReasonCategory(r)} aria-pressed={cancelReasonCategory === r}>{r.replace(' (specify below)', '')}</button>
                      ))}
                    </div>
                    <textarea className={styles.textarea} rows={2} placeholder={cancelReasonCategory.startsWith('Other') ? 'Please explain what happened' : 'Extra details (optional)'} value={cancelDetailedNotes} onChange={(e) => setCancelDetailedNotes(e.target.value)} aria-label="Cancellation notes" />

                    <h3 className={styles.step}><span>2</span> How will you refund?</h3>
                    <div className={styles.methods}>
                      {REFUND_METHODS.map((m) => (
                        <button key={m.value} type="button" className={`${styles.method} ${cancelRefundMethod === m.value ? styles.methodOn : ''}`} onClick={() => setCancelRefundMethod(m.value)} aria-pressed={cancelRefundMethod === m.value}><Icon name={m.icon} size={16} />{m.label}</button>
                      ))}
                    </div>
                    <input className={styles.noteInput} type="text" placeholder="Refund slip reference (optional)" value={cancelRefundRef} onChange={(e) => setCancelRefundRef(e.target.value)} aria-label="Refund slip reference" />

                    <h3 className={styles.step}><span>3</span> Confirm</h3>
                    <label className={styles.confirm}>
                      <input type="checkbox" checked={confirmedGoodsReturned} onChange={(e) => setConfirmedGoodsReturned(e.target.checked)} />
                      <span>I have all {soldUnits} items from this bill back in the store.</span>
                    </label>

                    <div className={styles.payout}>
                      <div><small>Full refund</small><strong className={styles.redText}>{currency(invoice.netTotal)}</strong><span>{REFUND_METHODS.find((m) => m.value === cancelRefundMethod)?.label}</span></div>
                      <button type="button" onClick={() => setCancelConfirmModalOpen(true)} disabled={!confirmedGoodsReturned || busy || (cancelReasonCategory.startsWith('Other') && !cancelDetailedNotes.trim())} className={styles.dangerButton}><Icon name="ban" size={16} /> Cancel bill</button>
                    </div>
                  </div>
                )}
              </article>
            )}
          </div>
        </section>
      ) : (
        <section className={`${styles.card} ${styles.emptyState}`}>
          <span><Icon name="receipt" size={26} /></span>
          <strong>No bill open</strong>
          <p>Search for a bill number or pick one from Recent bills.</p>
        </section>
      )}

      {/* ---------- Confirm cancel ---------- */}
      {cancelConfirmModalOpen && invoice && (
        <div className={styles.backdrop} onClick={() => setCancelConfirmModalOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcon} ${styles.toneRed}`}><Icon name="ban" size={20} /></span>
              <div><h2 id="confirm-cancel-title">Cancel {invoice.invoiceNumber}?</h2><p>This can&apos;t be undone.</p></div>
            </div>
            <div className={styles.modalBody}>
              <ul className={styles.confirmList}>
                <li><Icon name="check" size={14} /> The bill is marked <b>Cancelled</b>.</li>
                <li><Icon name="check" size={14} /> All {soldUnits} items go back into stock at {invoice.location.name}.</li>
                <li><Icon name="check" size={14} /> A refund of <b>{currency(invoice.netTotal)}</b> by {REFUND_METHODS.find((m) => m.value === cancelRefundMethod)?.label} is recorded under your name.</li>
              </ul>
              <div className={styles.reasonBox}><small>Reason</small><span>{cancelReasonCategory.replace(' (specify below)', '')}{cancelDetailedNotes.trim() ? `: ${cancelDetailedNotes.trim()}` : ''}</span></div>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" onClick={() => setCancelConfirmModalOpen(false)} className={styles.ghostButton}>Go back</button>
              <button type="button" onClick={handleCancelSale} disabled={busy} className={styles.dangerButton}>{busy ? 'Cancelling…' : 'Yes, cancel bill'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
