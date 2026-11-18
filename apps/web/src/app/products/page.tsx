'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './products.module.css';

interface ProductItem {
  id: number;
  name: string;
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

const initialProducts: ProductItem[] = [
  {
    id: 1,
    name: 'Arabica Ground Coffee',
    variant: 'Medium roast - 250 g',
    sku: 'BEV-1048',
    barcode: '8901234567890',
    category: 'Beverages',
    location: 'Downtown Store',
    price: 485.00,
    availableStock: { cartons: 2, loose: 3 },
    totalUnits: 27,
    unitsPerCarton: 12,
    inTransit: 36,
    reserved: 6,
    quarantined: 2,
    packaging: 'Carton (12)',
    status: 'Healthy'
  },
  {
    id: 2,
    name: 'Green Tea Bags',
    variant: 'Lemon Mint - 25 bags',
    sku: 'BEV-1056',
    barcode: '8901234567906',
    category: 'Beverages',
    location: 'North Mall',
    price: 160.00,
    availableStock: { cartons: 0, loose: 8 },
    totalUnits: 8,
    unitsPerCarton: 12,
    inTransit: 24,
    reserved: 4,
    quarantined: 0,
    packaging: 'Carton (12)',
    status: 'Low Stock'
  },
  {
    id: 3,
    name: 'Herbal Shampoo',
    variant: 'Aloe vera - 500 ml',
    sku: 'PC-2031',
    barcode: '8901234567913',
    category: 'Personal care',
    location: 'West End Outlet',
    price: 299.00,
    availableStock: { cartons: 0, loose: -2 },
    totalUnits: -2,
    unitsPerCarton: 1,
    inTransit: 10,
    reserved: 0,
    quarantined: 0,
    packaging: 'Packet-Only',
    status: 'Negative'
  },
  {
    id: 4,
    name: 'Facial Tissue Box',
    variant: '2 ply - 100 sheets',
    sku: 'HL-J108',
    barcode: '8901234567920',
    category: 'Home & living',
    location: 'Central Warehouse',
    price: 120.00,
    availableStock: { cartons: 12, loose: 0 },
    totalUnits: 144,
    unitsPerCarton: 12,
    inTransit: 48,
    reserved: 24,
    quarantined: 6,
    packaging: 'Carton (12)',
    status: 'Healthy'
  },
  {
    id: 5,
    name: 'Potato Chips',
    variant: 'Classic salted - 52 g',
    sku: 'SNK-4172',
    barcode: '8901234567937',
    category: 'Snacks',
    location: 'Downtown Store',
    price: 40.00,
    availableStock: { cartons: 0, loose: 9 },
    totalUnits: 9,
    unitsPerCarton: 24,
    inTransit: 36,
    reserved: 12,
    quarantined: 1,
    packaging: 'Carton (24)',
    status: 'Low Stock'
  },
  {
    id: 6,
    name: 'Basmati Royal Rice',
    variant: 'Long Grain - 5 kg',
    sku: 'PAN-5012',
    barcode: '8901234567944',
    category: 'Pantry',
    location: 'Central Warehouse',
    price: 750.00,
    availableStock: { cartons: 15, loose: 4 },
    totalUnits: 64,
    unitsPerCarton: 4,
    inTransit: 40,
    reserved: 8,
    quarantined: 0,
    packaging: 'Carton (4)',
    status: 'Healthy'
  },
  {
    id: 7,
    name: 'Cold Brew Concentrate',
    variant: 'Dark Mocha - 500 ml',
    sku: 'BEV-1062',
    barcode: '8901234567951',
    category: 'Beverages',
    location: 'West End Outlet',
    price: 320.00,
    availableStock: { cartons: 1, loose: 2 },
    totalUnits: 14,
    unitsPerCarton: 12,
    inTransit: 12,
    reserved: 2,
    quarantined: 0,
    packaging: 'Carton (12)',
    status: 'Healthy'
  },
  {
    id: 8,
    name: 'Olive Oil Extra Virgin',
    variant: 'Cold Pressed - 1 L',
    sku: 'PAN-5020',
    barcode: '8901234567968',
    category: 'Pantry',
    location: 'Downtown Store',
    price: 890.00,
    availableStock: { cartons: 0, loose: 4 },
    totalUnits: 4,
    unitsPerCarton: 8,
    inTransit: 16,
    reserved: 2,
    quarantined: 0,
    packaging: 'Carton (8)',
    status: 'Low Stock'
  },
  {
    id: 9,
    name: 'Organic Dark Chocolate',
    variant: '72% Cacao - 100 g',
    sku: 'SNK-4180',
    barcode: '8901234567975',
    category: 'Snacks',
    location: 'North Mall',
    price: 180.00,
    availableStock: { cartons: 3, loose: 6 },
    totalUnits: 42,
    unitsPerCarton: 12,
    inTransit: 24,
    reserved: 8,
    quarantined: 0,
    packaging: 'Carton (12)',
    status: 'Healthy'
  },
  {
    id: 10,
    name: 'Antibacterial Hand Wash',
    variant: 'Citrus Fresh - 250 ml',
    sku: 'PC-2045',
    barcode: '8901234567982',
    category: 'Personal care',
    location: 'Downtown Store',
    price: 145.00,
    availableStock: { cartons: 0, loose: -1 },
    totalUnits: -1,
    unitsPerCarton: 10,
    inTransit: 20,
    reserved: 0,
    quarantined: 0,
    packaging: 'Carton (10)',
    status: 'Negative'
  }
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    box: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z M4.5 7.7 12 11.9l7.5-4.2M12 12v9" />,
    list: <path d="M3 6h18M3 12h18M3 18h18" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    tag: <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2ZM7 7h.01" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    shoppingCart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    moreVertical: <><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    trending: <path d="m22 7-8.5 8.5-5-5L1 18" />,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    package: <><path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></>,
    dollarSign: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    truck: <><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);
  const [selectedLocation, setSelectedLocation] = useState('All retail locations');
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const [selectedHealth, setSelectedHealth] = useState('All items');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);

  // Modal States
  const [replenishModalOpen, setReplenishModalOpen] = useState(false);
  const [selectedProductForReplenish, setSelectedProductForReplenish] = useState<ProductItem | null>(null);
  const [replenishCartons, setReplenishCartons] = useState(5);
  const [replenishUrgency, setReplenishUrgency] = useState<'Standard' | 'Urgent' | 'Emergency'>('Standard');
  const [replenishNote, setReplenishNote] = useState('');

  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdVariant, setNewProdVariant] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Beverages');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdPrice, setNewProdPrice] = useState(199.00);
  const [newProdCartonRatio, setNewProdCartonRatio] = useState(12);
  const [newProdInitialUnits, setNewProdInitialUnits] = useState(24);
  const [newProdLocation, setNewProdLocation] = useState('Downtown Store');

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

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
        prod.location !== selectedLocation
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
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

  // Open Replenishment Modal
  const openReplenish = (product: ProductItem) => {
    setSelectedProductForReplenish(product);
    setReplenishCartons(product.packaging.includes('Carton') ? 5 : 20);
    setReplenishUrgency('Standard');
    setReplenishNote('');
    setReplenishModalOpen(true);
  };

  // Submit Replenishment Request
  const handleReplenishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForReplenish) return;

    const unitsAdded = selectedProductForReplenish.packaging.includes('Carton') 
      ? replenishCartons * selectedProductForReplenish.unitsPerCarton 
      : replenishCartons;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === selectedProductForReplenish.id) {
          return {
            ...p,
            inTransit: p.inTransit + unitsAdded
          };
        }
        return p;
      })
    );

    showToast(`Replenishment transfer request created: ${unitsAdded} units (${replenishCartons} packs) dispatched in-transit to ${selectedProductForReplenish.location}.`, 'success');
    setReplenishModalOpen(false);
  };

  // Add New Product Variant
  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim()) {
      alert('Please fill out Product Name and SKU.');
      return;
    }

    const cartons = newProdCartonRatio > 1 ? Math.floor(newProdInitialUnits / newProdCartonRatio) : 0;
    const loose = newProdCartonRatio > 1 ? newProdInitialUnits % newProdCartonRatio : newProdInitialUnits;

    let status: 'Healthy' | 'Low Stock' | 'Negative' = 'Healthy';
    if (newProdInitialUnits < 0) status = 'Negative';
    else if (newProdInitialUnits <= 10) status = 'Low Stock';

    const newProd: ProductItem = {
      id: Date.now(),
      name: newProdName.trim(),
      variant: newProdVariant.trim() || 'Standard pack',
      sku: newProdSku.trim().toUpperCase(),
      barcode: newProdBarcode.trim() || '890999' + Math.floor(1000000 + Math.random() * 9000000),
      category: newProdCategory,
      location: newProdLocation,
      price: Number(newProdPrice) || 99.00,
      availableStock: { cartons, loose },
      totalUnits: Number(newProdInitialUnits) || 0,
      unitsPerCarton: newProdCartonRatio > 1 ? newProdCartonRatio : 1,
      inTransit: 0,
      reserved: 0,
      quarantined: 0,
      packaging: newProdCartonRatio > 1 ? `Carton (${newProdCartonRatio})` : 'Packet-Only',
      status
    };

    setProducts([newProd, ...products]);
    showToast(`New SKU ${newProd.sku} successfully registered to ${newProd.location} catalogue.`, 'success');
    setAddProductModalOpen(false);
    // Reset fields
    setNewProdName('');
    setNewProdVariant('');
    setNewProdSku('');
    setNewProdBarcode('');
  };

  const categories = ['All categories', 'Beverages', 'Personal care', 'Home & living', 'Snacks', 'Pantry'];

  return (
    <div className={styles.appWrapper}>
      <div className={styles.pageContainer}>
        {/* Toast Feedback Notification */}
        {notification && (
          <div className={`${styles.toastNotification} ${styles[notification.type]}`}>
            <Icon name="check" size={16} />
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className={styles.toastCloseBtn}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* Top Breadcrumb Bar */}
        <div className={styles.topBar}>
          <div className={styles.breadcrumb}>
            <span>Catalog & Inventory</span>
            <span className={styles.separator}>›</span>
            <span className={styles.currentPage}>Products Catalogue</span>
          </div>
          <div className={styles.topBarRight}>
            <div className={styles.scopeIndicator}>
              <Icon name="mapPin" size={14} />
              <span>Scope: <strong>{selectedLocation}</strong></span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={styles.mainContent}>
          {/* Header with Title and Global Actions */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Products & Inventory Catalogue</h1>
              <p className={styles.pageSubtitle}>
                Master inventory view of SKU variants, retail pricing, mixed carton-to-loose packaging levels, and stock health across stores.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button onClick={handleExportCSV} className={styles.btnSecondary} title="Download CSV inventory export">
                <Icon name="download" size={17} />
                <span>Export CSV</span>
              </button>
              <button onClick={() => setAddProductModalOpen(true)} className={styles.btnPrimary} title="Register new product variant">
                <Icon name="plus" size={17} />
                <span>Add Product</span>
              </button>
            </div>
          </div>

          {/* Section 2: Header & KPI Summary Bar */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>
                <Icon name="package" size={24} />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Products Tracked</div>
                <div className={styles.statValue}>
                  {kpiStats.totalCount} <span className={styles.statSubtext}>variants</span>
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                <Icon name="dollarSign" size={24} />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Total Stock Valuation</div>
                <div className={styles.statValue}>
                  ₹{kpiStats.totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                <Icon name="alert" size={24} />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Low Stock Alerts</div>
                <div className={styles.statValue}>
                  {kpiStats.lowStockCount} <span className={styles.statSubtext}>reorder soon</span>
                </div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                <Icon name="alert" size={24} />
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Negative Stock (OD-03)</div>
                <div className={styles.statValue}>
                  {kpiStats.negativeStockCount} <span className={styles.statSubtext} style={{ color: '#dc2626' }}>reconcile audit</span>
                </div>
              </div>
            </div>

            {/* Stock State Breakdown */}
            <div className={styles.stockBreakdown}>
              <div className={styles.breakdownHeader}>
                <span className={styles.breakdownTitle}>Stock State Breakdown (Base Packs)</span>
              </div>
              <div className={styles.breakdownGrid}>
                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownDot} style={{ backgroundColor: '#22c55e' }} />
                  <span className={styles.breakdownLabel}>Available</span>
                  <span className={styles.breakdownValue}>{kpiStats.availableTotal}</span>
                </div>
                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownDot} style={{ backgroundColor: '#3b82f6' }} />
                  <span className={styles.breakdownLabel}>In-Transit (OD-05)</span>
                  <span className={styles.breakdownValue}>{kpiStats.inTransitTotal}</span>
                </div>
                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownDot} style={{ backgroundColor: '#a855f7' }} />
                  <span className={styles.breakdownLabel}>Reserved</span>
                  <span className={styles.breakdownValue}>{kpiStats.reservedTotal}</span>
                </div>
                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownDot} style={{ backgroundColor: '#94a3b8' }} />
                  <span className={styles.breakdownLabel}>Quarantined</span>
                  <span className={styles.breakdownValue}>{kpiStats.quarantinedTotal}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Search & Multi-Filter Controls */}
          <div className={styles.filtersSection}>
            <div className={styles.searchBox}>
              <Icon name="search" size={18} />
              <input
                type="text"
                placeholder="Search product, variant, SKU or barcode..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className={styles.clearSearchBtn}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>

            <div className={styles.filterGroup}>
              {/* Location Selector */}
              <div className={styles.filterSelect}>
                <Icon name="mapPin" size={16} />
                <select
                  value={selectedLocation}
                  onChange={(e) => {
                    handleLocationChange(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option>All retail locations</option>
                  <option>Downtown Store</option>
                  <option>North Mall</option>
                  <option>West End Outlet</option>
                  <option>Central Warehouse</option>
                </select>
                <Icon name="chevronDown" size={14} />
              </div>

              {/* Health Filter */}
              <div className={styles.filterSelect}>
                <Icon name="alert" size={16} />
                <select
                  value={selectedHealth}
                  onChange={(e) => {
                    setSelectedHealth(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option>All items</option>
                  <option>Healthy</option>
                  <option>Low Stock</option>
                  <option>Negative</option>
                </select>
                <Icon name="chevronDown" size={14} />
              </div>

              {/* Table / Grid Toggle */}
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
                  onClick={() => setViewMode('list')}
                  title="Table List View"
                >
                  <Icon name="list" size={16} />
                </button>
                <button
                  type="button"
                  className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid Card View"
                >
                  <Icon name="grid" size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className={styles.categoryTabs}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${styles.categoryTab} ${selectedCategory === cat ? styles.active : ''}`}
                onClick={() => {
                  setSelectedCategory(cat);
                  setCurrentPage(1);
                }}
              >
                <Icon name="tag" size={14} />
                <span>{cat}</span>
              </button>
            ))}
          </div>

          {/* Section 4: Master Inventory Data View */}
          {filteredProducts.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon name="box" size={48} />
              <h3>No products found</h3>
              <p>No inventory records match your search &quot;{searchQuery}&quot; or filter combination.</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All categories');
                  setSelectedHealth('All items');
                  setSelectedLocation('All retail locations');
                }}
                className={styles.btnSecondary}
              >
                Clear All Filters
              </button>
            </div>
          ) : viewMode === 'list' ? (
            /* Table Mode */
            <div className={styles.tableContainer}>
              <table className={styles.productsTable}>
                <thead>
                  <tr>
                    <th>Product & Variant</th>
                    <th>SKU & Barcode</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Price (Per Pack)</th>
                    <th>Available (Mixed Units OD-02)</th>
                    <th>In-Transit (OD-05)</th>
                    <th>Reserved</th>
                    <th>Packaging</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => {
                    const isNegative = product.totalUnits < 0;
                    const isLow = product.totalUnits >= 0 && product.totalUnits <= 10;

                    return (
                      <tr key={product.id}>
                        <td>
                          <div className={styles.productCell}>
                            <div className={styles.productAvatar}>
                              {product.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <div className={styles.productName}>{product.name}</div>
                              <div className={styles.productVariant}>{product.variant}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.skuCell}>
                            <span className={styles.skuBadge}>{product.sku}</span>
                            <span className={styles.barcodeText}>{product.barcode}</span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.categoryBadge}>{product.category}</span>
                        </td>
                        <td>
                          <div className={styles.locationCell}>
                            <Icon name="mapPin" size={13} />
                            <span>{product.location}</span>
                          </div>
                        </td>
                        <td className={styles.priceCell}>
                          <strong>₹{product.price.toFixed(2)}</strong>
                          <span className={styles.pricePolicy}>Fixed HQ</span>
                        </td>
                        <td>
                          <div className={styles.stockCell}>
                            <span className={`${styles.stockValue} ${isNegative ? styles.textNegative : ''}`}>
                              {product.totalUnits} packs
                            </span>
                            <span className={styles.stockDetail}>
                              {product.packaging.includes('Carton') ? (
                                isNegative ? (
                                  <span className={styles.negativeAlert}>Deficit: reconcile</span>
                                ) : (
                                  `(${product.availableStock.cartons} ctn + ${product.availableStock.loose} loose)`
                                )
                              ) : (
                                '(Loose Only)'
                              )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={product.inTransit > 0 ? styles.inTransitActive : styles.inTransitZero}>
                            {product.inTransit > 0 ? `+${product.inTransit}` : '0'}
                          </span>
                        </td>
                        <td>
                          <span className={styles.reservedText}>{product.reserved}</span>
                        </td>
                        <td>
                          <div className={styles.packagingBadge}>
                            <Icon name="package" size={13} />
                            <span>{product.packaging}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[product.status.replace(/\s+/g, '')]}`}>
                            {product.status === 'Healthy' && '● Healthy'}
                            {product.status === 'Low Stock' && '● Low Stock'}
                            {product.status === 'Negative' && '● Negative (OD-03)'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.actionsCell}>
                            <button
                              onClick={() => openReplenish(product)}
                              className={styles.actionBtnPrimary}
                              title="Request Stock Replenishment"
                            >
                              <Icon name="truck" size={14} />
                              <span>Replenish</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid Card Mode */
            <div className={styles.productsGrid}>
              {paginatedProducts.map((product) => {
                const isNegative = product.totalUnits < 0;
                return (
                  <div key={product.id} className={styles.gridCard}>
                    <div className={styles.gridCardHeader}>
                      <span className={styles.categoryBadge}>{product.category}</span>
                      <span className={`${styles.statusBadge} ${styles[product.status.replace(/\s+/g, '')]}`}>
                        ● {product.status}
                      </span>
                    </div>

                    <div className={styles.gridCardTitle}>
                      <h3>{product.name}</h3>
                      <p>{product.variant}</p>
                    </div>

                    <div className={styles.gridCardMeta}>
                      <div>
                        <span className={styles.metaLabel}>SKU:</span> {product.sku}
                      </div>
                      <div>
                        <span className={styles.metaLabel}>Price:</span> ₹{product.price.toFixed(2)}
                      </div>
                    </div>

                    <div className={styles.gridCardStockBox}>
                      <div className={styles.gridStockCol}>
                        <span className={styles.metaLabel}>On Hand:</span>
                        <strong className={isNegative ? styles.textNegative : ''}>
                          {product.totalUnits} packs
                        </strong>
                        <small>
                          {product.packaging.includes('Carton') && !isNegative
                            ? `${product.availableStock.cartons} ctn + ${product.availableStock.loose} loose`
                            : product.packaging}
                        </small>
                      </div>
                      <div className={styles.gridStockCol}>
                        <span className={styles.metaLabel}>In-Transit:</span>
                        <span className={product.inTransit > 0 ? styles.inTransitActive : styles.inTransitZero}>
                          +{product.inTransit}
                        </span>
                      </div>
                    </div>

                    <div className={styles.gridCardFooter}>
                      <div className={styles.locationCell}>
                        <Icon name="mapPin" size={13} />
                        <span>{product.location}</span>
                      </div>
                      <button
                        onClick={() => openReplenish(product)}
                        className={styles.actionBtnPrimary}
                      >
                        <Icon name="truck" size={14} />
                        <span>Replenish</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {filteredProducts.length > 0 && (
            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> -{' '}
                <strong>{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</strong> of{' '}
                <strong>{filteredProducts.length}</strong> items
              </div>
              <div className={styles.paginationControls}>
                <button
                  className={styles.pageBtn}
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                >
                  <Icon name="chevronLeft" size={14} />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i + 1}
                    className={`${styles.pageBtn} ${currentPage === i + 1 ? styles.active : ''}`}
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  className={styles.pageBtn}
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Request Replenishment Drawer/Modal */}
      {replenishModalOpen && selectedProductForReplenish && (
        <div className={styles.modalOverlay} onClick={() => setReplenishModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.modalIconWrap}>
                  <Icon name="truck" size={20} />
                </div>
                <div>
                  <h2>Draft Stock Replenishment Transfer</h2>
                  <p>Request stock transfer from Central Warehouse</p>
                </div>
              </div>
              <button onClick={() => setReplenishModalOpen(false)} className={styles.modalCloseBtn}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleReplenishSubmit} className={styles.modalBody}>
              <div className={styles.modalItemDetails}>
                <div><strong>Product:</strong> {selectedProductForReplenish.name} ({selectedProductForReplenish.variant})</div>
                <div><strong>SKU:</strong> {selectedProductForReplenish.sku} &nbsp;|&nbsp; <strong>Packaging:</strong> {selectedProductForReplenish.packaging}</div>
                <div><strong>Destination Store:</strong> {selectedProductForReplenish.location}</div>
                <div><strong>Current On Hand:</strong> {selectedProductForReplenish.totalUnits} packs (In-transit: {selectedProductForReplenish.inTransit})</div>
              </div>

              <div className={styles.formGroup}>
                <label>
                  Quantity to Request ({selectedProductForReplenish.packaging.includes('Carton') ? 'Cartons' : 'Base Packs'}):
                </label>
                <div className={styles.stepperWrap}>
                  <button
                    type="button"
                    onClick={() => setReplenishCartons(c => Math.max(1, c - 1))}
                    className={styles.stepBtn}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={replenishCartons}
                    onChange={(e) => setReplenishCartons(Math.max(1, parseInt(e.target.value) || 1))}
                    className={styles.stepInput}
                  />
                  <button
                    type="button"
                    onClick={() => setReplenishCartons(c => c + 1)}
                    className={styles.stepBtn}
                  >
                    +
                  </button>
                </div>
                <small className={styles.fieldHint}>
                  {selectedProductForReplenish.packaging.includes('Carton')
                    ? `Total equivalent units: ${replenishCartons * selectedProductForReplenish.unitsPerCarton} loose packs.`
                    : `${replenishCartons} units total.`}
                </small>
              </div>

              <div className={styles.formGroup}>
                <label>Dispatch Urgency Level:</label>
                <select
                  value={replenishUrgency}
                  onChange={(e) => setReplenishUrgency(e.target.value as any)}
                  className={styles.modalSelect}
                >
                  <option value="Standard">Standard Warehouse Run (24-48 hrs)</option>
                  <option value="Urgent">Urgent Priority (Same Day)</option>
                  <option value="Emergency">Emergency Critical Stockout (Immediate)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Internal Audit / Warehouse Notes:</label>
                <textarea
                  rows={2}
                  value={replenishNote}
                  onChange={(e) => setReplenishNote(e.target.value)}
                  placeholder="e.g., Weekend surge replenishment or promotional event..."
                  className={styles.modalTextarea}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setReplenishModalOpen(false)}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  <Icon name="check" size={16} />
                  <span>Confirm Transfer Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Product Modal */}
      {addProductModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddProductModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.modalIconWrap} style={{ background: '#e0f2fe', color: '#0369a1' }}>
                  <Icon name="package" size={20} />
                </div>
                <div>
                  <h2>Register New Product Variant</h2>
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
                  <label>Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className={styles.modalSelect}
                  >
                    <option>Beverages</option>
                    <option>Personal care</option>
                    <option>Home & living</option>
                    <option>Snacks</option>
                    <option>Pantry</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Retail Store Location</label>
                  <select
                    value={newProdLocation}
                    onChange={(e) => setNewProdLocation(e.target.value)}
                    className={styles.modalSelect}
                  >
                    <option>Downtown Store</option>
                    <option>North Mall</option>
                    <option>West End Outlet</option>
                    <option>Central Warehouse</option>
                  </select>
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
                  <label>Barcode (EAN/UPC)</label>
                  <input
                    type="text"
                    placeholder="e.g. 8901234567999"
                    value={newProdBarcode}
                    onChange={(e) => setNewProdBarcode(e.target.value)}
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Selling Price (₹ per canonical pack)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(parseFloat(e.target.value) || 0)}
                    className={styles.modalInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Units per Carton (1 for Packet-Only)</label>
                  <input
                    type="number"
                    min="1"
                    value={newProdCartonRatio}
                    onChange={(e) => setNewProdCartonRatio(parseInt(e.target.value) || 1)}
                    className={styles.modalInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Initial Available Stock (Packs):</label>
                <input
                  type="number"
                  value={newProdInitialUnits}
                  onChange={(e) => setNewProdInitialUnits(parseInt(e.target.value) || 0)}
                  className={styles.modalInput}
                />
                <small className={styles.fieldHint}>
                  {newProdCartonRatio > 1
                    ? `Auto-converted: ${Math.floor(newProdInitialUnits / newProdCartonRatio)} cartons + ${newProdInitialUnits % newProdCartonRatio} loose packs.`
                    : 'Tracked as loose packs.'}
                </small>
              </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
