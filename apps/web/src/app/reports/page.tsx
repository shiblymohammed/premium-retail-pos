'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './reports.module.css';
import { Icon, formatInr, formatCompactInr, formatDay, type SalesSummary, type SalesDetails, type StockReport, type TableData } from './report-ui';
import { SalesView, InvoicesView, StockView, SpecializedView } from './report-views';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Location = { id: string; name: string; type: string };

type NotificationItem = {
  id: string;
  dedupeKey: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  href: string;
};

type Notifications = {
  generatedAt: string;
  total: number;
  unread: number;
  items: NotificationItem[];
};

type ReportKind =
  | 'overview'
  | 'sales'
  | 'salesDetails'
  | 'stock'
  | 'lowStock'
  | 'ledger'
  | 'transferDiscrepancies'
  | 'auditVariances'
  | 'priceChanges'
  | 'cancellations'
  | 'itemDeletions';

type RangePreset = 'last7' | 'last30' | 'custom';

const SHARE_COLORS = ['#3e64a0', '#7f9cc9', '#c3d2e8', '#dce5f2'];

const REPORT_TABS: Array<{ key: ReportKind; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales' },
  { key: 'salesDetails', label: 'Invoices' },
  { key: 'stock', label: 'Stock' },
  { key: 'lowStock', label: 'Low stock' },
  { key: 'ledger', label: 'Movements' },
  { key: 'transferDiscrepancies', label: 'Transfers' },
  { key: 'auditVariances', label: 'Audits' },
  { key: 'priceChanges', label: 'Price history' },
  { key: 'cancellations', label: 'Voided sales' },
  { key: 'itemDeletions', label: 'Deletions' },
];

const REPORT_GROUPS: Array<{ label: string; keys: ReportKind[] }> = [
  { label: 'Overview', keys: ['overview'] },
  { label: 'Sales', keys: ['sales', 'salesDetails', 'cancellations', 'itemDeletions'] },
  { label: 'Inventory', keys: ['stock', 'lowStock', 'ledger', 'priceChanges'] },
  { label: 'Operations', keys: ['transferDiscrepancies', 'auditVariances'] },
];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function pdfSafe(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/₹/g, 'INR ').replace(/[→➜]/g, '->').replace(/[•·]/g, '-').replace(/[^\x20-\x7E]/g, '?');
}

