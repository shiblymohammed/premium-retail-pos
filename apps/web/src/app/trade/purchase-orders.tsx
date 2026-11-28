'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { money } from '../staff-records/records-api';
import type { StockVariant } from '../products/stock-intake';
import styles from '../staff-records/records.module.css';
import { tradeRequest } from './trade-api';
import { AdminModal } from '@/components/admin';
import { PackageCheck, Plus } from 'lucide-react';
import { receivedQuantities, type Order } from './purchase-data';
import tradeStyles from './trade.module.css';

type DraftLine = { item: StockVariant; quantity: string; unit: 'individual' | 'carton'; unitCost: string };
const MAX_QUANTITY = 2147483647;
const baseQuantity = (line: DraftLine) => Number(line.quantity) * (line.unit === 'carton' ? line.item.unitsPerCarton : 1);
export function PurchaseOrders({ token, locationId, locationName, catalogue, canPay, canOrder, reload, onReceive }: {
  token: string; locationId: string; locationName: string; catalogue: StockVariant[]; canPay: boolean; canOrder: boolean; reload: number; onReceive: (order: Order) => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [product, setProduct] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [serial, setSerial] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const order = orders.find((row) => row.id === selected);
  const nextProduct = catalogue.find((item) => item.variantId === product);

  function updateLine(variantId: string, change: Partial<Omit<DraftLine, 'item'>>) {
    setLines((values) => values.map((line) => line.item.variantId === variantId ? { ...line, ...change } : line));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void tradeRequest<Order[]>(`/trade/orders?locationId=${encodeURIComponent(locationId)}`, token, controller.signal)
      .then((rows) => { setOrders(rows); setSelected((value) => rows.some((row) => row.id === value) ? value : rows[0]?.id ?? ''); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, locationId, reload, serial]);

  async function submit(event: FormEvent, payment?: Order) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (payment) {
        await tradeRequest(`/trade/orders/${payment.id}/payments`, token, undefined, { amount, reference });
        setAmount(''); setReference('');
      } else {
        const saved = await tradeRequest<Order>('/trade/orders', token, undefined, {
          locationId, number, supplierName, lines: lines.map((line) => ({
            variantId: line.item.variantId, unitCost: line.unitCost, quantity: baseQuantity(line),
          })),
        });
        setOrders((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
        setSelected(saved.id); setOrderSearch('');
        setCreateOpen(false); setNumber(''); setSupplierName(''); setLines([]);
      }
      setSerial((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the purchase record.');
    } finally { setBusy(false); }
  }

  const matchingOrders = orders.filter((item) => `${item.number} ${item.supplierName}`.toLowerCase().includes(orderSearch.trim().toLowerCase()));
  const arrived = receivedQuantities(order);
  const awaitingGoods = order?.lines.some((line) => line.quantity > (arrived.get(line.variantId) ?? 0));
  const receivedCents = order?.lines.reduce((total, line) => total + (arrived.get(line.variantId) ?? 0) * Math.round(Number(line.unitCost) * 100), 0) ?? 0;
  const paidCents = order?.payments.reduce((total, payment) => total + Math.round(Number(payment.amount) * 100), 0) ?? 0;

  return <section className={styles.panel}>
    <header className={tradeStyles.sectionHeader}><h2>Purchase orders</h2>
      {canOrder && <button type="button" className="admin-primary" disabled={busy || !catalogue.length} onClick={() => { setError(''); setCreateOpen(true); }}><Plus size={16} aria-hidden="true" /> New purchase order</button>}
    </header>
    {error && !createOpen && <Feedback tone="error">{error}</Feedback>}
    {createOpen && <AdminModal isOpen title="New purchase order" subtitle={locationName} maxWidth="720px"
      onClose={() => { if (!busy) setCreateOpen(false); }}
      footer={<>
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</button>
        <button type="submit" form="purchase-order-form" className="admin-primary" disabled={busy || !lines.length}>{busy ? 'Saving…' : 'Save order'}</button>
      </>}>
      <form id="purchase-order-form" className={tradeStyles.orderForm} onSubmit={(event) => void submit(event)}>
        {error && <Feedback tone="error">{error}</Feedback>}
        <fieldset disabled={busy} className={tradeStyles.orderFields}>
          <div className={styles.fields}>
            <label>Order number<input required maxLength={100} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
            <label>Supplier<input required maxLength={200} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></label>
          </div>
          <div className={styles.fields}>
            <label>Product<select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">Choose a SKU</option>
              {catalogue.filter((item) => !lines.some((line) => line.item.variantId === item.variantId)).map((item) => <option key={item.variantId} value={item.variantId}>{item.name} · {item.sku}</option>)}
            </select></label>
            <button type="button" className="admin-secondary" disabled={!nextProduct || busy} onClick={() => {
              if (!nextProduct) return;
              setLines((values) => [...values, { item: nextProduct, quantity: '1', unit: 'individual', unitCost: '' }]);
              setProduct('');
            }}>Add line</button>
          </div>
          {lines.map((line) => {
            const { variantId, sku, baseUnit = 'unit', unitsPerCarton } = line.item;
            return <fieldset className={styles.schedule} key={variantId}>
              <legend>{sku}</legend>
              <div className={styles.fields}>
                {unitsPerCarton > 1 && <label>Order unit<select value={line.unit}
                  onChange={(event) => updateLine(variantId, { unit: event.target.value as DraftLine['unit'] })}>
                  <option value="individual">Individual {baseUnit}s</option>
                  <option value="carton">Cartons ({unitsPerCarton} {baseUnit}s each)</option>
                </select></label>}
                <label>Quantity<input type="number" required min="1" step="1" value={line.quantity}
                  max={line.unit === 'carton' ? Math.floor(MAX_QUANTITY / unitsPerCarton) : MAX_QUANTITY}
                  onChange={(event) => updateLine(variantId, { quantity: event.target.value })} /></label>
                <label>Cost per {baseUnit}<input type="number" required min="0" max="9999999999.99" step="0.01" value={line.unitCost}
                  onChange={(event) => updateLine(variantId, { unitCost: event.target.value })} /></label>
                <button type="button" className="admin-secondary" onClick={() => setLines((values) => values.filter((item) => item.item.variantId !== variantId))}>Remove line</button>
              </div>
              <p>{baseQuantity(line)} {baseUnit}{baseQuantity(line) === 1 ? '' : 's'} total</p>
            </fieldset>;
          })}
        </fieldset>
      </form>
    </AdminModal>}
    {loading && <p role="status">Loading orders…</p>}
    {!loading && !orders.length && <p>No purchase orders at this location.</p>}
    {orders.length > 0 && <div className={styles.fields}>
      <label>Find purchase order<input type="search" placeholder="Order number or supplier" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} /></label>
      <label>Purchase order<select value={matchingOrders.some((item) => item.id === selected) ? selected : ''} disabled={busy} onChange={(event) => {
        setSelected(event.target.value); setAmount(''); setReference('');
      }}>
        <option value="">Select an order</option>
        {matchingOrders.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.supplierName}</option>)}
      </select></label>
    </div>}
    {orderSearch.trim() && matchingOrders.length === 0 && <p>No orders match your search.</p>}
    {order && matchingOrders.some((item) => item.id === order.id) && <>
      <header className={tradeStyles.orderHeader}>
        <div><h3>Order {order.number}</h3><p>{order.supplierName}</p></div>
        <span className={awaitingGoods ? tradeStyles.pending : tradeStyles.received}>
          {awaitingGoods ? (arrived.size ? 'Partially received' : 'Awaiting delivery') : 'Fully received'}
        </span>
        {canOrder && awaitingGoods && <button type="button" className="admin-primary"
          disabled={busy || loading} onClick={() => onReceive(order)}><PackageCheck size={16} aria-hidden="true" /> Receive goods</button>}
      </header>
      <div className={styles.scroll}><table>
        <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Unit cost</th></tr></thead>
        <tbody>{order.lines.map((line) => <tr key={line.variantId}>
          <td>{line.variant.product.name} · {line.variant.sku}</td><td>{line.quantity} {line.variant.product.baseUnit}{line.quantity === 1 ? '' : 's'}</td>
          <td>{arrived.get(line.variantId) ?? 0}</td><td>{line.quantity - (arrived.get(line.variantId) ?? 0)}</td><td>{money(line.unitCost, order.currency)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className={styles.muted}>Goods receipts · {order.receipts.map((receipt) => receipt.receiptNumber).join(', ') || 'None recorded'}</p>
      <section className={tradeStyles.payments}><h3>Supplier payments</h3>
        <dl className={tradeStyles.paymentTotals}>
          <div><dt>Received value</dt><dd>{money(receivedCents / 100, order.currency)}</dd></div>
          <div><dt>Paid</dt><dd>{money(paidCents / 100, order.currency)}</dd></div>
          <div><dt>Balance due</dt><dd>{money((receivedCents - paidCents) / 100, order.currency)}</dd></div>
        </dl>
        {order.payments.length > 0 && <ul>{order.payments.map((payment) => <li key={payment.id}>
          {money(payment.amount, order.currency)} · {payment.reference} · {payment.actor.email}
        </li>)}</ul>}
        {canPay && receivedCents > paidCents && <form className={styles.fields} onSubmit={(e) => void submit(e, order)}>
          <label>Payment amount<input required type="number" min="0.01" step="0.01" max={(receivedCents - paidCents) / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Payment reference<input required maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <button className="admin-primary" disabled={busy}>Record supplier payment</button>
        </form>}
      </section>
    </>}
  </section>;
}
