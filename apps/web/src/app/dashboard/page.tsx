'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';

type LocationScope = 'All retail locations' | 'Downtown Store' | 'North Mall' | 'West End Outlet';
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

const locations: LocationScope[] = ['All retail locations', 'Downtown Store', 'North Mall', 'West End Outlet'];

const locationMetrics: Record<LocationScope, { sales: number; invoices: number; lowStock: number; negative: number; inTransit: number; factor: number }> = {
  'All retail locations': { sales: 248650, invoices: 1284, lowStock: 18, negative: 3, inTransit: 6, factor: 1 },
  'Downtown Store': { sales: 92140, invoices: 437, lowStock: 7, negative: 1, inTransit: 3, factor: 0.37 },
  'North Mall': { sales: 77860, invoices: 396, lowStock: 5, negative: 1, inTransit: 2, factor: 0.31 },
  'West End Outlet': { sales: 78650, invoices: 451, lowStock: 6, negative: 1, inTransit: 1, factor: 0.32 },
};

const stockByLocation: Record<LocationScope, { available: number; inTransit: number; reserved: number; quarantined: number }> = {
  'All retail locations': { available: 8420, inTransit: 760, reserved: 310, quarantined: 84 },
  'Downtown Store': { available: 3110, inTransit: 210, reserved: 90, quarantined: 16 },
  'North Mall': { available: 2560, inTransit: 305, reserved: 80, quarantined: 31 },
  'West End Outlet': { available: 2750, inTransit: 245, reserved: 140, quarantined: 37 },
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
  { id: 'TR-2026-0314', from: 'Central Warehouse', to: 'Downtown Store', status: 'In transit', detail: '58 of 72 units dispatched', tone: 'transit' },
  { id: 'TR-2026-0312', from: 'North Warehouse', to: 'West End Outlet', status: 'Pending approval', detail: '24 units requested', tone: 'pending' },
  { id: 'TR-2026-0310', from: 'Central Warehouse', to: 'North Mall', status: 'Receipt check', detail: '2 units need reconciliation', tone: 'issue' },
];

