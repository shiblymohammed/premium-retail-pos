'use client';

import { FormEvent, useEffect, useState } from 'react';
import { revokeSession } from '@/lib/auth';
import styles from './reports.module.css';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type Location = { id: string; name: string; type: string };
type SalesSummary = { period: { from: string; to: string }; totals: { netSales: string; completedInvoices: number; cancelledInvoices: number }; locations: Array<{ locationId: string; locationName: string; invoices: number; netSales: string; cancelled: number }>; daily: Array<{ date: string; invoices: number; netSales: string; cancelled: number }>; truncated: boolean };
type SalesDetails = { page: number; pageSize: number; total: number; totalPages: number; rows: Array<{ id: string; invoiceNumber: string; location: { name: string }; status: string; netTotal: string; createdAt: string }> };
type StockReport = { totals: { variants: number; availableBaseUnits: number; lowStockVariants: number; negativeStockVariants: number }; rows: Array<{ sku: string; productName: string; variantName: string; locationName: string; baseUnit: string; available: number; cartons: number | null; looseBaseUnits: number; unitsPerCarton: number | null; inTransit: number; reserved: number; quarantined: number; reorderLevelBase: number | null; lowStock: boolean; negativeStock: boolean }> };
type Notifications = { generatedAt: string; total: number; unread: number; items: Array<{ id: string; dedupeKey: string; type: string; title: string; message: string; createdAt: string; readAt: string | null; href: string }> };
type ReportKind = 'sales' | 'stock' | 'ledger' | 'lowStock' | 'transferDiscrepancies' | 'auditVariances' | 'priceChanges' | 'cancellations' | 'itemDeletions';
type TableData = { title: string; description: string; headers: string[]; rows: string[][] };

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function nested(value: unknown, ...keys: string[]): unknown { return keys.reduce<unknown>((current, key) => object(current)[key], value); }
function cell(value: unknown): string { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function roleFromToken(token: string) { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role as string; } catch { return ''; } }

