'use client';

import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { tradeRequest } from './trade-api';
import styles from './trade.module.css';

type Receipt = {
  id: string;
  receiptNumber: string;
  supplierName: string;
  confirmedAt: string;
  notes: string | null;
  purchaseOrder: { number: string } | null;
  lines: Array<{
    id: string;
    quantityBaseUnits: number;
    cartons: number;
    looseBaseUnits: number;
    unitsPerCarton: number | null;
    variant: { sku: string; product: { name: string; baseUnit: string } };
  }>;
};

export function GoodsReceipts({ locationId, token, initialSearch }: { locationId: string; token: string; initialSearch: string }) {
  const [query, setQuery] = useState(initialSearch);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ locationId, search: query.trim() });
    const timer = window.setTimeout(() => {
      void tradeRequest<Receipt[]>('/trade/receipts?' + params, token, controller.signal)
        .then((rows) => { if (!controller.signal.aborted) setReceipts(rows); })
        .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [locationId, query, retry, token]);

  return <section className={styles.surface}>
    <header className={styles.sectionHeader}>
      <h2>Goods receipt history</h2>
      <label className={styles.field}>Find receipt number<input type="search" maxLength={100} placeholder="Enter a goods receipt number" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </header>
    {loading ? <p role="status">Loading receipts…</p>
      : error ? <Feedback tone="error" action={<button type="button" className="admin-secondary" onClick={() => setRetry((value) => value + 1)}>Retry</button>}>{error}</Feedback>
      : !receipts.length ? <p>{query.trim() ? 'No receipts match this number.' : 'No goods receipts have been recorded at this location.'}</p>
      : <div className={styles.receiptList}>
        {receipts.length === 30 && <p className={styles.muted}>Showing the 30 most recent matches. Search by receipt number to narrow the list.</p>}
        {receipts.map((receipt) => <details className={styles.receipt} key={receipt.id}>
          <summary><strong>{receipt.receiptNumber}</strong><span>{receipt.supplierName} · {receipt.purchaseOrder ? `Order ${receipt.purchaseOrder.number}` : 'Direct delivery'}</span>
            <time dateTime={receipt.confirmedAt}>{new Date(receipt.confirmedAt).toLocaleDateString()}</time></summary>
          <ul>{receipt.lines.map((line) => {
            const unit = line.variant.product.baseUnit;
            return <li key={line.id}>{line.variant.product.name} · {line.variant.sku} · {line.quantityBaseUnits} {unit}{line.quantityBaseUnits === 1 ? '' : 's'}
              {line.cartons > 0 && ` (${line.cartons} carton${line.cartons === 1 ? '' : 's'} × ${line.unitsPerCarton ?? 1}${line.looseBaseUnits ? ` + ${line.looseBaseUnits} loose` : ''})`}
            </li>;
          })}</ul>
          {receipt.notes && <p>{receipt.notes}</p>}
        </details>)}
      </div>}
  </section>;
}
