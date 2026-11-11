'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const requestSequence = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingSaleRef = useRef<{ key: string; body: string } | null>(null);
  const syncingSalesRef = useRef(false);
  const pendingControlRef = useRef<{ key: string; method: string; url: string; body: string } | null>(null);

  const activeVariants = useMemo(
    () => results.flatMap((product) => product.variants.filter((variant) => variant.isActive).map((variant) => ({ product, variant }))),
    [results],
  );

  const stockVariantIds = useMemo(() => [...new Set([
    ...results.flatMap((product) => product.variants.map((variant) => variant.id)),
    ...cart.map((line) => line.variantId),
  ])].sort(), [cart, results]);

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
    if (!cleaned) {
      setResults([]);
      return;
    }
    const sequence = ++requestSequence.current;
    let products: Product[];
    try {
      const response = await fetch(`${API_BASE}/products?isActive=true&search=${encodeURIComponent(cleaned)}`, {
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
      if (!products.length) throw new Error('No cached product matches this search. Reconnect to refresh the catalogue.');
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
    if (exactBarcode && products.length === 0) setNotice('No matching barcode or product found.');
  }, [terminal, token]);

  useEffect(() => {
    if (!token || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchProducts(query, token).catch((caught: Error) => setError(caught.message));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, searchProducts, token]);

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
    setResults([]);
    setError('');
    setNotice(`${product.name} · ${variant.name} added`);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

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

  async function checkout() {
    if (!token || !cart.length || busy) return;
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
  }

  if (!terminal) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="brand-mark">P</div>
          <div className="eyebrow">PREMIUM RETAIL</div>
          <h1>Store terminal</h1>
          <p className="muted">Sign in with your cashier account to open its assigned store.</p>
          <form className="login-form" onSubmit={login}>
            <label htmlFor="email">Email</label>
            <input id="email" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Password</label>
            <input id="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Open cashier terminal'} <span>→</span></button>
          </form>
          <div className="secure-note"><span className="status-dot" /> Store access is checked by the server</div>
          <a className="admin-entry-link operations-entry" href="/dashboard">Open client demo dashboard</a>
          <a className="admin-entry-link" href="/admin/discount-limits">Admin: manage discount limits</a>
          <a className="admin-entry-link secondary-admin-link" href="/admin/sales-permissions">Admin: manage cancellation and return permissions</a>
          <a className="admin-entry-link secondary-admin-link" href="/sales-controls">Assigned users: process cancellations and returns</a>
          <a className="admin-entry-link operations-entry" href="/operations">Operations test bench: Phases 1–6 API workflows</a>
        </div>
      </main>
    );
  }

  return (
    <main className="pos-shell">
      <header className="topbar">
        <div className="topbar-brand"><div className="brand-mark small">P</div><div><strong>Premium Retail</strong><span>POINT OF SALE</span></div></div>
        <div className="store-pill"><span className="status-dot" /><div><small>ACTIVE STORE</small><strong>{terminal.location.name}</strong></div></div>
        <div className={`network-status ${isOnline ? 'online' : 'offline'}`}><span className="status-dot" />{isOnline ? 'Online' : 'Offline'}</div>
        <button className="text-button" disabled={saleRetryPending || saleControlRetryPending} onClick={logout}>Sign out</button>
      </header>

      <div className="pos-content">
        <section className="catalog-panel">
          <div className="page-heading"><div><div className="eyebrow">SALES FLOOR</div><h1>Build a basket</h1><p>Scan a barcode or search by product, SKU, or variant.</p></div><div className="open-badge"><span className="status-dot" /> Terminal ready</div></div>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              ref={searchRef}
              aria-label="Scan barcode or search products"
              autoFocus
              placeholder="Scan barcode or search products…"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setNotice(''); setError(''); }}
              onKeyDown={handleSearchKeyDown}
            />
            <kbd>ENTER</kbd>
          </div>

          {error && <div className="alert error inline-alert">{error}</div>}
          {notice && !error && <div className="notice-line">{notice}</div>}
          {saleRetryPending && <div className="alert stock-error">The checkout response was interrupted. Retry the same sale to safely confirm its result; keep this terminal open.</div>}
          {stockError && <div className="alert stock-error">Stock refresh failed: {stockError}</div>}

          <div className="results-heading"><span>{query ? 'MATCHING PRODUCTS' : 'QUICK GUIDE'}</span>{query && <span>{activeVariants.length} variant{activeVariants.length === 1 ? '' : 's'}</span>}</div>
          {query ? (
            results.length ? (
              <div className="product-results">
                {results.map((product) => (
                  <article className="product-card" key={product.id}>
                    <div className="product-card-top"><div className="product-avatar">{product.name.slice(0, 1).toUpperCase()}</div><div className="product-title"><strong>{product.name}</strong><span>{product.hasVariants ? 'Variant product' : `Sold by ${product.baseUnit}`}</span></div><span className="variant-count">{product.variants.length} SKU{product.variants.length === 1 ? '' : 's'}</span></div>
                    <div className="variant-list">
                      {product.variants.map((variant) => (
                        <button className="variant-option" key={variant.id} disabled={saleRetryPending} onClick={() => addToCart(product, variant)}>
                          <span className="variant-copy"><strong>{variant.name}</strong><small>{variant.sku}{variant.barcode ? ` · ${variant.barcode}` : ''}</small><span className={`stock-chip ${stockBalances[variant.id]?.negativeAvailable ? 'negative' : ''}`}>{stockBalances[variant.id] ? <>{stockBalances[variant.id].negativeAvailable && <b aria-label="Negative stock warning">!</b>} {stockBalances[variant.id].quantityBaseUnits} {product.baseUnit}{stockBalances[variant.id].quantityBaseUnits === 1 ? '' : 's'} available</> : isOnline ? 'Loading store stock…' : 'Stock unavailable offline; verify physically'}</span></span><span className="add-symbol">+</span>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="empty-state"><div className="empty-icon">⌕</div><strong>No matching products</strong><span>Try another product name, SKU, or barcode.</span></div>
          ) : (
            <div className="guide-grid">
              <div className="guide-card"><span className="guide-number">01</span><div><strong>Scan to add</strong><p>Use a barcode scanner or type the barcode and press Enter.</p></div></div>
              <div className="guide-card"><span className="guide-number">02</span><div><strong>Find a variant</strong><p>Search by product name, SKU, size, colour, or style.</p></div></div>
              <div className="guide-card"><span className="guide-number">03</span><div><strong>Review the basket</strong><p>Confirm quantities, authorized discount, and payment before completing checkout.</p></div></div>
            </div>
          )}
        </section>

        <aside className="basket-panel">
          <div className="basket-heading"><div><div className="eyebrow">CURRENT SALE</div><h2>Basket</h2></div><span className="item-count">{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
          {cart.length ? (
            <div className="basket-lines">
              {cart.map((line) => (
                <div className="basket-line" key={line.variantId}>
                  <div className="basket-line-main"><div className="basket-item-icon">{line.productName.slice(0, 1).toUpperCase()}</div><div className="basket-item-copy"><strong>{line.productName}</strong><span>{line.variantName} · {line.sku}</span><small>{formatMoney(line.sellingPrice)} / {line.baseUnit}</small><small className={stockBalances[line.variantId]?.negativeAvailable ? 'stock-warning-text' : 'basket-stock'}>{stockBalances[line.variantId] ? <>{stockBalances[line.variantId].negativeAvailable ? '⚠ Negative stock: ' : 'Available: '}{stockBalances[line.variantId].quantityBaseUnits} {line.baseUnit}s</> : 'Checking store stock…'}</small></div><button className="remove-button" disabled={removingVariantId === line.variantId || saleRetryPending} aria-label={`Remove ${line.productName}`} onClick={() => void removeLine(line.variantId)}>{removingVariantId === line.variantId ? '…' : '×'}</button></div>
                  <div className="quantity-control"><button aria-label="Decrease quantity" disabled={line.quantity <= 1 || saleRetryPending} onClick={() => setQuantity(line.variantId, String(line.quantity - 1))}>−</button><input aria-label={`Quantity for ${line.productName}`} inputMode="numeric" value={line.quantity} disabled={saleRetryPending} onChange={(event) => setQuantity(line.variantId, event.target.value)} /><button aria-label="Increase quantity" disabled={saleRetryPending} onClick={() => setQuantity(line.variantId, String(line.quantity + 1))}>+</button></div>
                  <label className="discount-input">Line discount (%)<input type="number" min="0" max="100" step="0.01" value={lineDiscounts[line.variantId] || ''} disabled={saleRetryPending || Number(billDiscount || 0) > 0} onChange={(event) => setLineDiscounts((current) => ({ ...current, [line.variantId]: event.target.value }))} /></label>
                </div>
              ))}
            </div>
          ) : <div className="basket-empty"><div className="basket-empty-icon">▤</div><strong>Your basket is empty</strong><span>Scan an item or choose a product to get started.</span></div>}
          <div className="basket-footer">
            <div className="sale-totals"><div><span>Subtotal</span><strong>{formatMoney(saleTotals.gross)}</strong></div><div><span>Discount</span><strong>−{formatMoney(saleTotals.discount)}</strong></div><div className="sale-net"><span>Total due</span><strong>{formatMoney(saleTotals.net)}</strong></div></div>
            <label className="discount-input bill-discount-input">Bill discount (%)<input type="number" min="0" max="100" step="0.01" value={billDiscount} disabled={saleRetryPending || cart.length === 0 || Object.values(lineDiscounts).some((value) => Number(value) > 0)} onChange={(event) => setBillDiscount(event.target.value)} /><small>Your discount limit: {discountLimit.toFixed(2)}%</small></label>
            <label className="payment-select">Payment method<select value={paymentMethod} disabled={saleRetryPending} onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE')}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="ONLINE">Online</option></select></label>
            {paymentMethod === 'CASH' ? <label className="payment-select">Cash tendered<input type="number" min={saleTotals.net} step="0.01" value={cashTendered} disabled={saleRetryPending} onChange={(event) => setCashTendered(event.target.value)} placeholder={saleTotals.net.toFixed(2)} /><small>Change: {formatMoney(Math.max(0, Number(cashTendered || 0) - saleTotals.net))}</small></label> : <label className="payment-select">Transaction reference (optional)<input type="text" maxLength={120} value={transactionReference} disabled={saleRetryPending} onChange={(event) => setTransactionReference(event.target.value)} placeholder="Do not enter card numbers" /></label>}
            <button className="checkout-button" disabled={busy || cart.length === 0 || (!saleRetryPending && saleTotals.percent > discountLimit + 0.000001)} onClick={() => void checkout()}><span>{busy ? 'Completing…' : saleRetryPending ? 'Retry same sale safely' : 'Complete sale'}</span><span>→</span></button>
            {saleTotals.percent > discountLimit + 0.000001 && <p className="discount-warning">Discount exceeds your assigned limit.</p>}
            <p>Prices, discounts, payment, and stock are verified by the server before invoice finalization.</p>
          </div>
          {offlineSales.length > 0 && <section className="offline-queue">
            <div className="offline-queue-heading"><div><strong>{offlineSales.length} pending sale{offlineSales.length === 1 ? '' : 's'}</strong><small>Saved on this device; not finalized yet.</small></div><button className="small-action-button" disabled={!isOnline || syncingSales} onClick={() => void syncOfflineSales()}>{syncingSales ? 'Syncing…' : 'Sync now'}</button></div>
            {offlineSales.map((sale) => {
              const quote = offlineQuotes[sale.idempotencyKey];
              const totalMatch = sale.error?.match(/Current server total is ([0-9]+\.[0-9]{2})/);
              return <div className="offline-sale-row" key={sale.idempotencyKey}>
                <strong>{new Date(sale.createdAt).toLocaleString()} · {sale.status === 'needs_review' ? 'Needs review' : 'Waiting to sync'}</strong>
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
          </section>}
          {(salesPermissions.canCancelSales || salesPermissions.canProcessReturns) && <section className="sale-controls">
            <div className="eyebrow">SALE CONTROLS</div><h3>Returns & cancellations</h3>
            <p>Enter the original invoice number. Returns have no time limit. Refunds are recorded manually; this app does not send money.</p>
            <div className="invoice-search"><input aria-label="Invoice number" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Invoice number" disabled={saleControlRetryPending} /><button className="small-action-button" disabled={controlBusy || saleControlRetryPending || !invoiceSearch.trim()} onClick={() => void loadSaleControl()}>{controlBusy ? 'Loading…' : 'Find'}</button></div>
            {controlError && <div className="alert error">{controlError}</div>}
            {controlNotice && <div className="alert success">{controlNotice}</div>}
            {saleControl && <div className="invoice-control-card">
              <div className="invoice-control-heading"><strong>{saleControl.invoiceNumber}</strong><span>{saleControl.status} · {saleControl.location.name}</span></div>
              {saleControl.cancellationReason && <p className="field-hint">Cancelled {saleControl.cancelledAt ? `on ${new Date(saleControl.cancelledAt).toLocaleString()}` : ''}: {saleControl.cancellationReason}</p>}
              <div className="invoice-control-totals"><span>Total {formatMoney(saleControl.netTotal)}</span><span>Paid by {saleControl.payment?.method || 'unknown'}</span></div>
              {saleControl.returns.map((saleReturn) => <div className="prior-return" key={saleReturn.returnNumber}>{saleReturn.returnNumber} · {saleReturn.refund ? `Manual refund ${formatMoney(saleReturn.refund.amount)} (${saleReturn.refund.method})` : 'No money refunded'}</div>)}
              {saleControl.status === 'FINALIZED' && <>
                <label className="control-field">Reason<textarea value={controlReason} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setControlReason(event.target.value)} placeholder="Required: record why this action is being taken" /></label>
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <label className="offline-confirm"><input type="checkbox" checked={confirmedGoodsReturned} disabled={saleControlRetryPending} onChange={(event) => setConfirmedGoodsReturned(event.target.checked)} /> I confirm all goods are physically back at this store.</label>}
                <label className="control-field">Manual refund method<select value={refundMethod} disabled={saleControlRetryPending} onChange={(event) => setRefundMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE' | 'OTHER')}><option value="CASH">Cash</option><option value="CARD">Card (manual)</option><option value="ONLINE">Online (manual)</option><option value="OTHER">Other</option></select></label>
                <label className="control-field">Refund reference (optional)<input value={refundReference} disabled={saleControlRetryPending} maxLength={120} onChange={(event) => setRefundReference(event.target.value)} placeholder="No card numbers" /></label>
                {saleControl.permissions.canCancelSales && saleControl.returns.length === 0 && <button className="danger-action-button" disabled={controlBusy} onClick={() => void cancelSale(saleControl)}>{saleControlRetryPending ? 'Retry same cancellation' : `Cancel sale · refund ${formatMoney(saleControl.netTotal)}`}</button>}
                {saleControl.permissions.canProcessReturns && <div className="return-lines-form"><strong>Return inspected items</strong>{saleControl.lines.map((line) => {
                  const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits;
                  const selection = returnLines[line.id] || { quantity: '', disposition: 'QUARANTINED' as const, inspectionNotes: '' };
                  if (remaining < 1) return null;
                  return <div className="return-line-entry" key={line.id}>
                    <span>{line.variant.product.name} · {line.variant.name}<small>{remaining} {line.variant.product.baseUnit} remaining · {line.variant.sku}</small></span>
                    <input aria-label={`Return quantity for ${line.variant.name}`} type="number" min="0" max={remaining} value={selection.quantity} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, quantity: event.target.value } }))} />
                    <select aria-label={`Disposition for ${line.variant.name}`} value={selection.disposition} disabled={saleControlRetryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, disposition: event.target.value as 'RESTOCKED' | 'QUARANTINED' } }))}><option value="QUARANTINED">Quarantine</option><option value="RESTOCKED">Inspected and restock</option></select>
                    <input aria-label={`Inspection notes for ${line.variant.name}`} value={selection.inspectionNotes} disabled={saleControlRetryPending} maxLength={500} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, inspectionNotes: event.target.value } }))} placeholder="Inspection notes (required)" />
                  </div>;
                })}<button className="small-action-button" disabled={controlBusy} onClick={() => void processSaleReturn(saleControl)}>{saleControlRetryPending ? 'Retry same return' : 'Record return'}</button></div>}
              </>}
            </div>}
          </section>}
        </aside>
      </div>
      {lastReceipt && <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Sale receipt"><section className="receipt-card"><div className="eyebrow">{terminal?.location.name}</div><h2>{lastReceipt.invoiceNumber}</h2><p>{new Date(lastReceipt.createdAt).toLocaleString()}</p>{lastReceipt.lines.map((line, index) => <div className="receipt-line" key={`${line.variant.sku}-${index}`}><span>{line.variant.product.name} · {line.variant.name}<small>{line.quantityBaseUnits} {line.variant.product.baseUnit} × {formatMoney(line.unitPriceAtSale)} · {line.variant.sku}</small></span><strong>{formatMoney(line.lineTotal)}</strong></div>)}<div className="receipt-line"><span>Subtotal</span><strong>{formatMoney(lastReceipt.grossTotal)}</strong></div><div className="receipt-line"><span>Discount</span><strong>−{formatMoney(lastReceipt.discountTotal)}</strong></div><div className="receipt-line receipt-total"><span>Total paid · {lastReceipt.payment?.method}</span><strong>{formatMoney(lastReceipt.netTotal)}</strong></div>{lastReceipt.payment?.cashTenderedAmount && <div className="receipt-line"><span>Cash tendered</span><strong>{formatMoney(lastReceipt.payment.cashTenderedAmount)}</strong></div>}{lastReceipt.payment?.changeGivenAmount && Number(lastReceipt.payment.changeGivenAmount) > 0 && <div className="receipt-line"><span>Change</span><strong>{formatMoney(lastReceipt.payment.changeGivenAmount)}</strong></div>}<div className="receipt-actions"><button className="checkout-button" onClick={() => window.print()}>Print receipt</button><button className="text-button" onClick={() => setLastReceipt(null)}>Close</button></div></section></div>}
      <footer className="terminal-footer"><span>Terminal bound to <strong>{terminal.location.name}</strong></span><span>Stock refreshes every 15 seconds while this terminal is open</span></footer>
    </main>
  );
}
