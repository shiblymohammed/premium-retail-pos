'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getStoredSession, AuthSession } from '@/lib/auth';
import styles from './dashboard.module.css';

type LocationScope = 'All retail locations' | 'Downtown Store' | 'North Mall' | 'West End Outlet' | 'Central Warehouse';
type SaleStatus = 'Completed' | 'Cancelled' | 'Return recorded';
type SaleRow = {
  invoice: string;
  cashier: string;
  initials: string;
  shade: string;
  store: Exclude<LocationScope, 'All retail locations'>;
  time: string;
  items: number;
  discount: string;
  method: 'Cash' | 'Card' | 'Online';
  amount: number;
  status: SaleStatus;
};

const locations: LocationScope[] = ['All retail locations', 'Downtown Store', 'North Mall', 'West End Outlet', 'Central Warehouse'];

const locationMetrics: Record<LocationScope, { sales: number; invoices: number; lowStock: number; negative: number; inTransit: number; factor: number }> = {
  'All retail locations': { sales: 248650, invoices: 1284, lowStock: 18, negative: 3, inTransit: 6, factor: 1 },
  'Downtown Store': { sales: 92140, invoices: 437, lowStock: 7, negative: 1, inTransit: 3, factor: 0.37 },
  'North Mall': { sales: 77860, invoices: 396, lowStock: 5, negative: 1, inTransit: 2, factor: 0.31 },
  'West End Outlet': { sales: 78650, invoices: 451, lowStock: 6, negative: 1, inTransit: 1, factor: 0.32 },
  'Central Warehouse': { sales: 0, invoices: 0, lowStock: 0, negative: 0, inTransit: 0, factor: 0 },
};

const stockByLocation: Record<LocationScope, { available: number; inTransit: number; reserved: number; quarantined: number }> = {
  'All retail locations': { available: 8420, inTransit: 760, reserved: 310, quarantined: 84 },
  'Downtown Store': { available: 3110, inTransit: 210, reserved: 90, quarantined: 16 },
  'North Mall': { available: 2560, inTransit: 305, reserved: 80, quarantined: 31 },
  'West End Outlet': { available: 2750, inTransit: 245, reserved: 140, quarantined: 37 },
  'Central Warehouse': { available: 0, inTransit: 0, reserved: 0, quarantined: 0 },
};

const sales = [
  { invoice: 'INV-2026-0842', cashier: 'Ravi Menon', initials: 'RM', shade: 'rose', store: 'Downtown Store', time: '10:42 AM', items: 4, discount: '5%', method: 'Card', amount: 12480, status: 'Completed' },
  { invoice: 'INV-2026-0841', cashier: 'Asha Patel', initials: 'AP', shade: 'sand', store: 'North Mall', time: '10:28 AM', items: 2, discount: '0%', method: 'Online', amount: 8240, status: 'Completed' },
  { invoice: 'INV-2026-0840', cashier: 'Neel Shah', initials: 'NS', shade: 'lilac', store: 'Downtown Store', time: '10:15 AM', items: 3, discount: '8%', method: 'Cash', amount: 5690, status: 'Return recorded' },
  { invoice: 'INV-2026-0839', cashier: 'Maya Das', initials: 'MD', shade: 'blue', store: 'West End Outlet', time: '09:56 AM', items: 6, discount: '10%', method: 'Card', amount: 16850, status: 'Completed' },
  { invoice: 'INV-2026-0838', cashier: 'Kabir Rao', initials: 'KR', shade: 'mint', store: 'North Mall', time: '09:41 AM', items: 1, discount: '0%', method: 'Cash', amount: 2340, status: 'Cancelled' },
  { invoice: 'INV-2026-0837', cashier: 'Ravi Menon', initials: 'RM', shade: 'rose', store: 'Downtown Store', time: '09:22 AM', items: 5, discount: '5%', method: 'Online', amount: 9120, status: 'Completed' },
  { invoice: 'INV-2026-0836', cashier: 'Maya Das', initials: 'MD', shade: 'sand', store: 'West End Outlet', time: '09:04 AM', items: 2, discount: '0%', method: 'Card', amount: 4760, status: 'Completed' },
] as SaleRow[];

