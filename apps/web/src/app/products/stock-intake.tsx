'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PackageCheck } from 'lucide-react';
import { AdminModal } from '@/components/admin';
import { outstandingLines, type Order } from '../trade/purchase-data';
import { Feedback } from '@/components/ui/feedback';
import styles from './products.module.css';

export type StockLocation = { id: string; name: string; type: string };
export type StockVariant = { variantId: string; name: string; variant: string; sku: string; unitsPerCarton: number; baseUnit?: string };
export type IntakeMode = 'opening' | 'supplier';

type Line = { variantId: string; cartons: number; looseBaseUnits: number };

export function StockIntake({ mode, apiBase, token, locations, initialLocation, variants, onCancel, onSaved, purchaseOrder }: {
  purchaseOrder?: Order;
  mode: IntakeMode;
  apiBase: string;
  token: string;
  locations: StockLocation[];
  initialLocation: string;
  variants: StockVariant[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const supplierReceipt = mode === 'supplier';
  const title = supplierReceipt ? 'Receive from supplier' : 'Import opening stock';
  const [locationId, setLocationId] = useState(locations.find((location) => location.name === initialLocation)?.id ?? (locations.length === 1 ? locations[0].id : ''));
  const [receiptMode, setReceiptMode] = useState<'linked' | 'direct'>('linked');
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderQuery, setOrderQuery] = useState('');
  const [linkedOrder, setLinkedOrder] = useState<Order>();
  const [ordersStatus, setOrdersStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ordersRetry, setOrdersRetry] = useState(0);
  const [supplierName, setSupplierName] = useState(purchaseOrder?.supplierName ?? '');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>(() => purchaseOrder ? receiptLines(purchaseOrder) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ body: string; key: string } | null>(null);
  const activeOrder = purchaseOrder ?? linkedOrder;
  const requiresOrder = supplierReceipt && receiptMode === 'linked';
  const remaining = new Map(activeOrder ? outstandingLines(activeOrder).map((line) => [line.variantId, line.remaining]) : []);
  const intakeVariants: StockVariant[] = activeOrder ? activeOrder.lines.map(({ variantId, variant }) => ({
    variantId, sku: variant.sku, name: variant.product.name, baseUnit: variant.product.baseUnit,
    unitsPerCarton: variant.product.unitsPerCarton ?? variants.find((item) => item.variantId === variantId)?.unitsPerCarton ?? 1,
    variant: '',
  })) : variants;
  const orderTerm = orderQuery.trim().toLowerCase();
  const matchingOrders = orders.filter((order) => outstandingLines(order).length
    && `${order.number} ${order.supplierName}`.toLowerCase().includes(orderTerm)).slice(0, 8);
  const formId = 'stock-intake-form';

  useEffect(() => {
    if (!supplierReceipt || purchaseOrder || !locationId || receiptMode !== 'linked') return;
    const controller = new AbortController();
    setOrders([]);
    setOrdersStatus('loading');
    void fetch(`${apiBase}/trade/orders?locationId=${encodeURIComponent(locationId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load purchase orders.');
      const { data } = await response.json() as { data: Order[] };
      if (!controller.signal.aborted) {
        setOrders(data);
        setOrdersStatus('ready');
      }
    }).catch(() => { if (!controller.signal.aborted) setOrdersStatus('error'); });
    return () => controller.abort();
  }, [apiBase, locationId, ordersRetry, purchaseOrder, receiptMode, supplierReceipt, token]);

  function chooseOrder(order?: Order) {
    setLinkedOrder(order);
    setLines(order ? receiptLines(order) : []);
    setSupplierName(order?.supplierName ?? '');
    setQuery('');
    setError('');
  }

  const selected = new Set(lines.map((line) => line.variantId));
  const term = query.trim().toLowerCase();
  const results = term ? variants.filter((variant) => !selected.has(variant.variantId) && `${variant.name} ${variant.variant} ${variant.sku}`.toLowerCase().includes(term)).slice(0, 8) : [];

  function setQuantity(variantId: string, field: 'cartons' | 'looseBaseUnits', value: string) {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) return;
    setLines((current) => current.map((line) => line.variantId === variantId ? { ...line, [field]: quantity } : line));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const converted = lines.map((line) => ({
      ...line,
      quantityBaseUnits: line.cartons * (intakeVariants.find((variant) => variant.variantId === line.variantId)?.unitsPerCarton ?? 1) + line.looseBaseUnits,
    })).filter((line) => !activeOrder || line.quantityBaseUnits > 0);
    if (!locationId || (requiresOrder && !activeOrder) || !converted.length || converted.some((line) => line.quantityBaseUnits < 1 || line.quantityBaseUnits > 2147483647)) {
      setError('Select a location and enter a positive quantity for each product.');
      return;
    }
    const excess = activeOrder && converted.find((line) => line.quantityBaseUnits > (remaining.get(line.variantId) ?? 0));
    if (excess) {
      const item = intakeVariants.find((variant) => variant.variantId === excess.variantId);
      const outstanding = remaining.get(excess.variantId) ?? 0;
      setError(`${item?.name ?? 'Product'} has only ${outstanding} ${item?.baseUnit ?? 'unit'}${outstanding === 1 ? '' : 's'} left on this order.`);
      return;
    }
    const body = JSON.stringify({
      locationId, notes: notes.trim() || undefined,
      ...(supplierReceipt ? {
        supplierName: supplierName.trim(), receiptNumber: receiptNumber.trim(),
        ...(activeOrder && { purchaseOrderId: activeOrder.id }),
        lines: converted.map(({ variantId, cartons, looseBaseUnits }) => ({ variantId, cartons, looseBaseUnits })),
      } : { lines: converted.map(({ variantId, quantityBaseUnits }) => ({ variantId, quantityBaseUnits })) }),
    });
    if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}${supplierReceipt ? '/receiving/receipts' : '/inventory/opening-stock/import'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Stock could not be recorded.');
      onSaved(supplierReceipt ? `Goods receipt ${receiptNumber.trim()} recorded. Inventory updated.` : 'Opening stock recorded. Inventory updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stock could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal isOpen title={title} badgeIcon={<PackageCheck size={20} aria-hidden="true" />} maxWidth="680px"
      subtitle={activeOrder ? `Purchase order ${activeOrder.number} · ${activeOrder.supplierName}` : supplierReceipt ? 'Add delivered quantities to available stock.' : 'Record initial quantities at one location.'}
      onClose={() => { if (!saving) onCancel(); }} footer={<>
        <button type="button" className="admin-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" form={formId} className="admin-primary"
          disabled={saving || !locationId || (requiresOrder && !activeOrder) || !lines.some((line) => line.cartons > 0 || line.looseBaseUnits > 0)}>
          {saving ? 'Saving…' : supplierReceipt ? 'Record goods receipt' : 'Record stock'}
        </button>
      </>}>
      <form id={formId} onSubmit={save}>
        <fieldset disabled={saving} className={styles.intakeFields}>
          <label className={styles.formGroup}>Stock location
            <select autoFocus required disabled={!!purchaseOrder} className={styles.modalInput} value={locationId} onChange={(event) => { setLocationId(event.target.value); if (supplierReceipt && receiptMode === 'linked') { chooseOrder(); setOrderQuery(''); setOrders([]); setOrdersStatus('loading'); } }}>
              <option value="">Select a location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          {supplierReceipt && !purchaseOrder && <>
            <label className={styles.formGroup}>Delivery type
              <select className={styles.modalInput} value={receiptMode} onChange={(event) => {
                setReceiptMode(event.target.value === 'direct' ? 'direct' : 'linked');
                setOrderQuery('');
                setOrders([]);
                setOrdersStatus('loading');
                chooseOrder();
              }}>
                <option value="linked">Receive against a purchase order</option>
                <option value="direct">Receive without a purchase order</option>
              </select>
            </label>
            {requiresOrder && locationId && (linkedOrder ? <div className={styles.intakeOrder}>
              <span>Order <strong>{linkedOrder.number}</strong> · {linkedOrder.supplierName}</span>
              <button type="button" className="admin-secondary" onClick={() => chooseOrder()}>Change order</button>
            </div> : <>
              <label className={styles.formGroup}>Find purchase order
                <input type="search" className={styles.modalInput} placeholder="Order number or supplier" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} />
              </label>
              {ordersStatus === 'loading' ? <p role="status">Loading purchase orders…</p>
                : ordersStatus === 'error' ? <Feedback tone="error" action={<button type="button" className="admin-secondary" onClick={() => setOrdersRetry((value) => value + 1)}>Retry</button>}>Could not load purchase orders.</Feedback>
                : <div className={styles.intakeResults}>
                  {matchingOrders.length ? matchingOrders.map((order) => <button key={order.id} type="button" className="admin-secondary"
                    onClick={() => chooseOrder(order)}>{order.number} · {order.supplierName}</button>) : <p>No matching purchase orders with items left to receive.</p>}
                </div>}
            </>)}
            {receiptMode === 'direct' && <p className={styles.intakeHint}>This delivery adds to stock without updating a purchase order or supplier balance.</p>}
          </>}
          {supplierReceipt && (!requiresOrder || activeOrder) && <div className={styles.formRow}>
            <label className={styles.formGroup}>Supplier<input className={styles.modalInput} required readOnly={!!activeOrder} maxLength={200} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
            <div className={styles.formGroup}>
              <label>Goods receipt number<input className={styles.modalInput} required maxLength={100} value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} /></label>
            </div>
          </div>}
              {supplierReceipt && locationId && <Link href={`/trade?${new URLSearchParams({ tab: 'receipts', locationId, ...(receiptNumber.trim() && { receipt: receiptNumber.trim() }) })}`} target="_blank" rel="noopener">Find a recorded receipt (opens in a new tab)</Link>}
          {!requiresOrder && <>
            <label className={styles.formGroup}>Find a product to add
              <input type="search" className={styles.modalInput} placeholder="Product name or SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            {!!term && <div className={styles.intakeResults}>
              {results.length ? results.map((variant) => <button type="button" key={variant.variantId} className="admin-secondary" onClick={() => {
                setLines((current) => [...current, { variantId: variant.variantId, cartons: 0, looseBaseUnits: 0 }]);
                setQuery('');
              }}>{variant.name} · {variant.sku}</button>) : <p>No matching products to add.</p>}
            </div>}
          </>}
          {activeOrder && <p className={styles.intakeHint}>Enter only the quantities delivered. Leave other items at zero.</p>}
          {lines.map((line) => {
            const variant = intakeVariants.find((item) => item.variantId === line.variantId);
            if (!variant) return null;
            return <fieldset key={line.variantId} className={styles.intakeLine}>
              <legend>{variant.name} · {variant.sku}</legend>
              {activeOrder && <p className={styles.intakeRemaining}>Remaining <strong>{remaining.get(line.variantId)} {variant.baseUnit ?? 'unit'}{remaining.get(line.variantId) === 1 ? '' : 's'}</strong></p>}
              {variant.unitsPerCarton > 1 && <label className={styles.formGroup}>Cartons ({variant.unitsPerCarton} each)
                <input type="number" min="0" step="1" className={styles.modalInput} value={line.cartons} onChange={(event) => setQuantity(line.variantId, 'cartons', event.target.value)} />
              </label>}
              <label className={styles.formGroup}>{variant.unitsPerCarton > 1 ? 'Loose units' : 'Units'}
                <input type="number" min="0" step="1" className={styles.modalInput} value={line.looseBaseUnits} onChange={(event) => setQuantity(line.variantId, 'looseBaseUnits', event.target.value)} />
              </label>
              {!activeOrder && <button type="button" className="admin-secondary" aria-label={`Remove ${variant.sku}`} onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}>Remove</button>}
            </fieldset>;
          })}
          <label className={styles.formGroup}>Notes (optional)
            <textarea rows={2} maxLength={500} className={styles.modalInput} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </fieldset>
        {error && <Feedback tone="error">{error}</Feedback>}
      </form>
    </AdminModal>
  );
}

function receiptLines(order: Order): Line[] {
  return outstandingLines(order).map(({ variantId }) => ({ variantId, cartons: 0, looseBaseUnits: 0 }));
}
