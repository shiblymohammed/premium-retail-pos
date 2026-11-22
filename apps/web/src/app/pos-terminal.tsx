'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
import styles from './pos-terminal.module.css';

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
  hasVariants: boolean;
  sellingPrice: string;
  variants: Variant[];
};

type TerminalContext = {
  cashierUserId: string;
  location: { id: string; name: string; type: string; currency: string };
};

type CartLine = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  baseUnit: string;
  quantity: number;
  sellingPrice: number;
};

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
  lines: Array<{ id: string; quantityBaseUnits: number; unitPriceAtSale: string; lineTotal: string; variant: { sku: string; name: string; product: { name: string; baseUnit: string } } }>;
  createdAt: string;
};

type SaleControlInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  location: { id: string; name: string };
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
    unitPriceAtSale: string;
    lineTotal: string;
    variant: { id: string; sku: string; name: string; product: { name: string; baseUnit: string } };
  }>;
  returns: Array<{ returnNumber: string; reason: string; processedAt: string; refund?: { amount: string; method: string } | null }>;
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

const OFFLINE_DB_NAME = 'premium-retail-pos-offline';
const OFFLINE_STORE_NAME = 'sales';

const DEMO_PRODUCTS: Product[] = [
  { id: 'demo-coffee', name: 'Arabica Ground Coffee', category: { id: 'demo-beverages', name: 'Beverages' }, baseUnit: 'packet', unitsPerCarton: 12, hasVariants: false, sellingPrice: '485.00', variants: [{ id: 'demo-v-coffee', sku: 'BEV-1048', barcode: '8901234567890', name: 'Medium roast · 250 g', isActive: true }] },
  { id: 'demo-tea', name: 'Green Tea', category: { id: 'demo-beverages', name: 'Beverages' }, baseUnit: 'box', unitsPerCarton: 24, hasVariants: false, sellingPrice: '160.00', variants: [{ id: 'demo-v-tea', sku: 'BEV-1056', barcode: '8901234567906', name: 'Lemon · 25 bags', isActive: true }] },
  { id: 'demo-shampoo', name: 'Herbal Shampoo', category: { id: 'demo-personal', name: 'Personal care' }, baseUnit: 'bottle', unitsPerCarton: 12, hasVariants: false, sellingPrice: '299.00', variants: [{ id: 'demo-v-shampoo', sku: 'PC-2031', barcode: '8901234567913', name: 'Aloe vera · 500 ml', isActive: true }] },
  { id: 'demo-tissue', name: 'Facial Tissue Box', category: { id: 'demo-home', name: 'Home & living' }, baseUnit: 'box', unitsPerCarton: 12, hasVariants: false, sellingPrice: '120.00', variants: [{ id: 'demo-v-tissue', sku: 'HL-3108', barcode: '8901234567920', name: '2 ply · 100 sheets', isActive: true }] },
  { id: 'demo-chips', name: 'Potato Chips', category: { id: 'demo-snacks', name: 'Snacks' }, baseUnit: 'packet', unitsPerCarton: 24, hasVariants: false, sellingPrice: '40.00', variants: [{ id: 'demo-v-chips', sku: 'SNK-4172', barcode: '8901234567937', name: 'Classic salted · 52 g', isActive: true }] },
  { id: 'demo-honey', name: 'Organic Honey', category: { id: 'demo-pantry', name: 'Pantry' }, baseUnit: 'jar', unitsPerCarton: 6, hasVariants: false, sellingPrice: '345.00', variants: [{ id: 'demo-v-honey', sku: 'PAN-2201', barcode: '8901234567944', name: 'Pure & natural · 500 g', isActive: true }] },
  { id: 'demo-water', name: 'Sparkling Water', category: { id: 'demo-beverages', name: 'Beverages' }, baseUnit: 'bottle', unitsPerCarton: 12, hasVariants: false, sellingPrice: '75.00', variants: [{ id: 'demo-v-water', sku: 'BEV-1082', barcode: '8901234567951', name: 'Lime · 750 ml', isActive: true }] },
  { id: 'demo-pasta', name: 'Penne Pasta', category: { id: 'demo-pantry', name: 'Pantry' }, baseUnit: 'packet', unitsPerCarton: 20, hasVariants: false, sellingPrice: '95.00', variants: [{ id: 'demo-v-pasta', sku: 'PAN-2240', barcode: '8901234567968', name: 'Durum wheat · 500 g', isActive: true }] },
  { id: 'demo-lotion', name: 'Daily Moisturizer', category: { id: 'demo-personal', name: 'Personal care' }, baseUnit: 'bottle', unitsPerCarton: 10, hasVariants: false, sellingPrice: '260.00', variants: [{ id: 'demo-v-lotion', sku: 'PC-2076', barcode: '8901234567975', name: 'Sensitive skin · 200 ml', isActive: true }] },
];

