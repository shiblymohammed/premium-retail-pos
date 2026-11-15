'use client';

import { useMemo, useState } from 'react';
import styles from './products.module.css';

type StockState = 'Healthy' | 'Low stock' | 'Negative';
type ProductRow = {
  name: string; sku: string; variant: string; category: string; location: string;
  price: number; available: number; inTransit: number; reserved: number;
  unit: string; cartonSize: number | null; state: StockState;
};

const productRows: ProductRow[] = [
  { name: 'Arabica Ground Coffee', sku: 'BEV-1048', variant: 'Medium roast · 250 g', category: 'Beverages', location: 'Downtown Store', price: 485, available: 18, inTransit: 48, reserved: 12, unit: 'pack', cartonSize: 12, state: 'Low stock' },
  { name: 'Almond Oat Drink', sku: 'BEV-1081', variant: 'Unsweetened · 1 L', category: 'Beverages', location: 'North Mall', price: 220, available: 26, inTransit: 24, reserved: 4, unit: 'bottle', cartonSize: 6, state: 'Low stock' },
  { name: 'Daily Moisture Lotion', sku: 'CARE-2036', variant: 'Fragrance free · 400 ml', category: 'Personal care', location: 'Downtown Store', price: 640, available: 82, inTransit: 0, reserved: 8, unit: 'bottle', cartonSize: 8, state: 'Healthy' },
  { name: 'Cotton Bath Towels', sku: 'HOME-3104', variant: 'Cloud white · Large', category: 'Home & living', location: 'West End Outlet', price: 890, available: 9, inTransit: 12, reserved: 2, unit: 'piece', cartonSize: 10, state: 'Low stock' },
  { name: 'Dark Chocolate Bar', sku: 'SNK-4120', variant: '70% cocoa · 90 g', category: 'Snacks', location: 'North Mall', price: 160, available: -4, inTransit: 36, reserved: 0, unit: 'piece', cartonSize: 24, state: 'Negative' },
  { name: 'Extra Virgin Olive Oil', sku: 'PAN-5022', variant: 'Cold pressed · 500 ml', category: 'Pantry', location: 'Downtown Store', price: 760, available: 43, inTransit: 18, reserved: 3, unit: 'bottle', cartonSize: 6, state: 'Healthy' },
  { name: 'Linen Table Runner', sku: 'HOME-3177', variant: 'Natural beige · 180 cm', category: 'Home & living', location: 'West End Outlet', price: 1_240, available: 14, inTransit: 0, reserved: 1, unit: 'piece', cartonSize: null, state: 'Low stock' },
  { name: 'Jasmine Green Tea', sku: 'BEV-1125', variant: 'Loose leaf · 100 g', category: 'Beverages', location: 'North Mall', price: 395, available: 72, inTransit: 12, reserved: 6, unit: 'pack', cartonSize: 10, state: 'Healthy' },
];

