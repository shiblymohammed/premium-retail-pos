import styles from './return-history.module.css';

export type ReturnableLine = {
  id: string;
  quantityBaseUnits: number;
  enteredUnit?: string;
  conversionRatioUsed?: number | null;
  unitPriceAtSale: string;
  variant: { sku: string; product: { name: string; baseUnit: string } };
};

export type SaleReturnRecord = {
  returnNumber: string;
  processedAt?: string;
  lines?: Array<{
    id: string;
    saleLineId: string;
    quantityBaseUnits: number;
    disposition: 'RESTOCKED' | 'QUARANTINED';
    inspectionNotes: string | null;
    refundAmount: string;
  }>;
  refund?: { amount: string; method: string; transactionReference?: string | null } | null;
};

export function countInUnit(quantity: number, unit: string) {
  return `${quantity} ${unit}${quantity === 1 ? '' : 's'}`;
}

export function soldPackaging(line: ReturnableLine) {
  const unit = line.variant.product.baseUnit;
  const ratio = line.conversionRatioUsed;
  if (line.enteredUnit === 'carton' && ratio) {
    return `${countInUnit(line.quantityBaseUnits / ratio, 'carton')} · ${countInUnit(ratio, unit)} per carton`;
  }
  if (line.enteredUnit === 'mixed' && ratio) {
    return `Cartons and loose units · ${countInUnit(ratio, unit)} per carton`;
  }
  return countInUnit(line.quantityBaseUnits, unit);
}

export function soldUnitPrice(line: ReturnableLine, money: (amount: number | string) => string) {
  const unit = line.variant.product.baseUnit;
  const ratio = line.conversionRatioUsed;
  if (line.enteredUnit === 'carton' && ratio) {
    return `${money(Number(line.unitPriceAtSale) * ratio)} / carton · ${money(line.unitPriceAtSale)} / ${unit}`;
  }
  return `${money(line.unitPriceAtSale)} / ${unit}`;
}

export function ReturnHistory({
  returns,
  saleLines,
  money,
  timezone,
}: {
  returns: SaleReturnRecord[];
  saleLines: ReturnableLine[];
  money: (amount: number | string) => string;
  timezone?: string;
}) {
  const byId = new Map(saleLines.map((line) => [line.id, line]));
  const newestFirst = [...returns].sort((first, second) =>
    (second.processedAt ?? '').localeCompare(first.processedAt ?? ''),
  );

  return (
    <ul className={styles.history} aria-label="Recorded returns">
      {newestFirst.map((entry) => (
        <li key={entry.returnNumber} className={styles.entry}>
          <header className={styles.header}>
            <div>
              <strong>{entry.returnNumber}</strong>
              {entry.processedAt && <time dateTime={entry.processedAt}>
                {new Date(entry.processedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })}
              </time>}
            </div>
            <div className={styles.refund}>
              <strong>{money(entry.refund?.amount ?? 0)}</strong>
              {entry.refund && <span>{entry.refund.method}</span>}
            </div>
          </header>
          {entry.refund?.transactionReference && <p className={styles.reference}>
            Refund reference <strong>{entry.refund.transactionReference}</strong>
          </p>}
          {!!entry.lines?.length && <ul className={styles.lines}>
            {entry.lines.map((line) => {
              const variant = byId.get(line.saleLineId)?.variant;
              const quantity = countInUnit(line.quantityBaseUnits, variant?.product.baseUnit ?? 'unit');
              return <li key={line.id}>
                <div className={styles.lineHeading}>
                  <strong>{variant?.product.name ?? 'Returned item'}</strong>
                  <span>{quantity} · {money(line.refundAmount)}</span>
                </div>
                <div className={styles.details}>
                  {variant?.sku && <span>{variant.sku} · </span>}
                  {line.disposition === 'QUARANTINED' ? 'Quarantined' : 'Returned to stock'}
                </div>
                {line.inspectionNotes && <p className={styles.notes}>{line.inspectionNotes}</p>}
              </li>;
            })}
          </ul>}
        </li>
      ))}
    </ul>
  );
}
