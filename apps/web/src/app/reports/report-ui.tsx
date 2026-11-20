/* Shared types, formatters and icons for the Reports page and its tab views. */
import React from 'react';

export type SalesSummary = {
  period: { from: string; to: string };
  totals: { netSales: string; completedInvoices: number; cancelledInvoices: number };
  locations: Array<{ locationId: string; locationName: string; invoices: number; netSales: string; cancelled: number }>;
  daily: Array<{ date: string; invoices: number; netSales: string; cancelled: number }>;
  truncated: boolean;
};

export type SalesDetails = {
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

export type StockReport = {
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

export type TableData = {
  title: string;
  description: string;
  headers: string[];
  rows: string[][];
};

export function formatInr(amount: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount);
}

export function formatCompactInr(amount: number) {
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(2).replace(/\.?0+$/, '')}L`;
  if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `₹${Math.round(amount)}`;
}

/** "2026-11-17" → "17 Nov" (timezone-safe: parsed as a calendar date). */
export function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
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
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></>,
    rupee: <path d="M7 5h10M7 9.5h10M10 5c5 0 5 9 0 9H7l7 6" />,
    receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.1 2.5-2.5 2.5h-3C9.1 12.5 8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10Z" /><path d="M10 20v-5h4v5" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
    tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
    up: <path d="M12 19V5M6 11l6-6 6 6" />,
    down: <path d="M12 5v14M6 13l6 6 6-6" />,
    swap: <path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4" />,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

