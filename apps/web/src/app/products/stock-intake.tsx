'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Feedback } from '@/components/ui/feedback';
import styles from './products.module.css';

export type StockLocation = { id: string; name: string; type: string };
export type StockVariant = { variantId: string; name: string; variant: string; sku: string; unitsPerCarton: number; baseUnit?: string };
export type IntakeMode = 'opening' | 'supplier';

type Line = { variantId: string; cartons: number; looseBaseUnits: number };

export function StockIntake({ mode, apiBase, token, locations, initialLocation, variants, onCancel, onSaved, purchaseOrder }: {
  purchaseOrder?: { id: string; number: string; supplierName: string };
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
  const [locationId, setLocationId] = useState(locations.find((location) => location.name === initialLocation)?.id ?? '');
  const [supplierName, setSupplierName] = useState(purchaseOrder?.supplierName ?? '');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ body: string; key: string } | null>(null);
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
      quantityBaseUnits: line.cartons * (variants.find((variant) => variant.variantId === line.variantId)?.unitsPerCarton ?? 1) + line.looseBaseUnits,
    }));
    if (!locationId || !converted.length || converted.some((line) => line.quantityBaseUnits < 1 || line.quantityBaseUnits > 2147483647)) {
      setError('Select a location and enter a positive quantity for each product.');
      return;
    }
    const body = JSON.stringify({
      locationId, notes: notes.trim() || undefined,
      ...(supplierReceipt ? {
        supplierName: supplierName.trim(), receiptNumber: receiptNumber.trim(),
        ...(purchaseOrder && { purchaseOrderId: purchaseOrder.id }),
        lines: lines.map(({ variantId, cartons, looseBaseUnits }) => ({ variantId, cartons, looseBaseUnits })),
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
    <div className={styles.modalOverlay}>
      <section className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="stock-intake-title" onKeyDown={(event) => { if (event.key === 'Escape' && !saving) onCancel(); }}>
        <header className={styles.modalHeader}>
          <div><h2 id="stock-intake-title">{title}</h2><p>{purchaseOrder ? `Purchase order ${purchaseOrder.number} · Record only the quantities that arrived.` : supplierReceipt ? 'Record a goods receipt and add the products received to available stock.' : 'Record initial quantities at one location.'}</p></div>
        </header>
        <form className={styles.modalBody} onSubmit={save}>
          <fieldset disabled={saving} className={styles.intakeFields}>
            <label className={styles.formGroup}>Stock location
              <select autoFocus required disabled={!!purchaseOrder} className={styles.modalInput} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Select a location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            {supplierReceipt && <div className={styles.formRow}>
              <label className={styles.formGroup}>Supplier<input className={styles.modalInput} required readOnly={!!purchaseOrder} maxLength={200} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
              <label className={styles.formGroup}>Goods receipt number<input className={styles.modalInput} required maxLength={100} value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} /></label>
            </div>}
            <label className={styles.formGroup}>Find a product to add
              <input type="search" className={styles.modalInput} placeholder="Product name or SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            {!!term && <div className={styles.intakeResults}>
              {results.length ? results.map((variant) => <button type="button" key={variant.variantId} className={styles.btnSecondary} onClick={() => {
                setLines((current) => [...current, { variantId: variant.variantId, cartons: 0, looseBaseUnits: 0 }]);
                setQuery('');
              }}>{variant.name} · {variant.sku}</button>) : <p>No matching products to add.</p>}
            </div>}
            {lines.map((line) => {
              const variant = variants.find((item) => item.variantId === line.variantId);
              if (!variant) return null;
              return <fieldset key={line.variantId} className={styles.intakeLine}>
                <legend>{variant.name} · {variant.sku}</legend>
                {variant.unitsPerCarton > 1 && <label className={styles.formGroup}>Cartons ({variant.unitsPerCarton} each)
                  <input type="number" min="0" step="1" className={styles.modalInput} value={line.cartons} onChange={(event) => setQuantity(line.variantId, 'cartons', event.target.value)} />
                </label>}
                <label className={styles.formGroup}>{variant.unitsPerCarton > 1 ? 'Loose units' : 'Units'}
                  <input type="number" min="0" step="1" className={styles.modalInput} value={line.looseBaseUnits} onChange={(event) => setQuantity(line.variantId, 'looseBaseUnits', event.target.value)} />
                </label>
                <button type="button" className={styles.btnSecondary} aria-label={`Remove ${variant.sku}`} onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}>Remove</button>
              </fieldset>;
            })}
            <label className={styles.formGroup}>Notes (optional)
              <textarea rows={2} maxLength={500} className={styles.modalInput} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </fieldset>
          {error && <Feedback tone="error">{error}</Feedback>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving || !lines.length}>{saving ? 'Saving…' : supplierReceipt ? 'Record goods receipt' : 'Record stock'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
