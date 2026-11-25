'use client';

/* Per-tab layouts for the Reports page. Each view = KPI strip + a visual that fits the
   report + a detail list/table. Data comes from the page's existing report datasets. */
import React, { useState } from 'react';
import styles from './reports.module.css';
import { Icon, formatMoney, formatCompactMoney, formatDay, type SalesSummary, type SalesDetails, type StockReport } from './report-ui';

type Matches = (...values: Array<string | number>) => boolean;
type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'info';

/* ---------- small building blocks ---------- */

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

export function Card({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
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

export function SalesView({ currency, sales, matches, rangeLabel }: { currency: string; sales: SalesSummary; matches: Matches; rangeLabel: string }) {
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
        { label: 'Net sales', value: formatMoney(currency, net), icon: 'money', chip: rangeLabel, tone: 'good' },
        { label: 'Completed invoices', value: invoices.toLocaleString('en-IN'), icon: 'receipt', chip: `${sales.locations.length} stores`, highlight: 'teal' },
        { label: 'Average bill', value: formatMoney(currency, invoices ? net / invoices : 0), icon: 'tag', chip: 'per invoice', tone: 'good' },
        { label: 'Cancelled invoices', value: String(sales.totals.cancelledInvoices), icon: 'x', chip: `${((sales.totals.cancelledInvoices / Math.max(invoices + sales.totals.cancelledInvoices, 1)) * 100).toFixed(1)}% of bills`, tone: 'bad' },
      ]} />

      <section className={styles.rowGrid}>
        <Card title="Daily net sales" subtitle={`Last ${sales.daily.length} trading days · best day ${best ? formatDay(best.date) : '—'}`} action={best && <span className={styles.highlightPill}>Peak {formatCompactMoney(currency, Number(best.netSales))}</span>}>
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
                  <title>{`${formatDay(d.date)}: ${formatMoney(currency, Number(d.netSales))} · ${d.invoices} invoices`}</title>
                  <circle cx={x} cy={y} r={isBest ? 6 : 4} className={isBest ? styles.areaDotBest : styles.areaDot} />
                  <text x={x} y={y - 12} textAnchor="middle" className={styles.areaValue}>{formatCompactMoney(currency, Number(d.netSales))}</text>
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
                    <span className={styles.rowLabel}><strong>{s.locationName}</strong><small>{s.invoices} invoices · {formatMoney(currency, s.invoices ? value / s.invoices : 0)} avg</small></span>
                    <b className={styles.storeValue}>{formatCompactMoney(currency, value)}</b>
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
              <span key="d" className={styles.cellStack}><strong>{formatDay(d.date)}</strong><small>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })}</small></span>,
              d.invoices,
              d.cancelled ? <Chip key="c" tone="bad">{d.cancelled}</Chip> : <span key="c" className={styles.mutedText}>0</span>,
              formatMoney(currency, d.invoices ? v / d.invoices : 0),
              <span key="b" className={`${styles.track} ${styles.inlineTrack}`}><i style={{ width: `${(v / maxDay) * 100}%` }} /></span>,
              <strong key="n">{formatMoney(currency, v, 2)}</strong>,
            ];
          })}
        />
      </Card>
    </>
  );
}

/* ---------- 2. Invoices ---------- */

export function InvoicesView({ currency, timezone, details, matches }: { currency: string; timezone: string; details: SalesDetails; matches: Matches }) {
  const labels = { FINALIZED: 'Finalized', PARTLY_RETURNED: 'Partly returned', RETURNED: 'Returned', CANCELLED: 'Cancelled' };
  const [status, setStatus] = useState<'all' | keyof typeof labels>('all');
  const finalized = details.rows.filter((r) => r.status === 'FINALIZED');
  const cancelled = details.rows.filter((r) => r.status !== 'FINALIZED');
  const netValue = details.rows.reduce((sum, row) => sum + Number(row.netAfterRefunds), 0);
  const largest = [...finalized].sort((a, b) => Number(b.netTotal) - Number(a.netTotal))[0];
  const rows = details.rows.filter((r) => (status === 'all' || r.reportStatus === status) && matches(r.invoiceNumber, r.location.name, labels[r.reportStatus]));

  return (
    <>
      <KpiStrip items={[
        { label: 'Invoices recorded', value: String(details.total), icon: 'receipt', chip: `page ${details.page} of ${details.totalPages}` },
        { label: 'Net after refunds', value: formatMoney(currency, netValue, 2), icon: 'money', chip: 'Shown on this page', tone: 'good', highlight: 'teal' },
        { label: 'Largest bill', value: largest ? formatMoney(currency, Number(largest.netTotal)) : '—', icon: 'up', chip: largest?.invoiceNumber, tone: 'info' },
        { label: 'Cancelled', value: String(cancelled.length), icon: 'x', chip: formatMoney(currency, cancelled.reduce((s, r) => s + Number(r.netTotal), 0)) + ' voided', tone: 'bad' },
      ]} />

      <Card
        title="Itemised sales transactions"
        subtitle="Latest invoices across the selected stores"
        action={<Segmented label="Invoice status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'FINALIZED', label: 'Finalized' }, { value: 'PARTLY_RETURNED', label: 'Partly returned' }, { value: 'RETURNED', label: 'Returned' }, { value: 'CANCELLED', label: 'Cancelled' }]} />}
      >
        <Table
          headers={['Invoice', 'Store', 'Status', 'Created', 'Original total', 'Refunds', 'Net after refunds']}
          alignRight={[4, 5, 6]}
          rows={rows.map((r) => [
            <span key="i" className={styles.invoiceCell}><span className={`${styles.skuBadge} ${r.status === 'FINALIZED' ? styles.toneTeal : styles.toneRed}`}><Icon name="receipt" size={14} /></span><span className={styles.cellStack}><span className={styles.mono}>{r.invoiceNumber}</span><small>{relativeTime(r.createdAt)}</small></span></span>,
            <span key="s" className={styles.withIcon}><Icon name="store" size={14} />{r.location.name}</span>,
            <Chip key="st" tone={r.reportStatus === 'FINALIZED' ? 'good' : r.reportStatus === 'CANCELLED' ? 'bad' : 'warn'}>{labels[r.reportStatus]}</Chip>,
            new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone }),
            formatMoney(currency, Number(r.originalTotal), 2),
            formatMoney(currency, Number(r.refundedTotal), 2),
            <strong key="n">{formatMoney(currency, Number(r.netAfterRefunds), 2)}</strong>,
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
