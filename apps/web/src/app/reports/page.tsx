'use client';

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

const DEMO_LOCATIONS: Location[] = [
  { id: 'loc_downtown', name: 'Downtown Store', type: 'RETAIL_STORE' },
  { id: 'loc_north_mall', name: 'North Mall', type: 'RETAIL_STORE' },
  { id: 'loc_west_end', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc_warehouse', name: 'Central Warehouse', type: 'WAREHOUSE' },
];

const DEMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_1',
    dedupeKey: 'low_stock_bev',
    type: 'LOW_STOCK',
    title: 'Low Stock Alert: Green Tea Bags',
    message: 'North Mall stock dropped to 8 packs (reorder point: 12). Replenishment transfer advised.',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    readAt: null,
    href: '/products',
  },
  {
    id: 'notif_2',
    dedupeKey: 'negative_stock_pc',
    type: 'NEGATIVE_STOCK',
    title: 'Negative Inventory Warning (OD-03)',
    message: 'West End Outlet has -2 units recorded for Herbal Shampoo. Audit reconciliation needed.',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    readAt: null,
    href: '/audits',
  },
  {
    id: 'notif_3',
    dedupeKey: 'audit_freeze_active',
    type: 'AUDIT_LOCK',
    title: 'ADR-010 Location Freeze Enforced',
    message: 'Downtown Store is currently locked for physical stocktake. Point of sale checkout paused.',
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    readAt: null,
    href: '/audits',
  },
];

const DEMO_SALES: SalesSummary = {
  period: { from: '2026-10-19', to: '2026-11-18' },
  totals: { netSales: '1482000.00', completedInvoices: 384, cancelledInvoices: 6 },
  locations: [
    { locationId: 'loc_downtown', locationName: 'Downtown Store', invoices: 198, netSales: '824000.00', cancelled: 3 },
    { locationId: 'loc_north_mall', locationName: 'North Mall', invoices: 112, netSales: '416000.00', cancelled: 2 },
    { locationId: 'loc_west_end', locationName: 'West End Outlet', invoices: 74, netSales: '242000.00', cancelled: 1 },
  ],
  daily: [
    { date: '2026-11-14', invoices: 48, netSales: '184000.00', cancelled: 1 },
    { date: '2026-11-15', invoices: 62, netSales: '246000.00', cancelled: 0 },
    { date: '2026-11-16', invoices: 54, netSales: '210000.00', cancelled: 2 },
    { date: '2026-11-17', invoices: 78, netSales: '312000.00', cancelled: 1 },
    { date: '2026-11-18', invoices: 64, netSales: '254000.00', cancelled: 0 },
  ],
  truncated: false,
};

