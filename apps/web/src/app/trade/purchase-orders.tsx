'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { money } from '../staff-records/records-api';
import type { StockVariant } from '../products/stock-intake';
import styles from '../staff-records/records.module.css';
import { tradeRequest } from './trade-api';

type OrderLine = { variantId: string; quantity: number; unitCost: string; variant: { sku: string; product: { name: string; baseUnit: string } } };
type DraftLine = { item: StockVariant; quantity: string; unit: 'individual' | 'carton'; unitCost: string };
const MAX_QUANTITY = 2147483647;
const baseQuantity = (line: DraftLine) => Number(line.quantity) * (line.unit === 'carton' ? line.item.unitsPerCarton : 1);
export type Order = {
  id: string; number: string; supplierName: string; currency: string;
  lines: OrderLine[];
  receipts: Array<{ id: string; receiptNumber: string; lines: Array<{ variantId: string; quantityBaseUnits: number }> }>;
  payments: Array<{ id: string; amount: string; reference: string; createdAt: string; actor: { email: string } }>;
};

export function PurchaseOrders({ token, locationId, catalogue, canPay, canOrder, reload, onReceive }: {
  token: string; locationId: string; catalogue: StockVariant[]; canPay: boolean; canOrder: boolean; reload: number; onReceive: (order: Order) => void;
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
        setSelected(saved.id);
        setCreateOpen(false); setNumber(''); setSupplierName(''); setLines([]);
      }
      setSerial((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the purchase record.');
    } finally { setBusy(false); }
  }

  const arrived = new Map<string, number>();
  for (const receipt of order?.receipts ?? []) for (const line of receipt.lines) {
    arrived.set(line.variantId, (arrived.get(line.variantId) ?? 0) + line.quantityBaseUnits);
  }
  const receivedCents = order?.lines.reduce((total, line) => total + (arrived.get(line.variantId) ?? 0) * Math.round(Number(line.unitCost) * 100), 0) ?? 0;
  const paidCents = order?.payments.reduce((total, payment) => total + Math.round(Number(payment.amount) * 100), 0) ?? 0;

  return <section className={styles.panel}>
    <header className={styles.top}><h2>Purchase orders</h2>
      {canOrder && <button type="button" className="admin-secondary" disabled={busy} onClick={() => setCreateOpen(!createOpen)}>{createOpen ? 'Close new order' : 'New purchase order'}</button>}
    </header>
    {error && <Feedback tone="error">{error}</Feedback>}
    {createOpen && <form className={styles.panel} onSubmit={(e) => void submit(e)}>
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
      <div><button className="admin-primary" disabled={busy || lines.length === 0}>Save order</button></div>
    </form>}
    {loading && <p role="status">Loading orders…</p>}
    {!loading && !orders.length && <p>No purchase orders at this location.</p>}
    {orders.length > 0 && <div className={styles.fields}><label>Purchase order<select value={selected} disabled={busy} onChange={(e) => {
      setSelected(e.target.value); setAmount(''); setReference('');
    }}>{orders.map((row) => <option key={row.id} value={row.id}>{row.number} · {row.supplierName}</option>)}</select></label></div>}
    {order && <>
      <div className={styles.scroll}><table>
        <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Unit cost</th></tr></thead>
        <tbody>{order.lines.map((line) => <tr key={line.variantId}>
          <td>{line.variant.product.name} · {line.variant.sku}</td><td>{line.quantity} {line.variant.product.baseUnit}{line.quantity === 1 ? '' : 's'}</td>
          <td>{arrived.get(line.variantId) ?? 0}</td><td>{line.quantity - (arrived.get(line.variantId) ?? 0)}</td><td>{money(line.unitCost, order.currency)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className={styles.fields}>
        <span>Goods receipts: {order.receipts.map((receipt) => receipt.receiptNumber).join(', ') || 'None'}</span>
        {canOrder && order.lines.some((line) => line.quantity > (arrived.get(line.variantId) ?? 0)) && <button type="button" className="admin-secondary"
          disabled={busy} onClick={() => onReceive(order)}>Receive goods</button>}
      </div>
      <section className={styles.panel}><h2>Supplier payments</h2>
        <p>{money(paidCents / 100, order.currency)} paid · {money((receivedCents - paidCents) / 100, order.currency)} due for received goods</p>
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
