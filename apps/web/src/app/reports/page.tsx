'use client';

import { addCalendarDays, businessDate, businessMidnight } from '@/lib/business-date';
import { downloadCsv, downloadPdf } from '@/lib/report-download';

import { useAccess } from '@/lib/permissions';
import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './reports.module.css';
import { EXTRA_REPORTS, toReportTable } from './report-data';
import { Icon, formatMoney, formatCompactMoney, formatDay, type SalesSummary, type SalesDetails, type StockReport, type TableData } from './report-ui';
import { SalesView, InvoicesView, StockView, Card, Table } from './report-views';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const SALES_CUTOFF_LABEL = 'Refunds and cancellations through period end';

type Location = { id: string; name: string; type: string; isActive: boolean; company: { currency: string; timezone?: string } };

async function requestData<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.data === undefined) throw new Error(payload.message || 'Could not load this report.');
  return payload.data as T;
}

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
  | 'productPerformance'
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
  { key: 'productPerformance', label: 'Product performance' },
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
  { label: 'Inventory', keys: ['stock', 'productPerformance', 'lowStock', 'ledger', 'priceChanges'] },
  { label: 'Operations', keys: ['transferDiscrepancies', 'auditVariances'] },
];

function reportParams(from: string, to: string, locationId: string, timezone: string) {
  const params = new URLSearchParams({
    from: businessMidnight(from, timezone),
    to: businessMidnight(addCalendarDays(to, 1), timezone),
  });
  if (locationId) params.set('locationId', locationId);
  return params;
}

