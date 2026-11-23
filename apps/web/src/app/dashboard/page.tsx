'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthSession, getStoredSession } from '@/lib/auth';
import styles from './dashboard.module.css';

type SalesSummary = {
  totals: { netSales: string | number; completedInvoices: number; cancelledInvoices: number };
  daily: Array<{ date: string; netSales: string | number; invoices: number }>;
};
type StockRow = { available: number; inTransit: number; reserved: number; quarantined: number; lowStock: boolean; negativeStock: boolean };
type DashboardData = {
  sales: SalesSummary;
  stock: { rows: StockRow[]; totals: { variants: number; availableBaseUnits: number; lowStockVariants: number; negativeStockVariants: number } };
  lowStock: { lowStock: unknown[]; replenishments: unknown[] };
  transfers: Array<{ status: string }>;
};
type SetupCounts = { companies: number | null; locations: number; users: number | null; products: number };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const REPORT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CENTRAL_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'STORE_MANAGER'];
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

async function getData<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : `Could not load ${path.split('?')[0]}.`);
  // Most endpoints wrap their payload in `data`; the company list currently
  // returns the array directly. Accept both response shapes so setup counts
  // stay accurate in a clean workspace.
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

function asNumber(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [setup, setSetup] = useState<SetupCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const role = session?.user.role ?? '';

  useEffect(() => {
    setSession(getStoredSession());
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    const current = session;
    const token = current?.accessToken;
    if (!token) { setLoading(false); return; }
    const currentRole = current.user.role;
    let cancelled = false;
    const locationIds = current.user.locationIds ?? [];
    const locationQuery = !['SUPER_ADMIN', 'ADMIN'].includes(currentRole) && locationIds[0]
      ? `?locationId=${encodeURIComponent(locationIds[0])}`
      : '';

    async function load() {
      try {
        if (!REPORT_ROLES.includes(currentRole)) { setLoading(false); return; }
        const needsCompanyCount = currentRole === 'SUPER_ADMIN';
        const needsUserCount = ['SUPER_ADMIN', 'ADMIN'].includes(currentRole);
        const optional = async <T,>(path: string, allowed: boolean): Promise<T | null> => allowed ? getData<T>(path, token!) : null;
        const [companies, locations, users, products] = await Promise.all([
          optional<Array<unknown>>('/companies', needsCompanyCount),
          getData<Array<unknown>>('/locations?isActive=true', token!),
          optional<Array<unknown>>('/users?isActive=true', needsUserCount),
          getData<Array<unknown>>('/products?isActive=true', token!),
        ]);
        if (cancelled) return;
        setSetup({ companies: companies?.length ?? null, locations: locations.length, users: users?.length ?? null, products: products.length });
        if (locations.length === 0) {
          if (currentRole !== 'SUPER_ADMIN') setError('No active location is assigned to this account yet. Ask an administrator to finish workspace setup.');
          return;
        }
        const [sales, stock, lowStock, transfers] = await Promise.all([
          getData<SalesSummary>(`/reports/sales-summary${locationQuery}`, token!),
          getData<DashboardData['stock']>(`/reports/stock${locationQuery}`, token!),
          getData<DashboardData['lowStock']>(`/reports/low-stock${locationQuery}`, token!),
          getData<DashboardData['transfers']>('/transfers', token!),
        ]);
        if (!cancelled) setData({ sales, stock, lowStock, transfers: Array.isArray(transfers) ? transfers : [] });
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Dashboard data could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [session, sessionLoaded]);

  if (!sessionLoaded) return <main className={styles.page}><div className={styles.panelMessage}>Loading your workspace…</div></main>;
  if (!session) {
    return <main className={styles.page}><section className={styles.empty}><h1>Sign in to view your dashboard</h1><Link href="/login" className={styles.primaryLink}>Go to sign in</Link></section></main>;
  }

  if (!REPORT_ROLES.includes(role)) {
    return <main className={styles.page}>
      <header className={styles.heading}><div><span className={styles.eyebrow}>YOUR WORKSPACE</span><h1>Welcome back</h1><p>Choose a task to continue your shift.</p></div></header>
      <section className={styles.quickLinks}>
        {role === 'CASHIER' && <Link href="/" className={styles.quickCard}><strong>Open POS terminal</strong><span>Start a sale, scan products, and complete checkout.</span></Link>}
        {['CASHIER', 'STAFF'].includes(role) && <Link href="/attendance" className={styles.quickCard}><strong>Staff attendance</strong><span>Clock in or out and review your recent records.</span></Link>}
        <Link href="/settings" className={styles.quickCard}><strong>My settings</strong><span>Review your account and sign-in options.</span></Link>
      </section>
    </main>;
  }

  const totals = data?.sales.totals;
  const states = (data?.stock.rows ?? []).reduce((sum, row) => ({
    available: sum.available + row.available,
    inTransit: sum.inTransit + row.inTransit,
    reserved: sum.reserved + row.reserved,
    quarantined: sum.quarantined + row.quarantined,
  }), { available: 0, inTransit: 0, reserved: 0, quarantined: 0 });
  const stateTotal = Object.values(states).reduce((sum, count) => sum + Math.max(count, 0), 0);
  const daily = data?.sales.daily.slice(-7) ?? [];
  const peak = Math.max(1, ...daily.map((day) => asNumber(day.netSales)));
  const pendingTransfers = (data?.transfers ?? []).filter((item) => ['PENDING_APPROVAL', 'APPROVED'].includes(item.status)).length;
  const inTransitTransfers = (data?.transfers ?? []).filter((item) => ['DISPATCHED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(item.status)).length;
  const cards = [
    { label: 'Net sales · last 30 days', value: totals ? CURRENCY.format(asNumber(totals.netSales)) : '—', detail: 'Finalized invoices in your authorized scope', href: '/reports' },
    { label: 'Completed invoices', value: totals?.completedInvoices ?? '—', detail: `${totals?.cancelledInvoices ?? 0} cancelled in the same period`, href: '/reports' },
    { label: 'Low stock variants', value: data?.stock.totals.lowStockVariants ?? '—', detail: 'At or below configured reorder level', href: '/products' },
    { label: 'Negative stock warnings', value: data?.stock.totals.negativeStockVariants ?? '—', detail: 'Available balance below zero', href: '/products' },
  ];

  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>RETAIL OPERATIONS</span><h1>Operations overview</h1><p>Live sales, stock health, and transfer activity for your authorized locations.</p></div>
      <Link href="/reports" className={styles.secondaryLink}>Open reports <span aria-hidden="true"><ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span></Link>
    </header>

    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}

    <section className={styles.kpiGrid} aria-label="Key performance indicators">
      {cards.map((card) => <Link href={card.href} key={card.label} className={styles.kpiCard}>
        <span>{card.label}</span><strong>{loading ? '…' : card.value}</strong><small>{card.detail}</small>
      </Link>)}
    </section>

    <section className={styles.contentGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>SALES</span><h2>Daily sales</h2><p>Last seven days · finalized invoices</p></div><Link href="/reports">View details <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></Link></div>
        {loading ? <div className={styles.panelMessage}>Loading sales activity…</div> : daily.length ? <div className={styles.chart}>
          {daily.map((day) => <div className={styles.chartColumn} key={day.date} title={`${day.date}: ${CURRENCY.format(asNumber(day.netSales))}`}>
            <span className={styles.barValue}>{CURRENCY.format(asNumber(day.netSales))}</span><div className={styles.barTrack}><i style={{ height: `${Math.max(5, (asNumber(day.netSales) / peak) * 100)}%` }} /></div>
            <span className={styles.barLabel}>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
          </div>)}
        </div> : <div className={styles.panelMessage}>No finalized sales in this period.</div>}
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>INVENTORY</span><h2>Stock by state</h2><p>{data?.stock.totals.variants ?? 0} variants in scope</p></div><Link href="/products">Open inventory <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></Link></div>
        <div className={styles.stockRows}>
          {([
            ['Available', states.available, 'available'],
            ['In transit', states.inTransit, 'transit'],
            ['Reserved', states.reserved, 'reserved'],
            ['Quarantined', states.quarantined, 'quarantined'],
          ] as const).map(([label, value, tone]) => <div className={styles.stockRow} key={tone}>
            <div><span>{label}</span><strong>{loading ? '…' : value.toLocaleString('en-IN')}</strong></div>
            <div className={styles.track}><i className={styles[tone]} style={{ width: `${stateTotal ? Math.max(0, value) / stateTotal * 100 : 0}%` }} /></div>
          </div>)}
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>LOGISTICS</span><h2>Transfers & replenishment</h2><p>Current requests within your access scope</p></div><Link href="/operations">Open operations <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></Link></div>
        <div className={styles.activityGrid}>
          <div><span>Pending approval</span><strong>{loading ? '…' : pendingTransfers}</strong></div>
          <div><span>In transit</span><strong>{loading ? '…' : inTransitTransfers}</strong></div>
          <div><span>Replenishment requests</span><strong>{loading ? '…' : data?.lowStock.replenishments.length ?? 0}</strong></div>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>WORKSPACE</span><h2>Setup status</h2><p>Current active records visible to your role</p></div></div>
        <div className={styles.setupGrid}>
          {setup?.companies !== null && setup?.companies !== undefined && <div><span>Companies</span><strong>{setup.companies}</strong></div>}
          <div><span>Locations</span><strong>{setup?.locations ?? (loading ? '…' : '—')}</strong></div>
          {setup?.users !== null && setup?.users !== undefined && <div><span>Active users</span><strong>{setup.users}</strong></div>}
          <div><span>Products</span><strong>{setup?.products ?? (loading ? '…' : '—')}</strong></div>
        </div>
        {setup && setup.companies === 0 && <p className={styles.setupHint}>Start by configuring the company, then locations, staff accounts, catalogue, and opening stock.</p>}
      </article>
    </section>
  </main>;
}
