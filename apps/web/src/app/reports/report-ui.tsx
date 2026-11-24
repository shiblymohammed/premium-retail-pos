/* Shared types, formatters and icons for the Reports page and its tab views. */
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Circle,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Banknote,
  IndianRupee,
  ListFilter,
  MapPin,
  Package,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
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

export function formatMoney(currency: string, amount: number, fractionDigits = 2) {
  if (!/^[A-Z]{3}$/.test(currency)) return amount.toFixed(fractionDigits);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount);
}

export function formatCompactMoney(currency: string, amount: number) {
  if (Math.abs(amount) < 1000 || !/^[A-Z]{3}$/.test(currency)) return formatMoney(currency, amount);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount);
}

/** "2026-11-17" → "17 Nov" (timezone-safe: parsed as a calendar date). */
export function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  bell: Bell,
  download: Download,
  calendar: CalendarDays,
  mapPin: MapPin,
  fileText: FileText,
  filter: ListFilter,
  check: Check,
  x: X,
  alert: TriangleAlert,
  search: Search,
  rupee: IndianRupee,
  money: Banknote,
  receipt: ReceiptText,
  store: Store,
  arrow: ArrowRight,
  spark: Sparkles,
  box: Package,
  truck: Truck,
  tag: Tag,
  user: UserRound,
  trash: Trash2,
  clipboard: ClipboardList,
  up: TrendingUp,
  down: TrendingDown,
  swap: ArrowLeftRight,
  shield: ShieldCheck,
  clock: Clock,
  return: Undo2,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />;
}