const transfers = [
  { id: 'TR-2026-0314', from: 'Central Warehouse', to: 'Downtown Store', status: 'In transit', detail: '58 of 72 units dispatched', tone: 'transit', stage: 2 },
  { id: 'TR-2026-0312', from: 'North Warehouse', to: 'West End Outlet', status: 'Pending approval', detail: '24 units requested', tone: 'pending', stage: 1 },
  { id: 'TR-2026-0310', from: 'Central Warehouse', to: 'North Mall', status: 'Receipt check', detail: '2 units need reconciliation', tone: 'issue', stage: 3 },
];
/** Transfer workflow: approval → dispatch → receipt confirmation. */
const TRANSFER_STAGES = 3;

const chartSets = {
  '7 days': { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: [38, 52, 46, 69, 61, 84, 76], previous: [28, 39, 35, 43, 48, 62, 54], total: 248650, change: '+12.8%' },
  '30 days': { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'], values: [42, 61, 54, 78, 88], previous: [31, 46, 43, 58, 62], total: 984320, change: '+9.6%' },
  '90 days': { labels: ['Aug', 'Sep', 'Oct', 'Nov'], values: [46, 59, 72, 88], previous: [36, 45, 54, 62], total: 2842180, change: '+15.2%' },
};

type Period = keyof typeof chartSets;

const statusTabs: Array<{ label: string; value: 'All' | SaleStatus }> = [
  { label: 'All', value: 'All' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
  { label: 'Returns', value: 'Return recorded' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    rupee: <><path d="M7 5h10M7 9.5h10M10 5c5 0 5 9 0 9H7l7 6" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    transfer: <><path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
    check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>,
    wifi: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.box}</svg>;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatUnits(amount: number) {
  return new Intl.NumberFormat('en-IN').format(amount);
}

/** Smooth S-curve through points (horizontal tangents), as in the reference chart. */
function smoothPath(points: Array<[number, number]>) {
  if (!points.length) return '';
  return points.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = points[i - 1];
    const mid = (x - px) / 2;
    return `${d} C${px + mid},${py} ${x - mid},${y} ${x},${y}`;
  }, '');
}

// Sales chart geometry (SVG user units). Same value→₹ mapping as before: 94.3 ≈ ₹3L.
const CHART = { width: 640, height: 250, left: 44, right: 500, base: 214, scale: 1.85 };
const GRID = [
  { label: '₹0', value: 0 },
  { label: '₹1L', value: 31.4 },
  { label: '₹2L', value: 62.9 },
  { label: '₹3L', value: 94.3 },
];
const yFor = (value: number) => CHART.base - value * CHART.scale;

function formatCompactMoney(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(amount);
}

type Segment = { label: string; value: number; color: string; display: string };

/** Net sales: stacked share bar + legend (by store, or this store vs the rest of the network). */
function SalesSplit({ segments, caption }: { segments: Segment[]; caption: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return <div className={styles.miniEmpty}>No retail sales in this scope</div>;
  return (
    <div className={styles.miniChart}>
      <small className={styles.miniCaption}>{caption}</small>
      <div className={styles.splitBar} role="img" aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
        {segments.map((s) => <i key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.display}`} />)}
      </div>
      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.label}><i style={{ background: s.color }} /><span>{s.label}</span><b>{s.display}</b></li>
        ))}
      </ul>
    </div>
  );
}

/** Completed invoices: payment-method mix donut with the average invoice value in the centre. */
function PaymentDonut({ segments, centre, centreLabel }: { segments: Segment[]; centre: string; centreLabel: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return <div className={styles.miniEmpty}>No invoices in this scope</div>;
  const r = 27;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={`${styles.miniChart} ${styles.donutWrap}`}>
      <svg viewBox="0 0 72 72" className={styles.donut} role="img" aria-label={`Payment mix: ${segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}`}>
        <circle cx="36" cy="36" r={r} className={styles.donutTrack} />
        {segments.map((s) => {
          const len = (s.value / total) * circ;
          const el = <circle key={s.label} cx="36" cy="36" r={r} stroke={s.color} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} className={styles.donutSeg}><title>{`${s.label}: ${s.display}`}</title></circle>;
          offset += len;
          return el;
        })}
        <text x="36" y="35" textAnchor="middle" className={styles.donutValue}>{centre}</text>
        <text x="36" y="46" textAnchor="middle" className={styles.donutLabel}>{centreLabel}</text>
      </svg>
      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.label}><i style={{ background: s.color }} /><span>{s.label}</span><b>{Math.round((s.value / total) * 100)}%</b></li>
        ))}
      </ul>
    </div>
  );
}

/** Low stock: severity meters for variants needing attention. */
function AttentionMeters({ rows }: { rows: Array<{ label: string; value: number; color: string; hint: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={styles.miniChart}>
      <small className={styles.miniCaption}>Variants needing action</small>
      <div className={styles.meters}>
        {rows.map((row) => (
          <div key={row.label} className={styles.meter} title={row.hint}>
            <div className={styles.meterTop}><span>{row.label}</span><b>{row.value}</b></div>
            <div className={styles.meterTrack}><i style={{ width: `${row.value ? Math.max(6, (row.value / max) * 100) : 0}%`, background: row.color }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '7 days', label: 'Last 7 days' },
  { value: '30 days', label: 'Last 30 days' },
  { value: '90 days', label: 'Last 90 days' },
];

/** Same lock and behaviour as the location dropdown in the top bar. */
function PeriodDropdown({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = PERIOD_OPTIONS.find((option) => option.value === value) ?? PERIOD_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.dropdown} ref={wrapRef}>
      <button type="button" className={styles.dropdownButton} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label="Sales summary period">
        <Icon name="clock" size={14} />
        <span>{current.label}</span>
        <span className={styles.dropdownCaret}>▼</span>
      </button>
      {open && (
        <div className={styles.dropdownMenu} role="listbox" aria-label="Sales summary period">
          <div className={styles.dropdownHeading}>REPORTING PERIOD</div>
          {PERIOD_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.dropdownItem} ${selected ? styles.dropdownItemActive : ''}`}
                onClick={() => { onChange(option.value); setOpen(false); }}
              >
                <span>{option.label}</span>
                {selected && <span className={styles.dropdownCheck}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [scope, setScope] = useState<LocationScope>('All retail locations');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [period, setPeriod] = useState<Period>('7 days');
  const [filter, setFilter] = useState<'All' | SaleStatus>('All');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const metrics = locationMetrics[scope];
  const stock = stockByLocation[scope];
  const activeChart = chartSets[period];
  const scopedTransfers = useMemo(() => transfers.filter((transfer) => scope === 'All retail locations' || transfer.from === scope || transfer.to === scope), [scope]);
  const visibleSales = useMemo(() => sales.filter((sale) => (scope === 'All retail locations' || sale.store === scope)
    && (filter === 'All' || sale.status === filter)
    && `${sale.invoice} ${sale.cashier} ${sale.store}`.toLowerCase().includes(search.toLowerCase())), [filter, scope, search]);
  const transactionTotal = useMemo(() => sales.filter((sale) => scope === 'All retail locations' || sale.store === scope).length, [scope]);
  const stockTotal = stock.available + stock.inTransit + stock.reserved + stock.quarantined;
  const receiptsToReview = scopedTransfers.filter((transfer) => transfer.tone === 'issue').length;

  // Net sales split: by store across the network, or this store vs. the other stores.
  const storeColors = ['#34558a', '#44679f', '#a9bfdf'];
  const networkSales = locationMetrics['All retail locations'].sales;
  const salesSegments: Segment[] = scope === 'All retail locations'
    ? (['Downtown Store', 'North Mall', 'West End Outlet'] as const).map((store, i) => ({ label: store, value: locationMetrics[store].sales, color: storeColors[i], display: formatCompactMoney(locationMetrics[store].sales) }))
    : metrics.sales
      ? [
          { label: scope, value: metrics.sales, color: storeColors[0], display: formatCompactMoney(metrics.sales) },
          { label: 'Other stores', value: networkSales - metrics.sales, color: storeColors[2], display: formatCompactMoney(networkSales - metrics.sales) },
        ]
      : [];

  // Payment mix of the (sample) invoices in scope, plus average invoice value.
  const scopedSales = sales.filter((sale) => scope === 'All retail locations' || sale.store === scope);
  const paymentColors: Record<SaleRow['method'], string> = { Card: '#7c3aed', Online: '#a78bfa', Cash: '#4c1d95' };
  const paymentSegments: Segment[] = (['Card', 'Online', 'Cash'] as const).map((method) => {
    const count = scopedSales.filter((sale) => sale.method === method).length;
    return { label: method, value: count, color: paymentColors[method], display: `${count} invoices` };
  });
  const avgInvoice = metrics.invoices ? metrics.sales / metrics.invoices : 0;
  useEffect(() => {
    setSession(getStoredSession());
    const syncScope = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (locations.includes(next as LocationScope)) setScope(next as LocationScope);
    };
    window.addEventListener('premium-retail-location-change', syncScope);
    return () => window.removeEventListener('premium-retail-location-change', syncScope);
  }, []);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Reset the chart marker when the period changes (label count differs).
  useEffect(() => setHoverIndex(null), [period]);

  function downloadReport() {
    const rows = [
      ['Invoice', 'Cashier', 'Location', 'Time', 'Items', 'Discount', 'Payment method', 'Net total', 'Status'],
      ...visibleSales.map((sale) => [sale.invoice, sale.cashier, sale.store, sale.time, String(sale.items), sale.discount, sale.method, formatMoney(sale.amount), sale.status]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n');
    const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'premium-retail-demo-sales.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  const firstName = (session?.user?.name || session?.user?.email?.split('@')[0] || 'Sam Morgan').split(' ')[0];

  const stockCards = [
    { label: 'Available', value: stock.available, description: 'Ready to sell or dispatch', icon: 'check', tone: styles.toneGreen },
    { label: 'In transit', value: stock.inTransit, description: 'Dispatched, not yet received', icon: 'transfer', tone: styles.toneBlue },
    { label: 'Reserved', value: stock.reserved, description: 'Allocated to operations', icon: 'lock', tone: styles.toneAmber },
    { label: 'Quarantined', value: stock.quarantined, description: 'Held for inspection', icon: 'alert', tone: styles.toneRed },
  ];

  // ---- Sales chart geometry ----
  const count = activeChart.values.length;
  const xFor = (index: number) => CHART.left + index * ((CHART.right - CHART.left) / Math.max(count - 1, 1));
  const currentPts = activeChart.values.map((v, i) => [xFor(i), yFor(v)] as [number, number]);
  const previousPts = activeChart.previous.map((v, i) => [xFor(i), yFor(v)] as [number, number]);
  const marker = hoverIndex ?? Math.floor((count - 1) / 2);
  const markerValue = activeChart.values[marker];
  const markerPrev = activeChart.previous[marker];
  const markerChange = markerPrev ? ((markerValue - markerPrev) / markerPrev) * 100 : 0;
  let tagCurrentY = currentPts[count - 1][1];
  let tagPreviousY = previousPts[count - 1][1];
  if (Math.abs(tagCurrentY - tagPreviousY) < 32) {
    const mid = (tagCurrentY + tagPreviousY) / 2;
    tagCurrentY = mid - 16;
    tagPreviousY = mid + 16;
  }
  const tooltipX = Math.min(Math.max(xFor(marker), CHART.left + 56), CHART.right - 56);
  const currentTotal = Math.round(activeChart.total * metrics.factor);
  const priorTotal = Math.round(currentTotal / (1 + parseFloat(activeChart.change) / 100));
  const tooltipY = Math.max(yFor(markerValue) - 54, 2);

  return (
    <main className={styles.dashboard}>
      {/* ---------- Greeting header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Good to see you again, {firstName}!</h1>
          <p>Here&apos;s what&apos;s happening across {scope === 'All retail locations' ? 'your retail locations' : scope} today.</p>
        </div>
        <div className={styles.headerActions}>
          {searchOpen && (
            <label className={styles.headerSearch}>
              <Icon name="search" size={15} />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }}
                placeholder="Search invoices, cashiers…"
                aria-label="Search invoices"
              />
            </label>
          )}
          <a className={styles.circleButton} href="/reports" aria-label="Open live in-app operational alerts" title="Live operational alerts"><Icon name="bell" size={18} /></a>
          <button className={`${styles.circleButton} ${searchOpen ? styles.circleActive : ''}`} type="button" onClick={() => setSearchOpen((open) => !open)} aria-label="Search invoices" aria-expanded={searchOpen} title="Search invoices"><Icon name="search" size={18} /></button>
          <a className={styles.circleButton} href="/operations" aria-label="Open transfers and logistics" title="Transfers & logistics"><Icon name="transfer" size={18} /></a>
          <button className={styles.primaryButton} type="button" onClick={downloadReport}>Export report</button>
        </div>
      </header>

      {/* ---------- Gradient stat cards ---------- */}
      <section className={styles.statsGrid} aria-label="Retail operations summary">
        <article className={`${styles.statCard} ${styles.statTeal}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}>
              <span className={styles.statIcon}><Icon name="rupee" size={16} /></span>
              <h3>Net Sales Today</h3>
            </div>
            <strong className={styles.statValue}>{formatMoney(metrics.sales)}</strong>
            <div className={styles.statMeta}>
              <span className={styles.deltaUp}>↗ 12.8%</span>
              <span>vs. previous day</span>
            </div>
          </div>
          <SalesSplit segments={salesSegments} caption={scope === 'All retail locations' ? 'Sales by store' : 'Share of network sales'} />
        </article>

        <article className={`${styles.statCard} ${styles.statBlue}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}>
              <span className={styles.statIcon}><Icon name="receipt" size={16} /></span>
              <h3>Completed Invoices</h3>
            </div>
            <strong className={styles.statValue}>{formatUnits(metrics.invoices)}</strong>
            <div className={styles.statMeta}>
              <span className={styles.deltaUp}>↗ 8.4%</span>
              <span>vs. previous day</span>
            </div>
          </div>
          <PaymentDonut segments={paymentSegments} centre={formatCompactMoney(avgInvoice)} centreLabel="avg / bill" />
        </article>

        <article className={`${styles.statCard} ${styles.statPink}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}>
              <span className={styles.statIcon}><Icon name="box" size={16} /></span>
              <h3>Low Stock Variants</h3>
            </div>
            <strong className={styles.statValue}>{metrics.lowStock} <small>variants</small></strong>
            <div className={styles.statMeta}>
              <span className={styles.deltaWarn}>Reorder attention</span>
              <a href="/operations" className={styles.statLink}>Review <Icon name="arrow" size={12} /></a>
            </div>
          </div>
          <AttentionMeters rows={[
            { label: 'Below reorder level', value: metrics.lowStock, color: '#f59e0b', hint: 'Variants at or below their reorder threshold' },
            { label: 'Negative balance', value: metrics.negative, color: '#dc2626', hint: 'Available ledger balance below zero' },
          ]} />
        </article>
      </section>

      {/* ---------- Stock by state + Sales summary ---------- */}
      <section className={styles.middleGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Stock by State</h2>
              <p>Total in scope = {formatUnits(stockTotal)} base units</p>
            </div>
            <a className={styles.outlineButton} href="/operations"><Icon name="plus" size={14} /> Open ledger</a>
          </div>
          <div className={styles.stockGrid}>
            {stockCards.map((card) => (
              <div className={styles.stockCard} key={card.label}>
                <div className={styles.stockCardTop}>
                  <span className={`${styles.stockIcon} ${card.tone}`}><Icon name={card.icon} size={15} /></span>
                  <span className={styles.stockLabel}>{card.label}</span>
                  <span className={styles.stockShare}>{stockTotal ? Math.round((card.value / stockTotal) * 100) : 0}%</span>
                </div>
                <strong>{formatUnits(card.value)} <small>units</small></strong>
                <span className={`${styles.stockDescription} ${card.tone}`}>{card.description}</span>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Sales Summary</h2>
              <p>Net sales <b>{formatMoney(currentTotal)}</b> · <span className={styles.positive}>{activeChart.change}</span> vs. prior {period} ({formatMoney(priorTotal)})</p>
            </div>
            <PeriodDropdown value={period} onChange={setPeriod} />
          </div>
          <svg className={styles.chart} viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={`Sales summary for the last ${period}`} onMouseLeave={() => setHoverIndex(null)}>
            {GRID.map((g) => (
              <g key={g.label}>
                <text x={CHART.left - 12} y={yFor(g.value) + 4} textAnchor="end" className={styles.axisText}>{g.label}</text>
              </g>
            ))}
            {activeChart.labels.map((label, i) => (
              <text key={label} x={xFor(i)} y={CHART.height - 6} textAnchor="middle" className={`${styles.axisText} ${i === marker ? styles.axisActive : ''}`}>{label}</text>
            ))}
            <line x1={xFor(marker)} x2={xFor(marker)} y1={14} y2={CHART.base} className={styles.markerLine} />
            <path d={`M${xFor(marker) - 5},8 h10 l-5,7 z`} className={styles.markerCap} />
            <path d={`M${xFor(marker) - 5},${CHART.base + 7} h10 l-5,-7 z`} className={styles.markerCap} />
            <path d={smoothPath(previousPts)} className={styles.previousLine} />
            <path d={smoothPath(currentPts)} className={styles.currentLine} />
            <circle cx={xFor(marker)} cy={yFor(markerValue)} r="7" className={styles.markerDot} />
            <g transform={`translate(${tooltipX - 56} ${tooltipY})`} className={styles.tooltip}>
              <rect width="112" height="40" rx="6" />
              <text x="56" y="16" textAnchor="middle">{activeChart.labels[marker]} · Net sales</text>
              <text x="56" y="32" textAnchor="middle" className={markerChange >= 0 ? styles.tooltipChange : styles.tooltipDown}>{markerChange >= 0 ? '+' : ''}{markerChange.toFixed(1)}% vs prior</text>
            </g>
            <g transform={`translate(${CHART.right + 12} ${tagCurrentY - 13})`}>
              <rect width="116" height="26" rx="6" className={styles.tagCurrent} />
              <text x="58" y="17" textAnchor="middle" className={styles.tagText}>Net sales</text>
            </g>
            <g transform={`translate(${CHART.right + 12} ${tagPreviousY - 13})`}>
              <rect width="116" height="26" rx="6" className={styles.tagPrevious} />
              <text x="58" y="17" textAnchor="middle" className={styles.tagText}>Prior {period}</text>
            </g>
            {activeChart.labels.map((label, i) => (
              <rect key={`hit-${label}`} x={xFor(i) - (CHART.right - CHART.left) / Math.max(count - 1, 1) / 2} y={0} width={(CHART.right - CHART.left) / Math.max(count - 1, 1)} height={CHART.height} fill="transparent" onMouseEnter={() => setHoverIndex(i)} />
            ))}
          </svg>
        </article>
      </section>

      {/* ---------- Recent invoices + Transfers / safeguards ---------- */}
      <section className={styles.bottomGrid}>
        <article className={styles.panel} id="recent-invoices">
          <div className={styles.panelHead}>
            <div>
              <h2>Recent Invoices <span className={styles.demoPill}>SAMPLE DATA · NOT LIVE</span></h2>
            </div>
            <div className={styles.tabs} role="tablist" aria-label="Filter invoices by status">
              {statusTabs.map((tab) => (
                <button key={tab.value} type="button" role="tab" aria-selected={filter === tab.value} className={filter === tab.value ? styles.tabActive : ''} onClick={() => setFilter(tab.value)}>{tab.label}</button>
              ))}
            </div>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Invoice</th><th>Payment</th><th>Location</th><th className={styles.right}>Net total</th></tr></thead>
              <tbody>
                {visibleSales.map((sale) => (
                  <tr key={sale.invoice}>
                    <td><span className={styles.invoiceCell}><i className={`${styles.avatar} ${styles[sale.shade]}`}>{sale.initials}</i><span><strong>{sale.invoice}</strong><small>{sale.cashier}</small></span></span></td>
                    <td><span className={styles.cellStack}><span>{sale.method}</span><small>{sale.items} items · {sale.discount} discount</small></span></td>
                    <td><span className={styles.cellStack}><span>{sale.store}</span><small>{sale.time}</small></span></td>
                    <td className={styles.right}><span className={styles.cellStack}><span className={sale.status === 'Completed' ? styles.amountIn : styles.amountOut}>{sale.status === 'Completed' ? '+' : ''}{formatMoney(sale.amount)}</span><small>{sale.status}</small></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleSales.length === 0 && <div className={styles.noResults}>No invoices match this location, filter, or search.</div>}
          </div>
          <div className={styles.tableFooter}>Showing <strong>{visibleSales.length}</strong> of <strong>{transactionTotal}</strong> sample invoices</div>
        </article>

        <div className={styles.sideColumn}>
          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Transfers &amp; Replenishment</h2>
                <p>Stock stays unavailable at the destination until receipt is confirmed.</p>
              </div>
              <a className={styles.accentButton} href="/operations">View all</a>
            </div>
            <div className={styles.transferSummary}>
              <span>Pending approval <b>5</b></span>
              <span>In transit <b>{metrics.inTransit}</b></span>
              <span>Receipt checks <b className={styles.warningText}>2</b></span>
            </div>
            <div className={styles.goalList}>
              {scopedTransfers.map((transfer) => {
                const pct = Math.round((transfer.stage / TRANSFER_STAGES) * 100);
                return (
                  <div className={styles.goalRow} key={transfer.id}>
                    <span className={`${styles.goalIcon} ${styles[transfer.tone]}`}><Icon name="transfer" size={18} /></span>
                    <div className={styles.goalInfo}>
                      <div className={styles.goalTop}>
                        <span><small>{transfer.id} · {transfer.from} → {transfer.to}</small><strong>{transfer.status}</strong></span>
                        <b>{pct}%</b>
                      </div>
                      <div className={styles.goalTrack}><i className={styles[transfer.tone]} style={{ width: `${pct}%` }} /></div>
                      <small className={styles.goalDetail}>Stage {transfer.stage} of {TRANSFER_STAGES} · {transfer.detail}</small>
                    </div>
                  </div>
                );
              })}
              {scopedTransfers.length === 0 && <div className={styles.noResults}>No transfers for this location.</div>}
            </div>
          </article>

          <article className={styles.panel} id="operational-safeguards">
            <div className={styles.panelHead}>
              <div>
                <h2>Operational Safeguards</h2>
                <p>Connection, receipt, and stock exception indicators</p>
              </div>
              <a className={styles.outlineButton} href="/">Open POS <Icon name="arrow" size={13} /></a>
            </div>
            <div className={styles.goalList}>
              <div className={styles.safeRow}>
                <span className={styles.goalIcon}><Icon name="wifi" size={17} /></span>
                <span className={styles.safeInfo}><strong>POS connection</strong><small>{isOnline === null ? 'Checking browser connection' : isOnline ? 'This browser is online · queue details in POS' : 'Offline · open POS to review queued sales'}</small></span>
                <b className={isOnline === null ? '' : isOnline ? styles.goodText : styles.warningText}>{isOnline === null ? '—' : isOnline ? 'Online' : 'Offline'}</b>
              </div>
              <div className={styles.safeRow}>
                <span className={styles.goalIcon}><Icon name="transfer" size={17} /></span>
                <span className={styles.safeInfo}><strong>Receipt reconciliation</strong><small>Transfers awaiting a receipt review</small></span>
                <b className={receiptsToReview ? styles.warningText : styles.goodText}>{receiptsToReview}</b>
              </div>
              <div className={styles.safeRow}>
                <span className={styles.goalIcon}><Icon name="shield" size={17} /></span>
                <span className={styles.safeInfo}><strong>Stock variance warnings</strong><small>Negative available balances in this scope</small></span>
                <b className={metrics.negative ? styles.warningText : styles.goodText}>{metrics.negative}</b>
              </div>
            </div>
          </article>
        </div>
      </section>

      <footer className={styles.footer}><span>© 2026 Premium Retail</span><span>Demo dashboard concept · mock data only · not connected to live records</span><a href="/operations">Open test bench <Icon name="arrow" size={13} /></a></footer>
    </main>
  );
}
