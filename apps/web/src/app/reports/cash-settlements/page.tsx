'use client';

import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { getStoredSession } from '@/lib/auth';
import styles from './settlements.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Settlement = {
  id: string;
  location: string;
  operator: string;
  currency: string;
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

function dateInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export default function CashSettlementsPage() {
  const [token, setToken] = useState('');
  const [canConsolidate, setCanConsolidate] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    const now = new Date();
    setFrom(dateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)));
    setTo(dateInput(now));
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
        const payload = await response.json();
        const stores = payload.data.filter((entry: { type: string }) => entry.type === 'RETAIL_STORE');
        setLocations(stores);
        if (!consolidated) setLocationId(stores[0]?.id ?? '');
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
    if (!token || !from || !to || (!canConsolidate && !locationId)) return;
    const controller = new AbortController();
    setRows([]);
    if (from > to) {
      setError('End date must be on or after the start date.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ from, to, ...(locationId ? { locationId } : {}) });
    void fetch(`${API_BASE}/reports/cash-settlements?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not load settlements.');
      setRows(payload.data);
    }).catch((error) => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, from, to, locationId, canConsolidate]);

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
    {(error || locationError) && <Feedback tone="error">{error || locationError}</Feedback>}
    {loading && <p role="status">Loading settlements…</p>}
    {!loading && !error && !locationError && rows.length === 0 && <p>No closed drawers in this period.</p>}
    {[...groups.entries()].map(([group, entries]) => <section key={group} className={styles.period}>
      <h2>{group}</h2>
      <div className={styles.tableScroll}>
        <table>
          <thead><tr><th scope="col">Drawer</th><th scope="col">Opening float</th><th scope="col">Expected cash</th><th scope="col">Counted cash</th><th scope="col">Cash difference</th><th scope="col">Expected card</th><th scope="col">Counted card</th><th scope="col">Card difference</th></tr></thead>
          <tbody>{entries.map((row) => <tr key={row.id}>
            <th scope="row">{row.location}<small>{row.operator} · {new Date(row.closedAt).toLocaleString()}</small></th>
            {[row.openingCash, row.expectedCash, row.countedCash, row.cashDifference, row.expectedCard, row.countedCard, row.cardDifference].map((amount, index) => <td key={index} className={(index === 3 || index === 6) && Number(amount) < 0 ? styles.shortage : ''}>{money(amount, row.currency)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>)}
  </main>;
}
