'use client';

import { CameraScanner } from '@/components/ui/camera-scanner';
import { Feedback } from '@/components/ui/feedback';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  FileText,
  IndianRupee,
  LayoutGrid,
  List,
  ListFilter,
  MapPin,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Tag,
  TrendingUp,
  TriangleAlert,
  Truck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import { getStoredSession } from '@/lib/auth';
import styles from './products.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

interface ProductItem {
  id: number;
  name: string;
  imageUrl?: string | null;
  variant: string;
  sku: string;
  barcode: string;
  category: string;
  location: string;
  price: number;
  availableStock: { cartons: number; loose: number };
  totalUnits: number;
  unitsPerCarton: number;
  inTransit: number;
  reserved: number;
  quarantined?: number;
  packaging: string;
  status: 'Healthy' | 'Low Stock' | 'Negative';
}

type SortKey = 'name' | 'sku' | 'price' | 'stock' | 'category' | 'status';

/** Sort order for stock health: problems first when ascending. */
const STATUS_RANK: Record<ProductItem['status'], number> = { Negative: 0, 'Low Stock': 1, Healthy: 2 };

/** Tile colours per category (product thumbnail placeholder). */
const CATEGORY_TONE: Record<string, string> = {
  Beverages: 'toneTeal',
  'Personal care': 'toneViolet',
  'Home & living': 'toneBlue',
  Snacks: 'toneAmber',
  Pantry: 'toneRose',
};

