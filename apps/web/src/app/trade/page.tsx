'use client';

import { useAccess } from '@/lib/permissions';
import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { getStoredSession } from '@/lib/auth';
import { tradeRequest } from './trade-api';
import styles from '../staff-records/records.module.css';
import { StockIntake, type StockLocation, type StockVariant } from '../products/stock-intake';
import { PurchaseOrders, type Order } from './purchase-orders';
import { CustomerCredit } from './customer-credit';

export const dynamic = 'force-static';
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export default function TradePage() {
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [catalogue, setCatalogue] = useState<StockVariant[]>([]);
  const [locationId, setLocationId] = useState('');
  const [tab, setTab] = useState<'orders' | 'credit'>('orders');
  const [receiving, setReceiving] = useState<Order | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const { can } = useAccess(token);
  const canCredit = can('customers.credit', ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'].includes(role));
  const canOrder = can('purchasing.orders', ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'INVENTORY'].includes(role));
  const canPay = can('purchasing.payments', ['SUPER_ADMIN', 'ADMIN'].includes(role));
  const location = locations.find((value) => value.id === locationId);
  const filteredLocations = tab === 'credit' ? locations.filter((value) => value.type === 'RETAIL_STORE') : locations;

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.accessToken) {
      setError('Sign in again to view purchasing and customer credit.');
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    type Catalogue = { name: string; unitsPerCarton: number | null; variants: Array<{ id: string; sku: string; name: string; isActive: boolean }> };
    void Promise.all([
      tradeRequest<StockLocation[]>('/locations', session.accessToken, controller.signal),
      tradeRequest<Catalogue[]>('/products?isActive=true', session.accessToken, controller.signal),
    ]).then(([locations, products]) => {
      setLocations(locations);
      setLocationId(locations[0]?.id ?? '');
      setCatalogue(products.flatMap((product) => product.variants.filter((variant) => variant.isActive).map((variant) => ({
        variantId: variant.id, sku: variant.sku, name: product.name, variant: variant.name, unitsPerCarton: product.unitsPerCarton ?? 1,
      }))));
      setToken(session.accessToken);
      setRole(session.user.role);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (role && canCredit && !canOrder && !canPay && tab !== 'credit') setMode('credit');
  }, [role, canCredit, canOrder, canPay, tab]);

  function setMode(next: 'orders' | 'credit') {
    setTab(next);
    setNotice('');
    if (next === 'credit' && location?.type !== 'RETAIL_STORE') {
      setLocationId(locations.find((value) => value.type === 'RETAIL_STORE')?.id ?? '');
    }
  }

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}><div><h1>{canCredit ? 'Purchasing & customer credit' : 'Purchasing'}</h1>
      <p className={styles.muted}>Track orders, receiving, and account activity by location.</p></div></header>
    <div className={styles.fields}>
      <label>Location<select aria-label="Location" value={locationId} disabled={!!receiving} onChange={(e) => { setLocationId(e.target.value); setNotice(''); }}>
        {!filteredLocations.length && <option value="">No locations available</option>}
        {filteredLocations.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
      </select></label>
      {canCredit && (canOrder || canPay) && <div className={styles.fields} role="group" aria-label="Workspace">
        <button type="button" className={tab === 'orders' ? 'admin-primary' : 'admin-secondary'} aria-pressed={tab === 'orders'} onClick={() => setMode('orders')}>Purchase orders</button>
        <button type="button" className={tab === 'credit' ? 'admin-primary' : 'admin-secondary'} aria-pressed={tab === 'credit'} onClick={() => setMode('credit')}>Customer credit</button>
      </div>}
    </div>
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {error && <Feedback tone="error">{error}</Feedback>}
    {loading && <p role="status">Loading locations and products…</p>}
    {token && location && tab === 'orders' && (canOrder || canPay) && <PurchaseOrders key={locationId} token={token} locationId={locationId} catalogue={catalogue}
      canPay={canPay} canOrder={canOrder} reload={reload} onReceive={setReceiving} />}
    {token && location?.type === 'RETAIL_STORE' && canCredit && tab === 'credit' && <CustomerCredit key={locationId} token={token} locationId={locationId} />}
    {location && receiving && <StockIntake mode="supplier" apiBase={API} token={token} locations={[location]} initialLocation={location.name}
      variants={catalogue.filter((variant) => receiving.lines.some((line) => line.variantId === variant.variantId && receiving.receipts.flatMap((receipt) => receipt.lines).filter((item) => item.variantId === line.variantId).reduce((sum, item) => sum + item.quantityBaseUnits, 0) < line.quantity))}
      purchaseOrder={receiving} onCancel={() => setReceiving(null)}
      onSaved={(message) => { setReceiving(null); setNotice(message); setReload((value) => value + 1); }} />}
  </main>;
}