export default function ReportsPage() {
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationState, setLocationState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locationRetry, setLocationRetry] = useState(0);
  const [reportResult, setReportResult] = useState({ key: '', error: '' });
  const [reportRetry, setReportRetry] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [productOrder, setProductOrder] = useState<'top' | 'slow' | 'unsold'>('top');
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangePreset, setRangePreset] = useState<RangePreset>('last30');
  const [report, setReport] = useState<ReportKind>('overview');
  const usesSalesCutoff = ['overview', 'sales', 'salesDetails', 'productPerformance'].includes(report);

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
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

  useEffect(() => {
    const authSession = getStoredSession();
    if (authSession?.accessToken) {
      setToken(authSession.accessToken);
    }
    setRole(authSession?.user?.role ?? '');
    const params = new URLSearchParams(window.location.search);
    const requestedReport = REPORT_TABS.find((tab) => tab.key === params.get('tab'));
    if (requestedReport) setReport(requestedReport.key);
    if (params.get('alerts') === '1') setShowNotifications(true);
  }, []);

  const canConsolidate = role === 'SUPER_ADMIN' || role === 'ADMIN';

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const applyLocation = (items: Location[], selectedName: string | null) => {
      const selected = items.find((item) => item.name === selectedName);
      setLocationId(selected?.id ?? (canConsolidate ? '' : items[0]?.id ?? ''));
      setInvoicePage(1);
    };

    setLocationState('loading');
    void requestData<Location[]>('/locations', token, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setLocations(items);
      applyLocation(items, window.localStorage.getItem('premium-retail-location-scope'));
      setLocationState('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setLocationState('error');
    });
    return () => controller.abort();
  }, [token, canConsolidate, locationRetry]);

  useEffect(() => {
    const syncLocation = (event: Event) => {
      const selected = locations.find((item) => item.name === (event as CustomEvent<string>).detail);
      setLocationId(selected?.id ?? (canConsolidate ? '' : locations[0]?.id ?? ''));
      setInvoicePage(1);
    };
    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, [locations, canConsolidate]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API}/reports/notifications`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Could not load operational alerts.');
        if (!cancelled) setNotifications(payload.data as Notifications);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not load operational alerts.');
      });
    return () => { cancelled = true; };
  }, [token]);

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

  const { can, loading: accessLoading } = useAccess(token);
  const reportRole = ['SUPER_ADMIN', 'ADMIN', 'CENTRAL_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'STORE_MANAGER'].includes(role);
  const canReadSales = can('sales.reports', reportRole);
  const canReadStock = can('stock.view', reportRole);
  const visibleReportTabs = REPORT_TABS.filter((tab) => {
    if (tab.key === 'overview') return canReadSales && canReadStock;
    if (tab.key === 'priceChanges') return can('products.prices', canConsolidate);
    if (tab.key === 'itemDeletions') return canReadSales && canConsolidate;
    if (['stock', 'lowStock', 'ledger', 'transferDiscrepancies', 'auditVariances'].includes(tab.key)) return canReadStock;
    return canReadSales;
  });
  const canReadReport = visibleReportTabs.some((tab) => tab.key === report);

  useEffect(() => {
    if (!accessLoading && !canReadReport && visibleReportTabs.length) setReport(visibleReportTabs[0].key);
  }, [accessLoading, canReadReport, visibleReportTabs]);
  useEffect(() => {
    if (accessLoading || !role || !canReadReport) return;
    const url = new URL(window.location.href);
    if (report === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', report);
    window.history.replaceState(null, '', url);
  }, [accessLoading, canReadReport, report, role]);

  const scopedLocations = locationId
    ? locations.filter((location) => location.id === locationId)
    : locations.filter((location) => canConsolidate && location.isActive);
  const currencies = [...new Set(scopedLocations.map((location) => location.company?.currency).filter(Boolean))];
  const currency = currencies[0] ?? '';
  const timezones = new Set(scopedLocations.map((location) => location.company?.timezone ?? 'UTC'));
  const timezone = timezones.values().next().value ?? 'UTC';
  useEffect(() => {
    if (rangePreset === 'custom' || locationState !== 'ready') return;
    const today = businessDate(new Date(), timezone);
    setTo(today);
    setFrom(addCalendarDays(today, rangePreset === 'last7' ? -6 : -29));
  }, [rangePreset, timezone, locationState]);
  const needsCurrency = ['overview', 'sales', 'salesDetails', 'cancellations', 'productPerformance'].includes(report);
  const scopeError = locationState !== 'ready' ? '' :
    !scopedLocations.length ? 'No authorized locations are available for reporting.' :
    needsCurrency && currencies.length !== 1 ? 'Choose a location to report sales in its currency.' :
    timezones.size > 1 ? 'Choose a location to use its company’s reporting time zone.' :
    !from || !to || from > to ? 'Choose a valid reporting period.' : '';
  const reportKey = JSON.stringify([report, locationId, from, to, timezone, report === 'salesDetails' ? invoicePage : 1, reportRetry]);
  const loaded = canReadReport && locationState === 'ready' && !scopeError && reportResult.key === reportKey && !reportResult.error;
  const failure = reportResult.key === reportKey ? reportResult.error : '';
  const formatAmount = (value: number, digits = 2) => formatMoney(currency, value, digits);
  const formatShortAmount = (value: number) => formatCompactMoney(currency, value);

  useEffect(() => {
    if (!token || locationState !== 'ready' || scopeError || accessLoading || !canReadReport) return;
    const controller = new AbortController();
    const params = reportParams(from, to, locationId, timezone);
    const read = <T,>(route: string) => requestData<T>(`/reports/${route}?${params}`, token, controller.signal);

    async function loadReport() {
      if (report === 'overview') {
        const [saleData, stockData] = await Promise.all([read<SalesSummary>('sales-summary'), read<StockReport>('stock')]);
        if (controller.signal.aborted) return;
        setSales(saleData);
        setStock(stockData);
      } else if (report === 'sales') {
        const saleData = await read<SalesSummary>('sales-summary');
        if (!controller.signal.aborted) setSales(saleData);
      } else if (report === 'stock') {
        const stockData = await read<StockReport>('stock');
        if (!controller.signal.aborted) setStock(stockData);
      } else if (report === 'salesDetails') {
        params.set('page', String(invoicePage));
        params.set('pageSize', '100');
        const details = await read<SalesDetails>('sales-details');
        if (!controller.signal.aborted) setSalesDetails(details);
      } else {
        if (report === 'ledger') params.set('limit', '500');
        const raw = await read<unknown>(EXTRA_REPORTS[report]);
        if (!controller.signal.aborted) setTableData(toReportTable(report, raw, timezone));
      }
      if (!controller.signal.aborted) setReportResult({ key: reportKey, error: '' });
    }

    void loadReport().catch((error: unknown) => {
      if (!controller.signal.aborted) setReportResult({ key: reportKey, error: error instanceof Error ? error.message : 'Could not load this report.' });
    });
    return () => controller.abort();
  }, [token, locationState, scopeError, reportKey, report, locationId, from, to, invoicePage, accessLoading, canReadReport]);

  async function markRead(id: string) {
    if (!notifications || !token) return;
    try {
      const response = await fetch(`${API}/reports/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not dismiss this alert.');
      const readAt = new Date().toISOString();
      setNotifications((current) => current ? {
        ...current,
        unread: Math.max(0, current.unread - (current.items.some((item) => item.id === id && !item.readAt) ? 1 : 0)),
        items: current.items.map((item) => item.id === id ? { ...item, readAt } : item),
      } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not dismiss this alert.');
    }
  }

  async function markAllRead() {
    if (!notifications || !token) return;
    const unreadItems = notifications.items.filter((item) => !item.readAt);
    let results: Array<{ id: string; ok: boolean; message?: string }>;
    try {
      results = await Promise.all(unreadItems.map(async (item) => {
        const response = await fetch(`${API}/reports/notifications/${encodeURIComponent(item.id)}/read`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        return { id: item.id, ok: response.ok, message: payload.message as string | undefined };
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update all operational alerts.');
      return;
    }
    const succeeded = new Set(results.filter((result) => result.ok).map((result) => result.id));
    const readAt = new Date().toISOString();
    setNotifications((current) => current ? {
      ...current,
      unread: Math.max(0, current.unread - succeeded.size),
      items: current.items.map((item) => succeeded.has(item.id) ? { ...item, readAt } : item),
    } : current);
    const failed = results.find((result) => !result.ok);
    setNotice(failed ? failed.message || 'Some alerts could not be marked as read.' : 'All operational notifications marked as read.');
  }

  function getExportData(invoiceRows = salesDetails?.rows ?? [], includeCsvColumn = false) {
    let headers: string[] = [];
    let rows: unknown[][] = [];

    if (report === 'overview') {
      headers = ['Location', 'Invoices', 'Cancelled', `Net Sales (${currency})`, `Average Bill (${currency})`];
      rows = (sales?.locations ?? []).map(r => [r.locationName, r.invoices, r.cancelled, r.netSales, r.invoices ? (Number(r.netSales) / r.invoices).toFixed(2) : '0.00']);
    } else if (report === 'sales') {
      headers = ['Date', 'Invoices', 'Cancelled', `Net Sales (${currency})`];
      rows = (sales?.daily ?? []).map(r => [r.date, r.invoices, r.cancelled, r.netSales]);
    } else if (report === 'salesDetails') {
      headers = ['Invoice Number', 'Location', 'Status', `Original Total (${currency})`, `Refunds (${currency})`, `Net After Refunds (${currency})`, 'Created At (UTC)'];
      rows = invoiceRows.map(r => [r.invoiceNumber, r.location.name, r.reportStatus, r.originalTotal, r.refundedTotal, r.netAfterRefunds, r.createdAt]);
    } else if (report === 'stock') {
      headers = ['Location', 'SKU', 'Product', 'Variant', 'Available', 'Base Unit', 'Cartons', 'Loose', 'In-Transit', 'Reserved', 'Quarantined'];
      rows = (stock?.rows ?? []).map(r => [r.locationName, r.sku, r.productName, r.variantName, r.available, r.baseUnit, r.cartons ?? 0, r.looseBaseUnits, r.inTransit, r.reserved, r.quarantined]);
    } else if (tableData) {
      headers = tableData.headers;
      rows = tableData.rows;
    }

    if (report === 'productPerformance') {
      headers = headers.map((header) => header === 'Net sales' ? `Net sales (${currency})` : header);
      if (productOrder === 'unsold') rows = rows.filter((row) => Number(row[4]) === 0 && Number(row[6]) > 0);
      if (productOrder === 'slow') rows = rows.filter((row) => Number(row[4]) > 0)
        .sort((first, second) => Number(first[4]) - Number(second[4]));
    }
    if (report === 'cancellations') headers = headers.map((header) => header === 'Net total' ? `Net total (${currency})` : header);
    const csvColumn = includeCsvColumn && report === 'transferDiscrepancies' ? tableData?.csvColumn : undefined;
    return {
      headers: csvColumn ? [...headers, csvColumn.header] : headers,
      rows: rows.flatMap((row, index) => matches(...row.map((value) => String(value ?? '')))
        ? [csvColumn ? [...row, csvColumn.values[index]] : row]
        : []),
    };
  }

  async function exportReport(format: 'PDF' | 'CSV') {
    if (!loaded || exporting) return;
    setExportOpen(false);
    setExporting(true);
    setExportError('');
    try {
      const invoiceRows = report === 'salesDetails'
        ? await requestData<SalesDetails['rows']>(`/reports/sales-details/export?${reportParams(from, to, locationId, timezone)}`, token, new AbortController().signal)
        : undefined;
      const { headers, rows } = getExportData(invoiceRows, format === 'CSV');
      const filename = `Premium-Retail-Report-${report}-${from}-to-${to}.csv`;
      if (format === 'PDF') {
        const title = report === 'overview' ? 'Store performance overview' : reportLabel;
        downloadPdf(title, usesSalesCutoff ? `${scopeName} · ${SALES_CUTOFF_LABEL}` : `${rows.length} records · ${scopeName}`, headers, rows, filename);
      } else downloadCsv(headers, rows, filename);
      setNotice(`Exported ${rows.length} records to ${format}.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export this report.');
    } finally {
      setExporting(false);
    }
  }

  // ---------- Derived overview data (scoped by the selected location) ----------
  const q = query.trim().toLowerCase();
  const matches = (...values: Array<string | number>) => !q || values.join(' ').toLowerCase().includes(q);
  const scopeName = locationId ? locations.find((l) => l.id === locationId)?.name ?? 'Selected location' : 'All locations';
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

  const rangeLabel = from && to ? `${formatDay(from)} – ${formatDay(to)}` : 'Reporting period';
  const reportLabel = visibleReportTabs.find((t) => t.key === report)?.label ?? 'Overview';
  const reportGroup = REPORT_GROUPS.find((group) => group.keys.includes(report)) ?? REPORT_GROUPS[0];
  const groupTabs = visibleReportTabs.filter((tab) => reportGroup.keys.includes(tab.key));

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p>{scopeName}{needsCurrency && currencies.length === 1 ? ` · ${currency}` : ''}</p>
        </div>
        <div className={styles.headerActions}>
          {can('cash.reports', ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'].includes(role)) && <a className="admin-secondary" href="/reports/cash-settlements">Cash settlements</a>}
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
            <button type="button" className={styles.primaryButton} disabled={!loaded || exporting} onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
              <Icon name="download" size={16} /> {exporting ? 'Preparing report…' : 'Export report'}
            </button>
            {exportOpen && loaded && (
              <div className={styles.exportMenu} role="menu">
                <div className={styles.exportHeading}>EXPORT {reportLabel.toUpperCase()} · {report === 'salesDetails' ? (query.trim() ? 'Matching invoices across all pages' : `${salesDetails?.total ?? 0} rows across all pages`) : `${getExportData().rows.length} rows`}</div>
                <button type="button" role="menuitem" onClick={() => void exportReport('PDF')}><Icon name="fileText" size={15} /> Download PDF</button>
                <button type="button" role="menuitem" onClick={() => void exportReport('CSV')}><Icon name="download" size={15} /> Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Tabs + filters ---------- */}
      <div className={styles.toolbar}>
        <div className={styles.reportGroups} role="group" aria-label="Report category">
          {REPORT_GROUPS.filter((group) => group.keys.some((key) => visibleReportTabs.some((tab) => tab.key === key))).map((group) => (
            <button key={group.label} type="button" aria-pressed={group === reportGroup} onClick={() => { if (group !== reportGroup) setReport(group.keys.find((key) => visibleReportTabs.some((tab) => tab.key === key)) ?? report); }}>
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
              setRangePreset(next);
              setInvoicePage(1);
            }}
            footer={
              <div className={styles.rangeInputs}>
                <label>From<input type="date" value={from} max={to} onChange={(e) => { setRangePreset('custom'); setFrom(e.target.value); setInvoicePage(1); }} /></label>
                <label>To<input type="date" value={to} min={from} onChange={(e) => { setRangePreset('custom'); setTo(e.target.value); setInvoicePage(1); }} /></label>
              </div>
            }
          />
          <PillDropdown<string>
            value={locationId || 'all'}
            heading="Location boundary"
            ariaLabel="Location boundary"
            icon={<Icon name="mapPin" size={14} />}
            options={[...(canConsolidate ? [{ value: 'all', label: 'All active locations' }] : []), ...locations.map((l) => ({ value: l.id, label: `${l.name}${l.isActive ? '' : ' (Inactive)'}` }))]}
            onChange={(next) => { setLocationId(next === 'all' ? '' : next); setInvoicePage(1); }}
          />
        </div>
      </div>

      {groupTabs.length > 1 && (
        <div className={styles.reportSubtabs} role="group" aria-label="Report type">
          {groupTabs.map((tab) => (
            <button key={tab.key} type="button" aria-pressed={report === tab.key} onClick={() => { setReport(tab.key); setInvoicePage(1); }}>{tab.label}</button>
          ))}
        </div>
      )}

      {/* ---------- Alerts drawer ---------- */}
      {showNotifications && (
        <section className={`${styles.card} ${styles.alerts}`}>
          <div className={styles.cardHead}>
            <div>
              <h2>Operational alerts</h2>
              <p>Restock requests, transfer discrepancies and audit alerts</p>
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

      {exportError && <Feedback tone="error">{exportError}</Feedback>}
      {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {locationState === 'error' && <Feedback tone="error">Could not load reporting locations. <button type="button" className={styles.textButton} onClick={() => setLocationRetry((value) => value + 1)}>Retry</button></Feedback>}
      {scopeError && <Feedback tone="error">{scopeError}</Feedback>}
      {failure && <Feedback tone="error">{failure} <button type="button" className={styles.textButton} onClick={() => setReportRetry((value) => value + 1)}>Retry</button></Feedback>}
      {!accessLoading && !visibleReportTabs.length && <p>No reports are available for this account.</p>}
      {!loaded && (accessLoading || visibleReportTabs.length > 0) && !scopeError && !failure && locationState !== 'error' && <p role="status">Loading report…</p>}
      {loaded && usesSalesCutoff && <p className={styles.mutedText}>
        Sales are grouped by invoice date. Refunds and cancellations are included through the selected end date.
        Extend the end date to include later changes to those invoices.
      </p>}

      {/* ---------- OVERVIEW ---------- */}
      {loaded && report === 'overview' && (
        <>
          <section className={styles.kpiGrid} aria-label="Key figures">
            <article className={styles.kpi}>
              <div className={styles.kpiTop}><span>Net revenue</span><i><Icon name="money" size={15} /></i></div>
              <strong>{formatAmount(netRevenue)}</strong>
              <span className={`${styles.chip} ${styles.chipGood}`}>{scopedStores.length} {scopedStores.length === 1 ? 'store' : 'stores'}</span>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}><span>Average bill</span><i><Icon name="receipt" size={15} /></i></div>
              <strong>{formatAmount(avgBill)}</strong>
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
                {bestDay && <span className={styles.highlightPill}>Best day: {formatDay(bestDay.date)} · {formatShortAmount(Number(bestDay.netSales))}</span>}
              </div>
              {daily.length ? <div className={styles.columns} role="region" aria-label="Daily turnover chart" tabIndex={0}>
                {daily.map((day) => {
                  const value = Number(day.netSales);
                  const isBest = day.date === bestDay?.date;
                  return (
                    <div className={styles.column} key={day.date} title={`${formatDay(day.date)}: ${formatAmount(value)} · ${day.invoices} invoices · ${day.cancelled} cancelled`}>
                      <b>{formatShortAmount(value)}</b>
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
                      <span className={styles.rowLabel}><strong>{store.locationName}</strong><small>{store.invoices} invoices · {formatAmount(store.invoices ? value / store.invoices : 0)} avg</small></span>
                      <span className={styles.track}><i style={{ width: `${(value / maxStoreRevenue) * 100}%` }} /></span>
                      <b className={styles.rowValue}>{formatShortAmount(value)}</b>
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
                    {scopedStores.map((s, i) => <i key={s.locationId} style={{ width: `${(Number(s.netSales) / netRevenue) * 100}%`, background: SHARE_COLORS[i % SHARE_COLORS.length] }} title={`${s.locationName}: ${formatAmount(Number(s.netSales))}`} />)}
                  </div>
                  <div className={styles.shareLegend}>
                    {scopedStores.map((s, i) => <span key={s.locationId}><i style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} />{s.locationName}<b>{formatShortAmount(Number(s.netSales))}</b></span>)}
                  </div>
                </div>
              )}
              {avgSpread && (
                <button type="button" className={styles.insight} onClick={() => setReport('sales')}>
                  <Icon name="spark" size={14} />
                  <span>{avgSpread.low.locationName} averages {formatAmount(avgSpread.lowAvg)} per bill, {formatAmount(avgSpread.highAvg - avgSpread.lowAvg)} below {avgSpread.high.locationName}.</span>
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
      {loaded && report === 'sales' && sales && <SalesView currency={currency} sales={sales} matches={matches} rangeLabel={rangeLabel} />}
      {loaded && report === 'salesDetails' && salesDetails && <>
        <InvoicesView currency={currency} timezone={timezone} details={salesDetails} matches={matches} />
        {salesDetails.totalPages > 1 && <div className={styles.headerActions} aria-label="Invoice pages">
          <button type="button" className={styles.textButton} disabled={invoicePage <= 1} onClick={() => setInvoicePage((page) => page - 1)}>Previous</button>
          <span>Page {invoicePage} of {salesDetails.totalPages} · {salesDetails.total} invoices</span>
          <button type="button" className={styles.textButton} disabled={invoicePage >= salesDetails.totalPages} onClick={() => setInvoicePage((page) => page + 1)}>Next</button>
        </div>}
      </>}
      {loaded && report === 'stock' && stock && <StockView stock={stock} matches={matches} />}
      {loaded && !['overview', 'sales', 'salesDetails', 'stock'].includes(report) && tableData && <Card title={tableData.title} subtitle={report === 'productPerformance' ? 'Net units and sales for the period. Available stock is current.' : tableData.description}
        action={report === 'productPerformance' && <PillDropdown
          value={productOrder} onChange={setProductOrder} ariaLabel="Rank products" heading="Rank products"
          options={[{ value: 'top', label: 'Most sold' }, { value: 'slow', label: 'Fewest sold' }, { value: 'unsold', label: 'In stock with no net sales' }]}
        />}>
        <Table headers={getExportData().headers} rows={getExportData().rows.map((row) => row.map(String))} />
      </Card>}
    </div>
  );
}

