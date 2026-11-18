'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import styles from './reports.module.css';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Location = { id: string; name: string; type: string };

type SalesSummary = {
  period: { from: string; to: string };
  totals: { netSales: string; completedInvoices: number; cancelledInvoices: number };
  locations: Array<{ locationId: string; locationName: string; invoices: number; netSales: string; cancelled: number }>;
  daily: Array<{ date: string; invoices: number; netSales: string; cancelled: number }>;
  truncated: boolean;
};

type SalesDetails = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: Array<{
    id: string;
    invoiceNumber: string;
    location: { name: string };
    status: string;
    netTotal: string;
    createdAt: string;
  }>;
};

type StockReport = {
  totals: {
    variants: number;
    availableBaseUnits: number;
    lowStockVariants: number;
    negativeStockVariants: number;
  };
  rows: Array<{
    sku: string;
    productName: string;
    variantName: string;
    locationName: string;
    baseUnit: string;
    available: number;
    cartons: number | null;
    looseBaseUnits: number;
    unitsPerCarton: number | null;
    inTransit: number;
    reserved: number;
    quarantined: number;
    reorderLevelBase: number | null;
    lowStock: boolean;
    negativeStock: boolean;
  }>;
};

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

type TableData = {
  title: string;
  description: string;
  headers: string[];
  rows: string[][];
};

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

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

