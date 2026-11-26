'use client';

import { countInUnit, ReturnHistory, soldPackaging, soldUnitPrice, type SaleReturnRecord } from '@/components/sales/return-history';
import { CashDrawer } from '../cash-drawer';
import { Feedback } from '@/components/ui/feedback';
import {
  Ban,
  Banknote,
  Check,
  Circle,
  Clock,
  CreditCard,
  Ellipsis,
  IndianRupee,
  Info,
  LogOut,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  TriangleAlert,
  Undo2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
  enteredUnit?: string;
  conversionRatioUsed?: number | null;
  unitPriceAtSale: string;
  lineTotal: string;
  refundedAmount?: string;
  variant: {
    sku: string;
    name: string;
    product: {
      name: string;
      baseUnit: string;
    };
  };
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: 'FINALIZED' | 'CANCELLED';
  cashierName?: string;
  cancelledByName?: string;
  refundDrawer?: { requiredForCash: boolean; open: boolean; canManage: boolean };
  location: {
    id: string;
    name: string;
    company: {
      currency: string;
      timezone?: string;
      invoicePrefix?: string;
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

const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  search: Search,
  shield: ShieldCheck,
  alert: TriangleAlert,
  check: Check,
  x: X,
  return: Undo2,
  ban: Ban,
  receipt: ReceiptText,
  rupee: IndianRupee,
  user: UserRound,
  store: Store,
  clock: Clock,
  card: CreditCard,
  cash: Banknote,
  phone: Smartphone,
  dots: Ellipsis,
  box: Package,
  minus: Minus,
  plus: Plus,
  logout: LogOut,
  info: Info,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" />;
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string>('');
  const [permissions, setPermissions] = useState<SalePermissions | null>(null);

  // Invoices looked up from the server during this session, newest first
  const [companyBilling, setCompanyBilling] = useState<{ currency: string; invoicePrefix: string }>();
  const [knownInvoices, setKnownInvoices] = useState<Invoice[]>([]);

  // Invoice lookup state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoice, setInvoiceState] = useState<Invoice | null>(null);

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
  const [refundDrawerOpen, setRefundDrawerOpen] = useState(false);
  const onRefundDrawer = useCallback((id: string | null) => setRefundDrawerOpen(!!id), []);
  const [returnRefundRef, setReturnRefundRef] = useState('');
  const [returnLines, setReturnLines] = useState<Record<string, ReturnLineSelection>>({});

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currency = (amount: number | string, code = invoice?.location.company.currency || companyBilling?.currency || 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(Number(amount) || 0);
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: invoice?.location.company.timezone });

  /** Shows a bill and keeps the "recent bills" list in sync with any change to it. */
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setCompanyBilling(undefined);
    void fetch(API_BASE + '/locations?type=RETAIL_STORE&isActive=true', {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const { data } = await response.json() as { data: Array<{ company: { currency: string; invoicePrefix: string } }> };
      const billing = data[0]?.company;
      if (billing && data.every((location) => location.company.invoicePrefix === billing.invoicePrefix) && !controller.signal.aborted) {
        setCompanyBilling(billing);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [token]);

  function setInvoice(next: Invoice | null) {
    setRefundDrawerOpen(next?.refundDrawer?.open ?? false);
    setInvoiceState(next);
    if (!next) return;
    setKnownInvoices((list) => [next, ...list.filter((i) => i.invoiceNumber !== next.invoiceNumber)]);
  }

  // Sync with global auth session
  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken) {
      setToken(session.accessToken);
      fetch(`${API_BASE}/users/me/sales-permissions`, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' })
        .then(async (response) => { if (!response.ok) throw new Error('Your sales permissions could not be verified.'); return response.json(); })
        .then((body) => setPermissions(body.data as SalePermissions))
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Your sales permissions could not be verified.'));
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
        inspectionNotes: '',
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
      if (!res.ok) throw new Error('Sign-in failed. Check the credentials and API connection.');
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in. Check the API connection.');
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
      if (!res.ok) throw new Error(res.status === 404 ? `No bill called "${query}" was found.` : 'The server could not load this bill.');
      const found = (await res.json()).data as Invoice;
      setInvoice(found);
      const tender = found.payment?.method;
      const refundMethod = tender === 'CARD' || tender === 'ONLINE' ? tender : 'CASH';
      setReturnRefundMethod(refundMethod);
      setCancelRefundMethod(refundMethod);
      setInvoiceNumber('');
      setNotice(`Opened ${found.invoiceNumber} from the server.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load that bill from the server.');
    } finally {
      setInvoiceNumber('');
      setBusy(false);
    }
  }

  const calculatedReturnRefund = useMemo(() => {
    if (!invoice) return 0;
    let cents = BigInt(0);
    for (const line of invoice.lines) {
      const selection = returnLines[line.id];
      if (!selection?.selected || !Number.isSafeInteger(selection.quantity) || selection.quantity <= 0) continue;
      const total = BigInt(Math.round(Number(line.lineTotal) * 100));
      const remaining = total - BigInt(Math.round(Number(line.refundedAmount ?? 0) * 100));
      const remainingUnits = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
      const quantity = BigInt(Math.min(selection.quantity, remainingUnits));
      const sold = BigInt(line.quantityBaseUnits);
      const prorated = (BigInt(2) * total * quantity + sold) / (BigInt(2) * sold);
      cents += selection.quantity >= remainingUnits || prorated > remaining ? remaining : prorated;
    }
    return Number(cents) / 100;
  }, [invoice, returnLines]);

  const selectedCount = Object.values(returnLines).filter((s) => s.selected && s.quantity > 0).reduce((s, l) => s + l.quantity, 0);

  const needsCondition = Object.values(returnLines).some((line) =>
    line.selected && line.quantity > 0 && line.inspectionNotes.trim().length < 5);
  const cashDrawerRequired = Boolean(invoice?.refundDrawer?.requiredForCash) &&
    (activeTab === 'return' ? returnRefundMethod : cancelRefundMethod) === 'CASH';
  const refundDrawerBlocked = cashDrawerRequired && !refundDrawerOpen;
  const refundDrawerControl = cashDrawerRequired && invoice && <div className={styles.refundDrawer}>
    {refundDrawerBlocked && <p role="status">{invoice.refundDrawer?.canManage
      ? `Open your cash drawer at ${invoice.location.name} before recording the cash refund.`
      : 'Ask a supervisor with drawer access at this store to record the cash refund.'}</p>}
    {invoice.refundDrawer?.canManage && <CashDrawer key={invoice.location.id} api={API_BASE} token={token}
      locationId={invoice.location.id} timezone={invoice.location.company.timezone} canClose={false} closeHref={`/pos-terminal?locationId=${encodeURIComponent(invoice.location.id)}`} onDrawer={onRefundDrawer} formatMoney={currency} />}
  </div>;

  async function handleCancelSale() {
    if (!invoice || !confirmedGoodsReturned || refundDrawerBlocked) return;
    const finalReason = `${cancelReasonCategory}: ${cancelDetailedNotes.trim() || 'No additional notes'}`;
    setBusy(true);
    setError('');
    try {
      {
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
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'The server could not cancel this bill');
        }
        const refreshed = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(invoice.invoiceNumber)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (refreshed.ok) setInvoice((await refreshed.json()).data as Invoice);
      }
      setCancelConfirmModalOpen(false);
      setNotice(`${invoice.invoiceNumber} cancellation was recorded by the server.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this bill');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordReturn() {
    if (!invoice || refundDrawerBlocked) return;
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
      const res = await fetch(`${API_BASE}/sales/${invoice.id}/returns`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          reason: selectedLineEntries.map(([id, selection]) => `${id}: ${selection.inspectionNotes}`).join('; '),
          refundMethod: returnRefundMethod,
          ...(returnRefundRef.trim() ? { refundReference: returnRefundRef.trim() } : {}),
          lines: selectedLineEntries.map(([saleLineId, selection]) => ({ saleLineId, quantityBaseUnits: selection.quantity, disposition: selection.disposition, inspectionNotes: selection.inspectionNotes.trim() })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'The server could not record this return.');
      }
      const refreshed = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(invoice.invoiceNumber)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (refreshed.ok) setInvoice((await refreshed.json()).data as Invoice);
      setNotice('Return recorded by the server.');
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
      <div className={`${styles.page} app-page`}>
        <div className={styles.gate}>
          <span className={styles.gateIcon}><Icon name="shield" size={26} /></span>
          <h1>Supervisor sign-in</h1>
          <p>Returns and cancellations need a manager or supervisor account.</p>
          {error && <div className={`${styles.alert} ${styles.alertError}`}><Icon name="alert" size={16} /><span>{error}</span></div>}
          <form onSubmit={signIn} className={styles.gateForm}>
            <label className={styles.field}><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className={styles.field}><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Returns &amp; Cancellations</h1>
          <p>Find a bill, then take back some items or cancel the whole sale.</p>
        </div>
      </header>

      {error && <Feedback tone="error" onDismiss={() => setError('')}>{error}</Feedback>}
      {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}

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
              <input type="text" placeholder={`e.g. ${invoice?.location.company.invoicePrefix || companyBilling?.invoicePrefix || 'INV'}-00000001`} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} aria-label="Bill number" />
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

        <details className={`${styles.card} ${styles.explainer}`}>
          <summary>Return or cancel?</summary>
          <p><strong>Return items</strong> when a customer brings back items. Only the selected items are refunded.</p>
          <p><strong>Cancel a bill</strong> to reverse the entire sale. Bills with a recorded return can’t be cancelled.</p>
          <p>By role, Super Admins, Admins and Store Managers handle returns. Super Admins and Admins handle cancellations. This workspace uses the permissions saved for your account.</p>
        </details>
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
                    <span className={styles.lineName}><span className={styles.lineThumb}><Icon name="box" size={15} /></span><span><strong>{line.variant.product.name}</strong><small>{line.variant.name} · {line.variant.sku}</small><small>{soldPackaging(line)}</small></span></span>
                    <span className={styles.num}>{countInUnit(line.quantityBaseUnits, line.variant.product.baseUnit)}</span>
                    <span className={`${styles.num} ${line.returnedQuantityBaseUnits ? styles.amberText : styles.mutedText}`}>{countInUnit(line.returnedQuantityBaseUnits, line.variant.product.baseUnit)}</span>
                    <span className={styles.num}>{soldUnitPrice(line, currency)}</span>
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
              {invoice.returns.length > 0 && <ReturnHistory
                returns={invoice.returns} saleLines={invoice.lines} money={currency} timezone={invoice.location.company.timezone}
              />}
            </article>
          </div>

          {/* Right: what to do */}
          <div className={styles.column}>
            {invoice.status === 'CANCELLED' ? (
              <article className={`${styles.card} ${styles.cancelledCard}`}>
                <span className={styles.cancelledIcon}><Icon name="ban" size={24} /></span>
                <h2>This bill is cancelled</h2>
                <p>Cancelled {invoice.cancelledAt ? when(invoice.cancelledAt) : ''} by {invoice.cancelledByName || 'a supervisor'}. No more returns or changes can be made.</p>
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
                              <span className={styles.returnName}><strong>{line.variant.product.name}</strong><small>{soldPackaging(line)}</small><small>{eligible ? `${countInUnit(remaining, line.variant.product.baseUnit)} can be returned` : 'Already fully returned'}</small></span>
                              <span className={styles.returnPrice}>{soldUnitPrice(line, currency)}</span>
                            </button>
                            {sel.selected && (
                              <div className={styles.returnDetail}>
                                <div className={styles.returnRow}>
                                  <label><small>Quantity to return in {line.variant.product.baseUnit}s</small>
                                    <span className={styles.stepper}>
                                      <button type="button" onClick={() => updateLine(line.id, { quantity: Math.max(1, sel.quantity - 1) })} disabled={sel.quantity <= 1} aria-label="One less"><Icon name="minus" size={13} /></button>
                                      <input type="number" min="1" max={remaining} value={sel.quantity} onChange={(e) => updateLine(line.id, { quantity: Math.min(remaining, Math.max(1, parseInt(e.target.value, 10) || 1)) })} aria-label={`Quantity to return in ${line.variant.product.baseUnit}s`} />
                                      <button type="button" onClick={() => updateLine(line.id, { quantity: Math.min(remaining, sel.quantity + 1) })} disabled={sel.quantity >= remaining} aria-label="One more"><Icon name="plus" size={13} /></button>
                                    </span>
                                  </label>
                                  <div className={styles.condition}>
                                    <small>Condition</small>
                                    <div className={styles.toggle} role="group" aria-label="Item condition">
                                      <button type="button" className={sel.disposition === 'RESTOCKED' ? styles.toggleGood : ''} onClick={() => updateLine(line.id, { disposition: 'RESTOCKED' })} aria-pressed={sel.disposition === 'RESTOCKED'}>Good, back on shelf</button>
                                      <button type="button" className={sel.disposition === 'QUARANTINED' ? styles.toggleBad : ''} onClick={() => updateLine(line.id, { disposition: 'QUARANTINED' })} aria-pressed={sel.disposition === 'QUARANTINED'}>Damaged, set aside</button>
                                    </div>
                                  </div>
                                </div>
                                <label>Condition note (required)
                                  <input className={styles.noteInput} type="text" placeholder="e.g. Seal intact" value={sel.inspectionNotes}
                                    required minLength={5} aria-invalid={sel.inspectionNotes.trim().length < 5}
                                    aria-describedby={`inspection-${line.id}`} onChange={(e) => updateLine(line.id, { inspectionNotes: e.target.value })} />
                                </label>
                                <small id={`inspection-${line.id}`}>Enter at least 5 characters.</small>
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
                    {refundDrawerControl}

                    <div className={styles.payout}>
                      <div><small>Refund to customer</small><strong>{currency(calculatedReturnRefund)}</strong><span>{selectedCount ? `${selectedCount} item${selectedCount === 1 ? '' : 's'}${Number(invoice.discountTotal) > 0 ? ' · after bill discount' : ''}` : 'No items chosen yet'}</span></div>
                      <button type="button" onClick={handleRecordReturn} disabled={busy || selectedCount === 0 || needsCondition || refundDrawerBlocked} className={styles.primaryButton}><Icon name="check" size={16} /> Record return</button>
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
                    {refundDrawerControl}

                    <h3 className={styles.step}><span>3</span> Confirm</h3>
                    <label className={styles.confirm}>
                      <input type="checkbox" checked={confirmedGoodsReturned} onChange={(e) => setConfirmedGoodsReturned(e.target.checked)} />
                      <span>I have all {soldUnits} items from this bill back in the store.</span>
                    </label>

                    <div className={styles.payout}>
                      <div><small>Full refund</small><strong className={styles.redText}>{currency(invoice.netTotal)}</strong><span>{REFUND_METHODS.find((m) => m.value === cancelRefundMethod)?.label}</span></div>
                      <button type="button" onClick={() => setCancelConfirmModalOpen(true)} disabled={!confirmedGoodsReturned || busy || refundDrawerBlocked || (cancelReasonCategory.startsWith('Other') && !cancelDetailedNotes.trim())} className={styles.dangerButton}><Icon name="ban" size={16} /> Cancel bill</button>
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
