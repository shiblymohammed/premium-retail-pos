'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import styles from './pos.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

interface Product {
  sku: string;
  name: string;
  variant: string;
  price: number;
  available: number;
  barcode: string;
  category: string;
  image?: string;
}

interface CartItem extends Product {
  quantity: number;
  lineTotal: number;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
}

const CATEGORIES = ['All Categories', 'Beverages', 'Snacks', 'Personal Care', 'Pantry', 'Bakery', 'Home Care'];

// Demo products (in real app, this would come from API)
const DEMO_PRODUCTS: Product[] = [
  { sku: 'BEV-1048', name: 'Aqua Pure Water', variant: '1 Ltr', price: 45, available: 27, barcode: '8901234567890', category: 'Beverages' },
  { sku: 'BEV-1056', name: 'Fresh Juice', variant: '200 ml', price: 20, available: 50, barcode: '8901234567906', category: 'Beverages' },
  { sku: 'BEV-1062', name: 'Green Tea', variant: '25 bags', price: 60, available: 12, barcode: '8901234567951', category: 'Beverages' },
  { sku: 'BEV-1070', name: 'Fresh Milk', variant: '1 Ltr', price: 55, available: 30, barcode: '8901234567982', category: 'Beverages' },
  { sku: 'SNK-4172', name: 'Potato Chips', variant: '50 gm', price: 30, available: 14, barcode: '8901234567937', category: 'Snacks' },
  { sku: 'SNK-4180', name: 'Marie Biscuits', variant: '200 gm', price: 35, available: 32, barcode: '8901234567945', category: 'Snacks' },
  { sku: 'PC-2031', name: 'Bath Soap', variant: '100 gm', price: 25, available: 40, barcode: '8901234567913', category: 'Personal Care' },
  { sku: 'PAN-5012', name: 'Bread Loaf', variant: '400 gm', price: 45, available: 18, barcode: '8901234567944', category: 'Bakery' },
  { sku: 'HC-3040', name: 'Detergent Powder', variant: '1 kg', price: 120, available: 25, barcode: '8901234567999', category: 'Home Care' },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', icon: 'rupee' },
  { id: 'card', name: 'Card', icon: 'creditCard' },
  { id: 'upi', name: 'UPI', icon: 'smartphone' },
  { id: 'online', name: 'Online', icon: 'globe' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    barcode: <><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14" /></>,
    shoppingCart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    rupee: <path d="M6 3h12M6 8h12m-9 13V8c4 0 5.333-2 4-6m0 11c1.333 2 5 2 9 0" />,
    creditCard: <><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></>,
    smartphone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10zM2 12h20" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M14 8H8M16 12H8M13 16H8" /></>,
    percent: <><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
    catalog: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    store: <><path d="M3 21h18M4 18h16M6 18V9.5M18 18V9.5M2 9l1.5-5h17L22 9" /><circle cx="12" cy="13" r="2" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [amountReceived, setAmountReceived] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [notice, setNotice] = useState('');
  const [processing, setProcessing] = useState(false);

  // Current time display
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountAmount = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
  const total = Math.max(0, subtotal - discountAmount);
  const receivedAmount = parseFloat(amountReceived) || 0;
  const changeAmount = Math.max(0, receivedAmount - total);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = DEMO_PRODUCTS;
    if (selectedCategory !== 'All Categories') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    }
    return filtered;
  }, [selectedCategory, searchQuery]);

  // Add to cart
  const addToCart = (product: Product) => {
    if (product.available <= 0) {
      setNotice(`${product.name} is out of stock`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.sku === product.sku);
      if (existing) {
        if (existing.quantity >= product.available) {
          setNotice(`Only ${product.available} units available`);
          return prev;
        }
        return prev.map((item) =>
          item.sku === product.sku
            ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * item.price }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, lineTotal: product.price }];
    });
  };

  // Update quantity
  const updateQuantity = (sku: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.sku !== sku) return item;
          const newQty = Math.max(0, Math.min(item.available, item.quantity + delta));
          return { ...item, quantity: newQty, lineTotal: newQty * item.price };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setSelectedPayment('');
    setAmountReceived('');
    setShowPayment(false);
  };

  // Process payment
  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) {
      setNotice('Please select a payment method');
      return;
    }
    if (selectedPayment === 'cash' && receivedAmount < total) {
      setNotice('Amount received is less than total');
      return;
    }

    setProcessing(true);
    setTimeout(() => {
      const invoiceNum = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
      setNotice(`✓ Sale completed! Invoice: ${invoiceNum}`);
      clearCart();
      setProcessing(false);
    }, 800);
  };

  // Auto-hide notices
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 3500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  return (
    <div className={styles.page}>
      {/* Top Header Bar */}
      <header className={styles.topBar}>
        <div className={styles.posInfo}>
          <div className={styles.posAvatar}>P</div>
          <div className={styles.posDetails}>
            <h1>POS Terminal</h1>
            <p>Retail Store Downtown - Lane POS-101</p>
          </div>
        </div>
        
        <div className={styles.topBarActions}>
          <span className={styles.statusBadge}>
            <span className={styles.onlineDot}></span>
            Online
          </span>
          <button type="button" className={styles.catalogBtn}>
            <Icon name="catalog" size={16} />
            Demo Catalogue
          </button>
          <div className={styles.dateTime}>
            <Icon name="calendar" size={14} />
            <div>
              <div className={styles.date}>{currentTime.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div className={styles.time}>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className={styles.searchSection}>
        <div className={styles.searchWrapper}>
          <Icon name="barcode" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Scan barcode or search product / SKU..."
            className={styles.searchInput}
          />
          <button type="button" className={styles.enterBtn}>
            Enter ↵
          </button>
        </div>
      </div>

      {notice && (
        <div className={styles.notice} role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
        </div>
      )}

      <div className={styles.mainLayout}>
        {/* Left: Products Section */}
        <div className={styles.productsSection}>
          <div className={styles.productsHeader}>
            <div className={styles.productsTitle}>
              <span className={styles.salesFloorTag}>SALES FLOOR</span>
              <h2>Products ({filteredProducts.length})</h2>
            </div>
            <div className={styles.productsActions}>
              <button type="button" className={styles.useCatalogBtn}>
                <Icon name="catalog" size={14} />
                Use Item Catalogue
              </button>
              <span className={styles.divider}>Sort:</span>
              <select className={styles.sortSelect}>
                <option>Product Name</option>
                <option>Price</option>
                <option>Stock</option>
              </select>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={viewMode === 'grid' ? styles.viewActive : ''}
                  onClick={() => setViewMode('grid')}
                >
                  <Icon name="grid" size={16} />
                </button>
                <button
                  type="button"
                  className={viewMode === 'list' ? styles.viewActive : ''}
                  onClick={() => setViewMode('list')}
                >
                  <Icon name="list" size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className={styles.categoryTabs}>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? styles.categoryActive : ''}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className={styles.productGrid}>
            {filteredProducts.map((product) => {
              const inCart = cart.find(item => item.sku === product.sku);
              return (
                <button
                  key={product.sku}
                  type="button"
                  className={styles.productCard}
                  onClick={() => addToCart(product)}
                  disabled={product.available <= 0}
                >
                  <div className={styles.productImage}>
                    {product.category[0]}
                  </div>
                  <div className={styles.productInfo}>
                    <span className={styles.productCategory}>{product.category}</span>
                    <h3>{product.name}</h3>
                    <p>{product.variant}</p>
                    <div className={styles.productFooter}>
                      <strong className={styles.productPrice}>₹{product.price.toFixed(2)}</strong>
                      <span className={product.available > 0 ? styles.stockBadge : styles.stockOutBadge}>
                        {product.available > 0 ? `${product.available} in stock` : 'Out of stock'}
                      </span>
                    </div>
                  </div>
                  {!inCart ? (
                    <button type="button" className={styles.addBtn} onClick={() => addToCart(product)}>
                      <Icon name="plus" size={16} />
                    </button>
                  ) : (
                    <span className={styles.inCartBadge}>{inCart.quantity}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Cart Sidebar */}
        <aside className={styles.cartSidebar}>
          <div className={styles.cartHeader}>
            <h2>Current Sale</h2>
            <button type="button" className={styles.clearCartBtn} onClick={clearCart}>
              <Icon name="trash" size={14} />
              Clear Cart
            </button>
          </div>

          {cart.length === 0 ? (
            <div className={styles.emptyCart}>
              <Icon name="shoppingCart" size={64} />
              <h3>Your basket is empty</h3>
              <p>Scan an item or choose a product to get started.</p>
            </div>
          ) : (
            <>
              <div className={styles.cartItems}>
                {cart.map((item) => (
                  <div key={item.sku} className={styles.cartItem}>
                    <div className={styles.cartItemInfo}>
                      <h4>{item.name}</h4>
                      <p>{item.variant}</p>
                      <span className={styles.cartItemPrice}>₹{item.price.toFixed(2)} each</span>
                    </div>
                    <div className={styles.cartItemActions}>
                      <div className={styles.qtyControl}>
                        <button type="button" onClick={() => updateQuantity(item.sku, -1)}>
                          <Icon name="minus" size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.sku, 1)} disabled={item.quantity >= item.available}>
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      <strong className={styles.cartItemTotal}>₹{item.lineTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.cartSummary}>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <div className={styles.discountInput}>
                    <Icon name="percent" size={14} />
                    <span>Discount</span>
                  </div>
                  <div className={styles.discountControls}>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0"
                      min="0"
                    />
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as 'percent' | 'amount')}
                    >
                      <option value="percent">%</option>
                      <option value="amount">₹</option>
                    </select>
                  </div>
                </div>
                {discount > 0 && (
                  <div className={`${styles.summaryRow} ${styles.discountAmount}`}>
                    <span></span>
                    <span>-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                  <strong>Total Due</strong>
                  <strong>₹{total.toFixed(2)}</strong>
                </div>
              </div>

              {!showPayment ? (
                <button type="button" className={styles.proceedBtn} onClick={() => setShowPayment(true)}>
                  <Icon name="creditCard" size={18} />
                  Proceed to Payment →
                </button>
              ) : (
                <div className={styles.paymentSection}>
                  <div className={styles.paymentGrid}>
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        className={`${styles.paymentBtn} ${selectedPayment === method.id ? styles.paymentActive : ''}`}
                        onClick={() => setSelectedPayment(method.id)}
                      >
                        <Icon name={method.icon} size={20} />
                        <span>{method.name}</span>
                      </button>
                    ))}
                  </div>

                  {selectedPayment === 'cash' && (
                    <div className={styles.cashInput}>
                      <label>Amount Received</label>
                      <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        autoFocus
                      />
                      {receivedAmount >= total && (
                        <div className={styles.change}>
                          <span>Change:</span>
                          <strong>₹{changeAmount.toFixed(2)}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.completeBtn}
                    onClick={handleCheckout}
                    disabled={processing || !selectedPayment}
                  >
                    {processing ? 'Processing...' : 'Complete Sale'}
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
