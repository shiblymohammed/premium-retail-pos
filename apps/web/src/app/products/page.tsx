'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PillDropdown } from '@/components/ui/pill-dropdown';
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
    chevronUp: <path d="m18 15-6-6-6 6" />,
    filter: <path d="M4 5h16l-6.3 7.2v5.3l-3.4 1.7v-7z" />,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
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
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

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

  // ---------- Derived figures for the statistic strip ----------
  const healthyCount = filteredProducts.filter((p) => p.status === 'Healthy').length;
  const healthPct = filteredProducts.length ? Math.round((healthyCount / filteredProducts.length) * 100) : 0;
  const healthLabel = healthPct >= 75 ? 'Good' : healthPct >= 50 ? 'Fair' : 'Needs attention';
  const topValueProduct = [...filteredProducts].sort((a, b) => Math.max(0, b.totalUnits) * b.price - Math.max(0, a.totalUnits) * a.price)[0];
  const activeFilterCount = [selectedHealth !== 'All items', selectedCategory !== 'All categories', !['All retail locations', 'All locations'].includes(selectedLocation)].filter(Boolean).length;
  const firstRow = sortedProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const lastRow = Math.min(currentPage * itemsPerPage, sortedProducts.length);
  const formatPrice = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      <span className={styles.sortIcon} aria-hidden="true">{sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
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
      <div className={styles.page}>
        {notification && (
          <div className={`${styles.toastNotification} ${styles[notification.type]}`} role="status">
            <Icon name="check" size={16} />
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className={styles.toastCloseBtn} aria-label="Dismiss"><Icon name="x" size={14} /></button>
          </div>
        )}

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
                    {['All retail locations', 'Downtown Store', 'North Mall', 'West End Outlet', 'Central Warehouse'].map((loc) => (
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
                      <span className={`${styles.thumb} ${styles[CATEGORY_TONE[product.category] ?? 'toneTeal']}`}>{product.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
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
                      <button type="button" className={styles.iconAction} onClick={() => openReplenish(product)} title="Request replenishment" aria-label={`Request replenishment for ${product.name}`}><Icon name="truck" size={15} /></button>
                      <button type="button" className={styles.iconAction} onClick={() => copySku(product)} title="Copy SKU" aria-label={`Copy SKU ${product.sku}`}><Icon name="copy" size={15} /></button>
                      <div className={styles.menuWrap} data-row-menu>
                        <button type="button" className={styles.iconAction} onClick={() => setMenuFor(menuFor === product.id ? null : product.id)} aria-haspopup="menu" aria-expanded={menuFor === product.id} aria-label="More actions"><Icon name="more" size={15} /></button>
                        {menuFor === product.id && (
                          <div className={styles.rowMenu} role="menu">
                            <button type="button" role="menuitem" onClick={() => { setMenuFor(null); openReplenish(product); }}><Icon name="truck" size={14} /> Request replenishment</button>
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
                      <span className={`${styles.thumb} ${styles.thumbLg} ${styles[CATEGORY_TONE[product.category] ?? 'toneTeal']}`}>{product.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
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
                      <button type="button" onClick={() => openReplenish(product)} className={styles.smallPrimary}><Icon name="truck" size={13} /> Replenish</button>
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
