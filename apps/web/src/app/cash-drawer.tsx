'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Banknote, LockKeyhole, Wallet } from 'lucide-react';
import { AdminModal } from '@/components/admin/admin-modal';
import Link from 'next/link';
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
  api, token, locationId, timezone, canClose, closeHref, onDrawer, formatMoney, isOpen, onOpenChange, onReviewPendingSales, refreshKey, hideTrigger = false,
}: {
  api: string;
  token: string;
  locationId: string;
  timezone?: string;
  canClose: boolean;
  hideTrigger?: boolean;
  isOpen?: boolean;
  onOpenChange?: (value: boolean) => void;
  closeHref?: string;
  onReviewPendingSales?: () => void;
  refreshKey?: number;
  onDrawer: (id: string | null) => void;
  formatMoney: (amount: number | string) => string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const formId = useId();
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
    setReady(false);
    void refresh(controller.signal).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [refresh, open, refreshKey]);

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
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the cash drawer.');
    } finally {
      setBusy(false);
    }
  }

  const cashVariance = cash.trim() && drawer ? Number(cash) - Number(drawer.expectedCash ?? drawer.openingCash) : null;
  const cardVariance = card.trim() && drawer ? Number(card) - Number(drawer.expectedCard ?? 0) : null;

  function closeDialog() {
    if (!busy) setOpen(false);
  }

  return <>
    {!hideTrigger && <button type="button" className="admin-secondary" onClick={() => { setError(''); setOpen(true); }}>
      <Wallet size={16} aria-hidden="true" /> Cash drawer{ready ? drawer ? ' · Open' : ' · Closed' : ''}
    </button>}
    <AdminModal isOpen={open} onClose={closeDialog} title="Cash drawer" maxWidth="600px"
      badgeIcon={<Wallet size={22} aria-hidden="true" />}
      subtitle={!ready ? undefined : drawer ? 'Compare counted cash and card totals with the register.' : 'Enter the cash available for change at the start of the shift.'}
      footer={<>
        <button type="button" className="admin-secondary" disabled={busy} onClick={closeDialog}>Done</button>
        {drawer && closeHref ? <Link className="admin-primary" href={closeHref}>Settle in Checkout</Link> :
          <button type="submit" form={formId} className="admin-primary" disabled={busy || !ready || (!!drawer && !canClose)}>
            {busy ? 'Saving…' : drawer ? 'Settle and close' : 'Open drawer'}
          </button>}
      </>}>
      <div className="drawer-body">
        {error && <Feedback tone="error">{error}</Feedback>}
        {!ready && !error && <p role="status">Checking drawer status…</p>}
        {ready && <form id={formId} onSubmit={(event) => void submit(event)}>
          {drawer ? <>
            <dl className="drawer-summary">
              <div><dt>Opening float</dt><dd>{formatMoney(drawer.openingCash)}</dd></div>
              <div><dt>Expected cash</dt><dd>{formatMoney(drawer.expectedCash ?? drawer.openingCash)}</dd></div>
              <div><dt>Expected card</dt><dd>{formatMoney(drawer.expectedCard ?? 0)}</dd></div>
            </dl>
            {!closeHref && <div className="drawer-fields">
              <label>Cash counted, including float
                <input type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required placeholder="0.00" value={cash} onChange={(event) => setCash(event.target.value)} />
                {cashVariance !== null && <small>Difference {formatMoney(cashVariance)}</small>}
              </label>
              <label>Card terminal net total
                <input type="number" inputMode="decimal" min="-9999999999.99" max="9999999999.99" step="0.01" required placeholder="0.00" value={card} onChange={(event) => setCard(event.target.value)} />
                {cardVariance !== null && <small>Difference {formatMoney(cardVariance)}</small>}
              </label>
            </div>}
            {!canClose && <Feedback action={onReviewPendingSales && <button type="button" className="admin-secondary" disabled={busy}
              onClick={() => { closeDialog(); onReviewPendingSales(); }}>Review pending sales</button>}>
              {closeHref ? 'Settle the drawer from Checkout.' : onReviewPendingSales
                ? 'Resolve pending sales before closing this drawer.'
                : 'Complete or clear the basket before closing. Checkout also checks for pending sales.'}
            </Feedback>}
          </> : <div className="drawer-fields drawer-fields--opening">
            <label><span><Banknote size={16} aria-hidden="true" /> Opening cash float</span>
              <input type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required placeholder="0.00" value={opening} onChange={(event) => setOpening(event.target.value)} />
              <small>Count the notes and coins available for change. Enter 0 for an empty drawer.</small>
            </label>
          </div>}
        </form>}
        {history.length > 0 && <details className="drawer-history">
          <summary><LockKeyhole size={15} aria-hidden="true" /> Recent settlements</summary>
          {history.map((row) => <div className="drawer-history-row" key={row.id}>
            <span>{new Date(row.closedAt!).toLocaleString(undefined, { timeZone: timezone })}<small>Cash {formatMoney(row.countedCash ?? 0)} · Card {formatMoney(row.countedCard ?? 0)}</small></span>
            <span>Cash difference {formatMoney(Number(row.countedCash) - Number(row.expectedCash))}<small>Card difference {formatMoney(Number(row.countedCard) - Number(row.expectedCard))}</small></span>
          </div>)}
        </details>}
      </div>
    </AdminModal>
  </>;
}
