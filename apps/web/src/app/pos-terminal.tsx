'use client';

import { downloadPdf } from '@/lib/report-download';

import { useAccess } from '@/lib/permissions';
import { AdminModal } from '@/components/admin/admin-modal';
import { CashDrawer } from './cash-drawer';
import { countInUnit, ReturnHistory, soldUnitPrice, type SaleReturnRecord } from '@/components/sales/return-history';
import { InfoHint } from '@/components/ui/info-hint';
import {
  ArrowRight,
  CloudUpload,
  Coffee,
  Cookie,
  CookingPot,
  CupSoda,
  Ellipsis,
  Plus,
  ReceiptText,
  Sandwich,
  Scroll,
  Search,
  ShoppingBag,
  ShoppingCart,
  SoapDispenserDroplet,
  SprayCan,
  TriangleAlert,
  Undo2,
  Wheat,
  X,
} from 'lucide-react';
import { Feedback } from '@/components/ui/feedback';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, getStoredSession } from '@/lib/auth';
import { quickCashAmounts, SETTINGS_STORAGE_PREFIX, type UserPreferences } from '@/components/settings/types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Variant = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  isActive: boolean;
};

type Product = {
  id: string;
  name: string;
  category?: { id: string; name: string } | null;
  baseUnit: string;
  unitsPerCarton: number | null;
  sellByCarton?: boolean;
  hasVariants: boolean;
  sellingPrice: string;
  variants: Variant[];
};

type TerminalContext = {
  access?: { checkout: boolean; drawer: boolean; receipts: boolean };
  cashierUserId: string;
  location: { id: string; name: string; type: string; currency: string; timezone?: string; isAuditLocked?: boolean; requireCheckoutDrawer?: boolean };
};

type SaleUnit = 'BASE_UNIT' | 'CARTON';

type CartLine = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  baseUnit: string;
  quantity: number;
  unit: SaleUnit;
  unitsPerCarton: number;
  sellingPrice: number;
};

function baseQuantity(line: CartLine) {
  return line.quantity * (line.unit === 'CARTON' ? line.unitsPerCarton : 1);
}

function cartKey(line: Pick<CartLine, 'variantId' | 'unit'>) {
  return `${line.variantId}:${line.unit}`;
}

type StockBalance = {
  quantityBaseUnits: number;
  formattedQuantity: string;
  negativeAvailable?: boolean;
  lowStock?: boolean;
  warning?: string;
};

type SaleReceipt = {
  id: string;
  invoiceNumber: string;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  payment?: { method: string; amount: string; cashTenderedAmount?: string | null; changeGivenAmount?: string | null };
  lines: Array<{ id: string; quantityBaseUnits: number; enteredUnit?: string; conversionRatioUsed?: number | null; unitPriceAtSale: string; lineTotal: string; variant: { sku: string; name: string; product: { name: string; baseUnit: string } } }>;
  returns?: SaleReturnRecord[];
  createdAt: string;
};

type SaleControlInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  location: { id: string; name: string; company?: { timezone?: string; currency?: string } };
  refundDrawer?: { requiredForCash: boolean; open: boolean; canManage: boolean };
  createdAt: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  payment?: { method: string; amount: string; recordedAt: string };
  lines: Array<{
    id: string;
    quantityBaseUnits: number;
    returnedQuantityBaseUnits: number;
    enteredUnit?: string;
    conversionRatioUsed?: number | null;
    unitPriceAtSale: string;
    lineTotal: string;
    variant: { id: string; sku: string; name: string; product: { name: string; baseUnit: string } };
  }>;
  returns: SaleReturnRecord[];
  permissions: { canCancelSales: boolean; canProcessReturns: boolean };
};

type SalesPermissions = { canCancelSales: boolean; canProcessReturns: boolean };

type QueuedSale = {
  idempotencyKey: string;
  body: string;
  ownerUserId: string;
  locationId: string;
  createdAt: string;
  status: 'queued' | 'needs_review';
  error?: string;
};

type OfflineQuote = { body: Record<string, any>; netTotal: string };

function getProductIcon(product: Product) {
  const name = product.name.toLowerCase();
  if (/water|juice|milk|drink/.test(name)) return CupSoda;
  if (/coffee|tea/.test(name)) return Coffee;
  if (/shampoo|lotion|detergent|clean/.test(name)) return SprayCan;
  if (/tissue|paper|napkin/.test(name)) return Scroll;
  if (/chip|snack|biscuit|cookie/.test(name)) return Cookie;
  if (/honey|sauce|jam/.test(name)) return CookingPot;
  if (/soap/.test(name)) return SoapDispenserDroplet;
  if (/bread|loaf|bakery/.test(name)) return Sandwich;
  if (/rice|grain|pasta|flour/.test(name)) return Wheat;
  return product.category?.name.toLowerCase().includes('personal') ? SprayCan : ShoppingBag;
}

const OFFLINE_DB_NAME = 'premium-retail-pos-offline';
const OFFLINE_STORE_NAME = 'sales';

function openOfflineSalesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        request.result.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'idempotencyKey' });
      }
      if (!request.result.objectStoreNames.contains('products')) {
        request.result.createObjectStore('products', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the offline sale queue'));
  });
}

async function readOfflineSales(): Promise<QueuedSale[]> {
  const db = await openOfflineSalesDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OFFLINE_STORE_NAME, 'readonly').objectStore(OFFLINE_STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result as QueuedSale[]); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not read the offline sale queue')); };
  });
}

async function saveOfflineSale(sale: QueuedSale) {
  const db = await openOfflineSalesDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(OFFLINE_STORE_NAME, 'readwrite').objectStore(OFFLINE_STORE_NAME).put(sale);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not save this sale for synchronization')); };
  });
}

async function deleteOfflineSale(idempotencyKey: string) {
  const db = await openOfflineSalesDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(OFFLINE_STORE_NAME, 'readwrite').objectStore(OFFLINE_STORE_NAME).delete(idempotencyKey);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not remove the synchronized sale')); };
  });
}

async function replaceOfflineProducts(products: Product[], locationId: string) {
  const safeProducts = products.map((product) => ({
    id: product.id,
    cachedLocationId: locationId,
    name: product.name,
    baseUnit: product.baseUnit,
    unitsPerCarton: product.unitsPerCarton,
    sellByCarton: product.sellByCarton,
    hasVariants: product.hasVariants,
    sellingPrice: product.sellingPrice,
    variants: (product.variants || []).filter((variant) => variant.isActive).map((variant) => ({
      id: variant.id, sku: variant.sku, barcode: variant.barcode, name: variant.name, isActive: true,
    })),
  }));
  const db = await openOfflineSalesDb();
  return new Promise<void>((resolve, reject) => {
    const store = db.transaction('products', 'readwrite').objectStore('products');
    store.clear();
    for (const product of safeProducts) store.put(product);
    const transaction = store.transaction;
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not cache the product catalogue')); };
  });
}

async function saveOfflineProducts(products: Product[], locationId: string) {
  const db = await openOfflineSalesDb();
  return new Promise<void>((resolve, reject) => {
    const store = db.transaction('products', 'readwrite').objectStore('products');
    for (const product of products) store.put({
      id: product.id,
      cachedLocationId: locationId,
      name: product.name,
      baseUnit: product.baseUnit,
      unitsPerCarton: product.unitsPerCarton,
      sellByCarton: product.sellByCarton,
      hasVariants: product.hasVariants,
      sellingPrice: product.sellingPrice,
      variants: (product.variants || []).filter((variant) => variant.isActive).map((variant) => ({
        id: variant.id, sku: variant.sku, barcode: variant.barcode, name: variant.name, isActive: true,
      })),
    });
    const transaction = store.transaction;
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not update cached product details')); };
  });
}

async function findOfflineProducts(term: string, locationId: string): Promise<Product[]> {
  const db = await openOfflineSalesDb();
  const products = await new Promise<Product[]>((resolve, reject) => {
    const request = db.transaction('products', 'readonly').objectStore('products').getAll();
    request.onsuccess = () => resolve(request.result as Product[]);
    request.onerror = () => reject(request.error || new Error('Could not search the offline catalogue'));
  });
  db.close();
  const cleaned = term.trim().toLowerCase();
  return products.filter((product) => (product as Product & { cachedLocationId?: string }).cachedLocationId === locationId)
    .filter((product) => product.name.toLowerCase().includes(cleaned)
    || product.variants.some((variant) => [variant.sku, variant.barcode || '', variant.name].some((value) => value.toLowerCase().includes(cleaned))));
}