const DEMO_SALES_DETAILS: SalesDetails = {
  page: 1,
  pageSize: 10,
  total: 5,
  totalPages: 1,
  rows: [
    { id: '1', invoiceNumber: 'INV-2026-0842', location: { name: 'Downtown Store' }, status: 'FINALIZED', netTotal: '1130.00', createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    { id: '2', invoiceNumber: 'INV-2026-0841', location: { name: 'Downtown Store' }, status: 'FINALIZED', netTotal: '485.00', createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
    { id: '3', invoiceNumber: 'INV-2026-0711', location: { name: 'North Mall' }, status: 'FINALIZED', netTotal: '612.00', createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString() },
    { id: '4', invoiceNumber: 'INV-2026-0699', location: { name: 'West End Outlet' }, status: 'FINALIZED', netTotal: '890.00', createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
    { id: '5', invoiceNumber: 'INV-2026-0600', location: { name: 'West End Outlet' }, status: 'CANCELLED', netTotal: '598.00', createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString() },
  ],
};

const DEMO_STOCK: StockReport = {
  totals: {
    variants: 248,
    availableBaseUnits: 12480,
    lowStockVariants: 18,
    negativeStockVariants: 3,
  },
  rows: [
    { sku: 'BEV-1048', productName: 'Arabica Ground Coffee', variantName: 'Medium roast - 250 g', locationName: 'Downtown Store', baseUnit: 'pack', available: 27, cartons: 2, looseBaseUnits: 3, unitsPerCarton: 12, inTransit: 36, reserved: 6, quarantined: 2, reorderLevelBase: 12, lowStock: false, negativeStock: false },
    { sku: 'BEV-1056', productName: 'Green Tea Bags', variantName: 'Lemon Mint - 25 bags', locationName: 'North Mall', baseUnit: 'pack', available: 8, cartons: 0, looseBaseUnits: 8, unitsPerCarton: 12, inTransit: 24, reserved: 4, quarantined: 0, reorderLevelBase: 12, lowStock: true, negativeStock: false },
    { sku: 'PC-2031', productName: 'Herbal Shampoo', variantName: 'Aloe vera - 500 ml', locationName: 'West End Outlet', baseUnit: 'bottle', available: -2, cartons: null, looseBaseUnits: -2, unitsPerCarton: null, inTransit: 10, reserved: 0, quarantined: 0, reorderLevelBase: 6, lowStock: true, negativeStock: true },
    { sku: 'HL-J108', productName: 'Facial Tissue Box', variantName: '2 ply - 100 sheets', locationName: 'Central Warehouse', baseUnit: 'box', available: 144, cartons: 12, looseBaseUnits: 0, unitsPerCarton: 12, inTransit: 48, reserved: 24, quarantined: 6, reorderLevelBase: 24, lowStock: false, negativeStock: false },
    { sku: 'SNK-4172', productName: 'Potato Chips', variantName: 'Classic salted - 52 g', locationName: 'Downtown Store', baseUnit: 'pack', available: 9, cartons: 0, looseBaseUnits: 9, unitsPerCarton: 24, inTransit: 36, reserved: 12, quarantined: 1, reorderLevelBase: 18, lowStock: true, negativeStock: false },
    { sku: 'PAN-5012', productName: 'Basmati Royal Rice', variantName: 'Long Grain - 5 kg', locationName: 'Central Warehouse', baseUnit: 'bag', available: 64, cartons: 15, looseBaseUnits: 4, unitsPerCarton: 4, inTransit: 40, reserved: 8, quarantined: 0, reorderLevelBase: 16, lowStock: false, negativeStock: false },
  ],
};

/** Specialised report datasets (demo data until the matching API endpoints are wired). */
const SPECIALIZED_REPORTS: Partial<Record<ReportKind, TableData>> = {
  lowStock: {
    title: 'Low Stock & Replenishment Reorder Points',
    description: 'Variants at or below reorder threshold across stores',
    headers: ['Location', 'SKU', 'Product & Variant', 'On Hand', 'Reorder Level', 'Replenishment Status'],
    rows: [
      ['North Mall', 'BEV-1056', 'Green Tea Bags (Lemon Mint - 25 bags)', '8 packs', '12 packs', 'Suggested 12 packs'],
      ['Downtown Store', 'SNK-4172', 'Potato Chips (Classic salted - 52 g)', '9 packs', '18 packs', 'Suggested 24 packs'],
      ['Downtown Store', 'PAN-5020', 'Olive Oil Extra Virgin (Cold Pressed - 1 L)', '4 bottles', '8 bottles', 'Suggested 8 bottles'],
      ['West End Outlet', 'PC-2031', 'Herbal Shampoo (Aloe vera - 500 ml)', '-2 bottles', '6 bottles', 'Deficit: Audit Freeze Alert'],
    ],
  },
  ledger: {
    title: 'Immutable Inventory Movement Ledger',
    description: 'Append-only ledger entries recording all physical inventory movements',
    headers: ['Timestamp', 'Type', 'Location', 'SKU', 'Quantity', 'State', 'Source / Destination', 'Actor'],
    rows: [
      ['Today 14:10', 'SALE', 'Downtown Store', 'BEV-1048', '-2 packs', 'AVAILABLE', 'Point of Sale (INV-0842)', 'Rajesh Kumar (Cashier)'],
      ['Today 12:45', 'RETURN_INWARD', 'North Mall', 'SNK-4172', '+1 pack', 'RESTOCKED', 'Customer Return (RET-0041)', 'Anita Sharma (Cashier)'],
      ['Yesterday 18:00', 'STOCK_ADJUSTMENT', 'Downtown Store', 'PAN-5012', '+4 bags', 'AVAILABLE', 'Physical Audit (audit_7891)', 'Store Manager'],
      ['16-Nov 11:30', 'TRANSFER_DISPATCH', 'Central Warehouse', 'HL-J108', '-24 boxes', 'IN_TRANSIT', 'Warehouse -> Downtown', 'Warehouse Logistics'],
    ],
  },
  transferDiscrepancies: {
    title: 'Inter-Store Transfer Discrepancies',
    description: 'Dispatched manifests vs goods physically verified upon arrival',
    headers: ['Transfer Manifest', 'Route', 'SKU', 'Dispatched', 'Received Good', 'Damaged (Quarantine)', 'Shortage'],
    rows: [
      ['TRF-2026-0182', 'Central Warehouse -> North Mall', 'BEV-1056', '24 packs', '22 packs', '2 packs (broken box)', '0 units'],
      ['TRF-2026-0155', 'Central Warehouse -> West End', 'PC-2031', '12 bottles', '10 bottles', '0 units', '2 units missing'],
    ],
  },
  auditVariances: {
    title: 'Stocktake Audit Variance History',
    description: 'Discrepancy logs from off-hours physical counts',
    headers: ['Audit Session', 'Store', 'Date', 'Product & SKU', 'Expected', 'Physical Count', 'Delta Variance', 'Resolution'],
    rows: [
      ['audit_7891', 'Downtown Store', '12-Nov-2026', 'Basmati Royal Rice (PAN-5012)', '60 bags', '64 bags', '+4 bags (Surplus)', 'Approved by Manager (Stock In)'],
      ['audit_6542', 'Downtown Store', '05-Nov-2026', 'Potato Chips (SNK-4172)', '12 packs', '9 packs', '-3 packs (Deficit)', 'Approved: Shelf breakage written off'],
    ],
  },
  priceChanges: {
    title: 'Master Price Alteration Audit Trail (Invariant 10)',
    description: 'Super Admin price change log with documented business justification',
    headers: ['Effective Date', 'SKU & Product', 'Field', 'Old Price (INR)', 'New Price (INR)', 'Authorized By', 'Mandatory Reason'],
    rows: [
      ['10-Nov-2026', 'BEV-1048 (Arabica Coffee)', 'Retail Selling Price', '₹450.00', '₹485.00', 'superadmin@retail.com', 'Supplier raw bean cost increase +8%'],
      ['01-Nov-2026', 'PAN-5020 (Olive Oil 1L)', 'Retail Selling Price', '₹850.00', '₹890.00', 'superadmin@retail.com', 'Import tariff revision quarterly adjust'],
    ],
  },
  cancellations: {
    title: 'Cancelled Invoices & Void Audit Log (OD-08)',
    description: 'Voided transaction records with manual refund tracking and ledger reversal status',
    headers: ['Invoice #', 'Store Branch', 'Cancelled Timestamp', 'Supervisor Authorizer', 'Net Refund (INR)', 'Method', 'Cancellation Reason'],
    rows: [
      ['INV-2026-0600', 'West End Outlet', '15-Nov-2026 14:15', 'Vikram Mehta (Supervisor)', '₹598.00', 'Card (manual)', 'Customer billing error: Duplicate payment charged by terminal'],
      ['INV-2026-0512', 'Downtown Store', '08-Nov-2026 18:30', 'Rajesh Manager', '₹485.00', 'Cash', 'Customer requested walkout before bagging completion'],
    ],
  },
  itemDeletions: {
    title: 'Cashier Cart Line Item Deletions',
    description: 'POS cart deletion security audit trail to detect cashier shrinkage or tampering',
    headers: ['Timestamp', 'Cashier', 'Terminal', 'Product Scanned & Removed', 'Qty', 'Unit Price', 'Supervisor Override'],
    rows: [
      ['Today 13:22', 'Rajesh Kumar (Cashier)', 'Downtown Register 1', 'Organic Dark Chocolate (SNK-4180)', '1 pack', '₹180.00', 'None (Below threshold)'],
      ['Yesterday 17:05', 'Amit Verma (Cashier)', 'West End Register 2', 'Olive Oil 1 L (PAN-5020)', '2 bottles', '₹890.00', 'Authorized by Store Supervisor'],
    ],
  },
};

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
  const [token, setToken] = useState('demo_token');
  const [role] = useState('SUPER_ADMIN');
  const [locations] = useState<Location[]>(DEMO_LOCATIONS);
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState<ReportKind>('overview');

  const [sales] = useState<SalesSummary | null>(DEMO_SALES);
  const [salesDetails] = useState<SalesDetails | null>(DEMO_SALES_DETAILS);
  const [stock] = useState<StockReport | null>(DEMO_STOCK);
  const [notifications, setNotifications] = useState<Notifications | null>({
    generatedAt: new Date().toISOString(),
    total: DEMO_NOTIFICATIONS.length,
    unread: DEMO_NOTIFICATIONS.filter(n => !n.readAt).length,
    items: DEMO_NOTIFICATIONS,
  });
  const [showNotifications, setShowNotifications] = useState(false);
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

    const stored = window.localStorage.getItem('premium-retail-location-scope');
    if (stored && stored !== 'All retail locations' && stored !== 'All locations') {
      const matched = DEMO_LOCATIONS.find((l) => l.name === stored);
      if (matched) setLocationId(matched.id);
    }

    const syncLocation = (event: Event) => {
      const locName = (event as CustomEvent<string>).detail;
      const found = DEMO_LOCATIONS.find((l) => l.name === locName);
      setLocationId(found ? found.id : '');
    };

    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, []);

  // Deep link: /reports?tab=stock opens that tab; switching tabs keeps the URL in sync.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && REPORT_TABS.some((t) => t.key === requested)) setReport(requested as ReportKind);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (report === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', report);
    window.history.replaceState(null, '', url);
  }, [report]);

  // Load Specialized Report datasets
  useEffect(() => {
    if (report === 'overview' || report === 'sales' || report === 'stock' || report === 'salesDetails') return;
    setTableData(SPECIALIZED_REPORTS[report] ?? null);
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
  const reportLabel = REPORT_TABS.find((t) => t.key === report)?.label ?? 'Overview';

  return (
    <div className={styles.page}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p>{rangeLabel} · {scopeName} · {reportLabel}</p>
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
        <div className={styles.tabs} role="tablist" aria-label="Report type">
          {REPORT_TABS.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={report === tab.key} className={report === tab.key ? styles.tabActive : ''} onClick={() => setReport(tab.key)}>
              {tab.label}
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

      {/* ---------- Alerts drawer ---------- */}
      {showNotifications && notifications && (
        <section className={`${styles.card} ${styles.alerts}`}>
          <div className={styles.cardHead}>
            <div>
              <h2>Operational alerts</h2>
              <p>Inventory alerts, transfer discrepancies and audit lock events</p>
            </div>
            <div className={styles.cardHeadActions}>
              {notifications.unread > 0 && <button type="button" onClick={markAllRead} className={styles.textButton}>Mark all as read</button>}
              <button type="button" onClick={() => setShowNotifications(false)} className={styles.iconButton} aria-label="Close alerts"><Icon name="x" size={16} /></button>
            </div>
          </div>
          <div className={styles.alertList}>
            {notifications.items.map((item) => (
              <div key={item.id} className={`${styles.alertItem} ${item.readAt ? styles.alertRead : ''}`}>
                <span className={`${styles.alertIcon} ${item.type === 'NEGATIVE_STOCK' ? styles.toneRed : item.type === 'LOW_STOCK' ? styles.toneAmber : styles.toneBlue}`}><Icon name="alert" size={15} /></span>
                <div className={styles.alertBody}>
                  <div className={styles.alertTop}><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
                  <p>{item.message}</p>
                  <div className={styles.alertFoot}>
                    <a href={item.href}>View details →</a>
                    {!item.readAt && <button type="button" onClick={() => markRead(item.id)}>Dismiss</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {notice && (
        <div className={styles.notice} role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

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
                {!scopedStores.length && <div className={styles.empty}>Warehouses do not record POS sales.</div>}
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
                  <h2>Stock cover vs. reorder level</h2>
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

          <section className={styles.rowGrid}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Daily turnover</h2>
                  <p>Network net sales for the last {daily.length} trading days</p>
                </div>
                {bestDay && <span className={styles.highlightPill}>Best day: {formatDay(bestDay.date)} · {formatCompactInr(Number(bestDay.netSales))}</span>}
              </div>
              <div className={styles.columns}>
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
              </div>
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