async function data<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : `Request failed (${response.status})`);
  return body.data as T;
}
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
  objects.forEach((object, index) => { offsets.push(pdfDocument.length); pdfDocument += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdfDocument.length;
  pdfDocument += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdfDocument], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = filename.replace(/\.csv$/, '.pdf'); link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState<ReportKind>('sales');
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [salesDetails, setSalesDetails] = useState<SalesDetails | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);
  const [notifications, setNotifications] = useState<Notifications | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(accessToken: string, loc: string, start = from, end = to, activePage = page) {
    const query = new URLSearchParams({ from: new Date(`${start}T00:00:00`).toISOString(), to: new Date(`${end}T23:59:59.999`).toISOString() });
    if (loc) query.set('locationId', loc);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [salesData, stockData, notificationData, detailData] = await Promise.all([
      data<SalesSummary>(await fetch(`${API}/reports/sales-summary?${query}`, { headers, cache: 'no-store' })),
      data<StockReport>(await fetch(`${API}/reports/stock?${query}`, { headers, cache: 'no-store' })),
      data<Notifications>(await fetch(`${API}/reports/notifications`, { headers, cache: 'no-store' })),
      data<SalesDetails>(await fetch(`${API}/reports/sales-details?${query}&page=${activePage}&pageSize=25`, { headers, cache: 'no-store' })),
    ]);
    setSales(salesData); setStock(stockData); setNotifications(notificationData); setSalesDetails(detailData);
  }

  async function loadExtra() {
    const routes: Record<Exclude<ReportKind, 'sales' | 'stock'>, string> = { ledger: 'movement-ledger', lowStock: 'low-stock', transferDiscrepancies: 'transfer-discrepancies', auditVariances: 'audit-variances', priceChanges: 'price-changes', cancellations: 'cancellations', itemDeletions: 'item-deletions' };
    const query = new URLSearchParams({ from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59.999`).toISOString() });
    if (locationId) query.set('locationId', locationId);
    if (report === 'ledger') query.set('limit', '500');
    setError('');
    try {
      const raw = await data<unknown>(await fetch(`${API}/reports/${routes[report as Exclude<ReportKind, 'sales' | 'stock'>]}?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
      const list: Array<Record<string, any>> = Array.isArray(raw) ? raw as Array<Record<string, any>> : [];
      let title = 'Report'; let description = `${list.length} records`; let headers: string[] = []; let rows: string[][] = [];
      if (report === 'ledger') { title = 'Movement ledger'; headers = ['Date', 'Movement', 'Location', 'Product', 'SKU', 'Quantity', 'Stock state', 'Source / destination', 'Reference', 'Actor']; rows = list.map((item) => [cell(item.createdAt), cell(item.type), cell(nested(item, 'location', 'name')), cell(nested(item, 'variant', 'product', 'name')), cell(nested(item, 'variant', 'sku')), `${cell(item.quantityBaseUnits)} ${cell(nested(item, 'variant', 'product', 'baseUnit'))}`, cell(item.stockState), `${cell(nested(item, 'transferRoute', 'sourceLocation', 'name'))} → ${cell(nested(item, 'transferRoute', 'destLocation', 'name'))}`, `${cell(item.referenceType)}: ${cell(item.referenceId)}`, cell(nested(item, 'actor', 'email'))]); }
      else if (report === 'lowStock') { const value = object(raw); const low = Array.isArray(value.lowStock) ? value.lowStock : []; const requests = Array.isArray(value.replenishments) ? value.replenishments : []; title = 'Low stock & replenishment'; description = `${low.length} stock alerts · ${requests.length} replenishment requests`; headers = ['Type', 'Location / route', 'Product', 'SKU / request', 'Available', 'Reorder / status', 'Suggested quantity']; rows = [...low.map((item) => ['Low stock', cell(item.locationName), cell(item.productName), cell(item.sku), `${cell(item.available)} ${cell(item.baseUnit)}`, cell(item.reorderLevelBase), '—']), ...requests.flatMap((request) => (Array.isArray(object(request).lines) ? object(request).lines as unknown[] : []).map((rawLine) => { const line = object(rawLine); return ['Replenishment', `${cell(nested(request, 'sourceLocation', 'name'))} → ${cell(nested(request, 'destLocation', 'name'))}`, cell(nested(line, 'variant', 'product', 'name')), `${cell(nested(line, 'variant', 'sku'))} · ${cell(request.requestNumber)}`, cell(line.availableQtyBase), cell(request.status), cell(line.managerApprovedQtyBase ?? line.systemSuggestedQtyBase)]; }))]; }
      else if (report === 'transferDiscrepancies') { title = 'Transfer discrepancies'; headers = ['Transfer', 'Status', 'Route', 'Updated', 'SKU', 'Short', 'Damaged', 'Excess']; rows = list.flatMap((item) => { const lines = Array.isArray(object(item).lines) ? object(item).lines as unknown[] : []; return lines.length ? lines.map((rawLine) => { const line = object(rawLine); return [cell(item.transferNumber), cell(item.status), `${cell(nested(item, 'sourceLocation', 'name'))} → ${cell(nested(item, 'destLocation', 'name'))}`, cell(item.updatedAt), cell(nested(line, 'variant', 'sku')), cell(line.shortQtyBase), cell(line.damagedQtyBase), cell(line.excessQtyBase)]; }) : [[cell(item.transferNumber), cell(item.status), `${cell(nested(item, 'sourceLocation', 'name'))} → ${cell(nested(item, 'destLocation', 'name'))}`, cell(item.updatedAt), '—', '0', '0', '0']]; }); }
      else if (report === 'auditVariances') { title = 'Stock audit variances'; headers = ['Audit', 'Location', 'Status', 'Product', 'SKU', 'Expected', 'Counted', 'Variance', 'Recount']; rows = list.map((item) => [cell(nested(item, 'auditSession', 'id')), cell(nested(item, 'auditSession', 'location', 'name')), cell(nested(item, 'auditSession', 'status')), cell(nested(item, 'variant', 'product', 'name')), cell(nested(item, 'variant', 'sku')), cell(item.expectedQtyBase), cell(item.approvedQtyBase ?? item.recountQtyBase ?? item.countedQtyBase), cell(item.varianceBase), item.requiresRecount ? 'Required' : 'No']); }
      else if (report === 'priceChanges') { title = 'Price change history'; headers = ['Date', 'Product', 'Field', 'Old value', 'New value', 'Reason', 'Changed by']; rows = list.map((item) => [cell(item.createdAt), cell(nested(item, 'product', 'name')), cell(item.fieldChanged), cell(item.oldValue), cell(item.newValue), cell(item.reason), cell(nested(item, 'changedBy', 'email'))]); }
      else if (report === 'cancellations') { title = 'Cancelled sales'; headers = ['Invoice', 'Location', 'Cancelled at', 'Reason', 'Net total', 'Refunds']; rows = list.map((item) => [cell(item.invoiceNumber), cell(nested(item, 'location', 'name')), cell(item.cancelledAt), cell(item.cancellationReason), cell(item.netTotal), cell(Array.isArray(item.refunds) ? item.refunds.length : 0)]); }
      else { title = 'Item deactivation audit'; headers = ['Date', 'Product', 'Actor', 'Action', 'Reason']; rows = list.map((item) => [cell(item.createdAt), cell(item.productName), cell(nested(item, 'actor', 'email')), cell(item.action), cell(item.reason)]); }
      setTableData({ title, description, headers, rows });
    } catch (cause) { setTableData(null); setError(cause instanceof Error ? cause.message : 'Could not load this report.'); }
  }

  async function markRead(id: string) {
    try {
      await fetch(`${API}/reports/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      setNotifications((current) => current ? { ...current, unread: Math.max(0, current.unread - Number(current.items.some((item) => item.id === id && !item.readAt))), items: current.items.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) } : current);
    } catch { /* The active alert still links to its source if acknowledgement fails. */ }
  }

  useEffect(() => {
    if (token && report !== 'sales' && report !== 'stock') void loadExtra();
  // Query changes intentionally reload the selected report.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, token, locationId, from, to]);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('pos-reports-token');
    if (!savedToken) return;
    setToken(savedToken);
    setRole(roleFromToken(savedToken));
    void fetch(`${API}/locations?isActive=true`, { headers: { Authorization: `Bearer ${savedToken}` }, cache: 'no-store' }).then((response) => data<Location[]>(response))
      .then(async (items) => { setLocations(items); const scopedLocation = ['ADMIN', 'SUPER_ADMIN'].includes(roleFromToken(savedToken)) ? '' : (items[0]?.id ?? ''); setLocationId(scopedLocation); await load(savedToken, scopedLocation); })
      .catch((cause) => { sessionStorage.removeItem('pos-reports-token'); setToken(''); setError(cause instanceof Error ? cause.message : 'Session expired. Please sign in again.'); });
  // Restore a session once on page load; the selected date inputs are initialized above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const login = await data<{ accessToken: string }>(await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
      const assigned = await data<Location[]>(await fetch(`${API}/locations?isActive=true`, { headers: { Authorization: `Bearer ${login.accessToken}` }, cache: 'no-store' }));
      const actorRole = roleFromToken(login.accessToken);
      const scopedLocation = ['ADMIN', 'SUPER_ADMIN'].includes(actorRole) ? '' : (assigned[0]?.id ?? '');
      await load(login.accessToken, scopedLocation);
      setLocations(assigned); setLocationId(scopedLocation); setRole(actorRole); setToken(login.accessToken); setPassword(''); sessionStorage.setItem('pos-reports-token', login.accessToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in. Use a manager or administrator account.'); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!token) return;
    setBusy(true); setError(''); setPage(1);
    try { await load(token, locationId, from, to, 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load report data.'); }
    finally { setBusy(false); }
  }

  async function getExportData() {
    let rows: unknown[][];
    if (report === 'sales') {
      const query = new URLSearchParams({ from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59.999`).toISOString(), page: '1', pageSize: '100' });
      if (locationId) query.set('locationId', locationId);
      const first = await data<SalesDetails>(await fetch(`${API}/reports/sales-details?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }));
      if (first.total > 50000) throw new Error('This export contains more than 50,000 invoices. Narrow the date range and export again.');
      const full = [first];
      for (let index = 2; index <= first.totalPages; index += 1) {
        const next = new URLSearchParams(query); next.set('page', String(index));
        full.push(await data<SalesDetails>(await fetch(`${API}/reports/sales-details?${next}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })));
      }
      rows = full.flatMap((part) => part.rows.map((item) => [item.invoiceNumber, item.location.name, item.status, item.netTotal, item.createdAt]));
    } else if (report === 'stock') rows = (stock?.rows ?? []).map((item) => [item.locationName, item.productName, item.variantName, item.sku, item.available, item.baseUnit, item.cartons ?? '', item.looseBaseUnits, item.inTransit, item.reserved, item.quarantined, item.lowStock ? 'Yes' : 'No']);
    else rows = tableData?.rows ?? [];
    const headers = report === 'sales' ? ['Invoice', 'Location', 'Status', 'Net total', 'Created at'] : report === 'stock' ? ['Location', 'Product', 'Variant', 'SKU', 'Available base units', 'Base unit', 'Cartons', 'Loose units', 'In transit', 'Reserved', 'Quarantined', 'Low stock'] : (tableData?.headers ?? []);
    return { headers, rows };
  }

  async function exportCsv() {
    setBusy(true); setError('');
    try {
      const { headers, rows } = await getExportData();
      const csv = [headers, ...rows].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `premium-retail-${report}-${from}-to-${to}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to export this report.'); }
    finally { setBusy(false); }
  }

  async function exportPdf() {
    setBusy(true); setError('');
    try {
      const { headers, rows } = await getExportData();
      const reportTitle = report === 'sales' ? 'Sales detail' : report === 'stock' ? 'Current stock' : (tableData?.title ?? 'Operations report');
      const description = `${rows.length.toLocaleString('en-IN')} records · ${locationId ? locations.find((location) => location.id === locationId)?.name ?? 'Assigned location' : 'All assigned locations'}`;
      downloadPdf(reportTitle, description, headers, rows, `premium-retail-${report}-${from}-to-${to}.csv`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to export this report as PDF.'); }
    finally { setBusy(false); }
  }

  if (!token) return <main className={styles.page}><section className={styles.login}><a href="/dashboard">← Dashboard</a><div className={styles.mark}>P</div><small>PREMIUM RETAIL · REPORTING</small><h1>Reports</h1><p>Sign in with a manager or administrator account to view authorized store data.</p><form onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>{error && <div className={styles.error}>{error}</div>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><small>Every report is restricted to locations assigned to your account.</small></section></main>;

  return <main className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/dashboard"><span className={styles.mark}>P</span><span><strong>Premium Retail</strong><small>REPORTING</small></span></a><div className={styles.headerRight}><span className={styles.api}><i /> REAL API</span><button className={styles.secondary} onClick={() => setShowNotifications((value) => !value)}>Alerts {notifications ? `(${notifications.unread} unread)` : ''}</button><button className={styles.secondary} onClick={() => { void revokeSession(token); sessionStorage.removeItem('pos-reports-token'); setToken(''); setSales(null); setStock(null); setNotifications(null); }}>Sign out</button></div></header>
    <section className={styles.content}>
      <div className={styles.heading}><div><small>RETAIL OPERATIONS / REPORTS</small><h1>Reports</h1><p>Live sales and inventory records within your assigned location scope.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={() => void exportPdf()} disabled={busy || (!sales && !stock && !tableData)}>Download PDF ↓</button><button className={styles.primary} onClick={() => void exportCsv()} disabled={busy || (!sales && !stock && !tableData)}>Export CSV ↓</button></div></div>
      {showNotifications && <section className={styles.card}><div className={styles.cardHead}><div><small>IN-APP ALERTS · LIVE</small><h2>Needs attention</h2><p>Active items for your authorized locations. SMS and WhatsApp delivery are not enabled.</p></div></div><div className={styles.alertList}>{notifications?.items.map((item) => <div className={styles.alert} key={item.id}><span className={item.type === 'REPLENISHMENT_APPROVAL' ? styles.alertDot : styles.alertDotWarning} /><a href={item.href}><span><strong>{item.title}</strong><small>{item.message}</small></span></a>{item.readAt ? <small className={styles.readLabel}>Read</small> : <button className={styles.readButton} onClick={() => void markRead(item.id)}>Mark read</button>}</div>)}{!notifications?.items.length && <p className={styles.empty}>No active alerts.</p>}</div></section>}
      <section className={styles.filters}><label>Location<select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{['ADMIN', 'SUPER_ADMIN'].includes(role) && <option value="">All assigned locations</option>}{locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name} · {loc.type.replaceAll('_', ' ')}</option>)}</select></label><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className={styles.secondary} disabled={busy} onClick={refresh}>{busy ? 'Loading…' : 'Apply filters'}</button></section>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tabs}>{([['sales', 'Sales'], ['stock', 'Current stock'], ['lowStock', 'Low stock'], ['ledger', 'Movement ledger'], ['transferDiscrepancies', 'Transfer discrepancies'], ['auditVariances', 'Audit variances'], ...(role === 'SUPER_ADMIN' ? [['priceChanges', 'Price history'] as [ReportKind, string]] : []), ['cancellations', 'Cancelled sales'], ['itemDeletions', 'Item deactivations']] as Array<[ReportKind, string]>).map(([key, label]) => <button className={report === key ? styles.selected : ''} onClick={() => setReport(key)} key={key}>{label}</button>)}</div>
      {report === 'sales' && sales && <>
        <section className={styles.kpis}><article><small>NET SALES</small><strong>₹{Number(sales.totals.netSales).toLocaleString('en-IN')}</strong></article><article><small>COMPLETED INVOICES</small><strong>{sales.totals.completedInvoices.toLocaleString('en-IN')}</strong></article><article><small>CANCELLED INVOICES</small><strong>{sales.totals.cancelledInvoices.toLocaleString('en-IN')}</strong></article><article><small>LOCATIONS IN SCOPE</small><strong>{sales.locations.length.toLocaleString('en-IN')}</strong></article></section>
        <section className={styles.grid}><article className={styles.card}><div className={styles.cardHead}><div><small>PERFORMANCE</small><h2>Daily sales</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Invoices</th><th>Cancelled</th><th>Net sales</th></tr></thead><tbody>{sales.daily.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.invoices}</td><td>{row.cancelled}</td><td>₹{Number(row.netSales).toLocaleString('en-IN')}</td></tr>)}{!sales.daily.length && <tr><td colSpan={4}>No sales in this period.</td></tr>}</tbody></table></div></article><article className={styles.card}><div className={styles.cardHead}><div><small>LOCATION BREAKDOWN</small><h2>Sales by location</h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>Location</th><th>Invoices</th><th>Net sales</th></tr></thead><tbody>{sales.locations.map((row) => <tr key={row.locationId}><td>{row.locationName}</td><td>{row.invoices}</td><td>₹{Number(row.netSales).toLocaleString('en-IN')}</td></tr>)}{!sales.locations.length && <tr><td colSpan={3}>No authorized location data.</td></tr>}</tbody></table></div></article></section>
        <section className={styles.card}><div className={styles.cardHead}><div><small>SALES DETAIL</small><h2>Invoices</h2><p>{salesDetails?.total.toLocaleString('en-IN') ?? 0} invoices · page {salesDetails?.page ?? 1} of {salesDetails?.totalPages ?? 1}</p></div></div><div className={styles.tableWrap}><table><thead><tr><th>Invoice</th><th>Location</th><th>Status</th><th>Net total</th><th>Created</th></tr></thead><tbody>{salesDetails?.rows.map((row) => <tr key={row.id}><td>{row.invoiceNumber}</td><td>{row.location.name}</td><td><span className={styles.pill}>{row.status}</span></td><td>₹{Number(row.netTotal).toLocaleString('en-IN')}</td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}{!salesDetails?.rows.length && <tr><td colSpan={5}>No invoices in this period.</td></tr>}</tbody></table></div><div className={styles.pager}><button className={styles.secondary} disabled={busy || page <= 1} onClick={async () => { const next = page - 1; setPage(next); setBusy(true); try { await load(token, locationId, from, to, next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load invoices.'); } finally { setBusy(false); } }}>Previous</button><button className={styles.secondary} disabled={busy || page >= (salesDetails?.totalPages ?? 1)} onClick={async () => { const next = page + 1; setPage(next); setBusy(true); try { await load(token, locationId, from, to, next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load invoices.'); } finally { setBusy(false); } }}>Next</button></div>{sales.truncated && <p className={styles.note}>Sales totals are capped at 10,000 invoices per request. Narrow the date range for exact totals.</p>}</section>
      </>}
      {report === 'stock' && stock && <><section className={styles.kpis}><article><small>ACTIVE VARIANTS</small><strong>{stock.totals.variants.toLocaleString('en-IN')}</strong></article><article><small>AVAILABLE BASE UNITS</small><strong>{stock.totals.availableBaseUnits.toLocaleString('en-IN')}</strong></article><article><small>LOW STOCK VARIANTS</small><strong>{stock.totals.lowStockVariants.toLocaleString('en-IN')}</strong></article><article><small>NEGATIVE BALANCES</small><strong>{stock.totals.negativeStockVariants.toLocaleString('en-IN')}</strong></article></section><section className={styles.card}><div className={styles.cardHead}><div><small>INVENTORY CONTROL</small><h2>Current stock by variant</h2><p>Quantities are stored in base units; carton and loose-unit values use the configured conversion.</p></div></div><div className={styles.tableWrap}><table><thead><tr><th>Location</th><th>Product / variant</th><th>SKU</th><th>Available</th><th>Cartons</th><th>Loose</th><th>In transit</th><th>Reserved</th><th>Quarantined</th><th>Status</th></tr></thead><tbody>{stock.rows.map((row) => <tr key={`${row.locationName}-${row.sku}`}><td>{row.locationName}</td><td>{row.productName}<small className={styles.subline}>{row.variantName}</small></td><td>{row.sku}</td><td>{row.available} {row.baseUnit}</td><td>{row.cartons ?? '—'}</td><td>{row.looseBaseUnits}</td><td>{row.inTransit}</td><td>{row.reserved}</td><td>{row.quarantined}</td><td>{row.negativeStock ? <span className={styles.danger}>Negative</span> : row.lowStock ? <span className={styles.warning}>Reorder</span> : <span className={styles.ok}>In range</span>}</td></tr>)}{!stock.rows.length && <tr><td colSpan={10}>No active inventory records found.</td></tr>}</tbody></table></div></section></>}
      {report !== 'sales' && report !== 'stock' && tableData && <section className={styles.card}><div className={styles.cardHead}><div><small>OPERATIONS REPORT</small><h2>{tableData.title}</h2><p>{tableData.description}</p></div></div><div className={styles.tableWrap}><table><thead><tr>{tableData.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{tableData.rows.map((row, index) => <tr key={`${index}-${row[0]}`}>{row.map((value, column) => <td key={`${column}-${value}`}>{value}</td>)}</tr>)}{!tableData.rows.length && <tr><td colSpan={tableData.headers.length || 1}>No records found in this period.</td></tr>}</tbody></table></div></section>}
      <footer className={styles.footer}>Report access is enforced by the API. CSV and PDF downloads use only records returned within your authorized scope.</footer>
    </section>
  </main>;
}
