'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { ArrowRight, Boxes, Check, ChevronRight, Circle, IndianRupee, PackageSearch, ReceiptText, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthSession, getStoredSession } from '@/lib/auth';
import { read, type Load } from './data';
import { ManagerOverview, ShiftOverview } from './role-overview';
import styles from './dashboard.module.css';

type SalesSummary = {
  totals: { netSales: string | number; completedInvoices: number; cancelledInvoices: number };
  daily: Array<{ date: string; netSales: string | number; invoices: number }>;
  invoices?: Array<{ id: string; invoiceNumber: string; locationName: string; netTotal: string | number; status: string; createdAt: string }>;
};
type StockRow = { available: number; inTransit: number; reserved: number; quarantined: number; lowStock: boolean; negativeStock: boolean };
type Stock = { rows: StockRow[]; totals: { variants: number; availableBaseUnits: number; lowStockVariants: number; negativeStockVariants: number } };
type LowStock = { replenishments: unknown[] };
type Transfer = { status: string };
type SetupCounts = { companies: Load<number>; locations: Load<number>; hubs: Load<number>; stores: Load<number>; users: Load<number>; products: Load<number> };
type DashboardData = { sales: Load<SalesSummary>; stock: Load<Stock>; lowStock: Load<LowStock>; transfers: Load<Transfer[]> };
const emptyData: DashboardData = { sales: undefined, stock: undefined, lowStock: undefined, transfers: undefined };
const count = (rows: unknown[] | null) => rows ? rows.length : null;
const overviewRoles = ['SUPER_ADMIN', 'ADMIN'];
const managerRoles = ['STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'];
const SHORT_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function asNumber(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [setup, setSetup] = useState<SetupCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const role = session?.user.role ?? '';

  useEffect(() => {
    setSession(getStoredSession());
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    if (!sessionLoaded || !session || !overviewRoles.includes(session.user.role)) return;
    const controller = new AbortController();
    const { signal } = controller;
    const token = session.accessToken;
    const superAdmin = session.user.role === 'SUPER_ADMIN';
    setLoading(true);
    setSetup(null);
    setData(emptyData);

    async function load() {
      const [companies, locations, users, products] = await Promise.all([
        superAdmin ? read<unknown[]>('/companies', token, signal) : Promise.resolve(null),
        read<Array<{ type: string }>>('/locations?isActive=true', token, signal),
        read<Array<{ role: string }>>('/users?isActive=true', token, signal),
        read<unknown[]>('/products?isActive=true', token, signal),
      ]);
      if (signal.aborted) return;
      setSetup({
        companies: count(companies), locations: count(locations), products: count(products),
        hubs: count(locations?.filter((item) => ['MAIN_WAREHOUSE', 'CENTRAL_WAREHOUSE'].includes(item.type)) ?? null),
        stores: count(locations?.filter((item) => item.type === 'RETAIL_STORE') ?? null),
        users: count(users?.filter((item) => item.role !== 'SUPER_ADMIN') ?? null),
      });
      const [sales, stock, lowStock, transfers] = await Promise.all([
        read<SalesSummary>('/reports/sales-summary', token, signal),
        read<Stock>('/reports/stock', token, signal),
        read<LowStock>('/reports/low-stock', token, signal),
        read<Transfer[]>('/transfers', token, signal),
      ]);
      if (!signal.aborted) { setData({ sales, stock, lowStock, transfers }); setLoading(false); }
    }

    void load();
    return () => controller.abort();
  }, [session, sessionLoaded, retry]);

  if (!sessionLoaded) return <main className={styles.page}><div className={styles.panelMessage}>Loading your workspace…</div></main>;
  if (!session) {
    return <main className={styles.page}><section className={styles.empty}><h1>Sign in to view your dashboard</h1><Link href="/login" className={styles.primaryLink}>Go to sign in</Link></section></main>;
  }

  if (managerRoles.includes(role)) return <ManagerOverview session={session} />;
  if (['CASHIER', 'STAFF'].includes(role)) return <ShiftOverview session={session} />;
  if (!overviewRoles.includes(role)) return <main className={styles.page}><h1>Overview</h1><Link href="/settings">Open settings</Link></main>;

  const totals = data.sales?.totals;
  const states = (data.stock?.rows ?? []).reduce((sum, row) => ({
    available: sum.available + row.available,
    inTransit: sum.inTransit + row.inTransit,
    reserved: sum.reserved + row.reserved,
    quarantined: sum.quarantined + row.quarantined,
  }), { available: 0, inTransit: 0, reserved: 0, quarantined: 0 });
  const stateTotal = Object.values(states).reduce((sum, count) => sum + Math.max(count, 0), 0);
  const daily = data.sales?.daily.slice(-7) ?? [];
  const peak = Math.max(1, ...daily.map((day) => asNumber(day.netSales)));
  const pendingTransfers = (data?.transfers ?? []).filter((item) => ['PENDING_APPROVAL', 'APPROVED'].includes(item.status)).length;
  const inTransitTransfers = (data?.transfers ?? []).filter((item) => ['DISPATCHED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(item.status)).length;
  const sellerActions = [
    { label: 'Negative stock warnings', value: data.stock?.totals.negativeStockVariants, href: '/reports?tab=lowStock' },
    { label: 'Transfers awaiting approval', value: data.transfers?.filter((row) => row.status === 'PENDING_APPROVAL').length, href: '/operations' },
    { label: 'Cancelled invoices · last 30 days', value: totals?.cancelledInvoices, href: '/reports?tab=cancellations' },
  ];
  const setupSteps = [
    ...(role === 'SUPER_ADMIN' ? [
      { label: 'Company profile', href: '/admin/company?tab=profile', value: setup?.companies },
      { label: 'Central warehouse', href: '/admin/company', value: setup?.hubs },
      { label: 'Retail store', href: '/admin/company', value: setup?.stores },
    ] : []),
    { label: 'Team accounts', href: '/admin/users', value: setup?.users },
    { label: 'Review permissions', href: '/admin/sales-permissions', value: undefined, review: true },
  ];
  const openSetup = setupSteps.filter((step) => !step.review && step.value === 0).length;
  const unavailable = Object.values(data).some((result) => result === null) || (setup !== null && [setup.locations, setup.products, setup.users, ...(role === 'SUPER_ADMIN' ? [setup.companies] : [])].includes(null));
  const cards = [
    { label: 'Net sales · last 30 days', icon: IndianRupee, value: totals ? CURRENCY.format(asNumber(totals.netSales)) : '—', detail: 'Finalized invoices in your authorized scope', href: '/reports' },
    { label: 'Completed invoices', icon: ReceiptText, value: totals?.completedInvoices ?? '—', detail: `${totals ? totals.cancelledInvoices : '—'} cancelled in the same period`, href: '/reports' },
    { label: 'Low stock variants', icon: PackageSearch, value: data.stock?.totals.lowStockVariants ?? '—', detail: 'At or below configured reorder level', href: '/products' },
    { label: 'Negative stock warnings', icon: Boxes, value: data.stock?.totals.negativeStockVariants ?? '—', detail: 'Available balance below zero', href: '/products' },
  ];

  return <main className={styles.page}>
    <header className={styles.overviewTitle}>
      <div><h1>Operations overview</h1><p>Sales, stock and transfers across your authorized locations.</p></div>
      <Link href="/reports" className={styles.secondaryLink}>Open reports <ArrowRight size={15} aria-hidden="true" /></Link>
    </header>

    {unavailable && <div className={styles.error} role="alert"><span>Some dashboard data is unavailable. Figures from connected sections are shown below.</span><button type="button" onClick={() => setRetry((attempt) => attempt + 1)}>Retry</button></div>}

    <div className={styles.adminOverviewLead}>
      {openSetup > 0 && <section className={styles.deskPanel} aria-labelledby="setup-title">
        <div className={styles.deskPanelHeading}><div><h2 id="setup-title">Workspace setup</h2><p>{openSetup} setup {openSetup === 1 ? 'step' : 'steps'} remaining</p></div></div>
        <ol className={styles.checklist}>{setupSteps.map((step, index) => <li key={step.label}><Link href={step.href}>
          <span className={styles.checklistNumber} data-complete={(step.value ?? 0) > 0}>{(step.value ?? 0) > 0 ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
          <strong>{step.label}</strong>
          <small>{step.review ? 'Review' : step.value === undefined ? 'Checking…' : step.value === null ? 'Unavailable' : step.value > 0 ? 'Complete' : 'Set up'}</small>
          <ChevronRight size={16} aria-hidden="true" />
        </Link></li>)}</ol>
      </section>}
      <section className={styles.deskPanel} aria-labelledby="exceptions-title">
        <div className={styles.deskPanelHeading}><div><h2 id="exceptions-title">Needs attention</h2><p>Review exceptions across your authorized locations.</p></div><span className={styles.exceptionIcon}><TriangleAlert size={18} aria-hidden="true" /></span></div>
        <div className={styles.exceptionList}>{sellerActions.map((action) => <Link key={action.label} href={action.href}><Circle size={10} className={styles.exceptionDot} aria-hidden="true" /><strong>{action.label}</strong><span>{action.value ?? (loading ? '…' : '—')}</span><ChevronRight size={15} aria-hidden="true" /></Link>)}</div>
      </section>
    </div>

    <div className={styles.overviewGrid}>
      <section className={`${styles.panel} ${styles.metricsPanel}`} aria-labelledby="performance-title">
        <div className={styles.panelHead}><div><div className="heading-with-info"><h2 id="performance-title">Key figures</h2><InfoHint label="About key figures">Sales figures cover the last 30 days. Stock figures reflect the current balances you can access.</InfoHint></div><p>Last 30 days for sales · current stock</p></div></div>
        <div className={styles.kpiGrid}>
          {cards.map((card) => <Link href={card.href} key={card.label} className={styles.kpiCard}>
            <div className={styles.kpiTop}><span>{card.label}</span><span className={styles.kpiIcon}><card.icon size={17} strokeWidth={1.8} aria-hidden="true" /></span></div>
            <strong>{loading ? '…' : card.value}</strong><small>{card.detail}</small>
          </Link>)}
        </div>
      </section>

      <section className={`${styles.panel} ${styles.salesPanel}`} aria-labelledby="daily-sales-title">
        <div className={styles.panelHead}>
          <div><div className="heading-with-info"><h2 id="daily-sales-title">Daily sales</h2><InfoHint label="About daily sales">Each bar shows net sales from finalized invoices on that day.</InfoHint></div><p>Last seven trading days</p></div>
          <Link href="/reports">View report <ArrowRight size={13} aria-hidden="true" /></Link>
        </div>
        <div className={styles.chartInset}>
          <div className={styles.chartLegend}><i /> Net sales</div>
          {daily.length ? <div className={styles.plot}>
            <div className={styles.chartAxis} aria-hidden="true">{[1, .75, .5, .25, 0].map((level) => <span key={level}>{CURRENCY.format(peak * level)}</span>)}</div>
            <div className={styles.chart} style={{ gridTemplateColumns: `repeat(${daily.length}, minmax(0, 1fr))` }}>
              {daily.map((day) => <div className={styles.chartColumn} key={day.date} aria-label={`${day.date}: ${CURRENCY.format(asNumber(day.netSales))}`} title={`${day.date}: ${CURRENCY.format(asNumber(day.netSales))}`}>
                <div className={styles.barTrack}><i style={{ height: `${Math.max(0, (asNumber(day.netSales) / peak) * 100)}%` }} /></div>
                <span className={styles.barLabel}>{SHORT_DATE.format(new Date(`${day.date}T12:00:00`))}</span>
              </div>)}
            </div>
          </div> : <div className={styles.chartEmpty}><span>{data.sales === undefined ? 'Loading sales activity…' : data.sales === null ? 'Sales data unavailable.' : 'No finalized sales in this period.'}</span></div>}
        </div>
      </section>
    </div>

    <div className={styles.contentGrid}>
      <section className={styles.panel} aria-labelledby="recent-invoices-title">
        <div className={styles.panelHead}><div><h2 id="recent-invoices-title">Recent invoices</h2><p>Most recent activity in your scope</p></div><Link href="/reports?tab=salesDetails">View invoices <ArrowRight size={13} aria-hidden="true" /></Link></div>
        <div className={styles.invoiceTable} role="region" aria-label="Recent invoices" tabIndex={0}>
          <table>
            <thead><tr><th>Invoice</th><th>Location</th><th>Status</th><th>Date</th><th>Total</th></tr></thead>
            <tbody>{(data.sales?.invoices ?? []).slice(0, 5).map((invoice) => <tr key={invoice.id}>
              <td>{invoice.invoiceNumber}</td><td>{invoice.locationName}</td>
              <td><span className={invoice.status === 'CANCELLED' ? styles.invoiceCancelled : styles.invoiceComplete}>{invoice.status === 'CANCELLED' ? 'Cancelled' : 'Finalized'}</span></td>
              <td>{SHORT_DATE.format(new Date(invoice.createdAt))}</td><td>{CURRENCY.format(asNumber(invoice.netTotal))}</td>
            </tr>)}
            {!data.sales?.invoices?.length && <tr><td colSpan={5}>{data.sales === undefined ? 'Loading invoices…' : data.sales === null ? 'Invoices unavailable.' : 'No invoices to show.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>INVENTORY</span><div className="heading-with-info"><h2>Stock by state</h2><InfoHint label="About stock states">Units are split by whether they are available, in transit, reserved for a transfer, or quarantined.</InfoHint></div><p>{data.stock ? `${data.stock.totals.variants} variants in scope` : data.stock === null ? 'Stock data unavailable' : 'Loading stock…'}</p></div><Link href="/products">Open inventory <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></Link></div>
        <div className={styles.stockRows}>
          {([
            ['Available', states.available, 'available'],
            ['In transit', states.inTransit, 'transit'],
            ['Reserved', states.reserved, 'reserved'],
            ['Quarantined', states.quarantined, 'quarantined'],
          ] as const).map(([label, value, tone]) => <div className={styles.stockRow} key={tone}>
            <div><span>{label}</span><strong>{data.stock === undefined ? '…' : data.stock === null ? '—' : value.toLocaleString('en-IN')}</strong></div>
            <div className={styles.track}><i className={styles[tone]} style={{ width: `${stateTotal ? Math.max(0, value) / stateTotal * 100 : 0}%` }} /></div>
          </div>)}
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>LOGISTICS</span><h2>Transfers & replenishment</h2><p>Current requests within your access scope</p></div><Link href="/operations">Open operations <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></Link></div>
        <div className={styles.activityGrid}>
          <div><span>Pending approval</span><strong>{data.transfers === undefined ? '…' : data.transfers === null ? '—' : pendingTransfers}</strong></div>
          <div><span>In transit</span><strong>{data.transfers === undefined ? '…' : data.transfers === null ? '—' : inTransitTransfers}</strong></div>
          <div><span>Replenishment requests</span><strong>{data.lowStock === undefined ? '…' : data.lowStock === null ? '—' : data.lowStock.replenishments.length}</strong></div>
        </div>
      </article>

    </div>
  </main>;
}