function downloadPdf(title: string, description: string, headers: string[], rows: unknown[][], filename: string) {
  const wrap = (value: string, width: number) => {
    const words = pdfSafe(value).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (word.length > width) {
        if (line) lines.push(line);
        for (let offset = 0; offset < word.length; offset += width) lines.push(word.slice(offset, offset + width));
        line = '';
      } else if (!line) line = word;
      else if (`${line} ${word}`.length <= width) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const lines = [`PREMIUM RETAIL - ${pdfSafe(title)}`, pdfSafe(description), `Period: ${filename.match(/\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}/)?.[0]?.replace('-to-', ' through ') ?? 'Selected filters'}`, `Rows: ${rows.length}`, ''];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}.`);
    row.forEach((value, column) => {
      const label = headers[column] ?? `Field ${column + 1}`;
      wrap(`${label}: ${String(value ?? '')}`, 115).forEach((line, lineIndex) => lines.push(`${lineIndex ? '   ' : '   '}${line}`));
    });
    lines.push('');
  });

  const pages: string[][] = [];
  for (let offset = 0; offset < lines.length; offset += 46) pages.push(lines.slice(offset, offset + 46));
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const addObject = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = pages.map((pageLines, pageIndex) => {
    const contentLines = [...pageLines, '', `Page ${pageIndex + 1} of ${pages.length}`];
    const text = `BT\n/F1 8 Tf\n36 555 Td\n11 TL\n${contentLines.map((line) => `(${pdfSafe(line).replace(/[\\()]/g, '\\$&')}) Tj\nT*`).join('\n')}\nET`;
    const stream = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
    const contentId = addObject(stream);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdfDocument = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => { offsets.push(pdfDocument.length); pdfDocument += `${object}\nendobj\n`; });
  const xrefOffset = pdfDocument.length;
  pdfDocument += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  
  const url = URL.createObjectURL(new Blob([pdfDocument], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = filename.replace(/\.csv$/, '.pdf'); link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState<ReportKind>('overview');

  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [salesDetails, setSalesDetails] = useState<SalesDetails | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);

  const [notifications, setNotifications] = useState<Notifications | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [alertError, setAlertError] = useState('');
  const [alertRetry, setAlertRetry] = useState(0);
  const [tableData, setTableData] = useState<TableData | null>(null);

  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close the export menu on outside click / Escape
  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => { if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey); };
  }, [exportOpen]);

  // Sync selected location from global app frame if present
  useEffect(() => {
    const authSession = getStoredSession();
    if (authSession?.accessToken) {
      setToken(authSession.accessToken);
    }
    setRole(authSession?.user?.role ?? '');

    const stored = window.localStorage.getItem('premium-retail-location-scope');
    // Global location selection is applied by the API query when a location ID is selected.

    const syncLocation = (event: Event) => {
      const locName = (event as CustomEvent<string>).detail;
      setLocationId('');
    };

    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, []);

  // Deep link: /reports?tab=stock opens that tab; switching tabs keeps the URL in sync.
  useEffect(() => {
    const routeParams = new URLSearchParams(window.location.search);
    const requested = routeParams.get('tab');
    if (routeParams.get('alerts') === '1') setShowNotifications(true);
    if (!requested || !REPORT_TABS.some((t) => t.key === requested)) return;
    const requestedTab = requested as ReportKind;
    if (requestedTab === 'priceChanges' && role !== 'SUPER_ADMIN') return;
    if (requestedTab === 'itemDeletions' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') return;
    setReport(requestedTab);
  }, [role]);

  useEffect(() => {
    if (!showNotifications || !token || notifications) return;
    const controller = new AbortController();

    async function loadAlerts() {
      setAlertError('');
      try {
        const response = await fetch(`${API}/reports/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Alerts unavailable');
        const { data } = await response.json() as { data: Omit<Notifications, 'unread'> & { unread?: number } };
        setNotifications({ ...data, unread: data.unread ?? data.items.filter((item) => !item.readAt).length });
      } catch {
        if (!controller.signal.aborted) setAlertError('Could not load operational alerts.');
      }
    }

    void loadAlerts();
    return () => controller.abort();
  }, [showNotifications, token, notifications, alertRetry]);

  const visibleReportTabs = REPORT_TABS.filter((tab) => {
    if (tab.key === 'priceChanges') return role === 'SUPER_ADMIN';
    if (tab.key === 'itemDeletions') return role === 'SUPER_ADMIN' || role === 'ADMIN';
    return true;
  });

  useEffect(() => {
    if (!visibleReportTabs.some((tab) => tab.key === report)) setReport('overview');
  }, [visibleReportTabs, report]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (report === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', report);
    window.history.replaceState(null, '', url);
  }, [report]);

  // Load Specialized Report datasets
  useEffect(() => {
    if (report === 'overview' || report === 'sales' || report === 'stock' || report === 'salesDetails') return;
    setTableData(null);
  }, [report]);

  function markRead(id: string) {
    if (!notifications) return;
    const updated = notifications.items.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setNotifications({
      ...notifications,
      unread: updated.filter(i => !i.readAt).length,
      items: updated,
    });
  }

  function markAllRead() {
    if (!notifications) return;
    const updated = notifications.items.map((item) => ({ ...item, readAt: new Date().toISOString() }));
    setNotifications({
      ...notifications,
      unread: 0,
      items: updated,
    });
    setNotice('All operational notifications marked as read.');
  }

  function getExportData() {
    let headers: string[] = [];
    let rows: unknown[][] = [];

    if (report === 'overview') {
      headers = ['Location', 'Invoices', 'Cancelled', 'Net Sales (INR)', 'Average Bill (INR)'];
      rows = (sales?.locations ?? []).map(r => [r.locationName, r.invoices, r.cancelled, r.netSales, r.invoices ? (Number(r.netSales) / r.invoices).toFixed(2) : '0.00']);
    } else if (report === 'sales') {
      headers = ['Date', 'Invoices', 'Cancelled', 'Net Sales (INR)'];
      rows = (sales?.daily ?? []).map(r => [r.date, r.invoices, r.cancelled, r.netSales]);
    } else if (report === 'salesDetails') {
      headers = ['Invoice Number', 'Location', 'Status', 'Net Total (INR)', 'Created At'];
      rows = (salesDetails?.rows ?? []).map(r => [r.invoiceNumber, r.location.name, r.status, r.netTotal, r.createdAt]);
    } else if (report === 'stock') {
      headers = ['Location', 'SKU', 'Product', 'Variant', 'Available', 'Base Unit', 'Cartons', 'Loose', 'In-Transit', 'Reserved', 'Quarantined'];
      rows = (stock?.rows ?? []).map(r => [r.locationName, r.sku, r.productName, r.variantName, r.available, r.baseUnit, r.cartons ?? 0, r.looseBaseUnits, r.inTransit, r.reserved, r.quarantined]);
    } else if (tableData) {
      headers = tableData.headers;
      rows = tableData.rows;
    }

    return { headers, rows };
  }

  function handleExportCsv() {
    const { headers, rows } = getExportData();
    const csv = [headers, ...rows].map(line => line.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Premium-Retail-Report-${report}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} records to CSV.`);
  }

  function handleExportPdf() {
    const { headers, rows } = getExportData();
    const reportTitle = report === 'overview' ? 'REPORTS OVERVIEW - STORE PERFORMANCE' : tableData && !['sales', 'salesDetails', 'stock'].includes(report) ? tableData.title : report.toUpperCase() + ' REPORT';
    const description = `${rows.length} records · ${locationId ? locations.find(l => l.id === locationId)?.name : 'All retail locations'}`;
    downloadPdf(reportTitle, description, headers, rows, `Premium-Retail-Report-${report}-${from}-to-${to}.csv`);
    setNotice(`Exported ${rows.length} records to vector PDF.`);
  }

  // ---------- Derived overview data (scoped by the selected location) ----------
  const q = query.trim().toLowerCase();
  const matches = (...values: Array<string | number>) => !q || values.join(' ').toLowerCase().includes(q);
  const scopeName = locationId ? locations.find((l) => l.id === locationId)?.name ?? 'Selected location' : 'All retail locations';
  const scopedStores = (sales?.locations ?? []).filter((l) => !locationId || l.locationId === locationId);
  const netRevenue = scopedStores.reduce((sum, l) => sum + Number(l.netSales), 0);
  const invoiceCount = scopedStores.reduce((sum, l) => sum + l.invoices, 0);
  const cancelledCount = scopedStores.reduce((sum, l) => sum + l.cancelled, 0);
  const avgBill = invoiceCount ? netRevenue / invoiceCount : 0;
  const cancelRate = invoiceCount + cancelledCount ? (cancelledCount / (invoiceCount + cancelledCount)) * 100 : 0;
  const networkRevenue = (sales?.locations ?? []).reduce((sum, l) => sum + Number(l.netSales), 0);
  const maxStoreRevenue = Math.max(...scopedStores.map((l) => Number(l.netSales)), 1);
  const byAvg = scopedStores.filter((s) => s.invoices).map((s) => ({ store: s, avg: Number(s.netSales) / s.invoices })).sort((a, b) => b.avg - a.avg);
  const avgSpread = byAvg.length > 1 ? { high: byAvg[0].store, highAvg: byAvg[0].avg, low: byAvg[byAvg.length - 1].store, lowAvg: byAvg[byAvg.length - 1].avg } : null;
  const topStore = [...scopedStores].sort((a, b) => Number(b.netSales) - Number(a.netSales))[0];

  const scopedStockRows = (stock?.rows ?? []).filter((r) => !locationId || r.locationName === scopeName);
  const lowStockCount = locationId ? scopedStockRows.filter((r) => r.lowStock).length : stock?.totals.lowStockVariants ?? 0;
  const negativeCount = locationId ? scopedStockRows.filter((r) => r.negativeStock).length : stock?.totals.negativeStockVariants ?? 0;
  const coverRows = scopedStockRows
    .filter((r) => r.reorderLevelBase)
    .map((r) => ({ ...r, cover: (r.available / (r.reorderLevelBase || 1)) * 100 }))
    .sort((a, b) => a.cover - b.cover)
    .filter((r) => matches(r.productName, r.sku, r.locationName));
  const worstRow = coverRows.find((r) => r.negativeStock) ?? coverRows.find((r) => r.lowStock);

  const daily = sales?.daily ?? [];
  const maxDaily = Math.max(...daily.map((d) => Number(d.netSales)), 1);
  const bestDay = [...daily].sort((a, b) => Number(b.netSales) - Number(a.netSales))[0];

  const STOCK_STATES = [
    { key: 'available', label: 'Available' },
    { key: 'inTransit', label: 'In transit' },
    { key: 'reserved', label: 'Reserved' },
    { key: 'quarantined', label: 'Quarantined' },
  ] as const;
  const heatLocations = Array.from(new Set(scopedStockRows.map((r) => r.locationName)));
  const heat = heatLocations.map((loc) => {
    const rows = scopedStockRows.filter((r) => r.locationName === loc);
    return { loc, values: STOCK_STATES.map((s) => rows.reduce((sum, r) => sum + Math.max(0, r[s.key]), 0)) };
  });
  const heatMax = STOCK_STATES.map((_, col) => Math.max(...heat.map((h) => h.values[col]), 1));
  const heatLevel = (value: number, col: number) => (value <= 0 ? -1 : Math.min(4, Math.floor((value / heatMax[col]) * 4.999)));

  const rangeDays = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
  const rangePreset: RangePreset = to === isoDate(new Date()) && (rangeDays === 7 || rangeDays === 30) ? (rangeDays === 7 ? 'last7' : 'last30') : 'custom';
  const rangeLabel = `${formatDay(from)} – ${formatDay(to)}`;
  const reportLabel = visibleReportTabs.find((t) => t.key === report)?.label ?? 'Overview';
  const reportGroup = REPORT_GROUPS.find((group) => group.keys.includes(report)) ?? REPORT_GROUPS[0];
  const groupTabs = visibleReportTabs.filter((tab) => reportGroup.keys.includes(tab.key));

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p>{scopeName}</p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.search}>
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stores, SKUs, invoices…" aria-label="Search reports" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="x" size={13} /></button>}
          </label>
          <button
            type="button"
            className={`${styles.circleButton} ${showNotifications ? styles.circleActive : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Operational alerts"
            title="Operational alerts"
          >
            <Icon name="bell" size={18} />
            {notifications && notifications.unread > 0 && <span className={styles.badgeDot}>{notifications.unread}</span>}
          </button>
          <div className={styles.exportWrap} ref={exportRef}>
            <button type="button" className={styles.primaryButton} onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
              <Icon name="download" size={16} /> Export report
            </button>
            {exportOpen && (
              <div className={styles.exportMenu} role="menu">
                <div className={styles.exportHeading}>EXPORT {reportLabel.toUpperCase()}</div>
                <button type="button" role="menuitem" onClick={() => { handleExportPdf(); setExportOpen(false); }}><Icon name="fileText" size={15} /> Download PDF</button>
                <button type="button" role="menuitem" onClick={() => { handleExportCsv(); setExportOpen(false); }}><Icon name="download" size={15} /> Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Tabs + filters ---------- */}
      <div className={styles.toolbar}>
        <div className={styles.reportGroups} role="group" aria-label="Report category">
          {REPORT_GROUPS.map((group) => (
            <button key={group.label} type="button" aria-pressed={group === reportGroup} onClick={() => { if (group !== reportGroup) setReport(group.keys[0]); }}>
              {group.label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <PillDropdown<RangePreset>
            value={rangePreset}
            heading="Reporting period"
            ariaLabel="Reporting period"
            icon={<Icon name="calendar" size={14} />}
            buttonLabel={rangeLabel}
            options={[
              { value: 'last7', label: 'Last 7 days' },
              { value: 'last30', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom range' },
            ]}
            onChange={(next) => {
              if (next === 'custom') return;
              setFrom(isoDate(new Date(Date.now() - (next === 'last7' ? 7 : 30) * 86400000)));
              setTo(isoDate(new Date()));
            }}
            footer={
              <div className={styles.rangeInputs}>
                <label>From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
                <label>To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
            }
          />
          <PillDropdown<string>
            value={locationId || 'all'}
            heading="Location boundary"
            ariaLabel="Location boundary"
            icon={<Icon name="mapPin" size={14} />}
            options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: `${l.name}${l.type === 'WAREHOUSE' ? ' (Warehouse)' : ''}` }))]}
            onChange={(next) => setLocationId(next === 'all' ? '' : next)}
          />
        </div>
      </div>

      {groupTabs.length > 1 && (
        <div className={styles.reportSubtabs} role="group" aria-label="Report type">
          {groupTabs.map((tab) => (
            <button key={tab.key} type="button" aria-pressed={report === tab.key} onClick={() => setReport(tab.key)}>{tab.label}</button>
          ))}
        </div>
      )}

      {/* ---------- Alerts drawer ---------- */}
      {showNotifications && (
        <section className={`${styles.card} ${styles.alerts}`}>
          <div className={styles.cardHead}>
            <div>
              <h2>Operational alerts</h2>
              <p>Replenishment requests, transfer discrepancies and audit alerts</p>
            </div>
            <div className={styles.cardHeadActions}>
              {Boolean(notifications?.unread) && <button type="button" onClick={markAllRead} className={styles.textButton}>Mark all as read</button>}
              <button type="button" onClick={() => setShowNotifications(false)} className={styles.iconButton} aria-label="Close alerts"><Icon name="x" size={16} /></button>
            </div>
          </div>
          <div className={styles.alertList}>
            {alertError && <Feedback tone="error">{alertError}</Feedback>}
            {alertError && <button type="button" className={styles.textButton} onClick={() => setAlertRetry((retry) => retry + 1)}>Retry</button>}
            {!notifications && !alertError && <p role="status">Loading alerts…</p>}
            {notifications?.items.length === 0 && <p>No operational alerts.</p>}
            {notifications?.items.map((item) => (
              <div key={item.id} className={`${styles.alertItem} ${item.readAt ? styles.alertRead : ''}`}>
                <span className={`${styles.alertIcon} ${item.type === 'NEGATIVE_STOCK' ? styles.toneRed : item.type === 'LOW_STOCK' ? styles.toneAmber : styles.toneBlue}`}><Icon name="alert" size={15} /></span>
                <div className={styles.alertBody}>
                  <div className={styles.alertTop}><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
                  <p>{item.message}</p>
                  <div className={styles.alertFoot}>
                    <a href={item.href}>View details <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></a>
                    {!item.readAt && <button type="button" onClick={() => markRead(item.id)}>Dismiss</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {/* ---------- OVERVIEW ---------- */}
      {report === 'overview' && (
        <>
          <section className={styles.kpiGrid} aria-label="Key figures">
            <article className={styles.kpi}>
              <div className={styles.kpiTop}><span>Net revenue</span><i><Icon name="rupee" size={15} /></i></div>
              <strong>{formatInr(netRevenue)}</strong>
              <span className={`${styles.chip} ${styles.chipGood}`}>{scopedStores.length} {scopedStores.length === 1 ? 'store' : 'stores'}</span>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}><span>Average bill</span><i><Icon name="receipt" size={15} /></i></div>
              <strong>{formatInr(avgBill)}</strong>
              <span className={`${styles.chip} ${styles.chipGood}`}>per invoice</span>
            </article>
            <article className={`${styles.kpi} ${styles.kpiTeal}`}>
              <div className={styles.kpiTop}><span>Completed invoices</span><i><Icon name="check" size={15} /></i></div>
              <strong>{invoiceCount.toLocaleString('en-IN')}</strong>
              <span className={styles.chip}>billed at POS</span>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}><span>Cancellation rate</span><i><Icon name="x" size={15} /></i></div>
              <strong>{cancelRate.toFixed(1)}%</strong>
              <span className={`${styles.chip} ${cancelledCount ? styles.chipBad : styles.chipGood}`}>{cancelledCount} voided</span>
            </article>
            <article className={`${styles.kpi} ${styles.kpiPink}`}>
              <div className={styles.kpiTop}><span>Low stock variants</span><i><Icon name="alert" size={15} /></i></div>
              <strong>{lowStockCount}</strong>
              <span className={`${styles.chip} ${styles.chipBad}`}>{negativeCount} negative</span>
            </article>
          </section>

          <section className={styles.rowGrid}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <div className="heading-with-info"><h2>Daily turnover</h2><InfoHint label="About daily turnover">Bars show daily net sales for the selected date range and location.</InfoHint></div>
                  <p>{daily.length ? `Net sales over ${daily.length} trading days` : 'Net sales for the selected period'}</p>
                </div>
                {bestDay && <span className={styles.highlightPill}>Best day: {formatDay(bestDay.date)} · {formatCompactInr(Number(bestDay.netSales))}</span>}
              </div>
              {daily.length ? <div className={styles.columns} role="region" aria-label="Daily turnover chart" tabIndex={0}>
                {daily.map((day) => {
                  const value = Number(day.netSales);
                  const isBest = day.date === bestDay?.date;
                  return (
                    <div className={styles.column} key={day.date} title={`${formatDay(day.date)}: ${formatInr(value)} · ${day.invoices} invoices · ${day.cancelled} cancelled`}>
                      <b>{formatCompactInr(value)}</b>
                      <span className={styles.columnTrack}><i className={isBest ? styles.columnBest : ''} style={{ height: `${(value / maxDaily) * 100}%` }} /></span>
                      <strong>{formatDay(day.date)}</strong>
                      <small>{day.invoices} invoices{day.cancelled ? ` · ${day.cancelled} void` : ''}</small>
                    </div>
                  );
                })}
              </div> : <div className={styles.empty}>No finalized sales in the selected period.</div>}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Stock by location &amp; state</h2>
                  <p>Base units of tracked variants · shaded per column</p>
                </div>
              </div>
              {heat.length ? (
                <div className={styles.heat} style={{ gridTemplateColumns: `minmax(110px, 1.2fr) repeat(${STOCK_STATES.length}, minmax(0, 1fr))` }}>
                  <span />
                  {STOCK_STATES.map((s) => <span key={s.key} className={styles.heatHead}>{s.label}</span>)}
                  {heat.map((row) => (
                    <div key={row.loc} className={styles.heatRow}>
                      <span className={styles.heatLabel}>{row.loc}</span>
                      {row.values.map((value, col) => {
                        const level = heatLevel(value, col);
                        return <span key={STOCK_STATES[col].key} className={`${styles.heatCell} ${level < 0 ? styles.heatEmpty : styles[`heat${level}`]}`} title={`${row.loc} · ${STOCK_STATES[col].label}: ${value} units`}>{value > 0 ? value.toLocaleString('en-IN') : '—'}</span>;
                      })}
                    </div>
                  ))}
                </div>
              ) : <div className={styles.empty}>No stock rows for this location.</div>}
              <div className={styles.heatLegend}><span>Low</span>{[0, 1, 2, 3, 4].map((l) => <i key={l} className={styles[`heat${l}`]} />)}<span>High</span></div>
            </article>
          </section>

          <section className={styles.rowGrid}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Revenue by store</h2>
                  <p>{topStore && netRevenue ? `${topStore.locationName} drives ${Math.round((Number(topStore.netSales) / netRevenue) * 100)}% of net sales in scope` : 'No retail sales recorded for this location'}</p>
                </div>
                <button type="button" className={styles.iconButton} onClick={() => setReport('sales')} aria-label="Open sales report" title="Open sales report"><Icon name="arrow" size={15} /></button>
              </div>
              <div className={styles.barList}>
                {scopedStores.filter((s) => matches(s.locationName)).map((store) => {
                  const value = Number(store.netSales);
                  const share = networkRevenue ? Math.round((value / networkRevenue) * 100) : 0;
                  return (
                    <div className={styles.barRow} key={store.locationId}>
                      <span className={styles.rowIcon}><Icon name="store" size={15} /></span>
                      <span className={styles.rowLabel}><strong>{store.locationName}</strong><small>{store.invoices} invoices · {formatInr(store.invoices ? value / store.invoices : 0)} avg</small></span>
                      <span className={styles.track}><i style={{ width: `${(value / maxStoreRevenue) * 100}%` }} /></span>
                      <b className={styles.rowValue}>{formatCompactInr(value)}</b>
                      <span className={`${styles.chip} ${styles.chipGood}`}>{share}%</span>
                    </div>
                  );
                })}
                {!scopedStores.length && <div className={styles.empty}>No store sales in the selected period.</div>}
              </div>
              {scopedStores.length > 0 && netRevenue > 0 && (
                <div className={styles.shareBlock}>
                  <small className={styles.shareCaption}>Share of net sales</small>
                  <div className={styles.shareBar} role="img" aria-label={scopedStores.map((s) => `${s.locationName} ${Math.round((Number(s.netSales) / netRevenue) * 100)}%`).join(', ')}>
                    {scopedStores.map((s, i) => <i key={s.locationId} style={{ width: `${(Number(s.netSales) / netRevenue) * 100}%`, background: SHARE_COLORS[i % SHARE_COLORS.length] }} title={`${s.locationName}: ${formatInr(Number(s.netSales))}`} />)}
                  </div>
                  <div className={styles.shareLegend}>
                    {scopedStores.map((s, i) => <span key={s.locationId}><i style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} />{s.locationName}<b>{formatCompactInr(Number(s.netSales))}</b></span>)}
                  </div>
                </div>
              )}
              {avgSpread && (
                <button type="button" className={styles.insight} onClick={() => setReport('sales')}>
                  <Icon name="spark" size={14} />
                  <span>{avgSpread.low.locationName} averages {formatInr(avgSpread.lowAvg)} per bill, {formatInr(avgSpread.highAvg - avgSpread.lowAvg)} below {avgSpread.high.locationName}.</span>
                  <Icon name="arrow" size={13} />
                </button>
              )}            </article>

            <article className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <div className="heading-with-info"><h2>Stock cover vs. reorder level</h2><InfoHint label="About stock cover">100% means available stock equals the reorder level. Lower percentages identify variants closer to running out.</InfoHint></div>
                  <p>Available units ÷ reorder level · lowest cover first</p>
                </div>
              </div>
              <div className={styles.barList}>
                {coverRows.slice(0, 5).map((row) => (
                  <div className={styles.coverRow} key={`${row.locationName}-${row.sku}`}>
                    <span className={`${styles.skuBadge} ${row.negativeStock ? styles.toneRed : row.lowStock ? styles.toneAmber : styles.toneTeal}`}>{row.productName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                    <span className={styles.rowLabel}><strong>{row.productName}</strong><small>{row.locationName} · {row.available} / {row.reorderLevelBase} {row.baseUnit}s</small></span>
                    <span className={styles.track}><i className={row.negativeStock ? styles.fillRed : row.lowStock ? styles.fillAmber : ''} style={{ width: `${Math.max(0, Math.min(100, row.cover / 3))}%` }} /></span>
                    <b className={styles.rowValue}>{Math.round(row.cover)}%</b>
                  </div>
                ))}
                {!coverRows.length && <div className={styles.empty}>No tracked variants for this location.</div>}
              </div>
              {worstRow && (
                <button type="button" className={styles.insight} onClick={() => setReport('lowStock')}>
                  <Icon name="spark" size={14} />
                  <span>{worstRow.negativeStock
                    ? `${worstRow.productName} at ${worstRow.locationName} is at ${worstRow.available} ${worstRow.baseUnit}s. Reconcile the ledger before the next transfer.`
                    : `${worstRow.productName} at ${worstRow.locationName} is below its reorder level. Raise a replenishment transfer.`}</span>
                  <Icon name="arrow" size={13} />
                </button>
              )}
            </article>
          </section>


        </>
      )}

      {/* ---------- Report tabs ---------- */}
      {report === 'sales' && sales && <SalesView sales={sales} matches={matches} rangeLabel={rangeLabel} />}
      {report === 'salesDetails' && salesDetails && <InvoicesView details={salesDetails} matches={matches} />}
      {report === 'stock' && stock && <StockView stock={stock} matches={matches} />}
      {!['overview', 'sales', 'salesDetails', 'stock'].includes(report) && tableData && <SpecializedView kind={report} data={tableData} matches={matches} />}
    </div>
  );
}