export default function ReportsPage() {
  const [token, setToken] = useState('demo_token');
  const [role] = useState('SUPER_ADMIN');
  const [locations] = useState<Location[]>(DEMO_LOCATIONS);
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState<ReportKind>('sales');

  const [sales, setSales] = useState<SalesSummary | null>(DEMO_SALES);
  const [salesDetails, setSalesDetails] = useState<SalesDetails | null>(DEMO_SALES_DETAILS);
  const [stock, setStock] = useState<StockReport | null>(DEMO_STOCK);
  const [notifications, setNotifications] = useState<Notifications | null>({
    generatedAt: new Date().toISOString(),
    total: DEMO_NOTIFICATIONS.length,
    unread: DEMO_NOTIFICATIONS.filter(n => !n.readAt).length,
    items: DEMO_NOTIFICATIONS,
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [tableData, setTableData] = useState<TableData | null>(null);

  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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

  // Load Specialized Report datasets
  useEffect(() => {
    if (report === 'sales' || report === 'stock' || report === 'salesDetails') return;

    if (report === 'lowStock') {
      setTableData({
        title: 'Low Stock & Replenishment Reorder Points',
        description: 'Variants at or below reorder threshold across stores',
        headers: ['Location', 'SKU', 'Product & Variant', 'On Hand', 'Reorder Level', 'Replenishment Status'],
        rows: [
          ['North Mall', 'BEV-1056', 'Green Tea Bags (Lemon Mint - 25 bags)', '8 packs', '12 packs', 'Suggested 12 packs'],
          ['Downtown Store', 'SNK-4172', 'Potato Chips (Classic salted - 52 g)', '9 packs', '18 packs', 'Suggested 24 packs'],
          ['Downtown Store', 'PAN-5020', 'Olive Oil Extra Virgin (Cold Pressed - 1 L)', '4 bottles', '8 bottles', 'Suggested 8 bottles'],
          ['West End Outlet', 'PC-2031', 'Herbal Shampoo (Aloe vera - 500 ml)', '-2 bottles', '6 bottles', 'Deficit: Audit Freeze Alert'],
        ],
      });
    } else if (report === 'ledger') {
      setTableData({
        title: 'Immutable Inventory Movement Ledger',
        description: 'Append-only ledger entries recording all physical inventory movements',
        headers: ['Timestamp', 'Type', 'Location', 'SKU', 'Quantity', 'State', 'Source / Destination', 'Actor'],
        rows: [
          ['Today 14:10', 'SALE', 'Downtown Store', 'BEV-1048', '-2 packs', 'AVAILABLE', 'Point of Sale (INV-0842)', 'Rajesh Kumar (Cashier)'],
          ['Today 12:45', 'RETURN_INWARD', 'North Mall', 'SNK-4172', '+1 pack', 'RESTOCKED', 'Customer Return (RET-0041)', 'Anita Sharma (Cashier)'],
          ['Yesterday 18:00', 'STOCK_ADJUSTMENT', 'Downtown Store', 'PAN-5012', '+4 bags', 'AVAILABLE', 'Physical Audit (audit_7891)', 'Store Manager'],
          ['16-Nov 11:30', 'TRANSFER_DISPATCH', 'Central Warehouse', 'HL-J108', '-24 boxes', 'IN_TRANSIT', 'Warehouse -> Downtown', 'Warehouse Logistics'],
        ],
      });
    } else if (report === 'transferDiscrepancies') {
      setTableData({
        title: 'Inter-Store Transfer Discrepancies',
        description: 'Dispatched manifests vs goods physically verified upon arrival',
        headers: ['Transfer Manifest', 'Route', 'SKU', 'Dispatched', 'Received Good', 'Damaged (Quarantine)', 'Shortage'],
        rows: [
          ['TRF-2026-0182', 'Central Warehouse -> North Mall', 'BEV-1056', '24 packs', '22 packs', '2 packs (broken box)', '0 units'],
          ['TRF-2026-0155', 'Central Warehouse -> West End', 'PC-2031', '12 bottles', '10 bottles', '0 units', '2 units missing'],
        ],
      });
    } else if (report === 'auditVariances') {
      setTableData({
        title: 'Stocktake Audit Variance History',
        description: 'Discrepancy logs from off-hours physical counts',
        headers: ['Audit Session', 'Store', 'Date', 'Product & SKU', 'Expected', 'Physical Count', 'Delta Variance', 'Resolution'],
        rows: [
          ['audit_7891', 'Downtown Store', '12-Nov-2026', 'Basmati Royal Rice (PAN-5012)', '60 bags', '64 bags', '+4 bags (Surplus)', 'Approved by Manager (Stock In)'],
          ['audit_6542', 'Downtown Store', '05-Nov-2026', 'Potato Chips (SNK-4172)', '12 packs', '9 packs', '-3 packs (Deficit)', 'Approved: Shelf breakage written off'],
        ],
      });
    } else if (report === 'priceChanges') {
      setTableData({
        title: 'Master Price Alteration Audit Trail (Invariant 10)',
        description: 'Super Admin price change log with documented business justification',
        headers: ['Effective Date', 'SKU & Product', 'Field', 'Old Price (INR)', 'New Price (INR)', 'Authorized By', 'Mandatory Reason'],
        rows: [
          ['10-Nov-2026', 'BEV-1048 (Arabica Coffee)', 'Retail Selling Price', '₹450.00', '₹485.00', 'superadmin@retail.com', 'Supplier raw bean cost increase +8%'],
          ['01-Nov-2026', 'PAN-5020 (Olive Oil 1L)', 'Retail Selling Price', '₹850.00', '₹890.00', 'superadmin@retail.com', 'Import tariff revision quarterly adjust'],
        ],
      });
    } else if (report === 'cancellations') {
      setTableData({
        title: 'Cancelled Invoices & Void Audit Log (OD-08)',
        description: 'Voided transaction records with manual refund tracking and ledger reversal status',
        headers: ['Invoice #', 'Store Branch', 'Cancelled Timestamp', 'Supervisor Authorizer', 'Net Refund (INR)', 'Method', 'Cancellation Reason'],
        rows: [
          ['INV-2026-0600', 'West End Outlet', '15-Nov-2026 14:15', 'Vikram Mehta (Supervisor)', '₹598.00', 'Card (manual)', 'Customer billing error: Duplicate payment charged by terminal'],
          ['INV-2026-0512', 'Downtown Store', '08-Nov-2026 18:30', 'Rajesh Manager', '₹485.00', 'Cash', 'Customer requested walkout before bagging completion'],
        ],
      });
    } else if (report === 'itemDeletions') {
      setTableData({
        title: 'Cashier Cart Line Item Deletions',
        description: 'POS cart deletion security audit trail to detect cashier shrinkage or tampering',
        headers: ['Timestamp', 'Cashier', 'Terminal', 'Product Scanned & Removed', 'Qty', 'Unit Price', 'Supervisor Override'],
        rows: [
          ['Today 13:22', 'Rajesh Kumar (Cashier)', 'Downtown Register 1', 'Organic Dark Chocolate (SNK-4180)', '1 pack', '₹180.00', 'None (Below threshold)'],
          ['Yesterday 17:05', 'Amit Verma (Cashier)', 'West End Register 2', 'Olive Oil 1 L (PAN-5020)', '2 bottles', '₹890.00', 'Authorized by Store Supervisor'],
        ],
      });
    }
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

    if (report === 'sales') {
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
    const reportTitle = tableData ? tableData.title : report.toUpperCase() + ' REPORT';
    const description = `${rows.length} records · ${locationId ? locations.find(l => l.id === locationId)?.name : 'All retail locations'}`;
    downloadPdf(reportTitle, description, headers, rows, `Premium-Retail-Report-${report}-${from}-to-${to}.csv`);
    setNotice(`Exported ${rows.length} records to vector PDF.`);
  }

  return (
    <div className={styles.container}>
      {/* Top Breadcrumb Bar with Notifications Bell */}
      <div className={styles.topBar}>
        <div className={styles.breadcrumb}>
          <span>Intelligence</span>
          <span className={styles.separator}>›</span>
          <span className={styles.currentPage}>Enterprise Reports & Export Center</span>
        </div>

        <div className={styles.topBarRight}>
          <button
            type="button"
            className={`${styles.notificationBtn} ${showNotifications ? styles.active : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
            title="Operational Notifications Drawer"
          >
            <Icon name="bell" size={18} />
            {notifications && notifications.unread > 0 && (
              <span className={styles.unreadBadge}>{notifications.unread}</span>
            )}
          </button>
        </div>
      </div>

      <div className={styles.mainContent}>
        {/* Notification Drawer (Collapsible) */}
        {showNotifications && notifications && (
          <div className={styles.notificationsDrawer}>
            <div className={styles.drawerHeader}>
              <div>
                <h3>In-App Operational Alerts</h3>
                <p>Real-time inventory alerts, transfer discrepancies, and audit lock events</p>
              </div>
              <div className={styles.drawerActions}>
                {notifications.unread > 0 && (
                  <button type="button" onClick={markAllRead} className={styles.btnSmallText}>
                    Mark all as read
                  </button>
                )}
                <button type="button" onClick={() => setShowNotifications(false)} className={styles.iconBtn}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            <div className={styles.alertList}>
              {notifications.items.map((item) => (
                <div key={item.id} className={`${styles.alertCard} ${item.readAt ? styles.alertRead : ''}`}>
                  <div className={styles.alertDot} />
                  <div className={styles.alertBody}>
                    <div className={styles.alertTitleRow}>
                      <strong>{item.title}</strong>
                      <small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <p>{item.message}</p>
                    <div className={styles.alertFooter}>
                      <a href={item.href} className={styles.alertLink}>View details →</a>
                      {!item.readAt && (
                        <button type="button" onClick={() => markRead(item.id)} className={styles.markReadBtn}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback notice */}
        {notice && (
          <div className={styles.noticeAlert}>
            <Icon name="check" size={16} />
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className={styles.iconBtn}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* Page Header with Export Buttons */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Enterprise Intelligence & Reports</h1>
            <p className={styles.pageSubtitle}>
              Audited retail business data across stores: turnover, carton conversions, ledger movements, and discrepancy logs with client-side PDF/CSV document generation.
            </p>
          </div>
          <div className={styles.exportGroup}>
            <button type="button" onClick={handleExportPdf} className={styles.btnSecondary}>
              <Icon name="download" size={16} />
              <span>Download PDF</span>
            </button>
            <button type="button" onClick={handleExportCsv} className={styles.btnPrimary}>
              <Icon name="fileText" size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters Bar: Location Scoping & Date Range */}
        <div className={styles.filterCard}>
          <div className={styles.filterItem}>
            <label>Location Boundary:</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={styles.select}
            >
              <option value="">All Assigned Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.type === 'RETAIL_STORE' ? 'Store' : 'Warehouse'})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterItem}>
            <label>From Date:</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.filterItem}>
            <label>To Date:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.filterPresets}>
            <button
              type="button"
              className={styles.presetChip}
              onClick={() => {
                setFrom(isoDate(new Date(Date.now() - 7 * 86400000)));
                setTo(isoDate(new Date()));
              }}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              className={styles.presetChip}
              onClick={() => {
                setFrom(isoDate(new Date(Date.now() - 30 * 86400000)));
                setTo(isoDate(new Date()));
              }}
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* 9 Core Report Tabs */}
        <div className={styles.reportTabsWrap}>
          {[
            ['sales', '1. Sales Summary'],
            ['salesDetails', '2. Invoices Detail'],
            ['stock', '3. Stock Ledger'],
            ['lowStock', '4. Low Stock Alerts'],
            ['ledger', '5. Movement Ledger'],
            ['transferDiscrepancies', '6. Transfer Discrepancies'],
            ['auditVariances', '7. Audit Variances'],
            ['priceChanges', '8. Price History'],
            ['cancellations', '9. Voided Sales'],
            ['itemDeletions', '10. Item Deletions'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.reportTab} ${report === key ? styles.active : ''}`}
              onClick={() => setReport(key as ReportKind)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* REPORT VIEW 1: Sales Summary */}
        {report === 'sales' && sales && (
          <div className={styles.reportContainer}>
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Net Revenue</span>
                <strong className={styles.kpiValue}>
                  ₹{Number(sales.totals.netSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
                <span className={styles.kpiSub}>Completed transactions</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Finalized Invoices</span>
                <strong className={styles.kpiValue}>
                  {sales.totals.completedInvoices.toLocaleString('en-IN')}
                </strong>
                <span className={styles.kpiSub}>Billed at POS</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Cancelled Voids</span>
                <strong className={styles.kpiValue} style={{ color: '#dc2626' }}>
                  {sales.totals.cancelledInvoices}
                </strong>
                <span className={styles.kpiSub}>Compensated ledger entries</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Stores in Scope</span>
                <strong className={styles.kpiValue}>{sales.locations.length}</strong>
                <span className={styles.kpiSub}>Retail outlets</span>
              </div>
            </div>

            <div className={styles.gridTwoColumns}>
              {/* Daily Sales Table */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>Daily Sales Turnover</h3>
                  <small>Timeline for {from} to {to}</small>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoices</th>
                        <th>Cancelled</th>
                        <th style={{ textAlign: 'right' }}>Net Sales (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.daily.map((row) => (
                        <tr key={row.date}>
                          <td><strong>{row.date}</strong></td>
                          <td>{row.invoices}</td>
                          <td>{row.cancelled}</td>
                          <td style={{ textAlign: 'right' }}>
                            <strong>₹{Number(row.netSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Location Breakdown Table */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>Turnover by Store Branch</h3>
                  <small>Store performance in selected window</small>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Billed Invoices</th>
                        <th style={{ textAlign: 'right' }}>Net Revenue (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.locations.map((loc) => (
                        <tr key={loc.locationId}>
                          <td><strong>{loc.locationName}</strong></td>
                          <td>{loc.invoices}</td>
                          <td style={{ textAlign: 'right' }}>
                            <strong>₹{Number(loc.netSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REPORT VIEW 2: Invoices Detail */}
        {report === 'salesDetails' && salesDetails && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Itemized Sales Transactions</h3>
              <small>{salesDetails.total} invoices recorded</small>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Store Branch</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                    <th style={{ textAlign: 'right' }}>Net Total (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {salesDetails.rows.map((row) => (
                    <tr key={row.id}>
                      <td><span className={styles.monoTag}>{row.invoiceNumber}</span></td>
                      <td>{row.location.name}</td>
                      <td>
                        <span className={row.status === 'FINALIZED' ? styles.tagSuccess : styles.tagDanger}>
                          ● {row.status}
                        </span>
                      </td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>₹{Number(row.netTotal).toFixed(2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT VIEW 3: Stock Ledger Balances */}
        {report === 'stock' && stock && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Current Stock Balances & Packaging Breakdown (OD-02)</h3>
              <small>{stock.totals.variants} variants tracked</small>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Product & Variant</th>
                    <th>SKU</th>
                    <th>Available (Base)</th>
                    <th>Carton Breakdown (OD-02)</th>
                    <th>In-Transit (OD-05)</th>
                    <th>Reserved</th>
                    <th>Quarantined</th>
                    <th>Health Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.rows.map((row) => (
                    <tr key={`${row.locationName}-${row.sku}`}>
                      <td>{row.locationName}</td>
                      <td>
                        <strong>{row.productName}</strong>
                        <div className={styles.subText}>{row.variantName}</div>
                      </td>
                      <td><span className={styles.monoTag}>{row.sku}</span></td>
                      <td><strong>{row.available} {row.baseUnit}</strong></td>
                      <td>
                        {row.cartons !== null ? `${row.cartons} ctn + ${row.looseBaseUnits} loose` : 'Packet-Only'}
                      </td>
                      <td><span className={row.inTransit > 0 ? styles.inTransitText : ''}>+{row.inTransit}</span></td>
                      <td>{row.reserved}</td>
                      <td>{row.quarantined}</td>
                      <td>
                        {row.negativeStock ? (
                          <span className={styles.tagDanger}>Negative (OD-03)</span>
                        ) : row.lowStock ? (
                          <span className={styles.tagWarning}>Low Stock</span>
                        ) : (
                          <span className={styles.tagSuccess}>Healthy</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT VIEW 4+: Specialized Reports (4 - 10) */}
        {report !== 'sales' && report !== 'salesDetails' && report !== 'stock' && tableData && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>{tableData.title}</h3>
                <small>{tableData.description}</small>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {tableData.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((r, rowIndex) => (
                    <tr key={rowIndex}>
                      {r.map((cell, colIndex) => (
                        <td key={colIndex}>
                          {colIndex === 0 ? <strong>{cell}</strong> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
