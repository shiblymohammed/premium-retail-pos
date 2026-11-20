'use client';

/* Per-tab layouts for the Reports page. Each view = KPI strip + a visual that fits the
   report + a detail list/table. Data comes from the page's existing report datasets. */
import React, { useState } from 'react';
import styles from './reports.module.css';
import { Icon, formatInr, formatCompactInr, formatDay, type SalesSummary, type SalesDetails, type StockReport, type TableData } from './report-ui';

type Matches = (...values: Array<string | number>) => boolean;
type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'info';

/* ---------- small building blocks ---------- */

/** First signed number in a string: "-2 bottles" → -2, "₹1,130.00" → 1130, "Suggested 12 packs" → 12. */
function num(value: string) {
  const m = value.replace(/,/g, '').match(/[-+]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}
function initials(text: string) {
  return text.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const chipClass: Record<Tone, string> = {
  good: styles.chipGood,
  bad: styles.chipBad,
  warn: styles.chipWarn,
  neutral: '',
  info: styles.chipInfo,
};

function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`${styles.chip} ${chipClass[tone]}`}>{children}</span>;
}

type Kpi = { label: string; value: string; icon: string; chip?: string; tone?: Tone; highlight?: 'teal' | 'pink' };

function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <section className={`${styles.kpiGrid} ${styles.kpiGrid4}`} aria-label="Report summary">
      {items.map((k) => (
        <article key={k.label} className={`${styles.kpi} ${k.highlight === 'teal' ? styles.kpiTeal : k.highlight === 'pink' ? styles.kpiPink : ''}`}>
          <div className={styles.kpiTop}><span>{k.label}</span><i><Icon name={k.icon} size={15} /></i></div>
          <strong>{k.value}</strong>
          {k.chip && <Chip tone={k.tone}>{k.chip}</Chip>}
        </article>
      ))}
    </section>
  );
}

function Card({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <article className={`${styles.card} ${className}`}>
      <div className={styles.cardHead}>
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </article>
  );
}

function Empty({ text = 'No records match the current search.' }: { text?: string }) {
  return <div className={styles.empty}>{text}</div>;
}

