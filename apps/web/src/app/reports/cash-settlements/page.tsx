'use client';

import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { downloadCsv, downloadPdf } from '@/lib/report-download';
import { addCalendarDays, businessDate } from '@/lib/business-date';
import { getStoredSession } from '@/lib/auth';
import styles from './settlements.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

const drawerColumns = ['Opening float', 'Expected cash', 'Counted cash', 'Cash difference', 'Expected card', 'Counted card', 'Card difference', 'Cash to remove'];

type Store = { id: string; name: string; company?: { timezone?: string } };

type Settlement = {
  id: string;
  location: string;
  operator: string;
  currency: string;
  timezone?: string;
  cadence: string;
  period: string;
  closedAt: string;
  openingCash: string;
  expectedCash: string;
  countedCash: string;
  expectedCard: string;
  countedCard: string;
  cashDifference: string;
  cardDifference: string;
};

export default function CashSettlementsPage() {
  const [token, setToken] = useState('');
  const [canConsolidate, setCanConsolidate] = useState(false);
  const [locations, setLocations] = useState<Store[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [loaded, setLoaded] = useState<{ query: string; rows: Settlement[] }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.accessToken) {
      setError('Sign in again to view cash settlements.');
      setLoading(false);
      return;
    }
    const consolidated = ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role);
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const controller = new AbortController();
    setCanConsolidate(consolidated);
    void fetch(`${API_BASE}/locations`, { headers, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load authorized stores.');
        const payload: { data: Array<Store & { type: string }> } = await response.json();
        if (controller.signal.aborted) return;
        const stores = payload.data.filter((entry) => entry.type === 'RETAIL_STORE');
        const workspace = window.localStorage.getItem('premium-retail-location-scope');
        const selected = stores.find((store) => store.name === workspace)
          ?? (consolidated ? undefined : stores[0]);
        setLocations(stores);
        setLocationId(selected?.id ?? '');
        const today = businessDate(new Date(), selected?.company?.timezone ?? stores[0]?.company?.timezone ?? 'UTC');
        setFrom(addCalendarDays(today, -29));
        setTo(today);
        setToken(session.accessToken);
        if (!consolidated && !stores.length) setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLocationError(error.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function syncLocation(event: Event) {
      const name = (event as CustomEvent<string>).detail;
      const selected = locations.find((store) => store.name === name);
      setLocationId(selected?.id ?? (canConsolidate ? '' : locations[0]?.id ?? ''));
    }
    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, [canConsolidate, locations]);

  const query = new URLSearchParams({ from, to, ...(locationId ? { locationId } : {}) }).toString();
  const rows = loaded?.query === query ? loaded.rows : [];

  useEffect(() => {
    if (!token || !from || !to || (!canConsolidate && !locationId)) return;
    const controller = new AbortController();
    if (from > to) {
      setError('End date must be on or after the start date.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    void fetch(`${API_BASE}/reports/cash-settlements?${query}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not load settlements.');
      if (!controller.signal.aborted) setLoaded({ query, rows: payload.data });
    }).catch((error) => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, from, to, locationId, canConsolidate, query]);

  const cashToRemove = (row: Settlement) => Math.max(0, Number(row.countedCash) - Number(row.openingCash));
  const exportSettlement = (format: 'csv' | 'pdf') => {
    const headers = ['Store', 'Operator', 'Closed at (UTC)', 'Currency', 'Reporting period', 'Opening float', 'Expected cash',
      'Counted cash', 'Cash variance', 'Cash to remove', 'Expected card', 'Counted card', 'Card variance'];
    const records = rows.map((row) => [row.location, row.operator, row.closedAt, row.currency, row.period,
      row.openingCash, row.expectedCash, row.countedCash, row.cashDifference, cashToRemove(row).toFixed(2),
      row.expectedCard, row.countedCard, row.cardDifference]);
    const filename = `cash-settlements-${from}-to-${to}.csv`;
    if (format === 'pdf') downloadPdf('Cash settlements', `${records.length} closed drawers`, headers, records, filename);
    else downloadCsv(headers, records, filename);
  };

  const money = (amount: string, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount));
  const groups = rows.reduce((result, row) => {
    const key = `${row.cadence} · ${row.period}`;
    const group = result.get(key) ?? [];
    group.push(row);
    result.set(key, group);
    return result;
  }, new Map<string, Settlement[]>());

  return <main className={`app-page ${styles.page}`}>
    <header>
      <a href="/reports">Back to Reports</a>
      <h1>Cash settlements</h1>
      <p>Review expected and counted cash and card totals by drawer.</p>
    </header>
    <div className={styles.filters}>
      <label>From<input type="date" value={from} max={to} onChange={(e) => { if (e.target.value) setFrom(e.target.value); }} /></label>
      <label>To<input type="date" value={to} min={from} onChange={(e) => { if (e.target.value) setTo(e.target.value); }} /></label>
      <label>Store<select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
        {canConsolidate && <option value="">All authorized stores</option>}
        {locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
      </select></label>
    </div>
    <div className={styles.filters}>
      <button type="button" className="admin-secondary" disabled={loading || !rows.length || !!error} onClick={() => exportSettlement('csv')}>Download CSV</button>
      <button type="button" className="admin-secondary" disabled={loading || !rows.length || !!error} onClick={() => exportSettlement('pdf')}>Download PDF</button>
    </div>
    {(error || locationError) && <Feedback tone="error">{error || locationError}</Feedback>}
    {loading && <p role="status">Loading settlements…</p>}
    {!loading && !error && !locationError && rows.length === 0 && <p>No closed drawers in this period.</p>}
    {[...groups.entries()].map(([group, entries]) => <section key={group} className={styles.period}>
      <h2>{group}</h2>
      <div className={styles.tableScroll} role="region" aria-label={`Cash settlements for ${group}`} tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Drawer</th>{drawerColumns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{entries.map((row) => <tr key={row.id}>
            <th scope="row">{row.location}<small>{row.operator} · {new Date(row.closedAt).toLocaleString(undefined, { timeZone: row.timezone })}</small></th>
            {[row.openingCash, row.expectedCash, row.countedCash, row.cashDifference, row.expectedCard, row.countedCard, row.cardDifference, cashToRemove(row).toFixed(2)].map((amount, index) => <td key={index} data-label={drawerColumns[index]} className={(index === 3 || index === 6) && Number(amount) < 0 ? styles.shortage : ''}>{money(amount, row.currency)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>)}
  </main>;
}
