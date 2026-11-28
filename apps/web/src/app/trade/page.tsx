'use client';

import { useAccess } from '@/lib/permissions';
import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { getStoredSession } from '@/lib/auth';
import { tradeRequest } from './trade-api';
import styles from './trade.module.css';
import { CreditCard, PackageCheck, ShoppingBag } from 'lucide-react';
import { LOCATION_KEY } from '@/components/layout/nav-data';
import { StockIntake, type StockLocation, type StockVariant } from '../products/stock-intake';
import { PurchaseOrders } from './purchase-orders';
import type { Order } from './purchase-data';
import { GoodsReceipts } from './goods-receipts';
import { CustomerCredit } from './customer-credit';

export const dynamic = 'force-static';
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export default function TradePage() {
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [catalogue, setCatalogue] = useState<StockVariant[]>([]);
  const [locationId, setLocationId] = useState('');
  const [tab, setTab] = useState<'orders' | 'receipts' | 'credit'>('orders');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiving, setReceiving] = useState<Order | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [catalogueError, setCatalogueError] = useState('');
  const [retryCatalogue, setRetryCatalogue] = useState(0);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const { can, loading: accessLoading } = useAccess(token);
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
    void tradeRequest<StockLocation[]>('/locations', session.accessToken, controller.signal).then((locations) => {
      setLocations(locations);
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('locationId');
      const workspace = window.localStorage.getItem(LOCATION_KEY);
      setLocationId(locations.find((location) => location.id === requested)?.id
        ?? locations.find((location) => location.id === workspace || location.name === workspace)?.id
        ?? locations[0]?.id ?? '');
      if (params.get('tab') === 'receipts') {
        setTab('receipts');
        setReceiptSearch((params.get('receipt') ?? '').slice(0, 100));
      }
      setToken(session.accessToken);
      setRole(session.user.role);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!token || accessLoading || !canOrder) return;
    const controller = new AbortController();
    setCatalogueError('');
    void tradeRequest<StockVariant[]>('/trade/catalog', token, controller.signal)
      .then((products) => { if (!controller.signal.aborted) setCatalogue(products); })
      .catch(() => { if (!controller.signal.aborted) setCatalogueError('Purchase order products could not be loaded.'); });
    return () => controller.abort();
  }, [token, accessLoading, canOrder, retryCatalogue]);

  useEffect(() => {
    if (role && canCredit && !canOrder && !canPay && tab !== 'credit') setMode('credit');
  }, [role, canCredit, canOrder, canPay, tab]);

  function setMode(next: 'orders' | 'receipts' | 'credit') {
    setTab(next);
    setNotice('');
    if (next === 'credit' && location?.type !== 'RETAIL_STORE') {
      setLocationId(locations.find((value) => value.type === 'RETAIL_STORE')?.id ?? '');
    }
  }

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.heading}>
      <h1>{canCredit ? 'Purchasing & customer credit' : 'Purchasing'}</h1>
      <p>Manage purchase orders, deliveries, and account activity by location.</p>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.views} role="group" aria-label="Purchasing and credit views">
        {(canOrder || canPay) && <>
          <button type="button" aria-pressed={tab === 'orders'} onClick={() => setMode('orders')}><ShoppingBag size={17} aria-hidden="true" /> Purchase orders</button>
          <button type="button" aria-pressed={tab === 'receipts'} onClick={() => setMode('receipts')}><PackageCheck size={17} aria-hidden="true" /> Goods receipts</button>
        </>}
        {canCredit && <button type="button" aria-pressed={tab === 'credit'} onClick={() => setMode('credit')}><CreditCard size={17} aria-hidden="true" /> Customer credit</button>}
      </div>
      <label className={styles.field}>Location<select aria-label="Location" value={locationId} disabled={!!receiving} onChange={(event) => { setLocationId(event.target.value); setNotice(''); }}>
        {!filteredLocations.length && <option value="">No locations available</option>}
        {filteredLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select></label>
    </div>
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {error && <Feedback tone="error">{error}</Feedback>}
    {loading && <p role="status">Loading purchasing locations…</p>}
    {tab === 'orders' && canOrder && catalogueError && <Feedback tone="error" action={
      <button type="button" className="admin-secondary" onClick={() => setRetryCatalogue((value) => value + 1)}>Retry</button>
    }>{catalogueError}</Feedback>}
    {token && location && tab === 'orders' && (canOrder || canPay) && <PurchaseOrders key={locationId} token={token} locationId={locationId} locationName={location.name} catalogue={catalogue}
      canPay={canPay} canOrder={canOrder} reload={reload} onReceive={setReceiving} />}
    {token && location && tab === 'receipts' && (canOrder || canPay) && <GoodsReceipts key={locationId} token={token} locationId={locationId} initialSearch={receiptSearch} />}
    {token && location?.type === 'RETAIL_STORE' && canCredit && tab === 'credit' && <CustomerCredit key={locationId} token={token} locationId={locationId} />}
    {location && receiving && <StockIntake mode="supplier" apiBase={API} token={token} locations={[location]} initialLocation={location.name}
      variants={catalogue}
      purchaseOrder={receiving} onCancel={() => setReceiving(null)}
      onSaved={(message) => { setReceiving(null); setNotice(message); setReload((value) => value + 1); }} />}
  </main>;
}