const chartSets = {
  '7 days': { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: [38, 52, 46, 69, 61, 84, 76], previous: [28, 39, 35, 43, 48, 62, 54], total: 248650, change: '+12.8%' },
  '30 days': { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'], values: [42, 61, 54, 78, 88], previous: [31, 46, 43, 58, 62], total: 984320, change: '+9.6%' },
  '90 days': { labels: ['Aug', 'Sep', 'Oct', 'Nov'], values: [46, 59, 72, 88], previous: [36, 45, 54, 62], total: 2842180, change: '+15.2%' },
};

type Period = keyof typeof chartSets;

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    transfer: <><path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    chart: <><path d="M4 20V11M10 20V5M16 20v-8M22 20H2" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    filter: <><path d="M4 5h16l-6.3 7.2v5.3l-3.4 1.7v-7z" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    warehouse: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="M7 11h2m3 0h2m3 0h1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

function chartPoints(values: number[]) {
  const width = 700;
  const height = 200;
  const xGap = width / Math.max(values.length - 1, 1);
  return values.map((value, index) => `${index * xGap},${height - value * 1.75}`).join(' ');
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatUnits(amount: number) {
  return new Intl.NumberFormat('en-IN').format(amount);
}

export default function DashboardPage() {
  const [scope, setScope] = useState<LocationScope>('All retail locations');
  const [period, setPeriod] = useState<Period>('7 days');
  const [filter, setFilter] = useState<'All' | SaleStatus>('All');
  const [search, setSearch] = useState('');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
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

  const stockRows = [
    { label: 'Available', value: stock.available, className: styles.availableBar, description: 'Ready to sell or dispatch' },
    { label: 'In transit', value: stock.inTransit, className: styles.transitBar, description: 'Dispatched, not yet received' },
    { label: 'Reserved', value: stock.reserved, className: styles.reservedBar, description: 'Allocated to operations' },
    { label: 'Quarantined', value: stock.quarantined, className: styles.quarantineBar, description: 'Held for inspection' },
  ];

  return (
    <main className={`${styles.dashboard} ${navCollapsed ? styles.navCollapsed : ''}`}>
      <header className={styles.referenceHeader}>
        <div className={styles.referenceBrand}><button className={styles.sidebarToggle} type="button" onClick={() => setNavCollapsed((collapsed) => !collapsed)} aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-controls="retail-sidebar" aria-expanded={!navCollapsed} title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><span aria-hidden="true">{navCollapsed ? '›' : '‹'}</span></button><span className={styles.referenceBrandMark}>P</span><strong>Premium Retail</strong><span className={styles.referenceDivider}>/</span><span>Store operations</span></div>
        <div className={styles.referenceHeaderRight}><span className={styles.headerStatus}><i /> DEMO WORKSPACE</span><span>Local sample data</span></div>
      </header>
      <aside className={styles.sidebar} id="retail-sidebar">
        <a className={styles.brand} href="/dashboard"><span className={styles.brandMark}>P</span><span><strong>Premium Retail</strong><small>RETAIL OPERATIONS</small></span></a>
        <label className={styles.storeSwitch} title="Choose a location">
          <span className={styles.storeIcon}><Icon name="pin" size={17} /></span>
          <span className={styles.storePicker}>
            <small>VIEWING LOCATION</small>
            <span className={styles.storeSelectWrap}>
              <select value={scope} onChange={(event) => setScope(event.target.value as LocationScope)} aria-label="Location scope">
                {locations.map((location) => <option key={location}>{location}</option>)}
              </select>
              <span className={styles.storeChevron} aria-hidden="true">⌄</span>
            </span>
            <span className={styles.locationHint}>Sales and stock in this view</span>
          </span>
        </label>
        <div className={styles.navLabel}>WORKSPACE</div>
        <nav className={styles.nav} aria-label="Main navigation">
          <a className={styles.navItem + ' ' + styles.active} href="/dashboard" title="Dashboard"><Icon name="grid" />Dashboard</a>
          <a className={styles.navItem} href="/" title="Sales and POS terminal"><Icon name="receipt" />Sales</a>
          <a className={styles.navItem} href="#recent-invoices" title="Recent invoices"><Icon name="receipt" />Invoices</a>
          <a className={styles.navItem} href="/products" title="Inventory"><Icon name="box" />Inventory</a>
          <a className={styles.navItem} href="/audits" title="Stock audits"><Icon name="shield" />Stock audits</a>
          <a className={styles.navItem} href="/operations" title="Transfers"><Icon name="transfer" />Transfers</a>
          <a className={styles.navItem} href="/operations" title="Warehouse operations"><Icon name="warehouse" />Warehouse</a>
          <button className={styles.navItem} type="button" title="Export sales report" onClick={downloadReport}><Icon name="chart" />Reports</button>
          <div className={styles.navLabel}>SETTINGS & CONTROLS</div>
          <a className={styles.navItem} href="/admin/discount-limits" title="Discount limits"><Icon name="chart" />Discount limits</a>
          <a className={styles.navItem} href="/admin/sales-permissions" title="Sale permissions"><Icon name="shield" />Sale permissions</a>
          <a className={styles.navItem} href="/sales-controls" title="Returns and cancellations"><Icon name="settings" />Returns & cancellations</a>
        </nav>
        <div className={styles.sidebarPromo}>
          <div className={styles.promoIcon}><Icon name="grid" size={16} /></div>
          <strong>Sample workspace</strong>
          <p>Demo figures across three retail locations.</p>
          <a href="/operations">API test bench <Icon name="arrow" size={14} /></a>
        </div>
        <div className={styles.sidebarFooter}><span className={styles.avatar}>SM</span><span className={styles.sidebarUser}><strong>Sam Morgan</strong><small>Super Admin</small></span><small className={styles.sidebarUserMode}>Demo</small></div>
      </aside>

      <section className={styles.mainArea}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}><span className={styles.brandMark}>P</span><strong>Premium Retail</strong></div>
          <div className={styles.breadcrumb}><span>Retail operations</span><b>/</b><strong>Overview</strong></div>
          <label className={styles.globalSearch}><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoices, cashiers…" /><kbd>⌘ K</kbd></label>
          <a className={styles.notificationButton} href="#operational-safeguards" aria-label={`View ${metrics.lowStock + metrics.negative} inventory alerts`}><Icon name="bell" size={17}/>{metrics.lowStock + metrics.negative > 0 && <i/>}</a>
          <select className={styles.headerPeriod} value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Dashboard date range"><option>7 days</option><option>30 days</option><option>90 days</option></select>
          <button className={styles.headerExport} type="button" onClick={downloadReport}><Icon name="chart" size={14}/> Export</button>
          <div className={styles.profile}><span className={styles.avatar}>SM</span><span><strong>Sam Morgan</strong><small>Super Admin · demo view</small></span></div>
        </header>

        <div className={styles.content}>
          <div className={styles.pageHeading}><div><div className={styles.overline}>RETAIL OPERATIONS <span>·</span> {scope.toUpperCase()}</div><h1>Dashboard</h1><p>Sales, inventory, and store activity across your retail locations.</p></div><span className={styles.dateStamp}>Reporting period · {period}</span></div>

          <section className={styles.statsGrid} aria-label="Retail operations summary">
            <article className={styles.statCard}><div className={styles.statHead}><span>NET SALES TODAY</span><span className={`${styles.statIcon} ${styles.coral}`}><Icon name="receipt" size={17} /></span></div><strong className={styles.statValue}>{formatMoney(metrics.sales)}</strong><div className={styles.statFoot}><span className={styles.positive}>↗ 12.8%</span><span>vs. previous day</span><span className={styles.sparkline}><svg viewBox="0 0 72 25" aria-hidden="true"><path d="M2 20 13 15 23 18 34 9 45 13 56 5 70 3" /></svg></span></div></article>
            <article className={styles.statCard}><div className={styles.statHead}><span>COMPLETED INVOICES</span><span className={`${styles.statIcon} ${styles.blush}`}><Icon name="receipt" size={17} /></span></div><strong className={styles.statValue}>{formatUnits(metrics.invoices)}</strong><div className={styles.statFoot}><span className={styles.positive}>↗ 8.4%</span><span>vs. previous day</span><span className={styles.sparkline}><svg viewBox="0 0 72 25" aria-hidden="true"><path d="M2 18 13 19 23 12 34 15 45 7 56 9 70 3" /></svg></span></div></article>
            <article className={styles.statCard}><div className={styles.statHead}><span>LOW STOCK VARIANTS</span><span className={`${styles.statIcon} ${styles.alertIcon}`}><Icon name="box" size={17} /></span></div><strong className={styles.statValue}>{metrics.lowStock} <small>variants</small></strong><div className={styles.statFoot}><span className={styles.alertText}>Reorder attention</span><span>at or below threshold</span><a className={styles.viewLink} href="/operations">Review <Icon name="arrow" size={13} /></a></div></article>
            <article className={`${styles.statCard} ${styles.alertStat}`}><div className={styles.statHead}><span>NEGATIVE STOCK WARNINGS</span><span className={`${styles.statIcon} ${styles.alertIcon}`}><Icon name="shield" size={17} /></span></div><strong className={styles.statValue}>{metrics.negative} <small>variants</small></strong><div className={styles.statFoot}><span className={styles.alertText}>Review ledger balance</span><span>cashier warning policy</span></div></article>
          </section>

          <section className={styles.analyticsGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHead}><div><span className={styles.panelEyebrow}>SALES & INVOICES</span><h2>Sales summary</h2><p>Finalized sales for {scope.toLowerCase()}</p></div><select className={styles.periodSelect} value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Sales summary period"><option>7 days</option><option>30 days</option><option>90 days</option></select></div>
              <div className={styles.chartSummary}><strong>{formatMoney(Math.round(activeChart.total * metrics.factor))}</strong><span className={styles.positive}>{activeChart.change}</span><small>compared with previous period</small></div>
              <div className={styles.chartWrap}><div className={styles.yLabels}><span>₹3L</span><span>₹2L</span><span>₹1L</span><span>₹0</span></div><svg className={styles.chart} viewBox="0 0 700 210" preserveAspectRatio="none" role="img" aria-label={`Sales summary for the last ${period}`}><path className={styles.gridLine} d="M0 35H700M0 90H700M0 145H700M0 200H700" /><polygon points={`0,200 ${chartPoints(activeChart.values)} 700,200`} fill="#eaf0ff" /><polyline points={chartPoints(activeChart.previous)} className={styles.previousLine} /><polyline points={chartPoints(activeChart.values)} className={styles.currentLine} />{activeChart.values.map((value, index) => <circle key={activeChart.labels[index]} cx={index * (700 / Math.max(activeChart.values.length - 1, 1))} cy={200 - value * 1.75} r="3.5" className={styles.chartPoint} />)}</svg></div>
              <div className={styles.xLabels}>{activeChart.labels.map((label) => <span key={label}>{label}</span>)}</div>
              <div className={styles.chartLegend}><span><i className={styles.legendCurrent} /> This period</span><span><i className={styles.legendPrevious} /> Previous period</span></div>
            </article>

            <article className={`${styles.panel} ${styles.inventoryPanel}`}>
              <div className={styles.panelHead}><div><span className={styles.panelEyebrow}>LEDGER STOCK</span><h2>Stock by state</h2><p>{formatUnits(stockTotal)} base units in scope</p></div><a className={styles.panelMore} href="/operations" aria-label="Open inventory"><Icon name="box" size={16} /></a></div>
              <div className={styles.stockStateList}>{stockRows.map((row) => <div className={styles.stockStateRow} key={row.label}><div className={styles.stockStateTop}><span>{row.label}</span><strong>{formatUnits(row.value)} <small>{Math.round((row.value / stockTotal) * 100)}%</small></strong></div><div className={styles.stockTrack}><i className={row.className} style={{ width: `${Math.max(2, (row.value / stockTotal) * 100)}%` }} /></div><small className={styles.stockDescription}>{row.description}</small></div>)}</div>
              <div className={styles.stockFootnote}><span className={styles.stockAlertDot} /> Negative available balances: <strong>{metrics.negative} variants</strong></div>
              <a className={styles.panelLink} href="/operations">Open inventory ledger <Icon name="arrow" size={14} /></a>
            </article>
          </section>

          <section className={styles.bottomGrid}>
            <article className={`${styles.panel} ${styles.transferPanel}`}>
              <div className={styles.panelHead}><div><span className={styles.panelEyebrow}>WAREHOUSE OPERATIONS</span><h2>Transfers & replenishment</h2><p>Stock remains unavailable at the destination until receipt is confirmed.</p></div><a className={styles.panelLink} href="/operations">View all <Icon name="arrow" size={13} /></a></div>
              <div className={styles.transferSummary}><div><span>Pending approval</span><strong>5</strong></div><div><span>In transit</span><strong>{metrics.inTransit}</strong></div><div><span>Receipt checks</span><strong className={styles.warningNumber}>2</strong></div></div>
              <div className={styles.transferList}>{scopedTransfers.map((transfer) => <div className={styles.transferRow} key={transfer.id}><span className={styles.transferIcon}><Icon name="transfer" size={15} /></span><div className={styles.transferInfo}><strong>{transfer.id}</strong><span>{transfer.from} <b>→</b> {transfer.to}</span><small>{transfer.detail}</small></div><span className={`${styles.transferStatus} ${styles[transfer.tone]}`}>{transfer.status}</span></div>)}</div>
            </article>

            <article className={`${styles.panel} ${styles.controlsPanel}`} id="operational-safeguards">
              <div className={styles.panelHead}><div><span className={styles.panelEyebrow}>CONTROL & AUDIT SIGNALS</span><h2>Operational safeguards</h2><p>Connection, receipt, and stock exception indicators</p></div><Icon name="shield" size={18} /></div>
              <div className={styles.controlRows}>
                <div><span><i className={styles.controlIcon}><Icon name="bell" size={14} /></i><span><strong>POS connection</strong><small>{isOnline === null ? 'Checking browser connection' : isOnline ? 'This browser is online · queue details in POS' : 'Offline · open POS to review queued sales'}</small></span></span><b className={isOnline === null ? '' : isOnline ? styles.goodSignal : styles.offlineSignal}>{isOnline === null ? '—' : isOnline ? 'Online' : 'Offline'}</b></div>
                <div><span><i className={styles.controlIcon}><Icon name="transfer" size={14} /></i><span><strong>Receipt reconciliation</strong><small>Transfers awaiting a receipt review</small></span></span><b className={receiptsToReview ? styles.warningNumber : styles.goodSignal}>{receiptsToReview}</b></div>
                <div><span><i className={styles.controlIcon}><Icon name="shield" size={14} /></i><span><strong>Stock variance warnings</strong><small>Negative available balances in this scope</small></span></span><b className={metrics.negative ? styles.warningNumber : styles.goodSignal}>{metrics.negative}</b></div>
              </div>
              <a className={styles.panelLink} href="/">Open POS terminal <Icon name="arrow" size={14} /></a>
            </article>
          </section>

          <section className={styles.transactionsPanel} id="recent-invoices">
            <div className={styles.tableHeading}><div><span className={styles.panelEyebrow}>SAMPLE DATA · NOT LIVE</span><h2>Recent invoices <span className={styles.livePill}><i /> DEMO</span></h2><p>Cashier, location, discount, and payment summary</p></div><div className={styles.tableActions}><label className={styles.tableSearch}><Icon name="search" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice or cashier" /></label><label className={styles.filterWrap}><Icon name="filter" size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter invoices"><option>All</option><option>Completed</option><option>Cancelled</option><option>Return recorded</option></select><span>⌄</span></label></div></div>
            <div className={styles.tableScroller}><table className={styles.transactionTable}><thead><tr><th>INVOICE</th><th>LOCATION</th><th>CASHIER</th><th>ITEMS</th><th>DISCOUNT</th><th>PAYMENT</th><th>NET TOTAL</th><th>SALE STATUS</th></tr></thead><tbody>{visibleSales.map((sale) => <tr key={sale.invoice}><td><span className={styles.invoiceCode}>{sale.invoice}</span><small className={styles.tableSubline}>{sale.time}</small></td><td>{sale.store}</td><td><span className={styles.customerCell}><i className={`${styles.customerAvatar} ${styles[sale.shade]}`}>{sale.initials}</i><strong>{sale.cashier}</strong></span></td><td>{sale.items} items</td><td>{sale.discount}</td><td><span className={styles.paymentType}>{sale.method}</span></td><td className={styles.amount}>{formatMoney(sale.amount)}</td><td><span className={`${styles.status} ${sale.status === 'Completed' ? styles.completed : sale.status === 'Cancelled' ? styles.refunded : styles.processing}`}><i />{sale.status}</span></td></tr>)}</tbody></table>{visibleSales.length === 0 && <div className={styles.noResults}>No invoices match this location, filter, or search.</div>}</div>
            <div className={styles.tableFooter}><span>Showing <strong>{visibleSales.length ? 1 : 0}–{visibleSales.length}</strong> of <strong>{transactionTotal}</strong> sample invoices</span><div className={styles.pagination}><button disabled aria-label="Previous page">‹</button><button className={styles.pageActive}>1</button><button disabled aria-label="Next page">›</button></div></div>
          </section>
          <footer className={styles.footer}><span>© 2026 Premium Retail</span><span>Demo dashboard concept · mock data only · not connected to live records</span><a href="/operations">Open test bench <Icon name="arrow" size={13} /></a></footer>
        </div>
      </section>
    </main>
  );
}
