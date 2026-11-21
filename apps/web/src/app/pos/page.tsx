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

// Demo products (in real app, this would come from API)
const DEMO_PRODUCTS: Product[] = [
  { sku: 'BEV-1048', name: 'Premium Arabica Coffee', variant: 'Medium roast - 250g', price: 299, available: 27, barcode: '8901234567890', category: 'Beverages' },
  { sku: 'BEV-1056', name: 'Green Tea Bags', variant: 'Lemon Mint - 25 bags', price: 180, available: 8, barcode: '8901234567906', category: 'Beverages' },
  { sku: 'PC-2031', name: 'Herbal Shampoo', variant: 'Aloe vera - 500ml', price: 145, available: 0, barcode: '8901234567913', category: 'Personal care' },
  { sku: 'SNK-4172', name: 'Potato Chips', variant: 'Classic salted - 52g', price: 40, available: 9, barcode: '8901234567937', category: 'Snacks' },
  { sku: 'PAN-5012', name: 'Basmati Royal Rice', variant: 'Long Grain - 5kg', price: 750, available: 64, barcode: '8901234567944', category: 'Pantry' },
  { sku: 'PAN-5020', name: 'Olive Oil Extra Virgin', variant: 'Cold Pressed - 1L', price: 890, available: 4, barcode: '8901234567968', category: 'Pantry' },
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
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2m0 6v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
    shoppingCart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>,
    rupee: <path d="M6 3h12M6 8h12m-9 13V8c4 0 5.333-2 4-6m0 11c1.333 2 5 2 9 0" />,
    creditCard: <><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></>,
    smartphone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10zM2 12h20" /></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><path d="M14 8H8M16 12H8M13 16H8" /></>,
    percent: <><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [amountReceived, setAmountReceived] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountAmount = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
  const total = Math.max(0, subtotal - discountAmount);
  const receivedAmount = parseFloat(amountReceived) || 0;
  const changeAmount = Math.max(0, receivedAmount - total);

  // Search products
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return DEMO_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.variant.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [search]);

  // Add to cart
  const addToCart = (product: Product) => {
    if (product.available <= 0) {
      setError(`${product.name} is out of stock`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.sku === product.sku);
      if (existing) {
        if (existing.quantity >= product.available) {
          setError(`Only ${product.available} units available`);
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
    setSearch('');
    setError('');
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

  // Remove from cart
  const removeFromCart = (sku: string) => {
    setCart((prev) => prev.filter((item) => item.sku !== sku));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscount(0);
    setSelectedPayment('');
    setAmountReceived('');
    setShowPayment(false);
  };

  // Process payment
  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) {
      setError('Please select a payment method');
      return;
    }
    if (selectedPayment === 'cash' && receivedAmount < total) {
      setError('Amount received is less than total');
      return;
    }

    setProcessing(true);
    // Simulate API call
    setTimeout(() => {
      const invoiceNum = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
      setNotice(`✓ Sale completed! Invoice: ${invoiceNum}`);
      clearCart();
      setProcessing(false);
      setError('');
    }, 800);
  };

  // Auto-hide notices
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Point of Sale</h1>
          <p>Scan or search products, build the cart, and checkout quickly.</p>
        </div>
        <div className={styles.headerStats}>
          <span className={styles.stat}>
            <Icon name="shoppingCart" size={16} />
            <strong>{cart.length}</strong> items
          </span>
          <span className={styles.stat}>
            <Icon name="rupee" size={16} />
            <strong>₹{total.toFixed(2)}</strong>
          </span>
        </div>
      </header>

      {notice && (
        <div className={styles.notice} role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <div className={styles.layout}>
        {/* Left: Product search + Cart */}
        <div className={styles.main}>
          {/* Search */}
          <div className={styles.searchCard}>
            <label className={styles.searchBar}>
              <Icon name="search" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan barcode or search product name, SKU..."
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear">
                  <Icon name="x" size={14} />
                </button>
              )}
            </label>

            {searchResults.length > 0 && (
              <div className={styles.results}>
                {searchResults.map((product) => (
                  <button
                    key={product.sku}
                    type="button"
                    className={styles.resultItem}
                    onClick={() => addToCart(product)}
                    disabled={product.available <= 0}
                  >
                    <div className={styles.resultInfo}>
                      <strong>{product.name}</strong>
                      <small>{product.variant} · {product.sku}</small>
                    </div>
                    <div className={styles.resultMeta}>
                      <span className={styles.price}>₹{product.price.toFixed(2)}</span>
                      <span className={product.available > 0 ? styles.stock : styles.stockOut}>
                        {product.available > 0 ? `${product.available} in stock` : 'Out of stock'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className={styles.cartCard}>
            <div className={styles.cartHeader}>
              <h2>
                <Icon name="shoppingCart" size={18} />
                Shopping Cart ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button type="button" className={styles.clearBtn} onClick={clearCart}>
                  <Icon name="trash" size={14} />
                  Clear all
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className={styles.emptyCart}>
                <Icon name="shoppingCart" size={48} />
                <p>Cart is empty</p>
                <small>Search and add products to start a sale</small>
              </div>
            ) : (
              <div className={styles.cartItems}>
                {cart.map((item) => (
                  <div key={item.sku} className={styles.cartItem}>
                    <div className={styles.itemInfo}>
                      <strong>{item.name}</strong>
                      <small>{item.variant}</small>
                      <span className={styles.itemSku}>{item.sku}</span>
                    </div>
                    <div className={styles.itemActions}>
                      <div className={styles.qtyControl}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.sku, -1)}
                          aria-label="Decrease quantity"
                        >
                          <Icon name="minus" size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.sku, 1)}
                          aria-label="Increase quantity"
                          disabled={item.quantity >= item.available}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                      <div className={styles.itemPrice}>
                        <small>₹{item.price.toFixed(2)} each</small>
                        <strong>₹{item.lineTotal.toFixed(2)}</strong>
                      </div>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => removeFromCart(item.sku)}
                        aria-label="Remove item"
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Checkout panel */}
        <aside className={styles.sidebar}>
          <div className={styles.checkoutCard}>
            <h2>
              <Icon name="receipt" size={18} />
              Checkout
            </h2>

            {/* Customer (optional) */}
            <div className={styles.section}>
              <label className={styles.label}>
                <Icon name="user" size={14} />
                Customer (optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                className={styles.input}
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone number"
                className={styles.input}
              />
            </div>

            {/* Discount */}
            <div className={styles.section}>
              <label className={styles.label}>
                <Icon name="percent" size={14} />
                Discount
              </label>
              <div className={styles.discountRow}>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className={styles.input}
                  min="0"
                />
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percent' | 'amount')}
                  className={styles.select}
                >
                  <option value="percent">%</option>
                  <option value="amount">₹</option>
                </select>
              </div>
            </div>

            {/* Totals */}
            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className={`${styles.totalRow} ${styles.discount}`}>
                  <span>Discount</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.totalFinal}`}>
                <strong>Total</strong>
                <strong>₹{total.toFixed(2)}</strong>
              </div>
            </div>

            {/* Payment method */}
            {!showPayment ? (
              <button
                type="button"
                className={styles.proceedBtn}
                onClick={() => setShowPayment(true)}
                disabled={cart.length === 0}
              >
                Proceed to Payment
              </button>
            ) : (
              <form onSubmit={handleCheckout} className={styles.paymentForm}>
                <label className={styles.label}>Payment Method</label>
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
                  <div className={styles.cashSection}>
                    <label className={styles.label}>Amount Received</label>
                    <input
                      type="number"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="0.00"
                      className={styles.input}
                      min="0"
                      step="0.01"
                      autoFocus
                    />
                    {receivedAmount >= total && (
                      <div className={styles.change}>
                        <span>Change to return:</span>
                        <strong>₹{changeAmount.toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => setShowPayment(false)}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className={styles.completeBtn}
                    disabled={processing || !selectedPayment}
                  >
                    {processing ? 'Processing...' : 'Complete Sale'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