const locations = ['All locations', 'Downtown Store', 'North Mall', 'West End Outlet'];
const categories = ['All categories', ...Array.from(new Set(productRows.map((product) => product.category)))];
const locationSummary: Record<string, { products: number; value: number; low: number; negative: number; available: number; inTransit: number; reserved: number; quarantined: number }> = {
  'All locations': { products: 248, value: 4_820_000, low: 18, negative: 3, available: 8420, inTransit: 760, reserved: 310, quarantined: 84 },
  'Downtown Store': { products: 114, value: 1_784_000, low: 7, negative: 1, available: 3110, inTransit: 210, reserved: 90, quarantined: 16 },
  'North Mall': { products: 72, value: 1_496_000, low: 5, negative: 1, available: 2560, inTransit: 305, reserved: 80, quarantined: 31 },
  'West End Outlet': { products: 62, value: 1_540_000, low: 6, negative: 1, available: 2750, inTransit: 245, reserved: 140, quarantined: 37 },
};
const reorderItems = [
  { initials: 'AO', name: 'Almond Oat Drink', sku: 'BEV-1081', location: 'North Mall', stock: '4 cartons + 2 bottles' },
  { initials: 'CT', name: 'Cotton Bath Towels', sku: 'HOME-3104', location: 'West End Outlet', stock: '9 pieces' },
  { initials: 'LT', name: 'Linen Table Runner', sku: 'HOME-3177', location: 'West End Outlet', stock: '14 pieces' },
  { initials: 'AC', name: 'Arabica Ground Coffee', sku: 'BEV-1048', location: 'Downtown Store', stock: '18 packs' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9"/></>,
    receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    transfer: <><path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    chart: <><path d="M4 20V11M10 20V5M16 20v-8M22 20H2"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.box}</svg>;
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatStock(value: number, unit: string, cartonSize: number | null) {
  if (cartonSize && value >= cartonSize) {
    const cartons = Math.floor(value / cartonSize);
    const loose = value % cartonSize;
    return `${cartons} cartons${loose ? ` + ${loose} ${unit}s` : ''}`;
  }
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export default function ProductsPage() {
  const [location, setLocation] = useState('All locations');
  const [category, setCategory] = useState('All categories');
  const [statusFilter, setStatusFilter] = useState<'All' | StockState>('All');
  const [query, setQuery] = useState('');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const summary = locationSummary[location];
  const visibleReorders = reorderItems.filter((item) => location === 'All locations' || item.location === location);
  const visibleProducts = useMemo(() => productRows.filter((product) =>
    (location === 'All locations' || product.location === location)
    && (category === 'All categories' || product.category === category)
    && (statusFilter === 'All' || product.state === statusFilter)
    && `${product.name} ${product.sku} ${product.variant} ${product.category}`.toLowerCase().includes(query.toLowerCase())),
  [category, location, query, statusFilter]);

  function exportInventory() {
    const rows = [
      ['Product', 'SKU', 'Variant', 'Category', 'Location', 'Selling price', 'Available base units', 'In transit base units', 'Reserved base units', 'Stock status'],
      ...visibleProducts.map((item) => [item.name, item.sku, item.variant, item.category, item.location, String(item.price), String(item.available), String(item.inTransit), String(item.reserved), item.state]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'premium-retail-demo-inventory.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className={`${styles.appShell} ${navCollapsed ? styles.navCollapsed : ''}`}>
    <header className={styles.referenceHeader}>
      <div className={styles.referenceBrand}><button className={styles.sidebarToggle} type="button" onClick={() => setNavCollapsed((collapsed) => !collapsed)} aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-controls="retail-sidebar" aria-expanded={!navCollapsed} title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><span aria-hidden="true">{navCollapsed ? '›' : '‹'}</span></button><span className={styles.referenceBrandMark}>P</span><strong>Premium Retail</strong><span className={styles.referenceDivider}>/</span><span>Store operations</span></div>
      <div className={styles.referenceHeaderRight}><span className={styles.headerStatus}><i /> DEMO WORKSPACE</span><span>Local sample data</span></div>
    </header>
    <aside className={styles.sidebar} id="retail-sidebar">
      <a className={styles.brand} href="/dashboard"><span className={styles.brandMark}>P</span><span><strong>Premium Retail</strong><small>RETAIL OPERATIONS</small></span></a>
      <label className={styles.locationCard}><span className={styles.locationIcon}><Icon name="pin" size={17}/></span><span className={styles.locationControl}><small>VIEWING LOCATION</small><span className={styles.selectWrap}><select value={location} onChange={(event) => setLocation(event.target.value)} aria-label="Inventory location">{locations.map((item) => <option key={item}>{item}</option>)}</select><b>⌄</b></span><em>Inventory at a glance</em></span></label>
      <p className={styles.navLabel}>STORE OPERATIONS</p>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="/dashboard" className={styles.navItem} title="Retail overview"><Icon name="grid"/>Retail overview</a>
        <a href="/" className={styles.navItem} title="POS terminal"><Icon name="receipt"/>POS terminal</a>
        <a href="/products" className={`${styles.navItem} ${styles.active}`} title="Products and inventory"><Icon name="box"/>Products & inventory</a>
        <a href="/operations" className={styles.navItem} title="Transfers and replenishment"><Icon name="transfer"/>Transfers & replenishment</a>
        <p className={styles.navLabel}>POLICIES & AUDIT</p>
        <a href="/admin/discount-limits" className={styles.navItem} title="Discount limits"><Icon name="chart"/>Discount limits</a>
        <a href="/admin/sales-permissions" className={styles.navItem} title="Sale permissions"><Icon name="shield"/>Sale permissions</a>
        <a href="/sales-controls" className={styles.navItem} title="Returns and cancellations"><Icon name="receipt"/>Returns & cancellations</a>
      </nav>
      <div className={styles.sidebarNote}><span className={styles.noteMark}><Icon name="box" size={16}/></span><strong>Inventory ledger</strong><p>Demo stock is grouped across three retail locations.</p><a href="/operations">API test bench <span>→</span></a></div>
      <div className={styles.sideFooter}><i/> Demo workspace <span>Mock data</span></div>
    </aside>

    <section className={styles.mainArea}>
      <header className={styles.topbar}><div className={styles.breadcrumb}><span>Retail operations</span><b>/</b><strong>Products & inventory</strong></div><span className={styles.demoBadge}><i/> DEMO · MOCK DATA</span><div className={styles.user}><span className={styles.avatar}>SM</span><span><strong>Sam Morgan</strong><small>Super Admin · demo view</small></span></div></header>
      <div className={styles.content}>
        <div className={styles.heading}><div><span className={styles.eyebrow}>CATALOGUE & STOCK CONTROL</span><h1>Products & inventory</h1><p>Keep product details, store availability, and replenishment needs in view.</p></div><button type="button" className={styles.exportButton} onClick={exportInventory}><Icon name="download" size={16}/> Export inventory</button></div>

        <div className={styles.statGrid}>
          <article className={`${styles.statCard} ${styles.catalogCard}`}><span className={styles.statLabel}>ACTIVE PRODUCTS</span><strong>{summary.products}</strong><small><i/> {location === 'All locations' ? 'Across 3 retail locations' : location}</small><b className={styles.statIcon}><Icon name="box" size={18}/></b></article>
          <article className={`${styles.statCard} ${styles.valueCard}`}><span className={styles.statLabel}>INVENTORY AT COST</span><strong>{money(summary.value)}</strong><small>Available stock valuation</small><b className={styles.statIcon}><Icon name="chart" size={18}/></b></article>
          <article className={`${styles.statCard} ${styles.lowCard}`}><span className={styles.statLabel}>LOW STOCK</span><strong>{summary.low} <em>variants</em></strong><small>At or below reorder level</small><b className={styles.statIcon}><Icon name="box" size={18}/></b></article>
          <article className={`${styles.statCard} ${styles.negativeCard}`}><span className={styles.statLabel}>NEGATIVE AVAILABLE</span><strong>{summary.negative} <em>variants</em></strong><small>Review location balances</small><b className={styles.statIcon}><Icon name="shield" size={18}/></b></article>
        </div>

        <div className={styles.overviewGrid}>
          <section className={`${styles.panel} ${styles.chartPanel}`}>
            <div className={styles.sectionTitle}><div><span className={styles.eyebrow}>STOCK MOVEMENT</span><h2>Total stock volume vs. consumption</h2><p>Available inventory compared with recent sales velocity.</p></div><label className={styles.periodSelect}>Last 30 days <span>⌄</span></label></div>
            <div className={styles.chartLegend}><span><i/>Stock volume</span><span><i/>Consumption</span><b>{location}</b></div>
            <div className={styles.inventoryChart} role="img" aria-label="Sample stock volume and consumption trend over the last six months">
              <div className={styles.chartYLabels}><span>10k</span><span>7.5k</span><span>5k</span><span>2.5k</span><span>0</span></div>
              <svg viewBox="0 0 720 215" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="stockFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b6be8" stopOpacity=".19"/><stop offset="100%" stopColor="#8b6be8" stopOpacity="0"/></linearGradient></defs><path className={styles.gridLines} d="M0 20H720M0 62H720M0 104H720M0 146H720M0 188H720"/><path className={styles.stockArea} d="M0 129 C35 118 55 112 83 102 S130 116 165 97 S215 74 248 91 S299 126 331 105 S382 67 414 78 S466 101 497 82 S545 43 579 56 S633 93 662 70 S696 47 720 59 L720 188H0Z"/><path className={styles.stockLine} d="M0 129 C35 118 55 112 83 102 S130 116 165 97 S215 74 248 91 S299 126 331 105 S382 67 414 78 S466 101 497 82 S545 43 579 56 S633 93 662 70 S696 47 720 59"/><path className={styles.consumptionLine} d="M0 158 C42 145 60 154 92 139 S145 144 177 126 S220 112 252 121 S303 144 334 133 S384 102 417 115 S467 128 500 117 S550 83 584 98 S634 122 664 105 S698 90 720 99"/><circle cx="579" cy="56" r="5" className={styles.chartDot}/></svg>
              <div className={styles.chartXLabels}><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span></div>
            </div>
          </section>
          <section className={`${styles.panel} ${styles.tagPanel}`}>
            <div className={styles.sectionTitle}><div><span className={styles.eyebrow}>CATALOGUE SNAPSHOT</span><h2>Custom tags &amp; labels</h2><p>Quickly review priority groups.</p></div><button type="button" className={styles.smallAction}>＋ Add tag</button></div>
            <div className={styles.tagChips}><button className={styles.tagSelected} type="button">Fast moving <b>12</b></button><button type="button">Discounted <b>8</b></button><button type="button">Low demand <b>6</b></button><button type="button">New arrivals <b>14</b></button></div>
            <div className={styles.miniTableWrap}><table className={styles.miniTable}><thead><tr><th>PRODUCT</th><th>ON HAND</th><th>IN TRANSIT</th><th>PRICE</th></tr></thead><tbody>{productRows.slice(0, 4).map((product) => <tr key={product.sku}><td><span className={styles.miniProduct}><i>{product.name.slice(0, 1)}</i><span><strong>{product.name}</strong><small>{product.sku}</small></span></span></td><td>{product.available}</td><td>{product.inTransit}</td><td>{money(product.price)}</td></tr>)}</tbody></table></div>
            <a href="#product-catalogue" className={styles.textLink}>View product catalogue <span>→</span></a>
          </section>
        </div>

        <div className={styles.insightGrid}>
          <section className={`${styles.panel} ${styles.orderPanel}`}><div className={styles.sectionTitle}><div><span className={styles.eyebrow}>RECENT ACTIVITY</span><h2>Sales &amp; orders</h2><p>Latest demo activity from your stores.</p></div><button type="button" className={styles.iconAction} aria-label="Search orders"><Icon name="search" size={16}/></button></div><div className={styles.orderRows}><div><i className={styles.orderThumb}>AR</i><span><strong>Arabica Ground Coffee</strong><small>Order #PR-8042 · 12 min ago</small></span><b>−4 <em>units</em></b></div><div><i className={styles.orderThumb}>AO</i><span><strong>Almond Oat Drink</strong><small>Order #PR-8038 · 38 min ago</small></span><b>−2 <em>units</em></b></div><div><i className={styles.orderThumb}>DT</i><span><strong>Daily Moisture Lotion</strong><small>Order #PR-8031 · 1 hr ago</small></span><b>−1 <em>unit</em></b></div></div><a href="/" className={styles.textLink}>Open POS terminal <span>→</span></a></section>
          <section className={`${styles.panel} ${styles.restockPanel}`}><div className={styles.sectionTitle}><div><span className={styles.eyebrow}>SUGGESTED ACTION</span><h2>Restock recommendation</h2><p>Based on current stock and sample sales.</p></div><span className={styles.aiMark}>✦</span></div><div className={styles.restockMetric}><strong>120 <small>units</small></strong><span>Suggested to replenish</span></div><div className={styles.sparkline}><svg viewBox="0 0 300 78" preserveAspectRatio="none" aria-hidden="true"><path d="M0 62 C30 55 42 36 71 43 S108 60 136 39 S177 47 205 27 S246 39 270 13 S290 20 300 6"/><circle cx="300" cy="6" r="4"/></svg></div><div className={styles.restockFoot}><span><i/> Demand is trending up</span><a href="/operations">Review plan →</a></div></section>
          <section className={`${styles.panel} ${styles.transitPanel}`}><div className={styles.sectionTitle}><div><span className={styles.eyebrow}>INBOUND STOCK</span><h2>Still in transit</h2><p>Transfers awaiting store receipt.</p></div><span className={styles.transitCount}>{visibleReorders.length + 2}</span></div><div className={styles.transitRows}>{visibleReorders.slice(0, 3).map((item, index) => <div key={item.sku}><i className={styles.transitThumb}>{item.initials}</i><span><strong>{item.name}</strong><small>{item.sku} · {index + 2} days</small></span><a href="/operations" aria-label={`View transfer for ${item.name}`}>View</a></div>)}</div><a href="/operations" className={styles.textLink}>See all transfers <span>→</span></a></section>
        </div>

        <section className={styles.productsPanel} id="product-catalogue">
          <div className={styles.tableHeader}><div><span className={styles.eyebrow}>PRODUCT CATALOGUE</span><h2>Products <span className={styles.countPill}>{visibleProducts.length} shown</span></h2><p>Product and variant stock for the selected view.</p></div><button type="button" className={styles.addButton} onClick={() => window.location.assign('/operations')}><Icon name="plus" size={15}/> Add product</button></div>
          <div className={styles.toolbar}>
            <label className={styles.search}><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, or variant"/></label>
            <label className={styles.selectControl}><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className={styles.filterTabs} aria-label="Filter stock status">{(['All', 'Low stock', 'Negative'] as const).map((item) => <button type="button" key={item} className={statusFilter === item ? styles.selectedTab : ''} onClick={() => setStatusFilter(item)}>{item}</button>)}</div>
          </div>
          <div className={styles.tableScroll}><table className={styles.productTable}><thead><tr><th>PRODUCT</th><th>SKU / CATEGORY</th><th>LOCATION</th><th>SELLING PRICE</th><th>AVAILABLE</th><th>IN TRANSIT</th><th>STATUS</th></tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.sku}><td><span className={styles.productCell}><i className={styles.productThumb}>{product.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</i><span><strong>{product.name}</strong><small>{product.variant}</small></span></span></td><td><span className={styles.sku}>{product.sku}</span><small className={styles.category}>{product.category}</small></td><td>{product.location}</td><td className={styles.price}>{money(product.price)}</td><td><strong className={product.available < 10 ? styles.lowQuantity : ''}>{formatStock(product.available, product.unit, product.cartonSize)}</strong><small className={styles.baseUnits}>{product.available} base units</small></td><td>{formatStock(product.inTransit, product.unit, product.cartonSize)}<small className={styles.baseUnits}>{product.inTransit} base units</small></td><td><span className={`${styles.stockBadge} ${product.state === 'Healthy' ? styles.healthy : product.state === 'Low stock' ? styles.low : styles.negative}`}>{product.state === 'Negative' ? 'Negative stock' : product.state}</span></td></tr>)}</tbody></table>{visibleProducts.length === 0 && <div className={styles.emptyState}>No products match these filters.</div>}</div>
          <div className={styles.tableFooter}><span>Showing <strong>{visibleProducts.length}</strong> demo products · Stock figures are base-unit ledger totals</span><span className={styles.demoFootnote}><i/> SAMPLE DATA · NOT LIVE</span></div>
        </section>
        <footer className={styles.footer}><span>© 2026 Premium Retail</span><span>Demo catalogue · mock data only · not connected to live records</span><a href="/operations">Open operations test bench →</a></footer>
      </div>
    </section>
  </main>;
}