const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  box: Package,
  list: List,
  grid: LayoutGrid,
  search: Search,
  mapPin: MapPin,
  tag: Tag,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  filter: ListFilter,
  copy: Copy,
  more: Ellipsis,
  upload: Upload,
  plus: Plus,
  shoppingCart: ShoppingCart,
  moreVertical: EllipsisVertical,
  check: Check,
  trending: TrendingUp,
  alert: TriangleAlert,
  package: Package,
  dollarSign: IndianRupee,
  truck: Truck,
  x: X,
  fileText: FileText,
  download: Download,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState('All retail locations');
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const [selectedHealth, setSelectedHealth] = useState('All items');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdVariant, setNewProdVariant] = useState('');
  const [newProdBaseUnit, setNewProdBaseUnit] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [barcodeCameraOpen, setBarcodeCameraOpen] = useState(false);
  const [newProdCartonRatio, setNewProdCartonRatio] = useState('');

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Sync location scope with app frame and local storage
  useEffect(() => {
    const stored = window.localStorage.getItem('premium-retail-location-scope');
    if (stored) setSelectedLocation(stored);

    const syncLocation = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      setSelectedLocation(target);
    };

    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, []);

  useEffect(() => {
    const token = getStoredSession()?.accessToken;
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };
    const currencyController = new AbortController();
    setCurrency(null);
    Promise.all([
      fetch(`${API_BASE}/products?isActive=true`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
    ]).then(async ([productResponse, locationResponse]) => {
      if (!productResponse.ok || !locationResponse.ok) throw new Error('Product catalogue could not be loaded from the API.');
      const [productPayload, locationPayload] = await Promise.all([productResponse.json(), locationResponse.json()]);
      const availableLocations = locationPayload.data || [];
      const names = availableLocations.map((location: { name: string }) => location.name);
      setLocations(names);
      const catalogue: any[] = productPayload.data || [];
      const variantIds = catalogue.flatMap((product) => product.variants || []).map((variant) => variant.id);
      const selectedLocations = ['All retail locations', 'All locations'].includes(selectedLocation)
        ? availableLocations
        : availableLocations.filter((location: { name: string }) => location.name === selectedLocation);
      const companyIds = [...new Set<string>(selectedLocations.flatMap((location: { companyId?: string }) => location.companyId ? [location.companyId] : []))];
      if (companyIds.length === 1 && !currencyController.signal.aborted) {
        void fetch(`${API_BASE}/companies/${encodeURIComponent(companyIds[0])}`, { headers, cache: 'no-store', signal: currencyController.signal })
          .then(async (response) => response.ok ? response.json() : null)
          .then((payload) => { if (!currencyController.signal.aborted) setCurrency(payload?.data?.currency ?? null); })
          .catch(() => { /* Prices can still display without a currency symbol. */ });
      }
      const totals = new Map<string, { available: number; transit: number; reserved: number; quarantined: number }>();
      for (const location of selectedLocations) {
        for (let index = 0; index < variantIds.length; index += 100) {
          const params = new URLSearchParams({ locationId: location.id, variantIds: variantIds.slice(index, index + 100).join(',') });
          const balanceResponse = await fetch(`${API_BASE}/inventory/balances?${params}`, { headers, cache: 'no-store' });
          if (!balanceResponse.ok) throw new Error('Inventory balances could not be loaded from the API.');
          const balancePayload = await balanceResponse.json();
          for (const balance of balancePayload.data || []) {
            const current = totals.get(balance.variantId) || { available: 0, transit: 0, reserved: 0, quarantined: 0 };
            const qty = Number(balance.quantityBaseUnits || 0);
            if (balance.stockState === 'AVAILABLE') current.available += qty;
            if (balance.stockState === 'IN_TRANSIT') current.transit += qty;
            if (balance.stockState === 'RESERVED') current.reserved += qty;
            if (balance.stockState === 'QUARANTINED') current.quarantined += qty;
            totals.set(balance.variantId, current);
          }
        }
      }
      const rows: ProductItem[] = catalogue.flatMap((product: any, productIndex: number) =>
        (product.variants || []).map((variant: any, variantIndex: number) => ({
          ...(() => {
            const stock = totals.get(variant.id) || { available: 0, transit: 0, reserved: 0, quarantined: 0 };
            const packSize = Number(product.unitsPerCarton || 1);
            const status = stock.available < 0 ? 'Negative' as const : stock.available <= Number(product.reorderLevel || 0) ? 'Low Stock' as const : 'Healthy' as const;
            return { availableStock: { cartons: packSize > 1 ? Math.trunc(stock.available / packSize) : 0, loose: packSize > 1 ? stock.available % packSize : stock.available }, totalUnits: stock.available, inTransit: stock.transit, reserved: stock.reserved, quarantined: stock.quarantined, status };
          })(),
          id: productIndex * 1000 + variantIndex + 1,
          name: product.name,
          imageUrl: product.imageUrl || null,
          variant: variant.name || 'Default',
          sku: variant.sku,
          barcode: variant.barcode || '',
          category: product.category?.name || 'Uncategorised',
          location: selectedLocations.length === 1 ? selectedLocations[0].name : '',
          price: Number(product.sellingPrice || 0),
          unitsPerCarton: Number(product.unitsPerCarton || 1),
          packaging: product.unitsPerCarton ? `Carton (${product.unitsPerCarton})` : 'Base unit',
        })),
      );
      setProducts(rows);
    }).catch((error) => showToast(error instanceof Error ? error.message : 'Could not load product data.', 'info')).finally(() => setLoading(false));
    return () => currencyController.abort();
  }, [reloadKey, selectedLocation]);

  const handleLocationChange = (loc: string) => {
    setSelectedLocation(loc);
    window.localStorage.setItem('premium-retail-location-scope', loc);
    window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: loc }));
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // Location filter
      if (
        selectedLocation !== 'All retail locations' &&
        selectedLocation !== 'All locations' &&
        (prod.location && prod.location !== selectedLocation)
      ) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'All categories' && prod.category !== selectedCategory) {
        return false;
      }

      // Health status filter
      if (selectedHealth === 'Healthy' && prod.status !== 'Healthy') return false;
      if (selectedHealth === 'Low Stock' && prod.status !== 'Low Stock') return false;
      if (selectedHealth === 'Negative' && prod.status !== 'Negative') return false;

      // Full text search
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchName = prod.name.toLowerCase().includes(query);
        const matchVariant = prod.variant.toLowerCase().includes(query);
        const matchSku = prod.sku.toLowerCase().includes(query);
        const matchBarcode = prod.barcode.toLowerCase().includes(query);
        if (!matchName && !matchVariant && !matchSku && !matchBarcode) return false;
      }

      return true;
    });
  }, [products, selectedLocation, selectedCategory, selectedHealth, searchQuery]);

  // Aggregate KPI stats dynamically
  const kpiStats = useMemo(() => {
    const totalCount = filteredProducts.length;
    const totalValuation = filteredProducts.reduce((acc, p) => acc + (p.totalUnits > 0 ? p.totalUnits * p.price : 0), 0);
    const lowStockCount = filteredProducts.filter((p) => p.status === 'Low Stock').length;
    const negativeStockCount = filteredProducts.filter((p) => p.status === 'Negative').length;
    const availableTotal = filteredProducts.reduce((acc, p) => acc + Math.max(0, p.totalUnits), 0);
    const inTransitTotal = filteredProducts.reduce((acc, p) => acc + p.inTransit, 0);
    const reservedTotal = filteredProducts.reduce((acc, p) => acc + p.reserved, 0);
    const quarantinedTotal = filteredProducts.reduce((acc, p) => acc + (p.quarantined || 0), 0);

    return {
      totalCount,
      totalValuation,
      lowStockCount,
      negativeStockCount,
      availableTotal,
      inTransitTotal,
      reservedTotal,
      quarantinedTotal
    };
  }, [filteredProducts]);

  // Sorting (applied after filtering, before pagination)
  const sortedProducts = useMemo(() => {
    const value = (p: ProductItem): string | number => {
      switch (sortKey) {
        case 'sku': return p.sku;
        case 'price': return p.price;
        case 'stock': return p.totalUnits;
        case 'category': return p.category;
        case 'status': return STATUS_RANK[p.status];
        default: return p.name.toLowerCase();
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredProducts].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [filteredProducts, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(start, start + itemsPerPage);
  }, [sortedProducts, currentPage, itemsPerPage]);

  // Keep the current page valid when filters shrink the list
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Close the filter popover and row menus on outside click / Escape
  useEffect(() => {
    if (!filterOpen && menuFor === null) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (filterOpen && !filterRef.current?.contains(target)) setFilterOpen(false);
      if (menuFor !== null && !target.closest('[data-row-menu]')) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setFilterOpen(false); setMenuFor(null); } };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey); };
  }, [filterOpen, menuFor]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const copySku = async (product: ProductItem) => {
    try {
      await navigator.clipboard.writeText(product.sku);
      showToast(`SKU ${product.sku} copied to clipboard.`, 'info');
    } catch {
      showToast(`SKU: ${product.sku}`, 'info');
    }
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Product Name', 'Variant', 'SKU', 'Barcode', 'Category', 'Location', 'Price (INR)', 'Total Units', 'Cartons', 'Loose', 'In-Transit', 'Reserved', 'Status'];
    const rows = filteredProducts.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.variant.replace(/"/g, '""')}"`,
      p.sku,
      p.barcode,
      p.category,
      p.location,
      p.price.toFixed(2),
      p.totalUnits,
      p.availableStock.cartons,
      p.availableStock.loose,
      p.inTransit,
      p.reserved,
      p.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Inventory-Export-${selectedLocation.replace(/\s+/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Inventory catalogue exported for ${filteredProducts.length} items.`, 'success');
  };

  // Replenishment drafts are generated from location-wide reorder thresholds
  // in the Transfers console; this product list does not support line-level requests.
  const openReplenish = () => { window.location.assign('/operations'); };

  // Add New Product Variant
  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim()) {
      showToast('Enter a product name and SKU.', 'error');
      return;
    }

    const token = getStoredSession()?.accessToken;
    if (!token) return showToast('Sign in again before creating products.', 'info');
    try {
      const response = await fetch(`${API_BASE}/products`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProdName.trim(), imageUrl: newProdImageUrl.trim() || undefined, baseUnit: newProdBaseUnit.trim() || 'unit', unitsPerCarton: Number(newProdCartonRatio) > 1 ? Number(newProdCartonRatio) : undefined, hasVariants: true, variants: [{ name: newProdVariant.trim() || 'Default', sku: newProdSku.trim().toUpperCase(), barcode: newProdBarcode.trim() || undefined }], sellingPrice: Number(newProdPrice), purchasePrice: 0, priceChangeReason: 'Initial catalogue setup' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'The server could not create this product.');
      setAddProductModalOpen(false); setReloadKey((value) => value + 1);
      setNewProdName(''); setNewProdImageUrl(''); setNewProdVariant(''); setNewProdBaseUnit(''); setNewProdSku(''); setNewProdBarcode(''); setNewProdPrice(''); setNewProdCartonRatio('');
      showToast('Product saved to the catalogue. Add opening stock separately to set quantities.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Product could not be saved.', 'info'); }
  };

  const categories = ['All categories', ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  // ---------- Derived figures for the statistic strip ----------
  const healthyCount = filteredProducts.filter((p) => p.status === 'Healthy').length;
  const healthPct = filteredProducts.length ? Math.round((healthyCount / filteredProducts.length) * 100) : 0;
  const healthLabel = healthPct >= 75 ? 'Good' : healthPct >= 50 ? 'Fair' : 'Needs attention';
  const topValueProduct = [...filteredProducts].sort((a, b) => Math.max(0, b.totalUnits) * b.price - Math.max(0, a.totalUnits) * a.price)[0];
  const activeFilterCount = [selectedHealth !== 'All items', selectedCategory !== 'All categories', !['All retail locations', 'All locations'].includes(selectedLocation)].filter(Boolean).length;
  const firstRow = sortedProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const lastRow = Math.min(currentPage * itemsPerPage, sortedProducts.length);
  const formatPrice = (n: number) => n.toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
    ...(currency ? { style: 'currency' as const, currency } : {}),
  });
  const statusTone = (s: ProductItem['status']) => (s === 'Healthy' ? styles.pillGood : s === 'Low Stock' ? styles.pillWarn : styles.pillBad);
  const unitWord = (n: number) => (Math.abs(n) === 1 ? 'pack' : 'packs');
  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const list = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    return list.flatMap((n, i) => (i && n - list[i - 1] > 1 ? ['gap' as const, n] : [n]));
  })();
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All categories');
    setSelectedHealth('All items');
    handleLocationChange('All retail locations');
    setCurrentPage(1);
  };

  const SortHead = ({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) => (
    <button type="button" className={`${styles.sortHead} ${sortKey === k ? styles.sortActive : ''} ${className}`} onClick={() => toggleSort(k)} aria-label={`Sort by ${label}`}>
      {label}
      <span className={styles.sortIcon} aria-hidden="true">{sortKey === k ? (sortDir === 'asc' ? <ArrowUp size="1em" className="inline-icon" aria-hidden="true" /> : <ArrowDown size="1em" className="inline-icon" aria-hidden="true" />) : <ArrowDownUp size="1em" className="inline-icon" aria-hidden="true" />}</span>
    </button>
  );

  /** Segmented semicircle: share of units already on the shelf vs. still in transit. */
  const Gauge = ({ product }: { product: ProductItem }) => {
    const onHand = Math.max(0, product.totalUnits);
    const pipeline = onHand + product.inTransit;
    const ratio = pipeline ? onHand / pipeline : 0;
    const segments = 12;
    const filled = Math.round(ratio * segments);
    const color = product.status === 'Healthy' ? '#22a559' : product.status === 'Low Stock' ? '#f2a93b' : '#e05252';
    return (
      <svg viewBox="0 0 64 36" className={styles.gauge} role="img" aria-label={`${Math.round(ratio * 100)}% of pipeline on shelf`}>
        {Array.from({ length: segments }).map((_, i) => {
          const angle = Math.PI - (i + 0.5) * (Math.PI / segments);
          const x1 = 32 + Math.cos(angle) * 20;
          const y1 = 32 - Math.sin(angle) * 20;
          const x2 = 32 + Math.cos(angle) * 29;
          const y2 = 32 - Math.sin(angle) * 29;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i < filled ? color : '#e5e7eb'} strokeWidth="3.2" strokeLinecap="round" />;
        })}
      </svg>
    );
  };

  return (
    <div className={styles.appWrapper}>
      <div className={`${styles.page} app-page`}>
        {notification && <Feedback toast tone={notification.type} onDismiss={() => setNotification(null)}>{notification.message}</Feedback>}

        {/* ---------- Header ---------- */}
        <header className={styles.header}>
          <div>
            <h1>Products &amp; Stock</h1>
            <p>{selectedLocation} · {sortedProducts.length} of {products.length} variants · prices are fixed by HQ</p>
          </div>
          <div className={styles.headerActions}>
            <label className={styles.search}>
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder="Search product, variant, SKU or barcode…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                aria-label="Search products"
              />
              {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><Icon name="x" size={13} /></button>}
            </label>

            <div className={styles.filterWrap} ref={filterRef}>
              <button type="button" className={`${styles.ghostButton} ${filterOpen ? styles.ghostActive : ''}`} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
                <Icon name="filter" size={15} /> Filter
                {activeFilterCount > 0 && <span className={styles.countBadge}>{activeFilterCount}</span>}
              </button>
              {filterOpen && (
                <div className={styles.filterMenu} role="dialog" aria-label="Filter products">
                  <div className={styles.menuHeading}>LOCATION</div>
                  <div className={styles.optionGrid}>
                    {['All retail locations', ...locations].map((loc) => (
                      <button key={loc} type="button" className={selectedLocation === loc ? styles.optionActive : ''} onClick={() => { handleLocationChange(loc); setCurrentPage(1); }}>{loc === 'All retail locations' ? 'All locations' : loc}</button>
                    ))}
                  </div>
                  <div className={styles.menuHeading}>STOCK HEALTH</div>
                  <div className={styles.optionGrid}>
                    {['All items', 'Healthy', 'Low Stock', 'Negative'].map((h) => (
                      <button key={h} type="button" className={selectedHealth === h ? styles.optionActive : ''} onClick={() => { setSelectedHealth(h); setCurrentPage(1); }}>{h}</button>
                    ))}
                  </div>
                  <div className={styles.menuFoot}>
                    <button type="button" onClick={resetFilters} className={styles.linkButton}>Reset all filters</button>
                    <button type="button" onClick={() => setFilterOpen(false)} className={styles.smallPrimary}>Done</button>
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={handleExportCSV} className={styles.ghostButton} title="Download CSV inventory export">
              <Icon name="upload" size={15} /> Export
            </button>
            <button type="button" onClick={() => setAddProductModalOpen(true)} className={styles.primaryButton}>
              <Icon name="plus" size={16} /> Add New Product
            </button>
          </div>
        </header>

        {/* ---------- Summary cards (compact stat design) ---------- */}
        <section className={styles.summaryGrid} aria-label="Product summary">
          <article className={`${styles.summaryCard} ${styles.summaryGray}`}>
            <i className={styles.summaryIcon}><Icon name="package" size={18} /></i>
            <div className={styles.summaryMain}>
              <span className={styles.summaryLabel}>Products tracked</span>
              <strong className={styles.summaryValue}>{kpiStats.totalCount}<em>variants</em></strong>
            </div>
            <div className={styles.summaryDetail}>
              <span className={styles.summaryDetailLabel}>Categories</span>
              <b className={`${styles.chip} ${styles.chipGray}`}>{new Set(filteredProducts.map((p) => p.category)).size}</b>
            </div>
          </article>

          <article className={`${styles.summaryCard} ${styles.summaryTeal}`}>
            <i className={styles.summaryIcon}><Icon name="dollarSign" size={18} /></i>
            <div className={styles.summaryMain}>
              <span className={styles.summaryLabel}>Stock valuation</span>
              <strong className={styles.summaryValue}>{formatPrice(kpiStats.totalValuation)}</strong>
            </div>
            <div className={styles.summaryDetail}>
              <span className={styles.summaryDetailLabel}>Units</span>
              <b className={`${styles.chip} ${styles.chipTeal}`}>{kpiStats.availableTotal}</b>
            </div>
          </article>

          <article className={`${styles.summaryCard} ${styles.summaryAmber}`}>
            <i className={styles.summaryIcon}><Icon name="alert" size={18} /></i>
            <div className={styles.summaryMain}>
              <span className={styles.summaryLabel}>Low stock</span>
              <strong className={styles.summaryValue}>{kpiStats.lowStockCount}</strong>
            </div>
            <div className={styles.summaryDetail}>
              <span className={styles.summaryDetailLabel}>Status</span>
              <button type="button" className={`${styles.chip} ${styles.chipAmber}`} onClick={() => { setSelectedHealth('Low Stock'); setCurrentPage(1); }}>View all</button>
            </div>
          </article>

          <article className={`${styles.summaryCard} ${styles.summaryGreen}`}>
            <i className={styles.summaryIcon}><Icon name="check" size={18} /></i>
            <div className={styles.summaryMain}>
              <span className={styles.summaryLabel}>Healthy stock</span>
              <strong className={styles.summaryValue}>{healthPct}%</strong>
            </div>
            <div className={styles.summaryDetail}>
              <span className={styles.summaryDetailLabel}>Variants</span>
              <b className={`${styles.chip} ${styles.chipGreen}`}>{healthyCount}</b>
            </div>
          </article>
        </section>

        {/* ---------- Toolbar: categories, page size, view ---------- */}
        <div className={styles.toolbar}>
          <div className={styles.categoryTabs} role="tablist" aria-label="Category">
            {categories.map((cat) => (
              <button key={cat} type="button" role="tab" aria-selected={selectedCategory === cat} className={selectedCategory === cat ? styles.tabActive : ''} onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}>
                {cat === 'All categories' ? 'All' : cat}
                <span className={styles.tabCount}>{cat === 'All categories' ? products.length : products.filter((p) => p.category === cat).length}</span>
              </button>
            ))}
          </div>
          <div className={styles.toolbarRight}>
            <span className={styles.showingLabel}>Showing</span>
            <PillDropdown<string>
              value={String(itemsPerPage)}
              heading="Rows per page"
              ariaLabel="Rows per page"
              options={[{ value: '6', label: '6' }, { value: '10', label: '10' }, { value: '20', label: '20' }]}
              onChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}
            />
            <div className={styles.viewToggle} role="group" aria-label="View mode">
              <button type="button" className={viewMode === 'list' ? styles.viewActive : ''} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view"><Icon name="list" size={15} /></button>
              <button type="button" className={viewMode === 'grid' ? styles.viewActive : ''} onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view"><Icon name="grid" size={15} /></button>
            </div>
          </div>
        </div>

        {/* ---------- Product list ---------- */}
        <section className={styles.listCard}>
          {sortedProducts.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Icon name="box" size={28} /></span>
              <h3>No products found</h3>
              <p>No inventory records match{searchQuery ? <> &quot;{searchQuery}&quot;</> : ''} with the current filters.</p>
              <button onClick={resetFilters} className={styles.ghostButton}>Clear all filters</button>
            </div>
          ) : viewMode === 'list' ? (
            <div className={styles.rowsScroller}>
              <div className={`${styles.rowGrid} ${styles.headRow}`}>
                <SortHead label="Product" k="name" />
                <SortHead label="Stock health" k="status" />
                <SortHead label="On hand" k="stock" />
                <span className={styles.headLabel}>Pipeline</span>
                <SortHead label="Price" k="price" />
                <span className={styles.headLabel}>Status</span>
                <span className={`${styles.headLabel} ${styles.alignRight}`}>Action</span>
              </div>
              {paginatedProducts.map((product) => {
                const isNegative = product.totalUnits < 0;
                const onHand = Math.max(0, product.totalUnits);
                const pipelineShare = onHand + product.inTransit ? Math.round((onHand / (onHand + product.inTransit)) * 100) : 0;
                return (
                  <div key={product.id} className={`${styles.rowGrid} ${styles.productRow}`}>
                    <div className={styles.productCell}>
                      {product.imageUrl
                        ? <img className={`${styles.thumb} ${styles.productImage}`} src={product.imageUrl} alt={`${product.name} product`} loading="lazy" />
                        : <span className={`${styles.thumb} ${styles[CATEGORY_TONE[product.category] ?? 'toneTeal']}`}>{product.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>}
                      <span className={styles.productText}>
                        <strong>{product.name}</strong>
                        <small>{product.variant} · {product.category}</small>
                        <span className={styles.productMeta}><span className={styles.sku}>{product.sku}</span><span className={styles.withIcon}><Icon name="mapPin" size={11} />{product.location}</span></span>
                      </span>
                    </div>

                    <div className={styles.healthCell}>
                      <Gauge product={product} />
                      <span className={styles.healthText}>
                        <span>{pipelineShare}%</span>
                        <small>on shelf</small>
                      </span>
                    </div>

                    <div className={styles.stockCell}>
                      <span className={styles.withIcon}><Icon name="package" size={14} /><b className={isNegative ? styles.negative : ''}>{product.totalUnits} {unitWord(product.totalUnits)}</b></span>
                      <small>{isNegative ? 'Deficit · reconcile ledger' : product.packaging.includes('Carton') ? `${product.availableStock.cartons} ctn + ${product.availableStock.loose} loose` : 'Loose only'}</small>
                    </div>

                    <div className={styles.pipelineCell}>
                      <span className={product.inTransit > 0 ? styles.transitText : styles.mutedText}><Icon name="truck" size={13} /> {product.inTransit > 0 ? `+${product.inTransit}` : '0'} in transit</span>
                      <small>{product.reserved} reserved{product.quarantined ? ` · ${product.quarantined} held` : ''}</small>
                    </div>

                    <div className={styles.priceCell}>
                      <b>{formatPrice(product.price)}</b>
                      <small>per pack</small>
                    </div>

                    <div><span className={`${styles.pill} ${statusTone(product.status)}`}>{product.status === 'Negative' ? 'Negative' : product.status}</span></div>

                    <div className={styles.actionsCell}>
                      <button type="button" className={styles.iconAction} onClick={openReplenish} title="Open replenishment tools" aria-label="Open replenishment tools"><Icon name="truck" size={15} /></button>
                      <button type="button" className={styles.iconAction} onClick={() => copySku(product)} title="Copy SKU" aria-label={`Copy SKU ${product.sku}`}><Icon name="copy" size={15} /></button>
                      <div className={styles.menuWrap} data-row-menu>
                        <button type="button" className={styles.iconAction} onClick={() => setMenuFor(menuFor === product.id ? null : product.id)} aria-haspopup="menu" aria-expanded={menuFor === product.id} aria-label="More actions"><Icon name="more" size={15} /></button>
                        {menuFor === product.id && (
                          <div className={styles.rowMenu} role="menu">
                            <button type="button" role="menuitem" onClick={() => { setMenuFor(null); openReplenish(); }}><Icon name="truck" size={14} /> Open replenishment tools</button>
                            <button type="button" role="menuitem" onClick={() => { setMenuFor(null); copySku(product); }}><Icon name="copy" size={14} /> Copy SKU</button>
                            <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setSelectedCategory(product.category); setCurrentPage(1); }}><Icon name="tag" size={14} /> Show {product.category}</button>
                            <a role="menuitem" href="/reports?tab=stock"><Icon name="fileText" size={14} /> Open stock report</a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.productsGrid}>
              {paginatedProducts.map((product) => {
                const isNegative = product.totalUnits < 0;
                return (
                  <article key={product.id} className={styles.gridCard}>
                    <div className={styles.gridTop}>
                      {product.imageUrl
                        ? <img className={`${styles.thumb} ${styles.thumbLg} ${styles.productImage}`} src={product.imageUrl} alt={`${product.name} product`} loading="lazy" />
                        : <span className={`${styles.thumb} ${styles.thumbLg} ${styles[CATEGORY_TONE[product.category] ?? 'toneTeal']}`}>{product.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>}
                      <span className={`${styles.pill} ${statusTone(product.status)}`}>{product.status}</span>
                    </div>
                    <div className={styles.gridTitle}>
                      <strong>{product.name}</strong>
                      <small>{product.variant}</small>
                    </div>
                    <div className={styles.gridFigures}>
                      <div><small>On hand</small><b className={isNegative ? styles.negative : ''}>{product.totalUnits}</b></div>
                      <div><small>In transit</small><b className={product.inTransit ? styles.transitText : ''}>+{product.inTransit}</b></div>
                      <div><small>Price</small><b>{formatPrice(product.price)}</b></div>
                    </div>
                    <div className={styles.gridHealth}><Gauge product={product} /><span>{product.packaging.includes('Carton') && !isNegative ? `${product.availableStock.cartons} ctn + ${product.availableStock.loose} loose` : product.packaging}</span></div>
                    <div className={styles.gridFoot}>
                      <span className={styles.withIcon}><Icon name="mapPin" size={12} />{product.location}</span>
                      <button type="button" onClick={openReplenish} className={styles.smallPrimary}><Icon name="truck" size={13} /> Transfers</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {sortedProducts.length > 0 && (
            <footer className={styles.pagination}>
              <button type="button" className={styles.pageNav} disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}><Icon name="chevronLeft" size={14} /> Previous</button>
              <div className={styles.pageCenter}>
                <div className={styles.pageNumbers}>
                  {pageNumbers.map((n, i) => n === 'gap'
                    ? <span key={`gap-${i}`} className={styles.pageGap}>…</span>
                    : <button key={n} type="button" className={currentPage === n ? styles.pageActive : ''} onClick={() => setCurrentPage(n)} aria-current={currentPage === n ? 'page' : undefined}>{String(n).padStart(2, '0')}</button>)}
                </div>
                <small>Showing {firstRow}–{lastRow} of {sortedProducts.length} variants</small>
              </div>
              <button type="button" className={styles.pageNav} disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next <Icon name="chevronRight" size={14} /></button>
            </footer>
          )}
        </section>
      </div>

      {/* MODAL 2: Add Product Modal */}
      {addProductModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddProductModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.modalIconWrap} style={{ background: 'light-dark(#e0f2fe, #1f2e38)', color: 'light-dark(#0369a1, #b4def5)' }}>
                  <Icon name="package" size={20} />
                </div>
                <div>
                  <h2>Add product</h2>
                  <p>Add new SKU, packaging ratio, and retail price</p>
                </div>
              </div>
              <button onClick={() => setAddProductModalOpen(false)} className={styles.modalCloseBtn}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className={styles.modalBody}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Product Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Organic Rolled Oats"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Variant Sub-Spec</label>
                  <input
                    type="text"
                    placeholder="e.g. 500 g resealable pouch"
                    value={newProdVariant}
                    onChange={(e) => setNewProdVariant(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="product-image-url">Product image URL</label>
                  <input id="product-image-url" type="url" inputMode="url" placeholder="https://example.com/product-image.jpg" value={newProdImageUrl} onChange={(e) => setNewProdImageUrl(e.target.value)} className={styles.modalInput} />
                  <small className={styles.fieldHint}>Use a public HTTPS image link. You can leave this blank and add an image later.</small>
                  {newProdImageUrl.trim() && <img className={styles.imagePreview} src={newProdImageUrl.trim()} alt="Product image preview" />}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="product-base-unit">Base unit *</label>
                  <input type="text" id="product-base-unit" list="product-base-units" required placeholder="e.g. packet" value={newProdBaseUnit} onChange={(e) => setNewProdBaseUnit(e.target.value)} className={styles.modalInput} />
                  <datalist id="product-base-units"><option value="packet" /><option value="bottle" /><option value="piece" /></datalist>
                  <small className={styles.fieldHint}>Use the smallest unit sold or counted individually. Put the number of those units per carton below.</small>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>SKU Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PAN-5099"
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="product-barcode">Barcode (EAN/UPC)</label>
                  <input
                    type="text"
                    id="product-barcode"
                    inputMode="numeric"
                    onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
                    placeholder="Scan or enter barcode"
                    value={newProdBarcode}
                    onChange={(e) => setNewProdBarcode(e.target.value)}
                    className={styles.modalInput}
                  />
                  <small className={styles.fieldHint}>Focus this field to use a USB or Bluetooth barcode scanner.</small>
                  <button type="button" className="admin-secondary" onClick={() => setBarcodeCameraOpen(true)}><Camera size={16} /> Scan with camera</button>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="product-selling-price">Selling price per base unit{currency ? ` (${currency})` : ''}</label>
                  <input
                    type="number"
                    id="product-selling-price"
                    step="0.01"
                    min="0"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="product-carton-units">Base units per carton</label>
                  <input
                    type="number"
                    id="product-carton-units"
                    min="2"
                    placeholder="e.g. 10"
                    step="1"
                    value={newProdCartonRatio}
                    onChange={(e) => setNewProdCartonRatio(e.target.value)}
                    className={styles.modalInput}
                  />
                  <small className={styles.fieldHint}>Leave blank when sold and counted individually only.</small>
                </div>
              </div>

              <p className={styles.fieldHint}>This creates the product catalogue record only. Import opening stock separately to record quantities at each location.</p>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setAddProductModalOpen(false)}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  <Icon name="check" size={16} />
                  <span>Save Product</span>
                </button>
              </div>
            </form>
            {barcodeCameraOpen && <CameraScanner kind="barcode" onClose={() => setBarcodeCameraOpen(false)} onScan={(value) => {
              if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(value)) return false;
              setNewProdBarcode(value);
              setBarcodeCameraOpen(false);
              return true;
            }} />}
          </div>
        </div>
      )}
    </div>
  );
}
