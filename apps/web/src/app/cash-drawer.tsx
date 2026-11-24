'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Feedback } from '@/components/ui/feedback';

type Drawer = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  expectedCash: string;
  expectedCard: string;
  countedCash: string | null;
  countedCard: string | null;
};

export function CashDrawer({
  api, token, locationId, canClose, onDrawer, formatMoney,
}: {
  api: string;
  token: string;
  locationId: string;
  canClose: boolean;
  onDrawer: (id: string | null) => void;
  formatMoney: (amount: number | string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [history, setHistory] = useState<Drawer[]>([]);
  const [opening, setOpening] = useState('');
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(async (operation: '' | '/open' | '/close', body?: unknown, signal?: AbortSignal) => {
    const response = await fetch(`${api}/pos/cash-drawer${operation}?locationId=${encodeURIComponent(locationId)}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Could not update the cash drawer.');
    return payload.data;
  }, [api, locationId, token]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await request('', undefined, signal) as { drawer: Drawer | null; history: Drawer[] };
    if (signal?.aborted) return;
    setDrawer(data.drawer);
    setHistory(data.history);
    onDrawer(data.drawer?.id ?? null);
    setReady(true);
  }, [request, onDrawer]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready || (drawer && !canClose)) return;
    setBusy(true);
    setError('');
    try {
      const saved = await request(drawer ? '/close' : '/open', drawer
        ? { id: drawer.id, countedCash: Number(cash), countedCard: Number(card) }
        : { openingCash: Number(opening) }) as Drawer;
      onDrawer(saved.closedAt ? null : saved.id);
      setDrawer(saved.closedAt ? null : saved);
      if (saved.closedAt) setHistory((current) => [saved, ...current.filter((row) => row.id !== saved.id)].slice(0, 20));
      setOpening('');
      setCash('');
      setCard('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the cash drawer.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="admin-secondary" onClick={() => {
      setOpen(true);
      setError('');
      void refresh().catch((cause: Error) => setError(cause.message));
    }}>Cash drawer{drawer ? ' · Open' : ''}</button>
    {open && <div className="receipt-overlay">
      <section className="receipt-card receipt-history-card" role="dialog" aria-modal="true" aria-labelledby="cash-drawer-title">
        <h2 id="cash-drawer-title">Cash drawer</h2>
        <p>Sales assigned to this drawer and refunds processed while it’s open count toward settlement.</p>
        {error && <Feedback tone="error">{error}</Feedback>}
        <form onSubmit={(event) => void submit(event)}>
          {drawer ? <>
            <p>Opening float {formatMoney(drawer.openingCash)} · Expected cash {formatMoney(drawer.expectedCash ?? drawer.openingCash)} · Expected card {formatMoney(drawer.expectedCard ?? 0)}</p>
            <label className="discount-input">Cash counted, including float<input type="number" min="0" max="9999999999.99" step="0.01" required value={cash} onChange={(event) => setCash(event.target.value)} /></label>
            <label className="discount-input">Card terminal net total<input type="number" min="-9999999999.99" max="9999999999.99" step="0.01" required value={card} onChange={(event) => setCard(event.target.value)} /></label>
            {!canClose && <p>Complete or clear your basket and sync queued sales before closing.</p>}
          </> : <label className="discount-input">Opening cash float<input type="number" min="0" max="9999999999.99" step="0.01" required value={opening} onChange={(event) => setOpening(event.target.value)} /></label>}
          <div className="device-lock-actions">
            <button type="button" className="admin-secondary" disabled={busy} onClick={() => setOpen(false)}>Done</button>
            <button type="submit" className="admin-primary" disabled={busy || !ready || (!!drawer && !canClose)}>{busy ? 'Saving…' : drawer ? 'Settle and close' : 'Open drawer'}</button>
          </div>
        </form>
        {history.length > 0 && <section aria-label="Recent closures">
          <h3>Recent closures</h3>
          {history.map((row) => <div className="receipt-line" key={row.id}>
            <span>{new Date(row.closedAt!).toLocaleString()} <small>Counted cash {formatMoney(row.countedCash ?? 0)} · Card {formatMoney(row.countedCard ?? 0)}</small></span>
            <span>Cash difference {formatMoney(Number(row.countedCash) - Number(row.expectedCash))}<small>Card difference {formatMoney(Number(row.countedCard) - Number(row.expectedCard))}</small></span>
          </div>)}
        </section>}
      </section>
    </div>}
  </>;
}