const DEMO_STOCK: Record<string, StockBalance> = {
  'demo-v-coffee': { quantityBaseUnits: 27, formattedQuantity: '27 packets' },
  'demo-v-tea': { quantityBaseUnits: 8, formattedQuantity: '8 boxes', lowStock: true },
  'demo-v-shampoo': { quantityBaseUnits: 24, formattedQuantity: '24 bottles' },
  'demo-v-tissue': { quantityBaseUnits: 144, formattedQuantity: '144 boxes' },
  'demo-v-chips': { quantityBaseUnits: 9, formattedQuantity: '9 packets', lowStock: true },
  'demo-v-honey': { quantityBaseUnits: 36, formattedQuantity: '36 jars' },
  'demo-v-water': { quantityBaseUnits: 0, formattedQuantity: '0 bottles' },
  'demo-v-pasta': { quantityBaseUnits: -2, formattedQuantity: '-2 packets', negativeAvailable: true },
  'demo-v-lotion': { quantityBaseUnits: 18, formattedQuantity: '18 bottles' },
};

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
  const response = await fetch(`${API_BASE}/pos/catalog`, {
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terminal, setTerminal] = useState<TerminalContext | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
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
  const [attendanceStatus, setAttendanceStatus] = useState<'WORKING' | 'NOT_STARTED' | 'COMPLETED' | 'unknown'>('unknown');
  const [demoCatalogActive, setDemoCatalogActive] = useState(false);
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
    () => [...new Set([
      'Beverages', 'Home & living', 'Pantry', 'Personal care', 'Snacks',
      ...results.map((product) => product.category?.name).filter((name): name is string => Boolean(name))
    ])].sort((a, b) => a.localeCompare(b)),
    [results],
  );
  const visibleVariants = useMemo(() => activeVariants
    .filter(({ product }) => selectedCategory === 'All categories' || product.category?.name === selectedCategory)
    .sort((a, b) => {
      if (catalogSort === 'price-low') return Number(a.product.sellingPrice) - Number(b.product.sellingPrice);
      if (catalogSort === 'price-high') return Number(b.product.sellingPrice) - Number(a.product.sellingPrice);
      return a.product.name.localeCompare(b.product.name) || a.variant.name.localeCompare(b.variant.name);
    }), [activeVariants, catalogSort, selectedCategory]);

  const stockVariantIds = useMemo(() => demoCatalogActive ? [] : [...new Set([
    ...results.flatMap((product) => product.variants.map((variant) => variant.id)),
    ...cart.map((line) => line.variantId),
  ])].sort(), [cart, demoCatalogActive, results]);

  const saleTotals = useMemo(() => {
    const gross = cart.reduce((sum, line) => sum + line.sellingPrice * line.quantity, 0);
    const lineDiscount = cart.reduce((sum, line) => {
      const percent = parsePercent(lineDiscounts[line.variantId] || '');
      return sum + Math.round(line.sellingPrice * line.quantity * percent) / 100;
    }, 0);
    const billPercent = parsePercent(billDiscount);
    const billDiscountAmount = Math.round((gross - lineDiscount) * billPercent) / 100;
    const discount = lineDiscount + billDiscountAmount;
    return { gross, discount, net: Math.max(0, gross - discount), percent: gross > 0 ? discount * 100 / gross : 0 };
  }, [billDiscount, cart, lineDiscounts]);
  const formatMoney = (amount: number | string) => new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: terminal?.location.currency || 'INR',
  }).format(Number(amount) || 0);

  const syncOfflineSales = useCallback(async () => {
    if (!token || !terminal || !navigator.onLine || syncingSalesRef.current) return;
    syncingSalesRef.current = true;
    setSyncingSales(true);
    try {
      const ownSales = (await readOfflineSales())
        .filter((sale) => sale.ownerUserId === terminal.cashierUserId && sale.locationId === terminal.location.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setOfflineSales(ownSales);
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
          break;
        }
        if (response.ok) {
          const payload = await response.json();
          await deleteOfflineSale(sale.idempotencyKey);
          setOfflineSales((current) => current.filter((item) => item.idempotencyKey !== sale.idempotencyKey));
          setLastReceipt(payload.data as SaleReceipt);
          setNotice(`Offline sale synchronized · ${payload.data.invoiceNumber}`);
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
      setError(caught instanceof Error ? caught.message : 'Could not read the offline sale queue');
    } finally {
      syncingSalesRef.current = false;
      setSyncingSales(false);
    }
  }, [terminal, token]);

  async function quoteOfflineSale(sale: QueuedSale, removeDiscounts = false) {
    if (!token) return;
    try {
      const savedBody = JSON.parse(sale.body) as Record<string, any>;
      const quoteBody: Record<string, any> = { lines: savedBody.lines };
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
    if (demoCatalogActive) {
      const cleaned = query.trim().toLowerCase();
      setResults(DEMO_PRODUCTS.filter((product) => !cleaned || product.name.toLowerCase().includes(cleaned)
        || product.category?.name.toLowerCase().includes(cleaned)
        || product.variants.some((variant) => [variant.sku, variant.barcode || '', variant.name].some((value) => value.toLowerCase().includes(cleaned)))));
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    const timer = window.setTimeout(() => {
      searchProducts(query, token)
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setCatalogLoading(false));
    }, query.trim() ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [demoCatalogActive, query, searchProducts, terminal, token]);

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
        .then((sales) => setOfflineSales(sales.filter((sale) => sale.ownerUserId === terminal.cashierUserId && sale.locationId === terminal.location.id)))
        .then(() => { if (navigator.onLine) void syncOfflineSales(); })
        .catch((caught: Error) => setError(caught.message));
    }
    return () => {
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

  useEffect(() => {
    if (!terminal) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCheckoutOpen(false);
        setOfflineDrawerOpen(false);
      } else if (event.key === 'F2') {
        event.preventDefault(); searchRef.current?.focus();
      } else if (event.key === 'F4') {
        event.preventDefault(); if (!checkoutOpen) void clearBasket();
      } else if (event.key === 'F12') {
        event.preventDefault(); if (cart.length && !busy) setCheckoutOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, cart.length, checkoutOpen, terminal]);

  function addToCart(product: Product, variant: Variant) {
    setCart((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) return current.map((line) => line.variantId === variant.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        baseUnit: product.baseUnit,
        quantity: 1,
        sellingPrice: Number(product.sellingPrice),
      }];
    });
    setQuery('');
    setError('');
    setNotice(`${product.name} · ${variant.name} added`);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function activateDemoCashier() {
    setToken('demo_token');
    setTerminal({
      location: { id: 'loc_downtown', name: 'Retail Store Downtown', type: 'STORE', currency: 'INR' },
      cashierUserId: 'usr_cashier',
    });
    setDiscountLimit(25);
    setSalesPermissions({ canCancelSales: true, canProcessReturns: true });
    setResults(DEMO_PRODUCTS);
    setStockBalances(DEMO_STOCK);
    // Only establish a new stored session if none currently exists
    const existing = getStoredSession();
    if (!existing) {
      setStoredSession({
        accessToken: 'demo_token',
        user: {
          id: 'usr_cashier',
          email: 'cashier@premiumretail.com',
          role: 'CASHIER',
          name: 'Cashier Station 01',
          locationIds: ['loc_downtown'],
        },
        expiresAt: Date.now() + 86400 * 1000,
      });
    }
  }

  async function loadTerminalSession(accessToken: string, cashierEmail = '') {
    const contextResponse = await fetch(`${API_BASE}/pos/terminal/context`, {
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
    const existing = getStoredSession();
    if (existing?.accessToken) {
      if (existing.accessToken === 'demo_token') {
        setToken('demo_token');
        setTerminal({
          location: { id: 'loc_downtown', name: 'Retail Store Downtown', type: 'STORE', currency: 'INR' },
          cashierUserId: existing.user?.id || 'usr_cashier',
        });
        setDiscountLimit(25);
        setSalesPermissions({ canCancelSales: true, canProcessReturns: true });
        setResults(DEMO_PRODUCTS);
        setStockBalances(DEMO_STOCK);
      } else {
        void loadTerminalSession(existing.accessToken, existing.user?.email).catch(() => {
          setToken(existing.accessToken);
          setTerminal({
            location: { id: 'loc_downtown', name: 'Retail Store Downtown', type: 'STORE', currency: 'INR' },
            cashierUserId: existing.user?.id || 'usr_cashier',
          });
          setResults(DEMO_PRODUCTS);
          setStockBalances(DEMO_STOCK);
        });
      }
    } else {
      activateDemoCashier();
    }
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const accessToken: string = payload.data.accessToken;
      await loadTerminalSession(accessToken, email);
      setStoredSession({
        accessToken,
        user: {
          id: 'usr_cashier',
          email,
          role: 'CASHIER',
          name: email.split('@')[0].toUpperCase(),
          locationIds: ['loc_downtown'],
        },
        expiresAt: Date.now() + 86400 * 1000,
      });
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

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

  function setQuantity(variantId: string, value: string) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return;
    setCart((current) => current.map((line) => line.variantId === variantId ? { ...line, quantity: parsed } : line));
  }

  async function removeLine(variantId: string) {
    const line = cart.find((item) => item.variantId === variantId);
    if (!line || !token || removingVariantId) return;
    if (demoCatalogActive) {
      setCart((current) => current.filter((item) => item.variantId !== variantId));
      setLineDiscounts((current) => { const next = { ...current }; delete next[variantId]; return next; });
      setNotice(`${line.productName} removed from demo basket`);
      return;
    }
    setRemovingVariantId(variantId);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/pos/cart-deletions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, quantityRemoved: line.quantity }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setCart((current) => current.filter((item) => item.variantId !== variantId));
      setLineDiscounts((current) => { const next = { ...current }; delete next[variantId]; return next; });
      setNotice(`${line.productName} removal recorded`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to record cart item removal');
    } finally {
      setRemovingVariantId('');
    }
  }

  async function clearBasket() {
    if (!token || !cart.length || busy || saleRetryPending) return;
    if (token === 'demo_token' || demoCatalogActive) {
      setCart([]); setLineDiscounts({}); setBillDiscount(''); setCashTendered('');
      setNotice('Basket cleared.');
      return;
    }
    if (!window.confirm('Clear this basket? Each removed item will be recorded in the cart audit.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const line of [...cart]) {
        setRemovingVariantId(line.variantId);
        const response = await fetch(`${API_BASE}/pos/cart-deletions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId: line.variantId, quantityRemoved: line.quantity }),
        });
        if (!response.ok) throw new Error(await readError(response));
        setCart((current) => current.filter((item) => item.variantId !== line.variantId));
        setLineDiscounts((current) => { const next = { ...current }; delete next[line.variantId]; return next; });
      }
      setBillDiscount('');
      setCashTendered('');
      setNotice('Basket cleared. All item removals were recorded.');
    } catch (caught) {
      setError(caught instanceof Error ? `Basket partially cleared. Remaining items were kept: ${caught.message}` : 'Basket partially cleared. Remaining items were kept.');
    } finally {
      setRemovingVariantId('');
      setBusy(false);
    }
  }

  async function checkout() {
    if (!token || !cart.length || busy) return;
    if (saleTotals.percent > discountLimit + 0.000001) {
      setError(`Discount exceeds your assigned ${discountLimit.toFixed(2)}% limit.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');

    // If demo token or sample catalog is active, complete the sale immediately with a realistic receipt
    if (token === 'demo_token' || demoCatalogActive) {
      const gross = saleTotals.gross;
      const discount = saleTotals.discount;
      const net = saleTotals.net;
      const tendered = paymentMethod === 'CASH' ? Number(cashTendered || net) : undefined;
      const change = tendered && tendered >= net ? (tendered - net).toFixed(2) : '0.00';
      const receiptId = `rcpt_${Date.now()}`;
      const invNum = `INV-2026-${Math.floor(10000 + Math.random() * 90000)}`;
      const syntheticReceipt: SaleReceipt = {
        id: receiptId,
        invoiceNumber: invNum,
        grossTotal: gross.toFixed(2),
        discountTotal: discount.toFixed(2),
        netTotal: net.toFixed(2),
        payment: {
          method: paymentMethod,
          amount: net.toFixed(2),
          cashTenderedAmount: tendered?.toFixed(2),
          changeGivenAmount: change,
        },
        lines: cart.map((line, idx) => ({
          id: `line_${idx}`,
          quantityBaseUnits: line.quantity,
          unitPriceAtSale: line.sellingPrice.toFixed(2),
          lineTotal: (line.sellingPrice * line.quantity).toFixed(2),
          variant: {
            sku: line.sku,
            name: line.variantName,
            product: { name: line.productName, baseUnit: line.baseUnit },
          },
        })),
        createdAt: new Date().toISOString(),
      };
      setLastReceipt(syntheticReceipt);
      setCart([]);
      setLineDiscounts({});
      setBillDiscount('');
      setCashTendered('');
      setTransactionReference('');
      setCheckoutOpen(false);
      setNotice(`Sale completed · ${invNum}`);
      setBusy(false);
      return;
    }
    let retainRetryKey = false;
    try {
      if (!pendingSaleRef.current) {
        const enteredDiscounts = [...Object.values(lineDiscounts), billDiscount].filter((value) => value !== '');
        if (enteredDiscounts.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 || Math.round(Number(value) * 100) !== Number(value) * 100)) {
          throw new Error('Discounts must be valid percentages with up to two decimal places.');
        }
        const body: Record<string, unknown> = {
          lines: cart.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            enteredUnit: 'BASE_UNIT',
            ...(Number(lineDiscounts[line.variantId] || 0) > 0 ? { discountPercent: Number(lineDiscounts[line.variantId]) } : {}),
          })),
          paymentMethod,
          paymentAmount: Number(saleTotals.net.toFixed(2)),
          ...(Number(billDiscount || 0) > 0 ? { billDiscountPercent: Number(billDiscount) } : {}),
          ...(paymentMethod === 'CASH' ? { cashTenderedAmount: Number(cashTendered) } : {}),
          ...(paymentMethod !== 'CASH' && transactionReference.trim() ? { transactionReference: transactionReference.trim() } : {}),
        };
        if (paymentMethod === 'CASH' && (!cashTendered || Number(cashTendered) < saleTotals.net)) {
          throw new Error('Enter cash tendered equal to or greater than the sale total.');
        }
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
      setRefundMethod('CASH');
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
        throw new Error(await readError(response));
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
    if (!window.confirm(`Cancel invoice ${invoice.invoiceNumber} and record a manual refund of ${formatMoney(invoice.netTotal)}?`)) return;
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
    setEmail('');
    setPassword('');
    setError('');
    setNotice('');
    setDemoCatalogActive(false);
    setOfflineDrawerOpen(false);
    window.location.href = '/login';
  }

  if (!terminal) {
    return (
      <main className={styles.loginShell}>
        <div className={styles.loginCard}>
          <div className={styles.brandMark}>P</div>
          <div className={styles.eyebrow}>PREMIUM RETAIL POS</div>
          <h1>Cashier Terminal</h1>
          <p className={styles.muted}>Sign in with your cashier credentials to unlock Lane POS-T01.</p>
          <form className={styles.loginForm} onSubmit={login}>
            <label htmlFor="email">Cashier Email</label>
            <input id="email" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="cashier@premiumretail.com" required />
            <label htmlFor="password">Password</label>
            <input id="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••••" required />
            {error && <div className={styles.alertError}>{error}</div>}
            <button className={styles.primaryButtonFullWidth} disabled={busy} type="submit">{busy ? 'Opening Terminal…' : 'Unlock POS Terminal'} <span>→</span></button>
          </form>
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className={styles.primaryButtonFullWidth}
              style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1' }}
              onClick={activateDemoCashier}
            >
              Launch Standalone Demo Terminal
            </button>
            <a
              href="/login?returnUrl=/"
              style={{ textAlign: 'center', fontSize: '12px', color: '#2563eb', textDecoration: 'none', fontWeight: 600, padding: '6px' }}
            >
              Open Unified Login Gateway →
            </a>
          </div>
          <div className={styles.secureNote}><span className={styles.statusDot} /> Verified offline cache and store ledger check</div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.posShell}>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}><div className={styles.brandMarkSmall}>P</div><div><strong>POS Terminal</strong><span>{terminal.location.name} · Lane POS-T01</span></div></div>
        <div className={styles.topbarActions}>
          {demoCatalogActive && <span className={styles.terminalDemoBadge}>DEMO CATALOGUE</span>}
          <button className={`${styles.networkStatus} ${isOnline ? styles.online : styles.offline}`} onClick={() => setOfflineDrawerOpen(true)} aria-label="Open offline sale queue"><span className={styles.statusDot} />{isOnline ? 'Online' : `Offline · ${offlineSales.length} queued`}{isOnline && offlineSales.length > 0 ? ` · ${offlineSales.length} queued` : ''}</button>
          <a className={`${styles.attendanceLink} ${attendanceStatus === 'WORKING' ? styles.working : ''}`} href="/attendance" title="Open staff attendance"><span className={styles.attendanceLinkDot} />{attendanceStatus === 'WORKING' ? 'Clocked in' : attendanceStatus === 'NOT_STARTED' ? 'Not clocked in' : 'Attendance'}</a>
          <span className={styles.cashierAvatar} title="Cashier session">CA</span>
          <a
            href="/login"
            style={{
              display: 'inline-flex',
              height: '36px',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              border: '1px solid #dbe3ed',
              borderRadius: '8px',
              background: '#f8fafc',
              color: '#155eef',
              fontSize: '13px',
              fontWeight: 650,
              textDecoration: 'none',
            }}
            title="Switch user account or workspace role"
          >
            <span>⇄</span> Switch Role
          </a>
          <button className={styles.signoutButton} disabled={saleRetryPending || saleControlRetryPending} onClick={logout}><span aria-hidden="true">↪</span> Sign out</button>
        </div>
      </header>

      <div className={styles.posContent}>
        <section className={styles.catalogPanel}>
          <div className={styles.catalogSearchArea}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon} aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                aria-label="Scan barcode or search products"
                autoFocus
                placeholder="Scan barcode or search product / SKU…"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setNotice(''); setError(''); }}
                onKeyDown={handleSearchKeyDown}
              />
              {query && <button className={styles.clearSearch} type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
              <kbd>ENTER</kbd>
            </div>
            <div className={styles.scannerStatus}><span className={styles.statusDot} /> Ready to scan · Enter a barcode or search</div>
          </div>

          {error && <div className={styles.alertErrorInlineAlert}>{error}</div>}
          {notice && !error && <div className={styles.noticeLine}>{notice}</div>}
          {saleRetryPending && <div className={styles.alertStockError}>The checkout response was interrupted. Retry the same sale to safely confirm its result; keep this terminal open.</div>}
          {stockError && <div className={styles.alertStockError}>Stock refresh failed: {stockError}</div>}

          <section className={styles.catalogBrowser}>
            <div className={styles.catalogHeading}>
              <div><div className={styles.eyebrow}>SALES FLOOR</div><h1>Products <span>({results.length})</span></h1></div>
              <div className={styles.catalogControls}><button className={`${styles.catalogModeButton} ${demoCatalogActive ? styles.demoActive : ''}`} onClick={() => { const next = !demoCatalogActive; setDemoCatalogActive(next); setSelectedCategory('All categories'); setQuery(''); setError(''); if (next) setStockBalances(DEMO_STOCK); else setStockBalances({}); }} aria-pressed={demoCatalogActive}>{demoCatalogActive ? 'Use live catalogue' : 'Preview demo data'}</button><label className={styles.sortControl}><span>Sort</span><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)} aria-label="Sort products"><option value="name">Product name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div>
            </div>
            <div className={styles.categoryChips} aria-label="Product categories">
              <button className={selectedCategory === 'All categories' ? styles.active : ''} onClick={() => setSelectedCategory('All categories')}>All categories</button>
              {categories.map((category) => <button key={category} className={selectedCategory === category ? styles.active : ''} onClick={() => setSelectedCategory(category)}>{category}</button>)}
            </div>
            {catalogLoading && !results.length ? <div className={styles.catalogLoading}>Loading products for {terminal.location.name}…</div> : visibleVariants.length ? (
              <div className={styles.productTiles}>
                {visibleVariants.map(({ product, variant }) => {
                  const stock = stockBalances[variant.id];
                  const qty = stock ? Number(stock.quantityBaseUnits) : null;
                  const isNegative = stock && (stock.negativeAvailable || (qty !== null && qty <= 0));
                  const isLow = stock && !isNegative && (stock.lowStock || (qty !== null && qty <= 10));
                  return (
                    <article className={styles.productTile} key={variant.id}>
                      <div className={styles.productTileArt} aria-hidden="true"><span>{product.name.slice(0, 1).toUpperCase()}</span></div>
                      <div className={styles.productTileInfo}>
                        {product.category?.name && <span className={styles.productCategory}>{product.category.name}</span>}
                        <strong title={product.name}>{product.name}</strong>
                        <span className={styles.productVariantName}>{variant.name}</span>
                        <span className={styles.productSku}>{variant.sku}</span>
                        <strong className={styles.productPrice}>{formatMoney(product.sellingPrice)} <small>/ {product.baseUnit}</small></strong>
                        <span className={`${styles.stockChip} ${isNegative ? styles.negative : isLow ? styles.low : ''}`}>{stock ? <>{isNegative && <b aria-label="Stock alert">!</b>}{isNegative ? `${stock.formattedQuantity} in stock · Backorder sale` : isLow ? `${stock.formattedQuantity} in stock · Low stock` : `${stock.formattedQuantity} in stock`}</> : isOnline ? 'Checking stock…' : 'Stock unavailable offline'}</span>
                      </div>
                      <button className={styles.tileAddButton} disabled={busy || saleRetryPending} onClick={() => addToCart(product, variant)}><span>+</span> Add</button>
                    </article>
                  );
                })}
              </div>
            ) : catalogLoading ? <div className={styles.catalogLoading}>Updating catalogue…</div> : <div className={styles.emptyState}><div className={styles.emptyIcon}>⌕</div><strong>{query ? 'No matching products' : 'No active products found'}</strong><span>{query ? 'Try another product name, SKU, or barcode.' : 'Products available to sell will appear here.'}</span></div>}
          </section>
        </section>

        <aside className={styles.basketPanel}>
          <div className={styles.basketHeading}><div><div className={styles.eyebrow}>CURRENT SALE</div><h2>Current basket</h2><small>{terminal.location.name}</small></div><div className={styles.basketHeadingActions}><span className={styles.itemCount}>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span><button className={styles.clearBasketButton} disabled={!cart.length || busy || saleRetryPending} onClick={() => void clearBasket()}>Clear basket</button></div></div>
          {cart.length ? (
            <div className={styles.basketLines}>
              {cart.map((line) => (
                <div className={styles.basketLine} key={line.variantId}>
                  <div className={styles.basketLineMain}><div className={styles.basketItemIcon}>{line.productName.slice(0, 1).toUpperCase()}</div><div className={styles.basketItemCopy}><strong>{line.productName}</strong><span>{line.variantName} · {line.sku}</span><small>{formatMoney(line.sellingPrice)} / {line.baseUnit}</small><small className={styles.basketLineTotal}>Line total · {formatMoney(line.sellingPrice * line.quantity)}</small><small className={stockBalances[line.variantId]?.negativeAvailable ? 'stock-warning-text' : 'basket-stock'}>{stockBalances[line.variantId] ? <>{stockBalances[line.variantId].negativeAvailable ? '⚠ Negative stock: ' : 'Available: '}{stockBalances[line.variantId].quantityBaseUnits} {line.baseUnit}s</> : 'Checking store stock…'}</small></div><button className={styles.removeButton} disabled={removingVariantId === line.variantId || saleRetryPending} aria-label={`Remove ${line.productName}`} onClick={() => void removeLine(line.variantId)}>{removingVariantId === line.variantId ? '…' : '×'}</button></div>
                  <div className={styles.quantityControl}><button aria-label="Decrease quantity" disabled={line.quantity <= 1 || saleRetryPending} onClick={() => setQuantity(line.variantId, String(line.quantity - 1))}>−</button><input aria-label={`Quantity for ${line.productName}`} inputMode="numeric" value={line.quantity} disabled={saleRetryPending} onChange={(event) => setQuantity(line.variantId, event.target.value)} /><button aria-label="Increase quantity" disabled={saleRetryPending} onClick={() => setQuantity(line.variantId, String(line.quantity + 1))}>+</button></div>
                  <label className={styles.discountInput}>Line discount (%)<input type="number" min="0" max="100" step="0.01" value={lineDiscounts[line.variantId] || ''} disabled={saleRetryPending || Number(billDiscount || 0) > 0} onChange={(event) => setLineDiscounts((current) => ({ ...current, [line.variantId]: event.target.value }))} /></label>
                </div>
              ))}
            </div>
          ) : <div className={styles.basketEmpty}><div className={styles.basketEmptyIcon}>▤</div><strong>Your basket is empty</strong><span>Scan an item or choose a product to get started.</span></div>}
          <div className={styles.basketFooter}>
            <div className={styles.saleTotals}><div><span>Subtotal</span><strong>{formatMoney(saleTotals.gross)}</strong></div><div><span>Discount</span><strong>−{formatMoney(saleTotals.discount)}</strong></div><div className="sale-net"><span>Total due</span><strong>{formatMoney(saleTotals.net)}</strong></div></div>
            <label className={styles.discountInputBillDiscountInput}>Bill discount (%)<input type="number" min="0" max="100" step="0.01" value={billDiscount} disabled={saleRetryPending || cart.length === 0 || Object.values(lineDiscounts).some((value) => Number(value) > 0)} onChange={(event) => setBillDiscount(event.target.value)} /><small>Your discount limit: {discountLimit.toFixed(2)}%</small></label>
            <button className={styles.checkoutButton} disabled={busy || cart.length === 0 || (!saleRetryPending && saleTotals.percent > discountLimit + 0.000001)} onClick={() => setCheckoutOpen(true)}><span>{saleRetryPending ? 'Retry same sale safely' : 'Complete sale'}</span><span>F12 →</span></button>
            <div className={styles.keyboardCues}><span><kbd>F2</kbd> Search</span><span><kbd>F4</kbd> Clear</span><span><kbd>F12</kbd> Checkout</span><span><kbd>Esc</kbd> Close</span></div>
            {saleTotals.percent > discountLimit + 0.000001 && <p className={styles.discountWarning}>Discount exceeds your assigned limit.</p>}
            <p>Prices, discounts, payment, and stock are verified by the server before invoice finalization.</p>
          </div>
          {offlineDrawerOpen && <div className={styles.offlineDrawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOfflineDrawerOpen(false); }}><section className="offline-queue offline-drawer" role="dialog" aria-modal="true" aria-label="Offline sale queue">
            <div className={styles.offlineDrawerTitle}><div><div className={styles.eyebrow}>LOCAL SYNC QUEUE</div><h2>Offline sales</h2></div><button className={styles.smallActionButton} onClick={() => setOfflineDrawerOpen(false)}>Close</button></div>
            {offlineSales.length === 0 && <p className={styles.offlineEmptyNote}>No sales are waiting to sync.</p>}
            <div className={styles.offlineQueueHeading}><div><strong>{offlineSales.length} pending sale{offlineSales.length === 1 ? '' : 's'}</strong><small>Saved on this device; not finalized yet.</small></div><button className={styles.smallActionButton} disabled={!isOnline || syncingSales} onClick={() => void syncOfflineSales()}>{syncingSales ? 'Syncing…' : 'Sync now'}</button></div>
            {offlineSales.map((sale) => {
              const quote = offlineQuotes[sale.idempotencyKey];
              const totalMatch = sale.error?.match(/Current server total is ([0-9]+\.[0-9]{2})/);
              return <div className={styles.offlineSaleRow} key={sale.idempotencyKey}>
                <strong>{new Date(sale.createdAt).toLocaleString()} · {sale.status === 'needs_review' ? 'Needs review' : 'Waiting to sync'}</strong>
                {sale.error && <p>{sale.error}</p>}
                {sale.status === 'needs_review' && <>
                  <div className={styles.offlineQuoteActions}><button className={styles.smallActionButton} disabled={!isOnline || syncingSales} onClick={() => void quoteOfflineSale(sale)}>Quote with discounts</button><button className="small-action-button secondary" disabled={!isOnline || syncingSales} onClick={() => void quoteOfflineSale(sale, true)}>Remove discounts and quote</button></div>
                  {quote && <div className={styles.offlineReconcileForm}>
                    <p>Current server total: <strong>{formatMoney(quote.netTotal)}</strong>. Reconcile any amount difference with the customer before confirming.</p>
                    {JSON.parse(sale.body).paymentMethod === 'CASH' ? <label>Cash received<input type="number" min={quote.netTotal} step="0.01" value={offlineCashTendered[sale.idempotencyKey] || totalMatch?.[1] || ''} onChange={(event) => setOfflineCashTendered((current) => ({ ...current, [sale.idempotencyKey]: event.target.value }))} /></label> : <label>Updated transaction reference (optional)<input type="text" maxLength={120} value={offlineReference[sale.idempotencyKey] || ''} onChange={(event) => setOfflineReference((current) => ({ ...current, [sale.idempotencyKey]: event.target.value }))} /></label>}
                    <label className={styles.offlineConfirm}><input type="checkbox" checked={offlinePaymentConfirmed[sale.idempotencyKey] || false} onChange={(event) => setOfflinePaymentConfirmed((current) => ({ ...current, [sale.idempotencyKey]: event.target.checked }))} /> I reconciled the actual payment with this total.</label>
                    <button className={styles.smallActionButton} disabled={!isOnline || syncingSales || !offlinePaymentConfirmed[sale.idempotencyKey]} onClick={() => void confirmOfflineSale(sale)}>Confirm and sync</button>
                  </div>}
                </>}
              </div>;
            })}
          </section></div>}
          {(salesPermissions.canCancelSales || salesPermissions.canProcessReturns) && <section className={styles.saleControls}>
            <div className={styles.eyebrow}>SALE CONTROLS</div><h3>Returns & cancellations</h3>
            <p>Enter the original invoice number. Returns have no time limit. Refunds are recorded manually; this app does not send money.</p>
            <div className={styles.invoiceSearch}><input aria-label="Invoice number" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Invoice number" disabled={saleControlRetryPending} /><button className={styles.smallActionButton} disabled={controlBusy || saleControlRetryPending || !invoiceSearch.trim()} onClick={() => void loadSaleControl()}>{controlBusy ? 'Loading…' : 'Find'}</button></div>
            {controlError && <div className={styles.alertError}>{controlError}</div>}
            {controlNotice && <div className={styles.alertSuccess}>{controlNotice}</div>}
            {saleControl && <div className={styles.invoiceControlCard}>
              <div className={styles.invoiceControlHeading}><strong>{saleControl.invoiceNumber}</strong><span>{saleControl.status} · {saleControl.location.name}</span></div>
              {saleControl.cancellationReason && <p className={styles.fieldHint}>Cancelled {saleControl.cancelledAt ? `on ${new Date(saleControl.cancelledAt).toLocaleString()}` : ''}: {saleControl.cancellationReason}</p>}
              <div className={styles.invoiceControlTotals}><span>Total {formatMoney(saleControl.netTotal)}</span><span>Paid by {saleControl.payment?.method || 'unknown'}</span></div>
              {saleControl.returns.map((saleReturn) => <div className={styles.priorReturn} key={saleReturn.returnNumber}>{saleReturn.returnNumber} · {saleReturn.refund ? `Manual refund ${formatMoney(saleReturn.refund.amount)} (${saleReturn.refund.method})` : 'No money refunded'}</div>)}
              {saleControl.status === 'FINALIZED' && <>
                <label className={styles.controlField}>Reason<textarea value={controlReason} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setControlReason(event.target.value)} placeholder="Required: record why this action is being taken" /></label>
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <label className={styles.offlineConfirm}><input type="checkbox" checked={confirmedGoodsReturned} disabled={saleControlRetryPending} onChange={(event) => setConfirmedGoodsReturned(event.target.checked)} /> I confirm all goods are physically back at this store.</label>}
                <label className={styles.controlField}>Manual refund method<select value={refundMethod} disabled={saleControlRetryPending} onChange={(event) => setRefundMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE' | 'OTHER')}><option value="CASH">Cash</option><option value="CARD">Card (manual)</option><option value="ONLINE">Online (manual)</option><option value="OTHER">Other</option></select></label>
                <label className={styles.controlField}>Refund reference (optional)<input value={refundReference} disabled={saleControlRetryPending} maxLength={120} onChange={(event) => setRefundReference(event.target.value)} placeholder="No card numbers" /></label>
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <button className={styles.dangerActionButton} disabled={controlBusy} onClick={() => void cancelSale(saleControl)}>{saleControlRetryPending ? 'Retry same cancellation' : `Cancel sale · refund ${formatMoney(saleControl.netTotal)}`}</button>}
                {saleControl.permissions.canProcessReturns && <div className={styles.returnLinesForm}><strong>Return inspected items</strong>{saleControl.lines.map((line) => {
                  const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
                  const selection = returnLines[line.id] || { quantity: '', disposition: 'QUARANTINED' as const, inspectionNotes: '' };
                  if (remaining < 1) return null;
                  return <div className={styles.returnLineEntry} key={line.id}>
                    <span>{line.variant.product.name} · {line.variant.name}<small>{remaining} {line.variant.product.baseUnit} remaining · {line.variant.sku}</small></span>
                    <input aria-label={`Return quantity for ${line.variant.name}`} type="number" min="0" max={remaining} value={selection.quantity} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, quantity: event.target.value } }))} />
                    <select aria-label={`Disposition for ${line.variant.name}`} value={selection.disposition} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, disposition: event.target.value as 'RESTOCKED' | 'QUARANTINED' } }))}><option value="QUARANTINED">Quarantine</option><option value="RESTOCKED">Inspected and restock</option></select>
                    <input aria-label={`Inspection notes for ${line.variant.name}`} value={selection.inspectionNotes} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, inspectionNotes: event.target.value } }))} placeholder="Inspection notes (required)" />
                  </div>;
                })}<button className={styles.smallActionButton} disabled={controlBusy} onClick={() => void processSaleReturn(saleControl)}>{saleControlRetryPending ? 'Retry same return' : 'Record return'}</button></div>}
              </>}
            </div>}
          </section>}
        </aside>
      </div>
      {checkoutOpen && <div className={styles.checkoutModalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCheckoutOpen(false); }}>
        <section className={styles.checkoutModal} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <header><div><div className={styles.eyebrow}>{demoCatalogActive ? 'DEMO · NO SALE WILL BE RECORDED' : 'PAYMENT'}</div><h2 id="checkout-title">Complete sale</h2><p>{demoCatalogActive ? 'Switch to the live catalogue to process a real customer sale.' : 'Review tender and confirm the amount received.'}</p></div><button className="modal-close" disabled={busy} onClick={() => setCheckoutOpen(false)} aria-label="Close checkout">×</button></header>
          <div className={styles.checkoutDue}><span>Amount due</span><strong>{formatMoney(saleTotals.net)}</strong></div>
          <label className={styles.paymentSelect}>Payment method<select value={paymentMethod} disabled={saleRetryPending} onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE')}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="ONLINE">Online</option></select></label>
          {paymentMethod === 'CASH' ? <><label className={styles.paymentSelect}>Cash received<input autoFocus type="number" min={saleTotals.net} step="0.01" value={cashTendered} disabled={saleRetryPending} onChange={(event) => setCashTendered(event.target.value)} placeholder={saleTotals.net.toFixed(2)} /></label><div className="cash-chips" aria-label="Quick cash amounts"><button onClick={() => setCashTendered(saleTotals.net.toFixed(2))}>Exact</button>{[100, 200, 500, 2000].map((amount) => <button key={amount} onClick={() => setCashTendered(String(amount))}>₹{amount}</button>)}</div><div className="checkout-change"><span>Change due</span><strong>{formatMoney(Math.max(0, Number(cashTendered || 0) - saleTotals.net))}</strong></div></> : <label className={styles.paymentSelect}>Transaction reference (optional)<input type="text" maxLength={120} value={transactionReference} disabled={saleRetryPending} onChange={(event) => setTransactionReference(event.target.value)} placeholder="Do not enter card numbers" /></label>}
          {demoCatalogActive && <div className={styles.demoCheckoutNote}>Sample items and stock are for display only. Checkout is disabled in demo mode.</div>}
          {error && <div className={styles.alertError}>{error}</div>}
          <button className={styles.checkoutButton} disabled={demoCatalogActive || busy || cart.length === 0 || (!saleRetryPending && saleTotals.percent > discountLimit + 0.000001)} onClick={() => void checkout()}><span>{demoCatalogActive ? 'Demo only · checkout disabled' : busy ? 'Completing…' : saleRetryPending ? 'Retry same sale safely' : 'Confirm payment'}</span><span>→</span></button>
        </section>
      </div>}
      {lastReceipt && <div className={styles.receiptOverlay} role="dialog" aria-modal="true" aria-label="Sale receipt"><section className="receipt-card"><div className={styles.eyebrow}>{terminal?.location.name}</div><h2>{lastReceipt.invoiceNumber}</h2><p>{new Date(lastReceipt.createdAt).toLocaleString()}</p>{lastReceipt.lines.map((line, index) => <div className="receipt-line" key={`${line.variant.sku}-${index}`}><span>{line.variant.product.name} · {line.variant.name}<small>{line.quantityBaseUnits} {line.variant.product.baseUnit} × {formatMoney(line.unitPriceAtSale)} · {line.variant.sku}</small></span><strong>{formatMoney(line.lineTotal)}</strong></div>)}<div className="receipt-line"><span>Subtotal</span><strong>{formatMoney(lastReceipt.grossTotal)}</strong></div><div className="receipt-line"><span>Discount</span><strong>−{formatMoney(lastReceipt.discountTotal)}</strong></div><div className="receipt-line receipt-total"><span>Total paid · {lastReceipt.payment?.method}</span><strong>{formatMoney(lastReceipt.netTotal)}</strong></div>{lastReceipt.payment?.cashTenderedAmount && <div className="receipt-line"><span>Cash tendered</span><strong>{formatMoney(lastReceipt.payment.cashTenderedAmount)}</strong></div>}{lastReceipt.payment?.changeGivenAmount && Number(lastReceipt.payment.changeGivenAmount) > 0 && <div className="receipt-line"><span>Change</span><strong>{formatMoney(lastReceipt.payment.changeGivenAmount)}</strong></div>}<div className="receipt-actions"><button className={styles.checkoutButton} onClick={() => window.print()}>Print receipt</button><button className="text-button" onClick={() => setLastReceipt(null)}>Close</button></div></section></div>}
      <footer className={styles.terminalFooter}><span>Terminal bound to <strong>{terminal.location.name}</strong></span><span>Stock refreshes every 15 seconds while this terminal is open</span></footer>
    </main>
  );
}
