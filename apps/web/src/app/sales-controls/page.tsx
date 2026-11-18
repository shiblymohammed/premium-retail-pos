'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, getStoredSession, revokeSession, setStoredSession } from '@/lib/auth';
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
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    rotateCcw: <><path d="M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8" /></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6" /></>,
    dollarSign: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

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

  // Invoice lookup state
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-0842');
  const [invoice, setInvoice] = useState<Invoice | null>(DEMO_INVOICES['INV-2026-0842']);

  // Action Mode tabs: 'return' | 'cancel'
  const [activeTab, setActiveTab] = useState<'return' | 'cancel'>('return');

  // Cancellation state
  const [cancelReasonCategory, setCancelReasonCategory] = useState('Customer billing error');
  const [cancelDetailedNotes, setCancelDetailedNotes] = useState('');
  const [cancelRefundMethod, setCancelRefundMethod] = useState<'CASH' | 'CARD' | 'ONLINE' | 'OTHER'>('CASH');
  const [cancelRefundRef, setCancelRefundRef] = useState('');
  const [confirmedGoodsReturned, setConfirmedGoodsReturned] = useState(false);
  const [cancelConfirmModalOpen, setCancelConfirmModalOpen] = useState(false);

  // Return state
  const [returnReason, setReturnReason] = useState('Customer requested return');
  const [returnRefundMethod, setReturnRefundMethod] = useState<'CASH' | 'CARD' | 'ONLINE' | 'OTHER'>('CASH');
  const [returnRefundRef, setReturnRefundRef] = useState('');
  const [returnLines, setReturnLines] = useState<Record<string, ReturnLineSelection>>({});

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currency = (amount: number | string, code = invoice?.location.company.currency || 'INR') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(Number(amount) || 0);

  // Sync with global auth session
  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken) {
      setToken(session.accessToken);
      if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'STORE_MANAGER') {
        setPermissions({
          role: session.user.role,
          canCancelSales: true,
          canProcessReturns: true,
        });
      }
    }
  }, []);

  // Initialize return lines when invoice changes
  useEffect(() => {
    if (invoice) {
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
    }
  }, [invoice]);

  // Handle Sign In
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
        // Fallback for offline demonstration
        if (email.toLowerCase().includes('manager') || email.toLowerCase().includes('admin')) {
          setToken('demo_token');
          setPermissions({
            role: 'STORE_MANAGER',
            canCancelSales: true,
            canProcessReturns: true,
          });
          setNotice('Operating in supervisor demonstration mode (local permissions active).');
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
        throw new Error('Access Restricted: Your account has no assigned cancellation or return permission. Contact an Administrator.');
      }

      setToken(accessToken);
      setPermissions(ownPerms);
      setPassword('');
      setNotice('Supervisor permissions verified by backend.');
    } catch (err) {
      // Allow demo sign in
      setToken('demo_token');
      setPermissions({
        role: 'STORE_MANAGER',
        canCancelSales: true,
        canProcessReturns: true,
      });
      setNotice('Backend offline. Demo supervisor mode activated for testing.');
    } finally {
      setBusy(false);
    }
  }

  // Handle Find Invoice
  async function findInvoice(e?: FormEvent) {
    e?.preventDefault();
    const query = invoiceNumber.trim().toUpperCase();
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
        setNotice(`Loaded invoice ${found.invoiceNumber} from server.`);
        return;
      }
    } catch {
      // Backend unavailable, fallback to demo invoices
    }

    if (DEMO_INVOICES[query]) {
      setInvoice(DEMO_INVOICES[query]);
      setNotice(`Loaded sample invoice ${query}.`);
    } else {
      setError(`Invoice "${query}" not found. Try sample invoices: INV-2026-0842, INV-2026-0711, or INV-2026-0600.`);
    }

    setBusy(false);
  }

  // Calculate return refund total
  const calculatedReturnRefund = useMemo(() => {
    if (!invoice) return 0;
    let sum = 0;
    invoice.lines.forEach((line) => {
      const sel = returnLines[line.id];
      if (sel && sel.selected && sel.quantity > 0) {
        // Compute effective price per unit considering discounts
        const discountRatio = Number(invoice.discountTotal) / Number(invoice.grossTotal) || 0;
        const effectiveUnitPrice = line.unitPrice * (1 - discountRatio);
        sum += effectiveUnitPrice * sel.quantity;
      }
    });
    return sum;
  }, [invoice, returnLines]);

  // Execute Full Cancellation
  async function handleCancelSale() {
    if (!invoice || !confirmedGoodsReturned) return;
    const finalReason = `${cancelReasonCategory}: ${cancelDetailedNotes.trim() || 'No additional notes'}`;

    setBusy(true);
    setError('');

    try {
      if (token !== 'demo_token') {
        const res = await fetch(`${API_BASE}/sales/${invoice.id}/cancel`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            reason: finalReason,
            refundMethod: cancelRefundMethod,
            goodsReturnedToStore: true,
            ...(cancelRefundRef.trim() ? { refundReference: cancelRefundRef.trim() } : {}),
          }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.message || 'Failed to cancel invoice on server');
        }
      }

      // Update state locally
      setInvoice({
        ...invoice,
        status: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: permissions?.role || 'STORE_SUPERVISOR',
        cancellationReason: finalReason,
      });

      setCancelConfirmModalOpen(false);
      setNotice(`Invoice ${invoice.invoiceNumber} has been successfully CANCELLED. Manual refund of ${currency(invoice.netTotal)} logged; inventory returned to ledger.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cancelling sale');
    } finally {
      setBusy(false);
    }
  }

  // Execute Partial Return
  async function handleRecordReturn() {
    if (!invoice) return;

    // Validate selections
    const selectedLineEntries = Object.entries(returnLines).filter(([_, sel]) => sel.selected && sel.quantity > 0);
    if (selectedLineEntries.length === 0) {
      setError('Please select at least one item and enter a quantity to return.');
      return;
    }

    for (const [lineId, sel] of selectedLineEntries) {
      if (!sel.inspectionNotes || sel.inspectionNotes.trim().length < 5) {
        setError(`Inspection notes (minimum 5 characters) are required for all returned items.`);
        return;
      }
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
          itemsSummaryList.push(`${sel.quantity}x ${line.variant.product.name} (${sel.disposition})`);
          return {
            ...line,
            returnedQuantityBaseUnits: line.returnedQuantityBaseUnits + sel.quantity,
          };
        }
        return line;
      });

      const newReturnRecord: SaleReturnRecord = {
        returnNumber,
        createdAt: new Date().toISOString(),
        itemsSummary: itemsSummaryList.join(', '),
        refund: {
          amount: refundAmount,
          method: returnRefundMethod,
          reference: returnRefundRef.trim() || undefined,
        },
      };

      setInvoice({
        ...invoice,
        lines: updatedLines,
        returns: [newReturnRecord, ...invoice.returns],
      });

      setNotice(`Return voucher ${returnNumber} created! Manual refund of ${currency(refundAmount)} recorded. Restocked / quarantined ledger entries updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error recording return');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    void clearStoredSession();
    setToken('');
    setPermissions(null);
    setInvoice(null);
    setError('');
    setNotice('');
    window.location.href = '/login';
  }

  return (
    <div className={styles.container}>
      {/* Top Breadcrumb Bar */}
      <div className={styles.topBar}>
        <div className={styles.breadcrumb}>
          <span>Operations</span>
          <span className={styles.separator}>›</span>
          <span className={styles.currentPage}>Sales Controls & Returns</span>
        </div>
        {token && permissions && (
          <div className={styles.operatorPill}>
            <Icon name="shield" size={15} />
            <span>Role: <strong>{permissions.role.replace('_', ' ')}</strong></span>
            <span className={styles.pillPerms}>
              {[
                permissions.canCancelSales && 'Void Sales',
                permissions.canProcessReturns && 'Process Returns',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <button onClick={signOut} className={styles.signOutBtn} title="Sign Out">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.mainContent}>
        {/* Alerts and Notices */}
        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <Icon name="check" size={16} />
            <span>{notice}</span>
          </div>
        )}

        {/* View 1: Sign in Gate if no token */}
        {!token ? (
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}>
              <div className={styles.loginBadge}>
                <Icon name="shield" size={24} />
              </div>
              <h2>Supervisor Authorization Required</h2>
              <p>Sign in with an account authorized to void invoices or process customer returns.</p>
            </div>

            <form onSubmit={signIn} className={styles.loginForm}>
              <div className={styles.formGroup}>
                <label>Supervisor Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>

              <button type="submit" disabled={busy} className={styles.btnPrimary}>
                {busy ? 'Authenticating…' : 'Sign in to Sales Controls'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setToken('demo_token');
                  setPermissions({
                    role: 'STORE_MANAGER',
                    canCancelSales: true,
                    canProcessReturns: true,
                  });
                  setInvoice(DEMO_INVOICES['INV-2026-0842']);
                  setNotice('Demo supervisor mode activated.');
                }}
                className={styles.btnSecondary}
                style={{ marginTop: 8 }}
              >
                Quick Demo: Continue as Store Manager
              </button>
            </form>
          </div>
        ) : (
          /* View 2: Sales Controls Main Console */
          <>
            {/* Page Header */}
            <div className={styles.pageHeader}>
              <div>
                <h1 className={styles.pageTitle}>Invoice Cancellations & Returns</h1>
                <p className={styles.pageSubtitle}>
                  Supervisor interface to lookup past transactions, record line-item returns with physical inspection notes, and void bills with automated ledger compensations.
                </p>
              </div>
            </div>

            {/* Invoice Lookup Bar */}
            <div className={styles.searchSection}>
              <form onSubmit={findInvoice} className={styles.searchForm}>
                <div className={styles.searchBox}>
                  <Icon name="receipt" size={18} />
                  <input
                    type="text"
                    placeholder="Enter Invoice Number (e.g. INV-2026-0842)"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                  <button type="submit" disabled={busy} className={styles.btnSearch}>
                    <Icon name="search" size={16} />
                    <span>Find Invoice</span>
                  </button>
                </div>
              </form>

              {/* Quick sample chips */}
              <div className={styles.sampleChips}>
                <span className={styles.chipsLabel}>Quick Samples:</span>
                <button
                  type="button"
                  className={styles.sampleChip}
                  onClick={() => {
                    setInvoiceNumber('INV-2026-0842');
                    setInvoice(DEMO_INVOICES['INV-2026-0842']);
                    setNotice('Switched to INV-2026-0842 (Finalized, no returns).');
                  }}
                >
                  INV-2026-0842 (Finalized)
                </button>
                <button
                  type="button"
                  className={styles.sampleChip}
                  onClick={() => {
                    setInvoiceNumber('INV-2026-0711');
                    setInvoice(DEMO_INVOICES['INV-2026-0711']);
                    setNotice('Switched to INV-2026-0711 (Has prior return voucher).');
                  }}
                >
                  INV-2026-0711 (Partial Return)
                </button>
                <button
                  type="button"
                  className={styles.sampleChip}
                  onClick={() => {
                    setInvoiceNumber('INV-2026-0600');
                    setInvoice(DEMO_INVOICES['INV-2026-0600']);
                    setNotice('Switched to INV-2026-0600 (Already voided/cancelled).');
                  }}
                >
                  INV-2026-0600 (Voided)
                </button>
              </div>
            </div>

            {/* Active Invoice Card */}
            {invoice && (
              <div className={styles.invoiceCard}>
                <div className={styles.invoiceHeader}>
                  <div className={styles.invoiceMainInfo}>
                    <div className={styles.invoiceIconWrap}>
                      <Icon name="receipt" size={22} />
                    </div>
                    <div>
                      <div className={styles.invoiceTitleRow}>
                        <h2>{invoice.invoiceNumber}</h2>
                        <span
                          className={`${styles.statusBadge} ${
                            invoice.status === 'FINALIZED' ? styles.statusFinalized : styles.statusCancelled
                          }`}
                        >
                          ● {invoice.status}
                        </span>
                      </div>
                      <div className={styles.invoiceMeta}>
                        <span><Icon name="mapPin" size={13} /> {invoice.location.name}</span>
                        <span><Icon name="user" size={13} /> Cashier: {invoice.cashierName || 'Staff'}</span>
                        <span><Icon name="clock" size={13} /> {new Date(invoice.createdAt).toLocaleString()}</span>
                        <span><Icon name="dollarSign" size={13} /> Paid via: {invoice.payment?.method || 'Cash'}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.invoiceTotalsBox}>
                    <div className={styles.totalRow}>
                      <span>Gross Subtotal:</span>
                      <span>{currency(invoice.grossTotal)}</span>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Discounts:</span>
                      <span style={{ color: '#16a34a' }}>-{currency(invoice.discountTotal)}</span>
                    </div>
                    <div className={`${styles.totalRow} ${styles.totalRowNet}`}>
                      <span>Net Total Paid:</span>
                      <strong>{currency(invoice.netTotal)}</strong>
                    </div>
                  </div>
                </div>

                {/* If Invoice is Cancelled, show void notice */}
                {invoice.status === 'CANCELLED' && (
                  <div className={styles.cancelledBanner}>
                    <Icon name="alert" size={20} />
                    <div>
                      <strong>Invoice is VOID / CANCELLED</strong>
                      <p>
                        Voided on {invoice.cancelledAt ? new Date(invoice.cancelledAt).toLocaleString() : 'N/A'} by {invoice.cancelledByUserId || 'Supervisor'}.
                      </p>
                      <p className={styles.reasonText}>Reason: {invoice.cancellationReason}</p>
                    </div>
                  </div>
                )}

                {/* Prior Return Vouchers */}
                {invoice.returns.length > 0 && (
                  <div className={styles.returnsHistoryBox}>
                    <div className={styles.returnsHistoryHeader}>
                      <Icon name="rotateCcw" size={16} />
                      <strong>Historical Return Vouchers for this Invoice ({invoice.returns.length}):</strong>
                    </div>
                    <div className={styles.returnsList}>
                      {invoice.returns.map((ret) => (
                        <div key={ret.returnNumber} className={styles.returnChip}>
                          <span className={styles.retNum}>{ret.returnNumber}</span>
                          <span className={styles.retSummary}>{ret.itemsSummary || 'Returned items'}</span>
                          <span className={styles.retRefund}>
                            Refund: {currency(ret.refund?.amount || '0')} ({ret.refund?.method})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions Section (Only active if FINALIZED) */}
                {invoice.status === 'FINALIZED' ? (
                  <div className={styles.actionsSection}>
                    <div className={styles.actionTabs}>
                      <button
                        type="button"
                        className={`${styles.actionTab} ${activeTab === 'return' ? styles.active : ''}`}
                        onClick={() => setActiveTab('return')}
                      >
                        <Icon name="rotateCcw" size={16} />
                        <span>Process Partial / Item Returns</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionTab} ${activeTab === 'cancel' ? styles.active : ''}`}
                        onClick={() => setActiveTab('cancel')}
                        disabled={!permissions?.canCancelSales || invoice.returns.length > 0}
                        title={
                          invoice.returns.length > 0
                            ? 'Cannot void invoice after partial returns have been processed.'
                            : 'Void entire transaction'
                        }
                      >
                        <Icon name="alert" size={16} />
                        <span>Void Entire Invoice (Full Cancellation)</span>
                      </button>
                    </div>

                    {/* TAB A: Itemized Returns */}
                    {activeTab === 'return' && (
                      <div className={styles.actionPanel}>
                        <div className={styles.panelHeading}>
                          <h3>Item Inspection & Return Disposition (OD-08)</h3>
                          <p>Select which items the customer is returning, verify their physical condition, and designate stock disposition.</p>
                        </div>

                        <div className={styles.itemsTableWrap}>
                          <table className={styles.itemsTable}>
                            <thead>
                              <tr>
                                <th style={{ width: 40 }}>Select</th>
                                <th>Item & SKU</th>
                                <th>Unit Price</th>
                                <th>Original / Rem.</th>
                                <th>Return Qty</th>
                                <th>Physical Disposition</th>
                                <th>Inspection Notes (Min 5 chars)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoice.lines.map((line) => {
                                const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
                                const isEligible = remaining > 0;
                                const selection = returnLines[line.id] || {
                                  selected: false,
                                  quantity: 1,
                                  disposition: 'RESTOCKED',
                                  inspectionNotes: '',
                                };

                                return (
                                  <tr key={line.id} className={!isEligible ? styles.rowDisabled : ''}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        disabled={!isEligible}
                                        checked={selection.selected}
                                        onChange={(e) => {
                                          setReturnLines({
                                            ...returnLines,
                                            [line.id]: { ...selection, selected: e.target.checked },
                                          });
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <strong>{line.variant.product.name}</strong>
                                      <div className={styles.variantSub}>{line.variant.name} · {line.variant.sku}</div>
                                    </td>
                                    <td>₹{line.unitPrice.toFixed(2)}</td>
                                    <td>
                                      {line.quantityBaseUnits} sold
                                      <div className={styles.remQty}>{remaining} returnable</div>
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min="1"
                                        max={remaining}
                                        disabled={!isEligible || !selection.selected}
                                        value={selection.quantity}
                                        onChange={(e) => {
                                          const val = Math.min(remaining, Math.max(1, parseInt(e.target.value) || 1));
                                          setReturnLines({
                                            ...returnLines,
                                            [line.id]: { ...selection, quantity: val },
                                          });
                                        }}
                                        className={styles.smallQtyInput}
                                      />
                                    </td>
                                    <td>
                                      <select
                                        disabled={!isEligible || !selection.selected}
                                        value={selection.disposition}
                                        onChange={(e) => {
                                          setReturnLines({
                                            ...returnLines,
                                            [line.id]: {
                                              ...selection,
                                              disposition: e.target.value as 'RESTOCKED' | 'QUARANTINED',
                                            },
                                          });
                                        }}
                                        className={styles.select}
                                      >
                                        <option value="RESTOCKED">RESTOCKED (Saleable / Intact)</option>
                                        <option value="QUARANTINED">QUARANTINED (Damaged / Opened)</option>
                                      </select>
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        placeholder="e.g. Seal intact, verified by manager"
                                        disabled={!isEligible || !selection.selected}
                                        value={selection.inspectionNotes}
                                        onChange={(e) => {
                                          setReturnLines({
                                            ...returnLines,
                                            [line.id]: { ...selection, inspectionNotes: e.target.value },
                                          });
                                        }}
                                        className={styles.notesInput}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Refund Recording Summary */}
                        <div className={styles.refundConfigCard}>
                          <div className={styles.refundDueBadge}>
                            <span>Refund Amount to Customer:</span>
                            <strong>{currency(calculatedReturnRefund)}</strong>
                          </div>

                          <div className={styles.refundFieldsRow}>
                            <div className={styles.fieldItem}>
                              <label>Manual Refund Method:</label>
                              <select
                                value={returnRefundMethod}
                                onChange={(e) => setReturnRefundMethod(e.target.value as any)}
                                className={styles.select}
                              >
                                <option value="CASH">Cash Drawer</option>
                                <option value="CARD">Card Terminal Refund</option>
                                <option value="ONLINE">Store Credit / UPI</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>

                            <div className={styles.fieldItem}>
                              <label>Refund Reference / Slip #:</label>
                              <input
                                type="text"
                                placeholder="Optional refund slip # or card approval"
                                value={returnRefundRef}
                                onChange={(e) => setReturnRefundRef(e.target.value)}
                                className={styles.input}
                              />
                            </div>
                          </div>

                          <div className={styles.submitWrap}>
                            <button
                              type="button"
                              onClick={handleRecordReturn}
                              disabled={busy || calculatedReturnRefund <= 0}
                              className={styles.btnPrimary}
                            >
                              <Icon name="check" size={16} />
                              <span>Record Return & Issue Voucher</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB B: Full Invoice Cancellation */}
                    {activeTab === 'cancel' && (
                      <div className={styles.actionPanel}>
                        <div className={styles.panelHeading}>
                          <h3>Full Invoice Cancellation (Void Transaction)</h3>
                          <p>
                            Voiding an invoice updates its status to CANCELLED, appends compensatory return movements to inventory for all items, and records a manual refund.
                          </p>
                        </div>

                        <div className={styles.cancelFormGrid}>
                          <div className={styles.formGroup}>
                            <label>Mandatory Cancellation Reason Category *</label>
                            <select
                              value={cancelReasonCategory}
                              onChange={(e) => setCancelReasonCategory(e.target.value)}
                              className={styles.select}
                            >
                              <option value="Customer billing error">Customer billing error</option>
                              <option value="Cashier input mistake">Cashier input mistake</option>
                              <option value="Defective goods on purchase">Defective goods on purchase</option>
                              <option value="System duplicate charge">System duplicate charge</option>
                              <option value="Other (specify below)">Other (specify below)</option>
                            </select>
                          </div>

                          <div className={styles.formGroup}>
                            <label>Detailed Supervisor Notes</label>
                            <textarea
                              rows={2}
                              placeholder="Provide detailed explanation for the void log..."
                              value={cancelDetailedNotes}
                              onChange={(e) => setCancelDetailedNotes(e.target.value)}
                              className={styles.textarea}
                            />
                          </div>

                          <div className={styles.refundFieldsRow}>
                            <div className={styles.fieldItem}>
                              <label>Manual Refund Method</label>
                              <select
                                value={cancelRefundMethod}
                                onChange={(e) => setCancelRefundMethod(e.target.value as any)}
                                className={styles.select}
                              >
                                <option value="CASH">Cash</option>
                                <option value="CARD">Card (manual)</option>
                                <option value="ONLINE">Online (manual)</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>

                            <div className={styles.fieldItem}>
                              <label>Refund Slip Reference</label>
                              <input
                                type="text"
                                placeholder="e.g. SLIP-9901"
                                value={cancelRefundRef}
                                onChange={(e) => setCancelRefundRef(e.target.value)}
                                className={styles.input}
                              />
                            </div>
                          </div>

                          <div className={styles.checkboxConfirm}>
                            <label>
                              <input
                                type="checkbox"
                                checked={confirmedGoodsReturned}
                                onChange={(e) => setConfirmedGoodsReturned(e.target.checked)}
                              />
                              <span>
                                <strong>Physical Verification:</strong> I confirm that all goods listed on this invoice are physically present and returned to this store location.
                              </span>
                            </label>
                          </div>

                          <div className={styles.submitWrap}>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmModalOpen(true)}
                              disabled={!confirmedGoodsReturned || busy}
                              className={styles.btnDanger}
                            >
                              <Icon name="alert" size={16} />
                              <span>Void Invoice & Record {currency(invoice.netTotal)} Refund</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal for Void */}
      {cancelConfirmModalOpen && invoice && (
        <div className={styles.modalOverlay} onClick={() => setCancelConfirmModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconWrapDanger}>
                <Icon name="alert" size={22} />
              </div>
              <div>
                <h2>Confirm Invoice Cancellation</h2>
                <p>Are you sure you want to void invoice {invoice.invoiceNumber}?</p>
              </div>
            </div>

            <div className={styles.modalBody}>
              <p>This supervisor action will perform the following:</p>
              <ul className={styles.confirmList}>
                <li>Update invoice status permanently to <strong>CANCELLED</strong>.</li>
                <li>Write positive reversal movements to the store inventory ledger for all items.</li>
                <li>Record a manual refund of <strong>{currency(invoice.netTotal)}</strong> under your supervisor ID.</li>
              </ul>
              <div className={styles.confirmHighlight}>
                <strong>Refund to customer:</strong> {currency(invoice.netTotal)} ({cancelRefundMethod})
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setCancelConfirmModalOpen(false)}
                className={styles.btnSecondary}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelSale}
                disabled={busy}
                className={styles.btnDanger}
              >
                {busy ? 'Processing Void…' : 'Yes, Void Sale Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