export function Table({ headers, rows, alignRight = [] }: { headers: string[]; rows: React.ReactNode[][]; alignRight?: number[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{headers.map((h, i) => <th key={h} className={alignRight.includes(i) ? styles.right : ''}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className={alignRight.includes(i) ? styles.right : ''}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
      {!rows.length && <Empty />}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? styles.segActive : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ---------- 1. Sales ---------- */

export function SalesView({ sales, matches, rangeLabel }: { sales: SalesSummary; matches: Matches; rangeLabel: string }) {
  const net = Number(sales.totals.netSales);
  const invoices = sales.totals.completedInvoices;
  const daily = sales.daily.filter((d) => matches(d.date, formatDay(d.date)));
  const stores = sales.locations.filter((l) => matches(l.locationName));
  const maxDay = Math.max(...sales.daily.map((d) => Number(d.netSales)), 1);
  const best = [...sales.daily].sort((a, b) => Number(b.netSales) - Number(a.netSales))[0];

  // Area chart geometry
  const W = 640, H = 210, padX = 30, top = 28, base = 170;
  const step = (W - padX * 2) / Math.max(sales.daily.length - 1, 1);
  const pts = sales.daily.map((d, i) => [padX + i * step, base - (Number(d.netSales) / maxDay) * (base - top)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');

  return (
    <>
      <KpiStrip items={[
        { label: 'Net sales', value: formatInr(net), icon: 'rupee', chip: rangeLabel, tone: 'good' },
        { label: 'Completed invoices', value: invoices.toLocaleString('en-IN'), icon: 'receipt', chip: `${sales.locations.length} stores`, highlight: 'teal' },
        { label: 'Average bill', value: formatInr(invoices ? net / invoices : 0), icon: 'tag', chip: 'per invoice', tone: 'good' },
        { label: 'Cancelled invoices', value: String(sales.totals.cancelledInvoices), icon: 'x', chip: `${((sales.totals.cancelledInvoices / Math.max(invoices + sales.totals.cancelledInvoices, 1)) * 100).toFixed(1)}% of bills`, tone: 'bad' },
      ]} />

      <section className={styles.rowGrid}>
        <Card title="Daily net sales" subtitle={`Last ${sales.daily.length} trading days · best day ${best ? formatDay(best.date) : '—'}`} action={best && <span className={styles.highlightPill}>Peak {formatCompactInr(Number(best.netSales))}</span>}>
          <svg className={styles.areaChart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily net sales trend">
            <defs>
              <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7f9cc9" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#7f9cc9" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((t) => <line key={t} x1={padX} x2={W - padX} y1={base - t * (base - top)} y2={base - t * (base - top)} className={styles.gridLine} />)}
            <path d={`${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`} fill="url(#salesArea)" />
            <path d={line} className={styles.areaLine} />
            {sales.daily.map((d, i) => {
              const [x, y] = pts[i];
              const isBest = d.date === best?.date;
              return (
                <g key={d.date}>
                  <title>{`${formatDay(d.date)}: ${formatInr(Number(d.netSales))} · ${d.invoices} invoices`}</title>
                  <circle cx={x} cy={y} r={isBest ? 6 : 4} className={isBest ? styles.areaDotBest : styles.areaDot} />
                  <text x={x} y={y - 12} textAnchor="middle" className={styles.areaValue}>{formatCompactInr(Number(d.netSales))}</text>
                  <text x={x} y={base + 22} textAnchor="middle" className={styles.areaAxis}>{formatDay(d.date)}</text>
                  <text x={x} y={base + 36} textAnchor="middle" className={styles.areaSub}>{d.invoices} bills</text>
                </g>
              );
            })}
          </svg>
        </Card>

        <Card title="Store contribution" subtitle="Net revenue, bills and average ticket by store">
          <div className={styles.storeCards}>
            {stores.map((s) => {
              const value = Number(s.netSales);
              const share = net ? (value / net) * 100 : 0;
              return (
                <div key={s.locationId} className={styles.storeCard}>
                  <div className={styles.storeTop}>
                    <span className={styles.rowIcon}><Icon name="store" size={15} /></span>
                    <span className={styles.rowLabel}><strong>{s.locationName}</strong><small>{s.invoices} invoices · {formatInr(s.invoices ? value / s.invoices : 0)} avg</small></span>
                    <b className={styles.storeValue}>{formatCompactInr(value)}</b>
                  </div>
                  <div className={styles.track}><i style={{ width: `${share}%` }} /></div>
                  <div className={styles.storeFoot}><span>{share.toFixed(0)}% of net sales</span>{s.cancelled > 0 ? <Chip tone="bad">{s.cancelled} cancelled</Chip> : <Chip tone="good">No cancellations</Chip>}</div>
                </div>
              );
            })}
            {!stores.length && <Empty />}
          </div>
        </Card>
      </section>

      <Card title="Daily breakdown" subtitle={rangeLabel}>
        <Table
          headers={['Date', 'Invoices', 'Cancelled', 'Average bill', 'Share of peak', 'Net sales']}
          alignRight={[5]}
          rows={daily.map((d) => {
            const v = Number(d.netSales);
            return [
              <span key="d" className={styles.cellStack}><strong>{formatDay(d.date)}</strong><small>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long' })}</small></span>,
              d.invoices,
              d.cancelled ? <Chip key="c" tone="bad">{d.cancelled}</Chip> : <span key="c" className={styles.mutedText}>0</span>,
              formatInr(d.invoices ? v / d.invoices : 0),
              <span key="b" className={`${styles.track} ${styles.inlineTrack}`}><i style={{ width: `${(v / maxDay) * 100}%` }} /></span>,
              <strong key="n">{formatInr(v, 2)}</strong>,
            ];
          })}
        />
      </Card>
    </>
  );
}

/* ---------- 2. Invoices ---------- */

export function InvoicesView({ details, matches }: { details: SalesDetails; matches: Matches }) {
  const [status, setStatus] = useState<'all' | 'FINALIZED' | 'CANCELLED'>('all');
  const finalized = details.rows.filter((r) => r.status === 'FINALIZED');
  const cancelled = details.rows.filter((r) => r.status !== 'FINALIZED');
  const finalizedValue = finalized.reduce((s, r) => s + Number(r.netTotal), 0);
  const largest = [...finalized].sort((a, b) => Number(b.netTotal) - Number(a.netTotal))[0];
  const rows = details.rows.filter((r) => (status === 'all' || r.status === status) && matches(r.invoiceNumber, r.location.name, r.status));

  return (
    <>
      <KpiStrip items={[
        { label: 'Invoices recorded', value: String(details.total), icon: 'receipt', chip: `page ${details.page} of ${details.totalPages}` },
        { label: 'Finalized value', value: formatInr(finalizedValue), icon: 'rupee', chip: `${finalized.length} finalized`, tone: 'good', highlight: 'teal' },
        { label: 'Largest bill', value: largest ? formatInr(Number(largest.netTotal)) : '—', icon: 'up', chip: largest?.invoiceNumber, tone: 'info' },
        { label: 'Cancelled', value: String(cancelled.length), icon: 'x', chip: formatInr(cancelled.reduce((s, r) => s + Number(r.netTotal), 0)) + ' voided', tone: 'bad' },
      ]} />

      <Card
        title="Itemised sales transactions"
        subtitle="Latest invoices across the selected stores"
        action={<Segmented label="Invoice status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'FINALIZED', label: 'Finalized' }, { value: 'CANCELLED', label: 'Cancelled' }]} />}
      >
        <Table
          headers={['Invoice', 'Store', 'Status', 'Created', 'Net total']}
          alignRight={[4]}
          rows={rows.map((r) => [
            <span key="i" className={styles.invoiceCell}><span className={`${styles.skuBadge} ${r.status === 'FINALIZED' ? styles.toneTeal : styles.toneRed}`}><Icon name="receipt" size={14} /></span><span className={styles.cellStack}><span className={styles.mono}>{r.invoiceNumber}</span><small>{relativeTime(r.createdAt)}</small></span></span>,
            <span key="s" className={styles.withIcon}><Icon name="store" size={14} />{r.location.name}</span>,
            <Chip key="st" tone={r.status === 'FINALIZED' ? 'good' : 'bad'}>{r.status === 'FINALIZED' ? 'Finalized' : 'Cancelled'}</Chip>,
            new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            <strong key="n" className={r.status === 'FINALIZED' ? '' : styles.strike}>{formatInr(Number(r.netTotal), 2)}</strong>,
          ])}
        />
      </Card>
    </>
  );
}

/* ---------- 3. Stock ---------- */

const STATE_COLORS = { available: '#3e64a0', inTransit: '#a78bfa', reserved: '#f2b75b', quarantined: '#ef8181' };

export function StockView({ stock, matches }: { stock: StockReport; matches: Matches }) {
  const rows = stock.rows.filter((r) => matches(r.locationName, r.productName, r.variantName, r.sku));
  const sum = (key: 'available' | 'inTransit' | 'reserved' | 'quarantined') => stock.rows.reduce((s, r) => s + Math.max(0, r[key]), 0);
  const mix = [
    { key: 'available', label: 'Available', value: sum('available') },
    { key: 'inTransit', label: 'In transit', value: sum('inTransit') },
    { key: 'reserved', label: 'Reserved', value: sum('reserved') },
    { key: 'quarantined', label: 'Quarantined', value: sum('quarantined') },
  ] as const;
  const mixTotal = mix.reduce((s, m) => s + m.value, 0) || 1;

  return (
    <>
      <KpiStrip items={[
        { label: 'Variants tracked', value: stock.totals.variants.toLocaleString('en-IN'), icon: 'box', chip: `${stock.rows.length} shown below` },
        { label: 'Available base units', value: stock.totals.availableBaseUnits.toLocaleString('en-IN'), icon: 'check', chip: 'ready to sell', tone: 'good', highlight: 'teal' },
        { label: 'Low stock variants', value: String(stock.totals.lowStockVariants), icon: 'alert', chip: 'at or below reorder', tone: 'warn' },
        { label: 'Negative balances', value: String(stock.totals.negativeStockVariants), icon: 'shield', chip: 'needs reconciliation', tone: 'bad', highlight: 'pink' },
      ]} />

      <Card title="Unit state mix" subtitle="Where the listed variants' units currently sit">
        <div className={styles.mixBar} role="img" aria-label={mix.map((m) => `${m.label} ${Math.round((m.value / mixTotal) * 100)}%`).join(', ')}>
          {mix.map((m) => <i key={m.key} style={{ width: `${(m.value / mixTotal) * 100}%`, background: STATE_COLORS[m.key] }} title={`${m.label}: ${m.value} units`} />)}
        </div>
        <div className={styles.mixLegend}>
          {mix.map((m) => (
            <div key={m.key}><i style={{ background: STATE_COLORS[m.key] }} /><span>{m.label}</span><b>{m.value.toLocaleString('en-IN')}</b><small>{Math.round((m.value / mixTotal) * 100)}%</small></div>
          ))}
        </div>
      </Card>

      <Card title="Stock balances & packaging" subtitle="Carton breakdown with in-transit, reserved and quarantined units">
        <Table
          headers={['Product', 'Location', 'Available', 'Packaging', 'State mix', 'Health']}
          rows={rows.map((r) => {
            const total = Math.max(0, r.available) + r.inTransit + r.reserved + r.quarantined || 1;
            const tone: Tone = r.negativeStock ? 'bad' : r.lowStock ? 'warn' : 'good';
            return [
              <span key="p" className={styles.invoiceCell}><span className={`${styles.skuBadge} ${r.negativeStock ? styles.toneRed : r.lowStock ? styles.toneAmber : styles.toneTeal}`}>{initials(r.productName)}</span><span className={styles.cellStack}><strong>{r.productName}</strong><small>{r.variantName} · <span className={styles.monoInline}>{r.sku}</span></small></span></span>,
              r.locationName,
              <strong key="a" className={r.available < 0 ? styles.badText : ''}>{r.available} {r.baseUnit}{Math.abs(r.available) === 1 ? '' : 's'}</strong>,
              r.cartons !== null ? `${r.cartons} ctn + ${r.looseBaseUnits} loose (${r.unitsPerCarton}/ctn)` : 'Packet only',
              <span key="m" className={styles.rowMix} title={`Available ${r.available} · In transit ${r.inTransit} · Reserved ${r.reserved} · Quarantined ${r.quarantined}`}>
                <i style={{ width: `${(Math.max(0, r.available) / total) * 100}%`, background: STATE_COLORS.available }} />
                <i style={{ width: `${(r.inTransit / total) * 100}%`, background: STATE_COLORS.inTransit }} />
                <i style={{ width: `${(r.reserved / total) * 100}%`, background: STATE_COLORS.reserved }} />
                <i style={{ width: `${(r.quarantined / total) * 100}%`, background: STATE_COLORS.quarantined }} />
              </span>,
              <Chip key="h" tone={tone}>{r.negativeStock ? 'Negative' : r.lowStock ? 'Low stock' : 'Healthy'}</Chip>,
            ];
          })}
        />
      </Card>
    </>
  );
}

/* ---------- 4–10. Specialised reports ---------- */

export function SpecializedView({ kind, data, matches }: { kind: string; data: TableData; matches: Matches }) {
  const rows = data.rows.filter((r) => matches(...r));
  switch (kind) {
    case 'lowStock': return <LowStockView data={data} rows={rows} />;
    case 'ledger': return <MovementsView data={data} rows={rows} />;
    case 'transferDiscrepancies': return <TransfersView data={data} rows={rows} />;
    case 'auditVariances': return <AuditsView data={data} rows={rows} />;
    case 'priceChanges': return <PriceView data={data} rows={rows} />;
    case 'cancellations': return <VoidsView data={data} rows={rows} />;
    case 'itemDeletions': return <DeletionsView data={data} rows={rows} />;
    default:
      return <Card title={data.title} subtitle={data.description}><Table headers={data.headers} rows={rows} /></Card>;
  }
}

type ViewProps = { data: TableData; rows: string[][] };

// Location, SKU, Product, On Hand, Reorder Level, Status
function LowStockView({ data, rows }: ViewProps) {
  const all = data.rows;
  const deficits = all.filter((r) => num(r[3]) < 0).length;
  const toOrder = all.reduce((s, r) => s + (Number.isFinite(num(r[5])) ? num(r[5]) : 0), 0);
  return (
    <>
      <KpiStrip items={[
        { label: 'Variants flagged', value: String(all.length), icon: 'alert', chip: 'at or below reorder', tone: 'warn' },
        { label: 'Negative on hand', value: String(deficits), icon: 'shield', chip: 'audit before selling', tone: 'bad', highlight: 'pink' },
        { label: 'Stores affected', value: String(new Set(all.map((r) => r[0])).size), icon: 'store', chip: 'retail locations' },
        { label: 'Suggested reorder', value: `${toOrder} units`, icon: 'truck', chip: 'via replenishment transfer', tone: 'good', highlight: 'teal' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <div className={styles.itemGrid}>
          {rows.map((r) => {
            const onHand = num(r[3]);
            const reorder = num(r[4]) || 1;
            const deficit = onHand < 0;
            const pct = Math.max(0, Math.min(100, (onHand / reorder) * 100));
            return (
              <div key={`${r[0]}-${r[1]}`} className={`${styles.itemCard} ${deficit ? styles.itemCardBad : ''}`}>
                <div className={styles.itemTop}>
                  <span className={`${styles.skuBadge} ${deficit ? styles.toneRed : styles.toneAmber}`}>{initials(r[2])}</span>
                  <span className={styles.rowLabel}><strong>{r[2].replace(/\s*\(.*\)/, '')}</strong><small>{r[2].match(/\((.*)\)/)?.[1] ?? ''}</small></span>
                </div>
                <div className={styles.itemMeta}><span className={styles.withIcon}><Icon name="store" size={13} />{r[0]}</span><span className={styles.monoInline}>{r[1]}</span></div>
                <div className={styles.itemFigures}>
                  <div><small>On hand</small><b className={deficit ? styles.badText : ''}>{r[3]}</b></div>
                  <div><small>Reorder level</small><b>{r[4]}</b></div>
                </div>
                <div className={styles.track}><i className={deficit ? styles.fillRed : styles.fillAmber} style={{ width: `${deficit ? 100 : Math.max(4, pct)}%` }} /></div>
                <div className={styles.itemFoot}>
                  <span>{deficit ? 'Below zero' : `${Math.round(pct)}% of reorder level`}</span>
                  <Chip tone={deficit ? 'bad' : 'warn'}>{r[5]}</Chip>
                </div>
              </div>
            );
          })}
          {!rows.length && <Empty />}
        </div>
      </Card>
    </>
  );
}

const MOVE_META: Record<string, { icon: string; tone: string; label: string }> = {
  SALE: { icon: 'receipt', tone: styles.toneTeal, label: 'Sale' },
  RETURN_INWARD: { icon: 'return', tone: styles.toneBlue, label: 'Customer return' },
  STOCK_ADJUSTMENT: { icon: 'clipboard', tone: styles.toneAmber, label: 'Stock adjustment' },
  TRANSFER_DISPATCH: { icon: 'truck', tone: styles.toneBlue, label: 'Transfer dispatch' },
};

// Timestamp, Type, Location, SKU, Quantity, State, Source / Destination, Actor
function MovementsView({ data, rows }: ViewProps) {
  const qty = data.rows.map((r) => num(r[4]));
  return (
    <>
      <KpiStrip items={[
        { label: 'Ledger entries', value: String(data.rows.length), icon: 'clipboard', chip: 'append-only' },
        { label: 'Units in', value: `+${qty.filter((q) => q > 0).reduce((s, q) => s + q, 0)}`, icon: 'up', chip: 'returns & adjustments', tone: 'good', highlight: 'teal' },
        { label: 'Units out', value: String(qty.filter((q) => q < 0).reduce((s, q) => s + q, 0)), icon: 'down', chip: 'sales & dispatches', tone: 'bad' },
        { label: 'Movement types', value: String(new Set(data.rows.map((r) => r[1])).size), icon: 'swap', chip: `${new Set(data.rows.map((r) => r[2])).size} locations` },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <ol className={styles.timeline}>
          {rows.map((r, i) => {
            const meta = MOVE_META[r[1]] ?? { icon: 'swap', tone: styles.toneTeal, label: r[1] };
            const q = num(r[4]);
            return (
              <li key={i} className={styles.timelineItem}>
                <span className={`${styles.timelineIcon} ${meta.tone}`}><Icon name={meta.icon} size={15} /></span>
                <div className={styles.timelineBody}>
                  <div className={styles.timelineTop}>
                    <strong>{meta.label}</strong>
                    <span className={styles.monoInline}>{r[3]}</span>
                    <Chip tone={q < 0 ? 'bad' : 'good'}>{r[4]}</Chip>
                    <Chip tone="info">{r[5].replace(/_/g, ' ').toLowerCase()}</Chip>
                  </div>
                  <p>{r[2]} · {r[6]}</p>
                </div>
                <div className={styles.timelineSide}><span className={styles.withIcon}><Icon name="user" size={13} />{r[7]}</span><small><Icon name="clock" size={12} /> {r[0]}</small></div>
              </li>
            );
          })}
          {!rows.length && <Empty />}
        </ol>
      </Card>
    </>
  );
}

// Manifest, Route, SKU, Dispatched, Received Good, Damaged (Quarantine), Shortage
function TransfersView({ data, rows }: ViewProps) {
  const dispatched = data.rows.reduce((s, r) => s + num(r[3]), 0);
  const received = data.rows.reduce((s, r) => s + num(r[4]), 0);
  const damaged = data.rows.reduce((s, r) => s + (num(r[5]) || 0), 0);
  const short = data.rows.reduce((s, r) => s + (num(r[6]) || 0), 0);
  return (
    <>
      <KpiStrip items={[
        { label: 'Manifests with variance', value: String(data.rows.length), icon: 'truck', chip: 'awaiting sign-off', tone: 'warn' },
        { label: 'Units dispatched', value: String(dispatched), icon: 'up', chip: `${received} received good`, tone: 'good' },
        { label: 'Fill rate', value: `${dispatched ? ((received / dispatched) * 100).toFixed(1) : '0'}%`, icon: 'check', chip: 'received ÷ dispatched', highlight: 'teal' },
        { label: 'Units at risk', value: String(damaged + short), icon: 'alert', chip: `${damaged} damaged · ${short} short`, tone: 'bad', highlight: 'pink' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <div className={styles.manifestList}>
          {rows.map((r) => {
            const [from, to] = r[1].split('->').map((s) => s.trim());
            const d = num(r[3]) || 1;
            const ok = num(r[4]);
            const dmg = num(r[5]) || 0;
            const sh = num(r[6]) || 0;
            return (
              <div key={r[0]} className={styles.manifest}>
                <div className={styles.manifestHead}>
                  <span className={styles.mono}>{r[0]}</span>
                  <span className={styles.route}><span>{from}</span><Icon name="arrow" size={13} /><span>{to}</span></span>
                  <span className={styles.monoInline}>{r[2]}</span>
                </div>
                <div className={styles.manifestBar} role="img" aria-label={`Received ${ok}, damaged ${dmg}, short ${sh} of ${d}`}>
                  <i style={{ width: `${(ok / d) * 100}%` }} className={styles.segOk} />
                  {dmg > 0 && <i style={{ width: `${(dmg / d) * 100}%` }} className={styles.segWarn} />}
                  {sh > 0 && <i style={{ width: `${(sh / d) * 100}%` }} className={styles.segBad} />}
                </div>
                <div className={styles.manifestFoot}>
                  <span>Dispatched <b>{r[3]}</b></span>
                  <span>Received <b>{r[4]}</b></span>
                  {dmg > 0 ? <Chip tone="warn">Damaged · {r[5]}</Chip> : <Chip>No damage</Chip>}
                  {sh > 0 ? <Chip tone="bad">Short · {r[6]}</Chip> : <Chip>No shortage</Chip>}
                </div>
              </div>
            );
          })}
          {!rows.length && <Empty />}
        </div>
      </Card>
    </>
  );
}

// Session, Store, Date, Product & SKU, Expected, Physical Count, Delta Variance, Resolution
function AuditsView({ data, rows }: ViewProps) {
  const deltas = data.rows.map((r) => num(r[6]));
  const netVariance = deltas.reduce((s, d) => s + d, 0);
  return (
    <>
      <KpiStrip items={[
        { label: 'Audit sessions', value: String(new Set(data.rows.map((r) => r[0])).size), icon: 'clipboard', chip: 'off-hours counts' },
        { label: 'Surplus lines', value: String(deltas.filter((d) => d > 0).length), icon: 'up', chip: `+${deltas.filter((d) => d > 0).reduce((s, d) => s + d, 0)} units`, tone: 'good', highlight: 'teal' },
        { label: 'Deficit lines', value: String(deltas.filter((d) => d < 0).length), icon: 'down', chip: `${deltas.filter((d) => d < 0).reduce((s, d) => s + d, 0)} units`, tone: 'bad', highlight: 'pink' },
        { label: 'Net variance', value: `${netVariance > 0 ? '+' : ''}${netVariance} ${Math.abs(netVariance) === 1 ? 'unit' : 'units'}`, icon: 'swap', chip: 'all approved', tone: 'good' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <div className={styles.auditList}>
          {rows.map((r) => {
            const exp = num(r[4]);
            const phys = num(r[5]);
            const delta = num(r[6]);
            const max = Math.max(exp, phys, 1);
            return (
              <div key={`${r[0]}-${r[3]}`} className={styles.audit}>
                <div className={styles.auditHead}>
                  <span className={`${styles.skuBadge} ${delta < 0 ? styles.toneRed : styles.toneTeal}`}><Icon name="clipboard" size={14} /></span>
                  <span className={styles.rowLabel}><strong>{r[3]}</strong><small>{r[1]} · {r[2]} · <span className={styles.monoInline}>{r[0]}</span></small></span>
                  <Chip tone={delta < 0 ? 'bad' : 'good'}>{r[6]}</Chip>
                </div>
                <div className={styles.compare}>
                  <div><small>Expected</small><span className={styles.track}><i className={styles.fillMuted} style={{ width: `${(exp / max) * 100}%` }} /></span><b>{r[4]}</b></div>
                  <div><small>Counted</small><span className={styles.track}><i className={delta < 0 ? styles.fillRed : ''} style={{ width: `${(phys / max) * 100}%` }} /></span><b>{r[5]}</b></div>
                </div>
                <p className={styles.resolution}><Icon name="check" size={13} /> {r[7]}</p>
              </div>
            );
          })}
          {!rows.length && <Empty />}
        </div>
      </Card>
    </>
  );
}

// Effective Date, SKU & Product, Field, Old Price, New Price, Authorized By, Reason
function PriceView({ data, rows }: ViewProps) {
  const changes = data.rows.map((r) => ((num(r[4]) - num(r[3])) / (num(r[3]) || 1)) * 100);
  const biggest = Math.max(...changes, 0);
  return (
    <>
      <KpiStrip items={[
        { label: 'Price changes', value: String(data.rows.length), icon: 'tag', chip: 'with written reason', tone: 'good' },
        { label: 'Average change', value: `${changes.length ? (changes.reduce((s, c) => s + c, 0) / changes.length).toFixed(1) : '0'}%`, icon: 'up', chip: 'selling price', highlight: 'teal' },
        { label: 'Largest increase', value: `+${biggest.toFixed(1)}%`, icon: 'alert', chip: data.rows[changes.indexOf(biggest)]?.[1].split(' (')[0], tone: 'warn' },
        { label: 'Approvers', value: String(new Set(data.rows.map((r) => r[5])).size), icon: 'shield', chip: 'super admin only' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <div className={styles.priceList}>
          {rows.map((r) => {
            const pct = ((num(r[4]) - num(r[3])) / (num(r[3]) || 1)) * 100;
            const [sku, name] = [r[1].split(' (')[0], r[1].match(/\((.*)\)/)?.[1] ?? r[1]];
            return (
              <div key={`${r[0]}-${r[1]}`} className={styles.priceRow}>
                <span className={`${styles.skuBadge} ${styles.toneBlue}`}><Icon name="tag" size={14} /></span>
                <span className={styles.rowLabel}><strong>{name}</strong><small><span className={styles.monoInline}>{sku}</span> · {r[2]} · {r[0]}</small></span>
                <span className={styles.priceChange}><s>{r[3]}</s><Icon name="arrow" size={13} /><b>{r[4]}</b></span>
                <Chip tone={pct > 0 ? 'warn' : 'good'}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</Chip>
                <p className={styles.quote}>“{r[6]}” <small>— {r[5]}</small></p>
              </div>
            );
          })}
          {!rows.length && <Empty />}
        </div>
      </Card>
    </>
  );
}

// Invoice #, Store Branch, Cancelled Timestamp, Supervisor Authorizer, Net Refund, Method, Reason
function VoidsView({ data, rows }: ViewProps) {
  const refunded = data.rows.reduce((s, r) => s + num(r[4]), 0);
  return (
    <>
      <KpiStrip items={[
        { label: 'Voided invoices', value: String(data.rows.length), icon: 'x', chip: 'ledger reversed', tone: 'bad' },
        { label: 'Refunded value', value: formatInr(refunded, 2), icon: 'rupee', chip: 'manual refunds', tone: 'warn', highlight: 'pink' },
        { label: 'Stores', value: String(new Set(data.rows.map((r) => r[1])).size), icon: 'store', chip: 'with voids' },
        { label: 'Supervisor approved', value: `${data.rows.filter((r) => r[3]).length}/${data.rows.length}`, icon: 'shield', chip: 'OD-08 compliant', tone: 'good', highlight: 'teal' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <div className={styles.voidList}>
          {rows.map((r) => (
            <div key={r[0]} className={styles.voidRow}>
              <div className={styles.voidHead}>
                <span className={`${styles.skuBadge} ${styles.toneRed}`}><Icon name="receipt" size={14} /></span>
                <span className={styles.rowLabel}><span className={styles.mono}>{r[0]}</span><small>{r[1]} · {r[2]}</small></span>
                <Chip tone="info">{r[5]}</Chip>
                <b className={styles.badText}>−{r[4]}</b>
              </div>
              <p className={styles.quote}>“{r[6]}”</p>
              <div className={styles.voidFoot}><Icon name="shield" size={13} /> Authorised by {r[3]}</div>
            </div>
          ))}
          {!rows.length && <Empty />}
        </div>
      </Card>
    </>
  );
}

// Timestamp, Cashier, Terminal, Product, Qty, Unit Price, Supervisor Override
function DeletionsView({ data, rows }: ViewProps) {
  const value = (r: string[]) => num(r[4]) * num(r[5]);
  const total = data.rows.reduce((s, r) => s + value(r), 0);
  const overrides = data.rows.filter((r) => !/^none/i.test(r[6])).length;
  return (
    <>
      <KpiStrip items={[
        { label: 'Lines deleted', value: String(data.rows.length), icon: 'trash', chip: 'from POS carts', tone: 'warn' },
        { label: 'Value removed', value: formatInr(total, 2), icon: 'rupee', chip: 'qty × unit price', highlight: 'pink', tone: 'bad' },
        { label: 'Cashiers involved', value: String(new Set(data.rows.map((r) => r[1])).size), icon: 'user', chip: `${new Set(data.rows.map((r) => r[2])).size} terminals` },
        { label: 'Supervisor overrides', value: String(overrides), icon: 'shield', chip: `${data.rows.length - overrides} below threshold`, tone: 'good', highlight: 'teal' },
      ]} />
      <Card title={data.title} subtitle={data.description}>
        <Table
          headers={['Cashier', 'Product removed', 'Quantity', 'Value', 'Override', 'When']}
          alignRight={[3]}
          rows={rows.map((r) => [
            <span key="c" className={styles.invoiceCell}><span className={`${styles.skuBadge} ${styles.toneBlue}`}>{initials(r[1])}</span><span className={styles.cellStack}><strong>{r[1].replace(/\s*\(.*\)/, '')}</strong><small>{r[2]}</small></span></span>,
            <span key="p" className={styles.cellStack}><strong>{r[3].replace(/\s*\(.*\)/, '')}</strong><small className={styles.monoInline}>{r[3].match(/\((.*)\)/)?.[1] ?? ''}</small></span>,
            `${r[4]} × ${r[5]}`,
            <strong key="v">{formatInr(value(r), 2)}</strong>,
            <Chip key="o" tone={/^none/i.test(r[6]) ? 'neutral' : 'good'}>{r[6]}</Chip>,
            <span key="w" className={styles.withIcon}><Icon name="clock" size={13} />{r[0]}</span>,
          ])}
        />
      </Card>
    </>
  );
}