async function refreshOfflineCatalog(accessToken: string, locationId: string) {
  const response = await fetch(`${API_BASE}/pos/catalog?locationId=${encodeURIComponent(locationId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  await replaceOfflineProducts(payload.data as Product[], locationId);
}

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return typeof payload.message === 'string' ? payload.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

function parsePercent(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

export default function PosTerminal() {
  const [token, setToken] = useState('');
  const [opening, setOpening] = useState(true);
  const [terminalRetry, setTerminalRetry] = useState(0);
  const [terminal, setTerminal] = useState<TerminalContext | null>(null);
  const [checkoutRole, setCheckoutRole] = useState('');
  const [storeOptions, setStoreOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [checkoutLocation, setCheckoutLocation] = useState('');
  const { can } = useAccess();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refundDrawerOpen, setRefundDrawerOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [cashDrawerId, setCashDrawerId] = useState<string | null>(null);
  const [receiptHistoryOpen, setReceiptHistoryOpen] = useState(false);
  const [receiptHistory, setReceiptHistory] = useState<SaleReceipt[] | null>(null);
  const [receiptHistoryError, setReceiptHistoryError] = useState('');
  const [receiptQuery, setReceiptQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [browseProducts, setBrowseProducts] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const [catalogSort, setCatalogSort] = useState<'name' | 'price-low' | 'price-high'>('name');
  const [stockBalances, setStockBalances] = useState<Record<string, StockBalance>>({});
  const [stockError, setStockError] = useState('');
  const [discountLimit, setDiscountLimit] = useState(0);
  const [salesPermissions, setSalesPermissions] = useState<SalesPermissions>({ canCancelSales: false, canProcessReturns: false });
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [saleControl, setSaleControl] = useState<SaleControlInvoice | null>(null);
  const [controlReason, setControlReason] = useState('');
  const [confirmedGoodsReturned, setConfirmedGoodsReturned] = useState(false);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'ONLINE' | 'OTHER'>('CASH');
  const [refundReference, setRefundReference] = useState('');
  const [returnLines, setReturnLines] = useState<Record<string, { quantity: string; disposition: 'RESTOCKED' | 'QUARANTINED'; inspectionNotes: string }>>({});
  const [controlBusy, setControlBusy] = useState(false);
  const [saleControlRetryPending, setSaleControlRetryPending] = useState(false);
  const [controlError, setControlError] = useState('');
  const [controlNotice, setControlNotice] = useState('');
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, string>>({});
  const [billDiscount, setBillDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'ONLINE'>('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [customerLookupOpen, setCustomerLookupOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Array<{ name: string; code: string }>>([]);
  const [customerError, setCustomerError] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const customerButton = useRef<HTMLButtonElement>(null);
  const [clearBasketOpen, setClearBasketOpen] = useState(false);
  const clearBasketButton = useRef<HTMLButtonElement>(null);
  const basketHeading = useRef<HTMLHeadingElement>(null);
  const [lastReceipt, setLastReceipt] = useState<SaleReceipt | null>(null);
  const [removingVariantId, setRemovingVariantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saleRetryPending, setSaleRetryPending] = useState(false);
  const [offlineSales, setOfflineSales] = useState<QueuedSale[]>([]);
  const [offlineQuotes, setOfflineQuotes] = useState<Record<string, OfflineQuote>>({});
  const [offlineCashTendered, setOfflineCashTendered] = useState<Record<string, string>>({});
  const [offlineReference, setOfflineReference] = useState<Record<string, string>>({});
  const [offlinePaymentConfirmed, setOfflinePaymentConfirmed] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(true);
  const [syncingSales, setSyncingSales] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [offlineDrawerOpen, setOfflineDrawerOpen] = useState(false);
  const [queueLocationChecked, setQueueLocationChecked] = useState<string>();
  const [queueLoadError, setQueueLoadError] = useState('');
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);
  const [attendanceStatus, setAttendanceStatus] = useState<'WORKING' | 'NOT_STARTED' | 'COMPLETED' | 'unknown'>('unknown');
  const requestSequence = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingSaleRef = useRef<{ key: string; body: string } | null>(null);
  const syncingSalesRef = useRef(false);
  const pendingControlRef = useRef<{ key: string; method: string; url: string; body: string } | null>(null);

  const activeVariants = useMemo(
    () => results.flatMap((product) => product.variants.filter((variant) => variant.isActive).map((variant) => ({ product, variant }))),
    [results],
  );

  const categories = useMemo(
    () => [...new Set(results.map((product) => product.category?.name).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)),
    [results],
  );
  const visibleVariants = useMemo(() => activeVariants
    .filter(({ product }) => selectedCategory === 'All categories' || product.category?.name === selectedCategory)
    .sort((a, b) => {
      if (catalogSort === 'price-low') return Number(a.product.sellingPrice) - Number(b.product.sellingPrice);
      if (catalogSort === 'price-high') return Number(b.product.sellingPrice) - Number(a.product.sellingPrice);
      return a.product.name.localeCompare(b.product.name) || a.variant.name.localeCompare(b.variant.name);
    }), [activeVariants, catalogSort, selectedCategory]);

  const stockVariantIds = useMemo(() => [...new Set([
    ...results.flatMap((product) => product.variants.map((variant) => variant.id)),
    ...cart.map((line) => line.variantId),
  ])].sort(), [cart, results]);

  const saleTotals = useMemo(() => {
    let grossCents = 0;
    let lineDiscountCents = 0;
    let requestedDiscount = 0;
    for (const line of cart) {
      const lineGross = Math.round(line.sellingPrice * 100) * baseQuantity(line);
      const discount = lineGross * Math.round(parsePercent(lineDiscounts[cartKey(line)] || '') * 100) / 10000;
      grossCents += lineGross;
      requestedDiscount += discount;
      lineDiscountCents += Math.round(discount);
    }
    const billRate = Math.round(parsePercent(billDiscount) * 100) / 10000;
    const discountCents = lineDiscountCents + Math.round((grossCents - lineDiscountCents) * billRate);
    return {
      gross: grossCents / 100,
      discount: discountCents / 100,
      net: Math.max(0, grossCents - discountCents) / 100,
      percent: grossCents ? (requestedDiscount / grossCents + billRate) * 100 : 0,
    };
  }, [billDiscount, cart, lineDiscounts]);
  const quantitiesByVariant = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of cart) totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + baseQuantity(line));
    return totals;
  }, [cart]);
  const basketQuantity = [...quantitiesByVariant.values()].reduce((total, quantity) => total + quantity, 0);
  const basketUnits = new Set(cart.map((line) => line.baseUnit));
  const hasStockShortage = (line: CartLine) => {
    const stock = stockBalances[line.variantId];
    return stock !== undefined && (quantitiesByVariant.get(line.variantId) ?? 0) > Math.max(stock.quantityBaseUnits, 0);
  };
  const stockBlocksCheckout = isOnline && !stockError && !saleRetryPending && cart.some(hasStockShortage);
  const drawerBlocksCheckout = terminal?.location.requireCheckoutDrawer && !cashDrawerId && !saleRetryPending;
  const auditBlocksCheckout = Boolean(terminal?.location.isAuditLocked && !saleRetryPending);
  const checkoutDisabled = auditBlocksCheckout || busy || !!removingVariantId || drawerBlocksCheckout || cart.length === 0 || cart.some((line) => !baseQuantity(line))
    || stockBlocksCheckout || (!saleRetryPending && saleTotals.percent > discountLimit + 0.000001);
  const [cashPreferences, setCashPreferences] = useState<Partial<UserPreferences>>({});
  const cashAmount = Number(cashTendered);
  const validateCashTender = paymentMethod === 'CASH' && !saleRetryPending;
  let cashTenderError = '';
  if (validateCashTender && cashTendered) {
    if (!Number.isFinite(cashAmount) || Math.abs(cashAmount * 100 - Math.round(cashAmount * 100)) > 0.000001) {
      cashTenderError = 'Enter a cash amount with up to two decimal places.';
    } else if (cashAmount < saleTotals.net) {
      cashTenderError = 'Cash received must cover the amount due.';
    }
  }
  const cashPaymentBlocked = validateCashTender && (!cashTendered || Boolean(cashTenderError));

  const formatMoney = (amount: number | string, currency = terminal?.location.currency || 'INR') => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

  function receiptQuantity(line: SaleReceipt['lines'][number]) {
    const baseUnit = line.variant.product.baseUnit;
    if (line.enteredUnit === 'carton' && line.conversionRatioUsed) {
      const cartons = line.quantityBaseUnits / line.conversionRatioUsed;
      return `${cartons} carton${cartons === 1 ? '' : 's'} × ${formatMoney(Number(line.unitPriceAtSale) * line.conversionRatioUsed)} (${line.quantityBaseUnits} ${baseUnit}s)`;
    }
    return `${line.quantityBaseUnits} ${baseUnit}${line.quantityBaseUnits === 1 ? '' : 's'} × ${formatMoney(line.unitPriceAtSale)}`;
  }

  function receiptTotals(receipt: SaleReceipt) {
    const totals = [
      ['Subtotal', formatMoney(receipt.grossTotal)],
      ['Discount', '−' + formatMoney(receipt.discountTotal)],
      [`Total paid · ${receipt.payment?.method ?? '—'}`, formatMoney(receipt.netTotal)],
    ];
    if (receipt.payment?.cashTenderedAmount) totals.push(['Cash tendered', formatMoney(receipt.payment.cashTenderedAmount)]);
    if (Number(receipt.payment?.changeGivenAmount) > 0) totals.push(['Change', formatMoney(receipt.payment!.changeGivenAmount!)]);
    return totals;
  }

  function downloadReceipt(receipt: SaleReceipt) {
    const returns = (receipt.returns ?? []).flatMap((entry) => [
      [`Return ${entry.returnNumber}`, entry.refund?.method ?? '', formatMoney(entry.refund?.amount ?? 0)],
      ...(entry.lines ?? []).map((line) => {
        const item = receipt.lines.find((sold) => sold.id === line.saleLineId);
        const condition = line.disposition === 'QUARANTINED' ? 'Quarantined' : 'Returned to stock';
        return [item?.variant.product.name ?? 'Returned item', `${countInUnit(line.quantityBaseUnits, item?.variant.product.baseUnit ?? 'unit')} · ${condition}`, formatMoney(line.refundAmount)];
      }),
    ]);
    downloadPdf(`Receipt ${receipt.invoiceNumber}`, `${terminal?.location.name ?? ''} · ${new Date(receipt.createdAt).toLocaleString(undefined, { timeZone: terminal?.location.timezone })}`,
      ['Item', 'Quantity and unit price', 'Amount'],
      [...receipt.lines.map((line) => [
        `${line.variant.product.name} · ${line.variant.sku}`, receiptQuantity(line), formatMoney(line.lineTotal),
      ]), ...receiptTotals(receipt).map(([label, total]) => [label, '', total]), ...returns],
      `receipt-${receipt.invoiceNumber}.pdf`);
  }

  const syncOfflineSales = useCallback(async () => {
    if (!token || !terminal || syncingSalesRef.current) return;
    syncingSalesRef.current = true;
    setSyncingSales(true);
    let loaded = false;
    try {
      const ownSales = (await readOfflineSales())
        .filter((sale) => sale.ownerUserId === terminal.cashierUserId && sale.locationId === terminal.location.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setOfflineSales(ownSales);
      setQueueLocationChecked(terminal.location.id);
      setQueueLoadError('');
      loaded = true;
      if (!navigator.onLine) return;
      for (const sale of ownSales) {
        if (sale.status === 'needs_review') break;
        let response: Response;
        try {
          response = await fetch(`${API_BASE}/sales`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': sale.idempotencyKey,
            },
            body: sale.body,
          });
        } catch {
          const retry = { ...sale, error: 'The connection was interrupted. Retry when connected.' };
          await saveOfflineSale(retry);
          setOfflineSales((current) => current.map((item) => item.idempotencyKey === sale.idempotencyKey ? retry : item));
          break;
        }
        if (response.ok) {
          const payload = await response.json();
          await deleteOfflineSale(sale.idempotencyKey);
          setOfflineSales((current) => current.filter((item) => item.idempotencyKey !== sale.idempotencyKey));
          setLastReceipt(payload.data as SaleReceipt);
          setDrawerRefreshKey((current) => current + 1);
          setNotice(`Pending sale synchronized · ${payload.data.invoiceNumber}`);
          continue;
        }
        const message = await readError(response);
        if (response.status >= 500) {
          const retry = { ...sale, error: message };
          await saveOfflineSale(retry);
          setOfflineSales((current) => current.map((item) => item.idempotencyKey === sale.idempotencyKey ? retry : item));
          break;
        }
        const needsReview = { ...sale, status: 'needs_review' as const, error: message };
        await saveOfflineSale(needsReview);
        setOfflineSales((current) => current.map((item) => item.idempotencyKey === sale.idempotencyKey ? needsReview : item));
        break;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not access pending sales';
      if (loaded) setError(message);
      else setQueueLoadError(message);
    } finally {
      syncingSalesRef.current = false;
      setSyncingSales(false);
    }
  }, [terminal, token]);

  async function quoteOfflineSale(sale: QueuedSale, removeDiscounts = false) {
    if (!token) return;
    try {
      const savedBody = JSON.parse(sale.body) as Record<string, any>;
      const quoteBody: Record<string, unknown> = { lines: savedBody.lines };
      if (savedBody.locationId) quoteBody.locationId = savedBody.locationId;
      if (!removeDiscounts && savedBody.billDiscountPercent !== undefined) quoteBody.billDiscountPercent = savedBody.billDiscountPercent;
      if (removeDiscounts) {
        quoteBody.lines = savedBody.lines.map((line: Record<string, unknown>) => {
          const { discountPercent: _discountPercent, ...withoutDiscount } = line;
          return withoutDiscount;
        });
      }
      if (!removeDiscounts && savedBody.billDiscountPercent === undefined) {
        quoteBody.lines = savedBody.lines;
      }
      const response = await fetch(`${API_BASE}/sales/quote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteBody),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      setOfflineQuotes((current) => ({ ...current, [sale.idempotencyKey]: { body: quoteBody, netTotal: String(payload.data.netTotal) } }));
      setOfflineCashTendered((current) => ({ ...current, [sale.idempotencyKey]: String(savedBody.cashTenderedAmount ?? payload.data.netTotal) }));
      setOfflineReference((current) => ({ ...current, [sale.idempotencyKey]: String(savedBody.transactionReference || '') }));
      setOfflinePaymentConfirmed((current) => ({ ...current, [sale.idempotencyKey]: false }));
      setControlError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not quote the queued sale using current server rules');
    }
  }

  async function confirmOfflineSale(sale: QueuedSale) {
    const quote = offlineQuotes[sale.idempotencyKey];
    if (!quote || !offlinePaymentConfirmed[sale.idempotencyKey]) return;
    const body = JSON.parse(sale.body) as Record<string, any>;
    body.lines = quote.body.lines;
    if (quote.body.billDiscountPercent !== undefined) body.billDiscountPercent = quote.body.billDiscountPercent;
    else delete body.billDiscountPercent;
    body.paymentAmount = Number(quote.netTotal);
    if (body.paymentMethod === 'CASH') {
      const tendered = Number(offlineCashTendered[sale.idempotencyKey] || 0);
      if (!Number.isFinite(tendered) || tendered < Number(quote.netTotal)) {
        setError('Cash tendered must cover the newly quoted total after you reconcile the difference with the customer.');
        return;
      }
      body.cashTenderedAmount = tendered;
    } else if (offlineReference[sale.idempotencyKey]?.trim()) {
      body.transactionReference = offlineReference[sale.idempotencyKey].trim();
    }
    const updated: QueuedSale = { ...sale, body: JSON.stringify(body), status: 'queued', error: undefined };
    try {
      await saveOfflineSale(updated);
      setOfflineSales((current) => current.map((item) => item.idempotencyKey === sale.idempotencyKey ? updated : item));
      setOfflineQuotes((current) => { const next = { ...current }; delete next[sale.idempotencyKey]; return next; });
      setOfflinePaymentConfirmed((current) => ({ ...current, [sale.idempotencyKey]: false }));
      setNotice('Queued sale updated to current prices and limits after manual payment reconciliation; syncing now.');
      void syncOfflineSales();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the queued sale');
    }
  }

  const searchProducts = useCallback(async (term: string, accessToken: string, exactBarcode = false) => {
    const cleaned = term.trim();
    const sequence = ++requestSequence.current;
    let products: Product[];
    try {
      const searchParameter = cleaned ? `&search=${encodeURIComponent(cleaned)}` : '';
      const response = await fetch(`${API_BASE}/products?isActive=true${searchParameter}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      products = (payload.data as Product[]).map((product) => ({
        ...product,
        variants: (product.variants || []).filter((variant) => variant.isActive),
      }));
      if (terminal?.location.id) void saveOfflineProducts(products, terminal.location.id).catch(() => undefined);
    } catch (caught) {
      if (navigator.onLine && !(caught instanceof TypeError)) throw caught;
      if (!terminal?.location.id) throw caught;
      products = await findOfflineProducts(cleaned, terminal.location.id);
      if (!products.length && cleaned) throw new Error('No cached product matches this search. Reconnect to refresh the catalogue.');
      setNotice('Showing the saved catalogue. The server will validate current prices and stock when connected.');
    }
    if (sequence !== requestSequence.current) return;

    if (exactBarcode) {
      const match = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })))
        .find(({ variant }) => variant.barcode?.trim().toLowerCase() === cleaned.toLowerCase());
      if (match) {
        addToCart(match.product, match.variant);
        return;
      }
    }
    setResults(products);
    setSelectedCategory('All categories');
    if (exactBarcode && products.length === 0) setNotice('No matching barcode or product found.');
  }, [terminal, token]);

  useEffect(() => {
    if (!token || !terminal) {
      setResults([]);
      return;
    }
    setCatalogLoading(true);
    const timer = window.setTimeout(() => {
      searchProducts(query, token)
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setCatalogLoading(false));
    }, query.trim() ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [query, searchProducts, terminal, token]);

  useEffect(() => {
    if (!token || !terminal || stockVariantIds.length === 0) return;
    let current = true;
    const refreshStock = async () => {
      try {
        const nextBalances: Record<string, StockBalance> = {};
        for (let offset = 0; offset < stockVariantIds.length; offset += 100) {
          const chunk = stockVariantIds.slice(offset, offset + 100);
          const params = new URLSearchParams({
            locationId: terminal.location.id,
            variantIds: chunk.join(','),
            stockState: 'AVAILABLE',
          });
          const response = await fetch(`${API_BASE}/inventory/balances?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!response.ok) throw new Error(await readError(response));
          const payload = await response.json();
          for (const balance of payload.data as Array<StockBalance & { variantId: string }>) {
            nextBalances[balance.variantId] = balance;
          }
        }
        if (!current) return;
        setStockBalances((existing) => ({ ...existing, ...nextBalances }));
        setStockError('');
      } catch (caught) {
        if (current) setStockError(caught instanceof Error ? caught.message : 'Could not refresh stock');
      }
    };

    void refreshStock();
    const interval = window.setInterval(() => void refreshStock(), 15_000);
    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [stockVariantIds, terminal, token]);

  useEffect(() => {
    let active = true;
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    const handleOnline = () => {
      updateOnlineState();
      if (token && terminal) void refreshOfflineCatalog(token, terminal.location.id).catch(() => undefined);
      if (token && terminal) void syncOfflineSales();
    };
    updateOnlineState();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', updateOnlineState);
    if (token && terminal) {
      readOfflineSales()
        .then((sales) => {
          if (!active) return;
          setOfflineSales(sales.filter((sale) => sale.ownerUserId === terminal.cashierUserId && sale.locationId === terminal.location.id));
          setQueueLocationChecked(terminal.location.id);
          setQueueLoadError('');
          if (navigator.onLine) void syncOfflineSales();
        })
        .catch((caught: Error) => { if (active) setQueueLoadError(caught.message); });
    }
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, [syncOfflineSales, terminal, token]);

  useEffect(() => {
    if (!token) return;
    const loadAttendance = async () => {
      try {
        const response = await fetch(`${API_BASE}/attendance/me/today`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        setAttendanceStatus(payload.data?.status ?? 'unknown');
      } catch { setAttendanceStatus('unknown'); }
    };
    void loadAttendance();
  }, [token]);

  const checkoutDisabledForClear = !cart.length || busy || !!removingVariantId || saleRetryPending;
  useEffect(() => {
    if (!terminal) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (customerLookupOpen || clearBasketOpen || drawerOpen || returnsOpen || offlineDrawerOpen) return;
      if (event.key === 'Escape') {
        setCheckoutOpen(false);
        setOfflineDrawerOpen(false);
      } else if (event.key === 'F2') {
        event.preventDefault(); searchRef.current?.focus();
      } else if (event.key === 'F4') {
        event.preventDefault(); if (!checkoutOpen && !checkoutDisabledForClear) setClearBasketOpen(true);
      } else if (event.key === 'F12') {
        event.preventDefault(); if (!checkoutDisabled && !clearBasketOpen) setCheckoutOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [checkoutDisabled, checkoutDisabledForClear, checkoutOpen, clearBasketOpen, customerLookupOpen, drawerOpen, returnsOpen, terminal, offlineDrawerOpen]);

  function addToCart(product: Product, variant: Variant) {
    const stock = stockBalances[variant.id];
    if (stock && Number(stock.quantityBaseUnits) <= 0) {
      setNotice('');
      setError(`${product.name} is out of stock at this store.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.variantId === variant.id && line.unit === 'BASE_UNIT');
      if (existing) return current.map((line) => line === existing && baseQuantity(line) < 2147483647
        ? { ...line, quantity: line.quantity + 1 }
        : line);
      return [...current, {
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        baseUnit: product.baseUnit,
        quantity: 1,
        unit: 'BASE_UNIT',
        unitsPerCarton: product.sellByCarton === false ? 1 : product.unitsPerCarton ?? 1,
        sellingPrice: Number(product.sellingPrice),
      }];
    });
    setQuery('');
    setError('');
    setNotice(`${product.name} · ${variant.name} added`);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function loadTerminalSession(accessToken: string, locationId: string) {
    const path = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    const contextResponse = await fetch(`${API_BASE}/pos/terminal/context${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!contextResponse.ok) throw new Error(await readError(contextResponse));
    const contextPayload = await contextResponse.json();
    const discountResponse = await fetch(`${API_BASE}/users/me/discount-limit`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!discountResponse.ok) throw new Error(await readError(discountResponse));
    const discountPayload = await discountResponse.json();
    setDiscountLimit(discountPayload.data.unlimited ? 100 : Number(discountPayload.data.discountLimitPercent || 0));
    const salesPermissionsResponse = await fetch(`${API_BASE}/users/me/sales-permissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!salesPermissionsResponse.ok) throw new Error(await readError(salesPermissionsResponse));
    const salesPermissionsPayload = await salesPermissionsResponse.json();
    setSalesPermissions(salesPermissionsPayload.data as SalesPermissions);
    setStockBalances({});
    setStockError('');
    setToken(accessToken);
    setTerminal(contextPayload.data as TerminalContext);
    void refreshOfflineCatalog(accessToken, contextPayload.data.location.id).catch(() => undefined);
  }

  useEffect(() => {
    if (!checkoutRole) return;
    const key = SETTINGS_STORAGE_PREFIX + checkoutRole;
    const update = () => {
      try { setCashPreferences(JSON.parse(window.localStorage.getItem(key) ?? '{}') ?? {}); }
      catch { setCashPreferences({}); }
    };
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) update(); };
    update();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [checkoutRole]);

  useEffect(() => {
    const existing = getStoredSession();
    if (!existing?.accessToken) { setOpening(false); return; }
    const role = existing.user.role;
    setCheckoutRole(role);
    let active = true;

    async function openTerminal(accessToken: string) {
      if (role === 'CASHIER') {
        await loadTerminalSession(accessToken, '');
        return;
      }
      const response = await fetch(`${API_BASE}/locations?type=RETAIL_STORE&isActive=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const { data } = await response.json() as { data: Array<{ id: string; name: string }> };
      if (!active) return;
      setStoreOptions(data);
      if (!data.length) throw new Error('Your account has no active retail locations for checkout.');
      const requestedLocation = new URLSearchParams(window.location.search).get('locationId');
      const selected = checkoutLocation || data.find((store) => store.id === requestedLocation)?.id || (data.length === 1 ? data[0].id : '');
      if (selected) await loadTerminalSession(accessToken, selected);
    }

    void openTerminal(existing.accessToken).catch((caught: Error) => {
      if (!active) return;
      setError(caught.message || 'Could not open checkout.');
      setTerminal(null);
      setToken('');
    }).finally(() => { if (active) setOpening(false); });
    return () => { active = false; };
  }, [terminalRetry, checkoutLocation]);

  useEffect(() => {
    if (!receiptHistoryOpen || !terminal || !token) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setReceiptHistory(null);
      setReceiptHistoryError('');
      try {
        const query = new URLSearchParams({ locationId: terminal.location.id, invoiceNumber: receiptQuery });
        const response = await fetch(`${API_BASE}/pos/receipts?${query}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response));
        const { data } = await response.json() as { data: SaleReceipt[] };
        if (!controller.signal.aborted) setReceiptHistory(data);
      } catch (cause) {
        if (!controller.signal.aborted) setReceiptHistoryError(cause instanceof Error ? cause.message : 'Could not load receipt history.');
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [receiptHistoryOpen, terminal, token, receiptQuery]);

  useEffect(() => {
    if (!terminal || !token || !isOnline) return;
    const controller = new AbortController();
    const locationId = terminal.location.id;
    async function refreshLock() {
      try {
        const response = await fetch(`${API_BASE}/pos/terminal/context?locationId=${encodeURIComponent(locationId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const { data } = await response.json() as { data: TerminalContext };
        if (!controller.signal.aborted) setTerminal((current) => current?.location.id === locationId &&
          current.location.isAuditLocked !== data.location.isAuditLocked ? { ...current, location: data.location } : current);
      } catch {
        // The sale endpoint still enforces the lock if status refresh fails.
      }
    }
    const timer = window.setInterval(refreshLock, 15_000);
    window.addEventListener('focus', refreshLock);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refreshLock); };
  }, [terminal, token, isOnline]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const barcode = query.trim();
    if (!barcode || !token) return;
    setBusy(true);
    setError('');
    setNotice('');
    searchProducts(barcode, token, true)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setBusy(false));
  }

  function setQuantity(key: string, value: string) {
    const quantity = Number(value);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) return;
    setCart((current) => current.map((line) =>
      cartKey(line) === key && baseQuantity({ ...line, quantity }) <= 2147483647 ? { ...line, quantity } : line));
  }

  function changeSellingUnit(line: CartLine, unit: SaleUnit) {
    const key = cartKey(line);
    const updated = { ...line, unit };
    if (baseQuantity(updated) > 2147483647 || cart.some((item) => cartKey(item) === cartKey(updated))) return;
    setCart((current) => current.map((item) => cartKey(item) === key ? updated : item));
    setLineDiscounts((current) => {
      const next = { ...current, [cartKey(updated)]: current[key] || '' };
      delete next[key];
      return next;
    });
  }

  function addOtherSellingUnit(line: CartLine) {
    const other: CartLine = { ...line, quantity: 1, unit: line.unit === 'BASE_UNIT' ? 'CARTON' : 'BASE_UNIT' };
    setCart((current) => current.some((item) => cartKey(item) === cartKey(other)) ? current : [...current, other]);
  }

  async function recordCartRemoval(line: CartLine) {
    const key = cartKey(line);
    if (baseQuantity(line)) {
      setRemovingVariantId(key);
      const response = await fetch(`${API_BASE}/pos/cart-deletions?locationId=${encodeURIComponent(terminal!.location.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: line.variantId, quantityRemoved: baseQuantity(line) }),
      });
      if (!response.ok) throw new Error(await readError(response));
    }
    setCart((current) => current.filter((item) => cartKey(item) !== key));
    setLineDiscounts((current) => { const next = { ...current }; delete next[key]; return next; });
  }

  async function removeLine(line: CartLine) {
    if (!token || !terminal || removingVariantId || busy || saleRetryPending) return;
    setError('');
    try {
      await recordCartRemoval(line);
      setNotice(`${line.productName} removal recorded`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to record cart item removal');
    } finally {
      setRemovingVariantId('');
    }
  }

  useEffect(() => {
    setCustomerResults([]);
    setCustomerError('');
    if (!customerLookupOpen || !terminal || !token || customerQuery.trim().length < 2) {
      setCustomerLoading(false);
      return;
    }
    const controller = new AbortController();
    setCustomerLoading(true);
    const params = new URLSearchParams({ locationId: terminal.location.id, search: customerQuery.trim() });
    fetch(`${API_BASE}/pos/customers?${params}`, {
      signal: controller.signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error(await readError(response));
      const { data } = await response.json();
      if (!controller.signal.aborted) setCustomerResults(data);
    }).catch((error) => {
      if (!controller.signal.aborted) setCustomerError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setCustomerLoading(false);
    });
    return () => controller.abort();
  }, [customerLookupOpen, terminal, token, customerQuery]);

  function closeCustomerLookup() {
    setCustomerLookupOpen(false);
    setCustomerQuery('');
    customerButton.current?.focus();
  }

  function dismissClearBasket() {
    setClearBasketOpen(false);
    clearBasketButton.current?.focus();
  }

  async function clearBasket() {
    if (!token || !terminal || checkoutDisabledForClear) return;
    setClearBasketOpen(false);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const line of cart) await recordCartRemoval(line);
      setBillDiscount('');
      setCashTendered('');
      setNotice('Basket cleared. All item removals were recorded.');
    } catch (caught) {
      setError(caught instanceof Error ? `Basket partially cleared. Remaining items were kept: ${caught.message}` : 'Basket partially cleared. Remaining items were kept.');
    } finally {
      setRemovingVariantId('');
      setBusy(false);
      searchRef.current?.focus();
    }
  }

  async function checkout() {
    if (!token || !cart.length || busy || cashPaymentBlocked) return;
    if (cart.some((line) => !baseQuantity(line))) {
      setError('Enter a quantity for every basket line.');
      return;
    }
    if (stockBlocksCheckout || drawerBlocksCheckout) return;
    if (saleTotals.percent > discountLimit + 0.000001) {
      setError(`Discount exceeds your assigned ${discountLimit.toFixed(2)}% limit.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');

    let retainRetryKey = false;
    try {
      if (!pendingSaleRef.current) {
        const enteredDiscounts = [...Object.values(lineDiscounts), billDiscount].filter((value) => value !== '');
        if (enteredDiscounts.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 || Math.abs(Math.round(Number(value) * 100) - Number(value) * 100) > 0.000001)) {
          throw new Error('Discounts must be valid percentages with up to two decimal places.');
        }
        const body: Record<string, unknown> = {
          ...(checkoutRole !== 'CASHIER' && terminal ? { locationId: terminal.location.id } : {}),
          lines: cart.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            enteredUnit: line.unit,
            ...(Number(lineDiscounts[cartKey(line)] || 0) > 0 ? { discountPercent: Number(lineDiscounts[cartKey(line)]) } : {}),
          })),
          ...(cashDrawerId ? { cashDrawerId } : {}),
          paymentMethod,
          paymentAmount: Number(saleTotals.net.toFixed(2)),
          ...(Number(billDiscount || 0) > 0 ? { billDiscountPercent: Number(billDiscount) } : {}),
          ...(paymentMethod === 'CASH' ? { cashTenderedAmount: cashAmount } : {}),
          ...(paymentMethod !== 'CASH' && transactionReference.trim() ? { transactionReference: transactionReference.trim() } : {}),
        };
        pendingSaleRef.current = { key: crypto.randomUUID(), body: JSON.stringify(body) };
      }
      const queuePendingSale = async (queueError?: string) => {
        if (!pendingSaleRef.current || !terminal) throw new Error('The active cashier location is unavailable; sale was not queued');
        const sale: QueuedSale = {
          idempotencyKey: pendingSaleRef.current.key,
          body: pendingSaleRef.current.body,
          ownerUserId: terminal.cashierUserId,
          locationId: terminal.location.id,
          createdAt: new Date().toISOString(),
          status: 'queued',
          ...(queueError ? { error: queueError } : {}),
        };
        await saveOfflineSale(sale);
        setOfflineSales((current) => [...current.filter((item) => item.idempotencyKey !== sale.idempotencyKey), sale]);
        pendingSaleRef.current = null;
        setSaleRetryPending(false);
        setCart([]);
        setLineDiscounts({});
        setBillDiscount('');
        setCashTendered('');
        setTransactionReference('');
        setCheckoutOpen(false);
        setNotice('Sale saved on this terminal; it is not finalized until it syncs successfully. The server will recheck current prices and discount limits.');
      };
      if (!navigator.onLine) {
        await queuePendingSale();
        return;
      }
      retainRetryKey = true;
      const response = await fetch(`${API_BASE}/sales`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingSaleRef.current.key,
        },
        body: pendingSaleRef.current.body,
      });
      if (!response.ok) {
        retainRetryKey = response.status >= 500;
        throw new Error(await readError(response));
      }
      const payload = await response.json();
      pendingSaleRef.current = null;
      setSaleRetryPending(false);
      setLastReceipt(payload.data as SaleReceipt);
      setCart([]);
      setLineDiscounts({});
      setBillDiscount('');
      setCashTendered('');
      setTransactionReference('');
      setCheckoutOpen(false);
      setNotice(`Sale completed · ${payload.data.invoiceNumber}`);
    } catch (caught) {
      if (retainRetryKey && pendingSaleRef.current && terminal) {
        try {
          const sale: QueuedSale = {
            idempotencyKey: pendingSaleRef.current.key,
            body: pendingSaleRef.current.body,
            ownerUserId: terminal.cashierUserId,
            locationId: terminal.location.id,
            createdAt: new Date().toISOString(),
            status: 'queued',
            error: caught instanceof Error ? caught.message : 'Connection interrupted before the server confirmed this sale',
          };
          await saveOfflineSale(sale);
          setOfflineSales((current) => [...current.filter((item) => item.idempotencyKey !== sale.idempotencyKey), sale]);
          pendingSaleRef.current = null;
          setSaleRetryPending(false);
          setCart([]);
          setLineDiscounts({});
          setBillDiscount('');
          setCashTendered('');
          setTransactionReference('');
          setCheckoutOpen(false);
          setNotice('Checkout was interrupted; the sale is saved locally with its original retry key. It is not finalized until sync succeeds.');
        } catch (queueError) {
          setSaleRetryPending(true);
          setError(queueError instanceof Error ? queueError.message : 'Could not save the pending sale locally');
        }
      } else {
        if (!retainRetryKey) pendingSaleRef.current = null;
        setError(caught instanceof Error ? caught.message : 'Unable to complete sale');
      }
    } finally {
      setBusy(false);
    }
  }

  const updateRefundDrawer = useCallback((id: string | null) => {
    setSaleControl((current) => current?.refundDrawer ?
      { ...current, refundDrawer: { ...current.refundDrawer, open: Boolean(id) } } : current);
  }, []);

  async function loadSaleControl(invoiceNumber = invoiceSearch) {
    if (!token || !invoiceNumber.trim()) return;
    setControlBusy(true);
    setControlError('');
    setControlNotice('');
    try {
      const response = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(invoiceNumber.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const found = payload.data as SaleControlInvoice;
      setSaleControl(found);
      setReturnLines(Object.fromEntries(found.lines.map((line) => [line.id, {
        quantity: '', disposition: 'QUARANTINED' as const, inspectionNotes: '',
      }])));
      setControlReason('');
      setConfirmedGoodsReturned(false);
      setRefundReference('');
      setRefundMethod(found.payment?.method === 'CARD' || found.payment?.method === 'ONLINE' ? found.payment.method : 'CASH');
    } catch (caught) {
      setSaleControl(null);
      setControlError(caught instanceof Error ? caught.message : 'Could not find this invoice');
    } finally {
      setControlBusy(false);
    }
  }

  async function submitControlMutation(method: 'PATCH' | 'POST', url: string, bodyValue: Record<string, unknown>) {
    if (!token) throw new Error('Sign in again to process sale controls');
    const body = JSON.stringify(bodyValue);
    if (!pendingControlRef.current) pendingControlRef.current = { key: crypto.randomUUID(), method, url, body };
    const pending = pendingControlRef.current;
    if (pending.method !== method || pending.url !== url || pending.body !== body) {
      throw new Error('Retry the same sale action before changing its details.');
    }
    setControlBusy(true);
    setControlError('');
    let retainKey = true;
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
        body: pending.body,
      });
      if (!response.ok) {
        retainKey = response.status >= 500;
        const message = await readError(response);
        if (response.status === 409 && message.includes('Open your cash drawer at this store')) {
          updateRefundDrawer(null);
          if (saleControl?.location.id === terminal?.location.id) setCashDrawerId(null);
        }
        throw new Error(message);
      }
      const payload = await response.json();
      pendingControlRef.current = null;
      setSaleControlRetryPending(false);
      return payload.data;
    } catch (caught) {
      if (retainKey) setSaleControlRetryPending(true);
      else pendingControlRef.current = null;
      throw caught;
    } finally {
      setControlBusy(false);
    }
  }

  async function cancelSale(invoice: SaleControlInvoice) {
    if (!controlReason.trim()) { setControlError('A cancellation reason is required.'); return; }
    if (!confirmedGoodsReturned) { setControlError('Confirm all goods are physically back at this store before cancellation.'); return; }
    if (!window.confirm(`Cancel invoice ${invoice.invoiceNumber} and record a manual refund of ${formatMoney(invoice.netTotal, invoice.location.company?.currency)}?`)) return;
    try {
      await submitControlMutation('PATCH', `/sales/${invoice.id}/cancel`, {
        reason: controlReason.trim(), refundMethod, goodsReturnedToStore: true,
        ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}),
      });
      await loadSaleControl(invoice.invoiceNumber);
      setControlNotice('Sale cancelled. The app recorded the manual refund; it did not send money.');
    } catch (caught) {
      setControlError(caught instanceof Error ? caught.message : 'Could not cancel this sale');
    }
  }

  async function processSaleReturn(invoice: SaleControlInvoice) {
    const lines = invoice.lines.flatMap((line) => {
      const selection = returnLines[line.id];
      const quantityBaseUnits = Number(selection?.quantity || 0);
      if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits < 1) return [];
      return [{ saleLineId: line.id, quantityBaseUnits, disposition: selection.disposition, inspectionNotes: selection.inspectionNotes.trim() }];
    });
    if (!lines.length) { setControlError('Enter a return quantity for at least one line.'); return; }
    if (!controlReason.trim()) { setControlError('A return reason is required.'); return; }
    if (lines.some((line) => line.inspectionNotes.length < 5)) { setControlError('Add inspection notes of at least five characters for each returned line.'); return; }
    const body = {
      reason: controlReason.trim(),
      refundMethod,
      ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}),
      lines,
    };
    try {
      await submitControlMutation('POST', `/sales/${invoice.id}/returns`, body);
      await loadSaleControl(invoice.invoiceNumber);
      setControlNotice('Return recorded. Any refund is a manual record only; no payment was initiated.');
    } catch (caught) {
      setControlError(caught instanceof Error ? caught.message : 'Could not record this return');
    }
  }

  function logout() {
    void clearStoredSession();
    setToken('');
    setTerminal(null);
    setCart([]);
    setLastReceipt(null);
    pendingSaleRef.current = null;
    setSaleRetryPending(false);
    setResults([]);
    setStockBalances({});
    setStockError('');
    setQuery('');
    setError('');
    setNotice('');
    setOfflineDrawerOpen(false);
    window.location.href = '/login';
  }

  if (!terminal) return (
    <main className="app-page">
      <h1>Checkout</h1>
      {opening ? <p role="status">Opening checkout…</p> : storeOptions.length > 1 && !checkoutLocation && !error ? <label className="discount-input">Retail store
        <select value="" onChange={(event) => { setOpening(true); setCheckoutLocation(event.target.value); }}>
          <option value="">Choose a store</option>
          {storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </label> : <>
        <Feedback tone="error">{error || 'Sign in to open checkout.'}</Feedback>
        <div className="device-lock-actions">
          {error && <button type="button" className="admin-secondary" onClick={() => {
            setOpening(true);
            setError('');
            setTerminalRetry((value) => value + 1);
          }}>Try again</button>}
          {error ? <button type="button" className="admin-primary" onClick={logout}>Sign out</button>
            : <a className="admin-primary" href="/login?returnUrl=%2Fpos-terminal">Sign in</a>}
        </div>
      </>}
    </main>
  );

  const canCreateSale = can('sales.checkout', terminal.access?.checkout ?? true);
  const canOpenDrawer = can('cash.drawer', terminal.access?.drawer ?? true);
  const refundAtTerminal = saleControl?.location.id === terminal.location.id && canOpenDrawer;
  const refundNeedsDrawer = refundMethod === 'CASH' && saleControl?.refundDrawer?.requiredForCash &&
    !(refundAtTerminal ? cashDrawerId : saleControl.refundDrawer.open) && !saleControlRetryPending;
  const showCatalog = browseProducts || !!query.trim();

  return (
    <main className="pos-shell">
      <div className={`pos-content${canCreateSale ? (showCatalog ? ' pos-with-catalog' : ' pos-basket-only') : ' pos-utility-only'}`}>
        {!canCreateSale && <header><h1>Register tools</h1><p>{terminal.location.name}</p></header>}
        <div className="pos-history-actions">
          {canOpenDrawer && <CashDrawer key={terminal.location.id} api={API_BASE} token={token} locationId={terminal.location.id} timezone={terminal.location.timezone}
            onDrawer={setCashDrawerId} formatMoney={formatMoney} isOpen={drawerOpen || (refundDrawerOpen && refundAtTerminal)}
            onOpenChange={refundDrawerOpen && refundAtTerminal ? setRefundDrawerOpen : setDrawerOpen}
            canClose={!queueLoadError && queueLocationChecked === terminal.location.id && !cart.length && !busy && !saleRetryPending && !syncingSales && !offlineSales.length}
            refreshKey={drawerRefreshKey}
            onReviewPendingSales={offlineSales.length || queueLoadError ? () => setOfflineDrawerOpen(true) : undefined} />}
        {(offlineSales.length > 0 || queueLoadError) && (
          <button type="button" className="admin-secondary" onClick={() => setOfflineDrawerOpen(true)}>
            <CloudUpload size={16} aria-hidden="true" /> Pending sales{!queueLoadError && ` (${offlineSales.length})`}
          </button>
        )}
        {canCreateSale && <button type="button" ref={customerButton} className="admin-secondary" onClick={() => setCustomerLookupOpen(true)}>Customers</button>}
          {can('sales.receipts', terminal.access?.receipts ?? true) && <button className="admin-secondary" type="button" onClick={() => { setReceiptHistory(null); setReceiptHistoryOpen(true); }}><ReceiptText size={16} /> Receipt history</button>}
          {(salesPermissions.canCancelSales || salesPermissions.canProcessReturns) &&
            <button type="button" className="admin-secondary" onClick={() => setReturnsOpen(true)}><Undo2 size={16} /> Returns &amp; cancellations</button>}
          {storeOptions.length > 1 && <button className="admin-secondary" type="button" disabled={cart.length > 0 || busy || saleRetryPending || syncingSales}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('locationId');
              window.history.replaceState(null, '', url);
              setTerminal(null); setCashDrawerId(null); setResults([]); setSaleControl(null); setOfflineSales([]); setQueueLoadError(''); setQueueLocationChecked(undefined); setCheckoutLocation('');
            }}>Change store</button>}
        </div>
        {canCreateSale && <>
        <div className="pos-mobile-basket-bar">
          <button type="button" className="pos-basket-jump" onClick={() => {
            basketHeading.current?.focus({ preventScroll: true });
            basketHeading.current?.scrollIntoView({ block: 'start' });
          }}>
            <ShoppingCart size={16} aria-hidden="true" />
            <span>Basket ({basketQuantity})</span>
            <strong>{formatMoney(saleTotals.net)}</strong>
          </button>
        </div>
        <div className="pos-search-panel">
          <div className="catalog-search-area">
            <div className="pos-search-tools">
            <div className="search-wrap">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                aria-label="Scan barcode or search products"
                autoFocus
                placeholder="Scan barcode or search product / SKU…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setNotice(''); setError(''); }}
                onKeyDown={handleSearchKeyDown}
              />
              {query && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} className="inline-icon" aria-hidden="true" /></button>}
              <kbd>ENTER</kbd>
            </div>
            <button type="button" className="admin-secondary" aria-expanded={showCatalog}
              onClick={() => {
                const hide = browseProducts && !query.trim() && selectedCategory === 'All categories';
                setBrowseProducts(!hide);
                setQuery('');
                setSelectedCategory('All categories');
              }}>
              {browseProducts && !query.trim() && selectedCategory === 'All categories' ? 'Hide products' : 'Show all products'}
            </button>
            </div>
            <div className="scanner-status"><span className="status-dot" /> Ready to scan · Enter a barcode or search</div>
          </div>

          {error && !checkoutOpen && <Feedback tone="error">{error}</Feedback>}
          {notice && !error && <div className="notice-line">{notice}</div>}
          {saleRetryPending && <div className="alert stock-error">The checkout response was interrupted. Retry the same sale to safely confirm its result; keep this terminal open.</div>}
          {stockError && <div className="alert stock-error">Stock refresh failed: {stockError}</div>}
        </div>

        {showCatalog && <section className="catalog-panel" aria-label="Products">
          <section className="catalog-browser">
            <div className="catalog-heading">
              <div><div className="eyebrow">SALES FLOOR</div><h1>Products <span>({results.length})</span></h1></div>
              <div className="catalog-controls"><label className="sort-control"><span>Sort</span><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)} aria-label="Sort products"><option value="name">Product name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div>
            </div>
            <div className="category-chips" aria-label="Product categories">
              <button className={selectedCategory === 'All categories' ? 'active' : ''} onClick={() => setSelectedCategory('All categories')}>All categories</button>
              {categories.map((category) => <button key={category} className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory(category)}>{category}</button>)}
            </div>
            {catalogLoading && !results.length ? <div className="catalog-loading">Loading products for {terminal.location.name}…</div> : visibleVariants.length ? (
              <div className="product-tiles">
                {visibleVariants.map(({ product, variant }) => {
                  const ProductIcon = getProductIcon(product);
                  const stock = stockBalances[variant.id];
                  const qty = stock ? Number(stock.quantityBaseUnits) : null;
                  const isNegative = stock && (stock.negativeAvailable || (qty !== null && qty <= 0));
                  const isLow = stock && !isNegative && (stock.lowStock || (qty !== null && qty <= 10));
                  return (
                    <article className="product-tile" key={variant.id}>
                      <div className="product-tile-art" aria-hidden="true"><span><ProductIcon size="1em" aria-hidden="true" /></span></div>
                      <div className="product-tile-info">
                        {product.category?.name && <span className="product-category">{product.category.name}</span>}
                        <strong title={product.name}>{product.name}</strong>
                        <span className="product-variant-name">{variant.name}</span>
                        <span className="product-sku">{variant.sku}</span>
                        <strong className="product-price">{formatMoney(product.sellingPrice)} <small>/ {product.baseUnit}</small></strong>
                      </div>
                      <div className="product-tile-actions">
                        <span className={`stock-chip ${isNegative ? 'negative' : isLow ? 'low' : ''}`}>{stock ? <>{isNegative && <b aria-hidden="true"><TriangleAlert size={10} aria-hidden="true" /></b>}{isNegative ? 'Out of stock' : isLow ? `${stock.formattedQuantity} in stock · Low stock` : `${stock.formattedQuantity} in stock`}</> : isOnline ? 'Checking stock…' : 'Stock unavailable offline'}</span>
                        <button type="button" className="tile-add-button" aria-label={`Add ${product.name} to basket`} disabled={busy || saleRetryPending || Boolean(isNegative)} onClick={() => addToCart(product, variant)}><span><Plus size="1em" className="inline-icon" aria-hidden="true" /></span><span className="tile-add-label">Add</span></button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : catalogLoading ? <div className="catalog-loading">Updating catalogue…</div> : <div className="empty-state"><div className="empty-icon"><Search size="1em" className="inline-icon" aria-hidden="true" /></div><strong>{query ? 'No matching products' : 'No active products found'}</strong><span>{query ? 'Try another product name, SKU, or barcode.' : 'Products available to sell will appear here.'}</span></div>}
          </section>
        </section>}

        <aside className="basket-panel" aria-labelledby="pos-basket-title">
          <div className="basket-heading">
            <div><h2 id="pos-basket-title" ref={basketHeading} tabIndex={-1}>Current basket</h2><small>{terminal.location.name}</small></div>
            <div className="basket-heading-actions">
              <span className="item-count">{basketQuantity} {basketUnits.size === 1 ? [...basketUnits][0] + (basketQuantity === 1 ? '' : 's') : 'base units'}</span>
              <button ref={clearBasketButton} className="clear-basket-button" disabled={checkoutDisabledForClear} onClick={() => setClearBasketOpen(true)}>Clear basket</button>
            </div>
          </div>
          <div className="basket-body">
          {cart.length ? (
            <div className="basket-lines">
              {cart.map((line) => {
                const stock = stockBalances[line.variantId];
                const quantity = baseQuantity(line);
                const cartonFirst = line.unit === 'CARTON';
                const key = cartKey(line);
                const hasOtherUnit = cart.some((item) => item.variantId === line.variantId && item.unit !== line.unit);
                const quantityLabel = `${line.baseUnit} quantity`;
                const unitCount = (count: number) => `${count} ${line.baseUnit}${Math.abs(count) === 1 ? '' : 's'}`;
                return (
                  <div className="basket-line" key={key}>
                    <div className="basket-line-main">
                      <div className="basket-item-icon" aria-hidden="true">{line.productName.slice(0, 1).toUpperCase()}</div>
                      <div className="basket-item-copy">
                        <strong>{line.productName}</strong>
                        <span>{line.variantName} · {line.sku}</span>
                        <small>{formatMoney(line.sellingPrice * (cartonFirst ? line.unitsPerCarton : 1))} / {cartonFirst ? 'carton' : line.baseUnit}</small>
                        <small className={hasStockShortage(line) ? 'stock-warning-text' : 'basket-stock'}>
                          {stock ? `${stock.negativeAvailable ? 'Negative stock' : 'Available'}: ${unitCount(stock.quantityBaseUnits)}` : isOnline ? 'Checking store stock…' : 'Stock unavailable offline'}
                        </small>
                      </div>
                      <button className="remove-button" disabled={busy || removingVariantId === key || saleRetryPending}
                        aria-label={`Remove ${line.productName} (${cartonFirst ? 'carton' : line.baseUnit})`} onClick={() => void removeLine(line)}>
                        {removingVariantId === key ? <Ellipsis size={16} className="inline-icon" aria-hidden="true" /> : <X size={16} className="inline-icon" aria-hidden="true" />}
                      </button>
                    </div>
                    <div className="basket-quantity-fields">
                      {line.unitsPerCarton > 1 && <label className="basket-selling-unit">
                        Selling unit
                        <select aria-label={`Selling unit for ${line.productName}`} disabled={busy || saleRetryPending || hasOtherUnit || !!removingVariantId} value={line.unit}
                          onChange={(event) => changeSellingUnit(line, event.target.value as SaleUnit)}>
                          <option value="BASE_UNIT">{line.baseUnit}</option>
                          <option value="CARTON">Carton ({unitCount(line.unitsPerCarton)})</option>
                        </select>
                      </label>}
                      <label>
                        {cartonFirst ? 'Carton quantity' : quantityLabel}
                        <input type="number" inputMode="numeric" min="0" max="2147483647" step="1" disabled={busy || saleRetryPending}
                          value={line.quantity} onChange={(event) => setQuantity(key, event.target.value)} />
                      </label>
                      <label>
                        Line discount (%)
                        <input type="number" min="0" max="100" step="0.01" value={lineDiscounts[cartKey(line)] || ''}
                          disabled={busy || saleRetryPending || Number(billDiscount || 0) > 0}
                          onChange={(event) => setLineDiscounts((current) => ({ ...current, [key]: event.target.value }))} />
                      </label>
                    </div>
                    {line.unitsPerCarton > 1 && !hasOtherUnit && <button type="button" className="small-action-button secondary basket-unit-action"
                      disabled={busy || saleRetryPending} onClick={() => addOtherSellingUnit(line)}>
                      Add {cartonFirst ? line.baseUnit + 's' : 'cartons'}
                    </button>}
                    <div className="basket-line-summary">
                      <small>{unitCount(quantity)} deducted from stock</small>
                      <strong>{formatMoney(line.sellingPrice * quantity)}</strong>
                    </div>
                    {hasStockShortage(line) && <small className="basket-stock-warning">Quantity exceeds available stock.</small>}
                  </div>
                );
              })}
            </div>
          ) : <div className="basket-empty"><div className="basket-empty-icon" aria-hidden="true"><ShoppingCart size="1em" className="inline-icon" aria-hidden="true" /></div><strong>Your basket is empty</strong><span>Scan an item or choose a product to get started.</span></div>}


          </div>
          <div className="basket-footer">
            <div className="sale-totals"><div><span>Subtotal</span><strong>{formatMoney(saleTotals.gross)}</strong></div><div><span>Discount</span><strong>−{formatMoney(saleTotals.discount)}</strong></div><div className="sale-net"><span>Total due</span><strong>{formatMoney(saleTotals.net)}</strong></div></div>
            <label className="discount-input bill-discount-input">Bill discount (%)<input type="number" min="0" max="100" step="0.01" value={billDiscount} disabled={saleRetryPending || cart.length === 0 || Object.values(lineDiscounts).some((value) => Number(value) > 0)} onChange={(event) => setBillDiscount(event.target.value)} /><small>Your discount limit: {discountLimit.toFixed(2)}%</small></label>
            {drawerBlocksCheckout && <div className="checkout-drawer-required">
              <p role="status">{canOpenDrawer ? 'Enter your opening cash before completing a sale.' : 'Ask a supervisor with drawer access to open the register.'}</p>
              {canOpenDrawer && <button type="button" className="admin-secondary" onClick={() => setDrawerOpen(true)}>Enter opening cash</button>}
            </div>}
            <button className="checkout-button" disabled={checkoutDisabled} onClick={() => setCheckoutOpen(true)}><span>{saleRetryPending ? 'Retry same sale safely' : 'Complete sale'}</span><span>F12 <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span></button>
            <div className="keyboard-cues"><span><kbd>F2</kbd> Search</span><span><kbd>F4</kbd> Clear</span><span><kbd>F12</kbd> Checkout</span><span><kbd>Esc</kbd> Close</span></div>
            {saleTotals.percent > discountLimit + 0.000001 && <p className="discount-warning">Discount exceeds your assigned limit.</p>}
            {auditBlocksCheckout && <p className="basket-stock-warning" role="status">Checkout is paused while this store’s stock count is open.</p>}
            {stockBlocksCheckout && <p className="basket-stock-warning" role="status">Reduce the flagged quantities or restock to continue.</p>}
          </div>
        </aside>
        </>}
      </div>
      <AdminModal isOpen={offlineDrawerOpen} onClose={() => setOfflineDrawerOpen(false)}
        title="Pending sales" maxWidth="560px" badgeIcon={<CloudUpload size={22} aria-hidden="true" />}>
          <section className="offline-queue">
            {queueLoadError ? (
              <Feedback tone="error" action={<button type="button" className="admin-secondary" disabled={syncingSales} onClick={() => void syncOfflineSales()}>Retry</button>}>
                Could not load pending sales. {queueLoadError}
              </Feedback>
            ) : offlineSales.length === 0 ? <p className="offline-empty-note">No sales are waiting to sync.</p> : (
              <div className="offline-queue-heading">
                <div><strong>{offlineSales.length} pending sale{offlineSales.length === 1 ? '' : 's'}</strong>
                  <small>{isOnline ? 'Saved on this device. Sync to finalize these sales.' : 'Reconnect to sync these sales.'}</small></div>
                <button type="button" className="small-action-button" disabled={!isOnline || syncingSales} onClick={() => void syncOfflineSales()}>{syncingSales ? 'Syncing…' : 'Sync now'}</button>
              </div>
            )}
            {offlineSales.map((sale) => {
              const quote = offlineQuotes[sale.idempotencyKey];
              const totalMatch = sale.error?.match(/Current server total is ([0-9]+\.[0-9]{2})/);
              return <div className="offline-sale-row" key={sale.idempotencyKey}>
                <strong>{new Date(sale.createdAt).toLocaleString(undefined, { timeZone: terminal?.location.timezone })} · {sale.status === 'needs_review' ? 'Needs review' : 'Waiting to sync'}</strong>
                {sale.error && <p>{sale.error}</p>}
                {sale.status === 'needs_review' && <>
                  <div className="offline-quote-actions"><button className="small-action-button" disabled={!isOnline || syncingSales} onClick={() => void quoteOfflineSale(sale)}>Quote with discounts</button><button className="small-action-button secondary" disabled={!isOnline || syncingSales} onClick={() => void quoteOfflineSale(sale, true)}>Remove discounts and quote</button></div>
                  {quote && <div className="offline-reconcile-form">
                    <p>Current server total: <strong>{formatMoney(quote.netTotal)}</strong>. Reconcile any amount difference with the customer before confirming.</p>
                    {JSON.parse(sale.body).paymentMethod === 'CASH' ? <label>Cash received<input type="number" min={quote.netTotal} step="0.01" value={offlineCashTendered[sale.idempotencyKey] || totalMatch?.[1] || ''} onChange={(event) => setOfflineCashTendered((current) => ({ ...current, [sale.idempotencyKey]: event.target.value }))} /></label> : <label>Updated transaction reference (optional)<input type="text" maxLength={120} value={offlineReference[sale.idempotencyKey] || ''} onChange={(event) => setOfflineReference((current) => ({ ...current, [sale.idempotencyKey]: event.target.value }))} /></label>}
                    <label className="offline-confirm"><input type="checkbox" checked={offlinePaymentConfirmed[sale.idempotencyKey] || false} onChange={(event) => setOfflinePaymentConfirmed((current) => ({ ...current, [sale.idempotencyKey]: event.target.checked }))} /> I reconciled the actual payment with this total.</label>
                    <button className="small-action-button" disabled={!isOnline || syncingSales || !offlinePaymentConfirmed[sale.idempotencyKey]} onClick={() => void confirmOfflineSale(sale)}>Confirm and sync</button>
                  </div>}
                </>}
              </div>;
            })}
          </section>
      </AdminModal>
      {refundDrawerOpen && saleControl && !refundAtTerminal && <CashDrawer
        key={saleControl.location.id} api={API_BASE} token={token} locationId={saleControl.location.id}
        timezone={saleControl.location.company?.timezone} onDrawer={updateRefundDrawer} formatMoney={(amount) => formatMoney(amount, saleControl.location.company?.currency)}
        isOpen={refundDrawerOpen} onOpenChange={setRefundDrawerOpen} hideTrigger canClose={false}
        closeHref={`/pos-terminal?locationId=${encodeURIComponent(saleControl.location.id)}`} />}
      {returnsOpen && !refundDrawerOpen && <AdminModal isOpen title="Returns & cancellations" badgeIcon={<Undo2 size={22} />}
        subtitle="Find the original invoice to record a return or cancel the sale."
        onClose={() => { if (!controlBusy) setReturnsOpen(false); }} maxWidth="760px"
        footer={<button type="button" className="admin-secondary" disabled={controlBusy} onClick={() => setReturnsOpen(false)}>Done</button>}>
        <section className="sale-controls checkout-returns">
            <div className="invoice-search"><input aria-label="Invoice number" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Invoice number" disabled={saleControlRetryPending} /><button className="small-action-button" disabled={controlBusy || saleControlRetryPending || !invoiceSearch.trim()} onClick={() => void loadSaleControl()}>{controlBusy ? 'Loading…' : 'Find'}</button></div>
            {controlNotice && <Feedback tone="success">{controlNotice}</Feedback>}
            {saleControl && <div className="invoice-control-card">
              <div className="invoice-control-heading"><strong>{saleControl.invoiceNumber}</strong><span>{saleControl.status} · {saleControl.location.name}</span></div>
              {saleControl.cancellationReason && <p className="field-hint">Cancelled {saleControl.cancelledAt ? `on ${new Date(saleControl.cancelledAt).toLocaleString(undefined, { timeZone: terminal?.location.timezone })}` : ''}: {saleControl.cancellationReason}</p>}
              <div className="invoice-control-totals"><span>Total {formatMoney(saleControl.netTotal, saleControl.location.company?.currency)}</span><span>Paid by {saleControl.payment?.method || 'unknown'}</span></div>
              {saleControl.returns.length > 0 && <ReturnHistory
                returns={saleControl.returns} saleLines={saleControl.lines}
                money={(amount) => formatMoney(amount, saleControl.location.company?.currency)}
                timezone={saleControl.location.company?.timezone}
              />}
              {saleControl.status === 'FINALIZED' && <>
                <label className="control-field">Reason<textarea value={controlReason} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setControlReason(event.target.value)} placeholder="Required: record why this action is being taken" /></label>
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <label className="offline-confirm"><input type="checkbox" checked={confirmedGoodsReturned} disabled={saleControlRetryPending} onChange={(event) => setConfirmedGoodsReturned(event.target.checked)} /> I confirm all goods are physically back at this store.</label>}
                <label className="control-field">Manual refund method<select value={refundMethod} disabled={saleControlRetryPending} onChange={(event) => setRefundMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE' | 'OTHER')}><option value="CASH">Cash</option><option value="CARD">Card (manual)</option><option value="ONLINE">Online (manual)</option><option value="OTHER">Other</option></select></label>
                <label className="control-field">Refund reference (optional)<input value={refundReference} disabled={saleControlRetryPending} maxLength={120} onChange={(event) => setRefundReference(event.target.value)} placeholder="No card numbers" /></label>
                {refundNeedsDrawer && <Feedback action={saleControl.refundDrawer?.canManage && <button type="button" className="admin-secondary"
                  onClick={() => { setControlError(''); setRefundDrawerOpen(true); }}>Open cash drawer</button>}>
                  {saleControl.refundDrawer?.canManage ? `Open your cash drawer at ${saleControl.location.name} before recording a cash refund.`
                    : 'Ask a supervisor with drawer access at this store to record the cash refund.'}
                </Feedback>}
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <button className="danger-action-button" disabled={controlBusy || refundNeedsDrawer} onClick={() => void cancelSale(saleControl)}>{saleControlRetryPending ? 'Retry same cancellation' : `Cancel sale · refund ${formatMoney(saleControl.netTotal, saleControl.location.company?.currency)}`}</button>}
                {saleControl.permissions.canProcessReturns && <div className="return-lines-form"><strong>Return inspected items</strong>{saleControl.lines.map((line, index) => {
                  const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
                  const selection = returnLines[line.id] || { quantity: '', disposition: 'QUARANTINED' as const, inspectionNotes: '' };
                  if (remaining < 1) return null;
                  const unit = line.variant.product.baseUnit;
                  const soldAs = line.enteredUnit === 'carton' && line.conversionRatioUsed
                    ? `${line.quantityBaseUnits / line.conversionRatioUsed} ${line.quantityBaseUnits === line.conversionRatioUsed ? 'carton' : 'cartons'}`
                    : line.enteredUnit === 'mixed' ? 'cartons and loose items' : `${line.quantityBaseUnits} ${unit}${line.quantityBaseUnits === 1 ? '' : 's'}`;
                  const label = `line ${index + 1}, ${line.variant.product.name}, sold as ${soldAs}`;
                  return <div className="return-line-entry" key={line.id}>
                    <span>{line.variant.product.name} · {line.variant.name}<small>Sold as {soldAs} · {remaining} {unit}{remaining === 1 ? '' : 's'} remaining · {line.variant.sku}</small>
                      <small>{soldUnitPrice(line, (amount) => formatMoney(amount, saleControl.location.company?.currency))}</small></span>
                    <input aria-label={`Return quantity in ${unit}s for ${label}`} type="number" min="0" max={remaining} value={selection.quantity} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, quantity: event.target.value } }))} />
                    <select aria-label={`Disposition for ${label}`} value={selection.disposition} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, disposition: event.target.value as 'RESTOCKED' | 'QUARANTINED' } }))}><option value="QUARANTINED">Quarantine</option><option value="RESTOCKED">Inspected and restock</option></select>
                    <input aria-label={`Inspection notes for ${label}`} value={selection.inspectionNotes} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, inspectionNotes: event.target.value } }))} placeholder="Inspection notes (required)" />
                  </div>;
                })}<button className="small-action-button" disabled={controlBusy || refundNeedsDrawer} onClick={() => void processSaleReturn(saleControl)}>{saleControlRetryPending ? 'Retry same return' : 'Record return'}</button></div>}
              </>}
            </div>}
        </section>
      </AdminModal>}
      {returnsOpen && !refundDrawerOpen && controlError && <div className="pos-return-toast">
        <Feedback tone="error" onDismiss={() => setControlError('')}>{controlError}</Feedback>
      </div>}
      {customerLookupOpen && <div className="checkout-modal-backdrop">
        <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="lookup-title" onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); closeCustomerLookup(); }
          if (event.key === 'Tab') {
            const controls = event.currentTarget.querySelectorAll('input, button');
            if (event.shiftKey && event.target === controls[0]) { event.preventDefault(); (controls[1] as HTMLElement).focus(); }
            if (!event.shiftKey && event.target === controls[1]) { event.preventDefault(); (controls[0] as HTMLElement).focus(); }
          }
        }}>
          <h2 id="lookup-title">Customer lookup</h2>
          <label className="payment-select">Customer name or code<input autoFocus maxLength={100} value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} /></label>
          {customerError && <Feedback tone="error">{customerError}</Feedback>}
          {customerLoading && <p role="status">Searching customers…</p>}
          {!customerLoading && !customerError && customerQuery.trim().length >= 2 && !customerResults.length && <p>No matching customers at this store.</p>}
          {customerResults.length > 0 && <ul className="customer-results">{customerResults.map((customer) => (
            <li key={customer.code}><strong>{customer.name}</strong><small>{customer.code}</small></li>
          ))}</ul>}
          <button type="button" className="admin-secondary" onClick={closeCustomerLookup}>Close</button>
        </section>
      </div>}
      {clearBasketOpen && <div className="checkout-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismissClearBasket();
      }}>
        <section className="checkout-modal" role="alertdialog" aria-modal="true" aria-labelledby="clear-basket-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); dismissClearBasket(); }
            if (event.key === 'Tab') { event.preventDefault(); event.currentTarget.querySelectorAll('button')[event.target === event.currentTarget.querySelector('button') ? 1 : 0]?.focus(); }
          }}>
          <h2 id="clear-basket-title">Clear this basket?</h2>
          <p>Each item removed will be recorded in the cart audit.</p>
          <div className="receipt-actions">
            <button type="button" className="admin-secondary" autoFocus onClick={dismissClearBasket}>Keep basket</button>
            <button type="button" className="danger-action-button" onClick={() => void clearBasket()}>Clear basket</button>
          </div>
        </section>
      </div>}
      {canCreateSale && checkoutOpen && <div className="checkout-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCheckoutOpen(false); }}>
        <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <header><div><div className="eyebrow">PAYMENT</div><div className="heading-with-info"><h2 id="checkout-title">Complete sale</h2><InfoHint label="About checkout">Choose the payment method. For cash, enter the amount received to calculate change.</InfoHint></div><p>Review tender and confirm the amount received.</p></div><button className="modal-close" disabled={busy} onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><X size={16} className="inline-icon" aria-hidden="true" /></button></header>
          <div className="checkout-due"><span>Amount due</span><strong>{formatMoney(saleTotals.net)}</strong></div>
          <label className="payment-select">Payment method<select value={paymentMethod} disabled={saleRetryPending} onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE')}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="ONLINE">Online</option></select></label>
          {paymentMethod === 'CASH' ? <>
            <label className="payment-select">
              Cash received
              <input autoFocus type="number" min={saleTotals.net} step="0.01" value={cashTendered} disabled={saleRetryPending}
                aria-invalid={Boolean(cashTenderError)} aria-describedby={cashTenderError ? 'checkout-cash-error' : undefined}
                onChange={(event) => setCashTendered(event.target.value)} placeholder={saleTotals.net.toFixed(2)} />
            </label>
            {cashTenderError && <Feedback tone="error"><span id="checkout-cash-error">{cashTenderError}</span></Feedback>}
            <div className="cash-chips" aria-label="Quick cash amounts">
              <button disabled={saleRetryPending} onClick={() => setCashTendered(saleTotals.net.toFixed(2))}>Exact</button>
              {quickCashAmounts(terminal.location.currency, cashPreferences).map((amount) => (
                <button key={amount} disabled={saleRetryPending} onClick={() => setCashTendered(String(amount))}>{formatMoney(amount)}</button>
              ))}
            </div>
            <div className="checkout-change"><span>Change due</span><strong>{formatMoney(Math.max(0, cashAmount - saleTotals.net))}</strong></div>
          </> : <label className="payment-select">{paymentMethod === 'CARD' ? 'Card terminal reference (optional)' : 'Online payment reference (optional)'}<input type="text" maxLength={120} value={transactionReference} disabled={saleRetryPending} onChange={(event) => setTransactionReference(event.target.value)} placeholder="Do not enter card numbers" /></label>}
          {error && <Feedback tone="error">{error}</Feedback>}
          <button className="checkout-button" disabled={checkoutDisabled || cashPaymentBlocked} onClick={() => void checkout()}><span>{busy ? 'Completing…' : saleRetryPending ? 'Retry same sale safely' : 'Confirm payment'}</span><span><ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span></button>
        </section>
      </div>}
      {receiptHistoryOpen && <div className="receipt-overlay">
        <section className="receipt-card receipt-history-card" role="dialog" aria-modal="true" aria-labelledby="receipt-history-title"
          onKeyDown={(event) => { if (event.key === 'Escape') setReceiptHistoryOpen(false); }}>
          <header className="pos-receipt-header">
            <h2 id="receipt-history-title">Receipt history</h2>
            <button type="button" className="pos-receipt-close" aria-label="Close receipt history" onClick={() => setReceiptHistoryOpen(false)}><X size={18} aria-hidden="true" /></button>
          </header>
          <p>{terminal.location.name} · Up to 25 matching finalized sales</p>
          <label className="discount-input">Invoice number<input autoFocus value={receiptQuery} onChange={(event) => setReceiptQuery(event.target.value)} /></label>
          {receiptHistoryError ? <Feedback tone="error">{receiptHistoryError}</Feedback> : receiptHistory === null ? <p role="status">Loading receipts…</p> :
            receiptHistory.length === 0 ? <p>No matching receipts.</p> : receiptHistory.map((receipt) => <div className="receipt-line" key={receipt.id}>
              <span><b>{receipt.invoiceNumber}</b><small>{new Date(receipt.createdAt).toLocaleString(undefined, { timeZone: terminal?.location.timezone })} · {formatMoney(receipt.netTotal)}</small>
                {!!receipt.returns?.length && <small>{receipt.returns.length} {receipt.returns.length === 1 ? 'return' : 'returns'} · {formatMoney(receipt.returns.reduce((total, entry) => total + Number(entry.refund?.amount ?? 0), 0))} refunded</small>}
              </span>
              <button type="button" className="admin-secondary" onClick={() => { setReceiptHistoryOpen(false); setLastReceipt(receipt); }}>Open receipt</button>
            </div>)}
        </section>
      </div>}
      {lastReceipt && !offlineDrawerOpen && !drawerOpen && <div className="receipt-overlay">
        <section className="receipt-card receipt-history-card" role="dialog" aria-modal="true" aria-label="Sale receipt"
          onKeyDown={(event) => { if (event.key === 'Escape') setLastReceipt(null); }}>
          <header className="pos-receipt-header">
            <div><div className="eyebrow">{terminal.location.name}</div><h2>{lastReceipt.invoiceNumber}</h2></div>
            <button type="button" className="pos-receipt-close" autoFocus aria-label="Close receipt" onClick={() => setLastReceipt(null)}><X size={18} aria-hidden="true" /></button>
          </header>
          <p>{new Date(lastReceipt.createdAt).toLocaleString(undefined, { timeZone: terminal?.location.timezone })}</p>
          {lastReceipt.lines.map((line) => <div className="receipt-line" key={line.id}>
            <span>{line.variant.product.name} · {line.variant.name}
              <small>{receiptQuantity(line)} · {line.variant.sku}</small>
            </span>
            <strong>{formatMoney(line.lineTotal)}</strong>
          </div>)}
          {receiptTotals(lastReceipt).map(([label, amount]) => (
            <div className={label.startsWith('Total paid') ? 'receipt-line receipt-total' : 'receipt-line'} key={label}>
              <span>{label}</span><strong>{amount}</strong>
            </div>
          ))}
          {!!lastReceipt.returns?.length && <section className="pos-receipt-returns" aria-label="Returns for this receipt">
            <h3>Returns and refunds</h3>
            <ReturnHistory returns={lastReceipt.returns} saleLines={lastReceipt.lines} money={formatMoney} timezone={terminal.location.timezone} />
          </section>}
          <div className="receipt-actions">
            <button className="admin-secondary" type="button" onClick={() => window.print()}>Print receipt</button>
            <button className="admin-secondary" type="button" onClick={() => downloadReceipt(lastReceipt)}>Download PDF</button>
          </div>
        </section>
      </div>}
      <footer className="terminal-footer"><span>Terminal bound to <strong>{terminal.location.name}</strong></span><span>Stock refreshes every 15 seconds while this terminal is open</span></footer>
    </main>
  );
}
