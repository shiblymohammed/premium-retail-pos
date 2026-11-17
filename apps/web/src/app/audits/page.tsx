'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { revokeSession } from '@/lib/auth';
import styles from './audits.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Location = { id: string; name: string; type: string };
type AuditItem = {
  id: string;
  expectedQtyBase?: number;
  countedQtyBase: number | null;
  recountQtyBase: number | null;
  requiresRecount: boolean;
  varianceBase: number | null;
  variancePercent: string | number | null;
  approvedQtyBase?: number | null;
  highCountAlert: boolean;
  variant: { id: string; sku: string; name: string; product: { name: string; baseUnit: string } };
};
type Session = {
  id: string;
  locationId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  resolutionReason?: string | null;
  approvedByUserId?: string | null;
  approvedBy?: { id: string; email: string } | null;
  countItems: AuditItem[];
};
type SessionRow = { id: string; status: string; startedAt: string; completedAt: string | null; _count: { countItems: number } };
type Threshold = { scopeKey: string; categoryId: string | null; recountVariancePercent: string | number; recountVarianceUnits: number; highCountAlertQty: number | null; category: { id: string; name: string } | null };
type ProductCategory = { category: { id: string; name: string } | null };
type Schedule = { locationId: string; enabled: boolean; startTime: string | null; timezone: string; lastRunDate: string | null; locationType: string; allowedDays: string; earliestStartTime: string | null; canStartNow: boolean };

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : `Request failed (${response.status})`);
  return payload.data as T;
}

export default function AuditsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [policyScope, setPolicyScope] = useState('default');
  const [percent, setPercent] = useState('2');
  const [units, setUnits] = useState('5');
  const [highCount, setHighCount] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [thresholdReason, setThresholdReason] = useState('');
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [actorRole, setActorRole] = useState('');

  const selectedLocation = locations.find((location) => location.id === locationId);
  const canResolve = session?.status === 'SUBMITTED';
  const activeSession = useMemo(() => sessions.find((item) => item.status === 'ACTIVE'), [sessions]);

  async function authorized<T>(path: string, init: RequestInit = {}) {
    return responseData<T>(await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    }));
  }

  async function loadSessions(nextLocationId = locationId, accessToken = token) {
    if (!nextLocationId || !accessToken) return;
    const rows = await responseData<SessionRow[]>(await fetch(`${API_BASE}/audits/locations/${nextLocationId}/sessions`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
    setSessions(rows);
  }

  async function loadSession(id: string) {
    const current = await authorized<Session>(`/audits/sessions/${id}`);
    setSession(current);
    setCounts(Object.fromEntries(current.countItems.map((item) => [item.id, String(item.requiresRecount ? item.recountQtyBase ?? '' : item.countedQtyBase ?? '')])));
    setApprovalReason('');
  }

  async function loadSchedule(nextLocationId = locationId, accessToken = token) {
    if (!nextLocationId || !accessToken) return;
    const value = await responseData<Schedule>(await fetch(`${API_BASE}/audits/locations/${nextLocationId}/schedule`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
    setSchedule(value); setScheduleTime(value.startTime ?? '19:00');
  }

  async function refreshPolicy(accessToken = token) {
    const [policyRows, products] = await Promise.all([
      responseData<Threshold[]>(await fetch(`${API_BASE}/audits/thresholds`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })),
      responseData<ProductCategory[]>(await fetch(`${API_BASE}/products?isActive=true`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })),
    ]);
    setThresholds(policyRows);
    setCategories([...new Map(products.filter((p) => p.category).map((p) => [p.category!.id, p.category!])).values()]);
    const first = policyRows[0];
    if (first) {
      setPolicyScope(first.scopeKey);
      setPercent(String(first.recountVariancePercent));
      setUnits(String(first.recountVarianceUnits));
      setHighCount(first.highCountAlertQty === null ? '' : String(first.highCountAlertQty));
    }
  }

  useEffect(() => {
    const policy = thresholds.find((item) => item.scopeKey === policyScope);
    if (!policy) return;
    setPercent(String(policy.recountVariancePercent));
    setUnits(String(policy.recountVarianceUnits));
    setHighCount(policy.highCountAlertQty === null ? '' : String(policy.highCountAlertQty));
  }, [policyScope, thresholds]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await responseData<{ accessToken: string }>(await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
      const accessToken = result.accessToken;
      const actor = await responseData<{ role: string }>(await fetch(`${API_BASE}/users/me/sales-permissions`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
      setActorRole(actor.role);
      const visibleLocations = await responseData<Location[]>(await fetch(`${API_BASE}/locations?isActive=true`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
      setToken(accessToken); setLocations(visibleLocations); setLocationId(visibleLocations[0]?.id || ''); setPassword('');
      await refreshPolicy(accessToken);
      if (!visibleLocations.length) setNotice('This account has no active locations in its scope.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!token || !locationId) return;
    void Promise.all([loadSessions(), loadSchedule()]).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load location audit settings'));
    const timer = window.setInterval(() => void loadSchedule().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [token, locationId]);

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const value = await authorized<Schedule>(`/audits/locations/${locationId}/schedule`, { method: 'PATCH', body: JSON.stringify({ enabled: true, startTime: scheduleTime }) });
      setSchedule(value); setNotice(`Audit schedule saved for ${value.allowedDays} at or after ${value.startTime} (${value.timezone}).`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the daily schedule'); }
    finally { setBusy(false); }
  }

  async function startAudit() {
    if (!locationId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await authorized<Session>(`/audits/locations/${locationId}/sessions`, { method: 'POST' });
      setSession(created); setCounts({}); await loadSessions(); setNotice('Audit started. Expected quantities are hidden while counts are entered.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start audit'); }
    finally { setBusy(false); }
  }

  async function recordCount(item: AuditItem) {
    const quantityBaseUnits = Number(counts[item.id]);
    if (!Number.isInteger(quantityBaseUnits) || quantityBaseUnits < 0) { setError('Enter a whole-number count of zero or more.'); return; }
    setBusy(true); setError('');
    try {
      await authorized(`/audits/sessions/${session!.id}/items/${item.id}/count`, { method: 'POST', body: JSON.stringify({ quantityBaseUnits }) });
      await loadSession(session!.id); setNotice(item.requiresRecount ? 'Recount saved.' : 'Count saved.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save count'); }
    finally { setBusy(false); }
  }

  async function requestRecount(item: AuditItem) {
    const recountReason = window.prompt(`Why does ${item.variant.sku} need a recount?`);
    if (!recountReason?.trim()) return;
    setBusy(true); setError('');
    try { await authorized(`/audits/sessions/${session!.id}/items/${item.id}/recount-required`, { method: 'POST', body: JSON.stringify({ reason: recountReason }) }); await loadSession(session!.id); setNotice('Item added to the recount queue.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request recount'); }
    finally { setBusy(false); }
  }

  async function sessionAction(action: 'submit' | 'approve' | 'abort') {
    if (!session) return;
    if (action !== 'submit' && !approvalReason.trim()) { setError('Enter a reason before resolving the audit.'); return; }
    setBusy(true); setError('');
    try {
      await authorized(`/audits/sessions/${session.id}/${action}`, { method: 'POST', ...(action === 'submit' ? {} : { body: JSON.stringify({ reason: approvalReason }) }) });
      await loadSession(session.id); await loadSessions(); setNotice(action === 'approve' ? 'Audit approved; ledger adjustments were posted.' : action === 'abort' ? 'Audit aborted without changing stock.' : 'Audit submitted for manager review.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Audit action failed'); }
    finally { setBusy(false); }
  }

  async function abortCurrent() {
    if (!session) return;
    const abortReason = window.prompt('Why is this stock audit being aborted?');
    if (!abortReason?.trim()) return;
    setBusy(true); setError('');
    try {
      await authorized(`/audits/sessions/${session.id}/abort`, { method: 'POST', body: JSON.stringify({ reason: abortReason }) });
      await loadSession(session.id); await loadSessions(); setNotice('Audit aborted without changing stock.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not abort audit'); }
    finally { setBusy(false); }
  }

  async function saveThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const categoryId = policyScope === 'default' ? undefined : policyScope.replace(/^category:/, '');
      await authorized('/audits/thresholds', { method: 'POST', body: JSON.stringify({ categoryId, recountVariancePercent: Number(percent), recountVarianceUnits: Number(units), highCountAlertQty: highCount === '' ? null : Number(highCount), reason: thresholdReason }) });
      await refreshPolicy(); setThresholdReason(''); setNotice('Threshold policy saved. New sessions will snapshot these values.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save threshold'); }
    finally { setBusy(false); }
  }

  function signOut() { void revokeSession(token); setToken(''); setLocations([]); setSessions([]); setSession(null); setThresholds([]); setError(''); setNotice(''); }

  if (!token) return <main className={styles.authPage}><form className={styles.authCard} onSubmit={signIn}><a href="/dashboard" className={styles.back}>← Dashboard</a><div className={styles.brandMark}>P</div><p className={styles.eyebrow}>PREMIUM RETAIL · STOCK CONTROL</p><h1>Stock audits</h1><p className={styles.muted}>Sign in with a manager account to run and review location stock counts.</p><label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <p className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button><small className={styles.secure}>Location access and manager actions are enforced by the API.</small></form></main>;

  return <main className={styles.page}>
    <header className={styles.header}><a href="/dashboard" className={styles.brand}><span className={styles.brandMark}>P</span><span><strong>Premium Retail</strong><small>STOCK CONTROL</small></span></a><div className={styles.headerRight}><span className={styles.badge}><i /> REAL API</span><span className={styles.actor}>{email}</span><button className={styles.secondary} onClick={signOut}>Sign out</button></div></header>
    <div className={styles.content}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>INVENTORY CONTROL / PHASE 7</p><h1>Stock audits</h1><p className={styles.muted}>Freeze movement, count stock, and reconcile only after manager approval.</p></div><label className={styles.locationSelect}>Audit location<select value={locationId} onChange={(e) => { setLocationId(e.target.value); setSession(null); }}><option value="">Choose a location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.type.replaceAll('_', ' ')}</option>)}</select></label></div>
      {error && <div className={styles.alertError}>{error}</div>}{notice && <div className={styles.alertSuccess}>{notice}</div>}
      <div className={styles.layout}>
        <section className={styles.mainColumn}>
          <article className={styles.card}>
            <div className={styles.cardHead}><div><p className={styles.eyebrow}>PHYSICAL COUNT</p><h2>{session ? `Audit ${session.id.slice(0, 8)}` : 'Location audit'}</h2><p className={styles.muted}>{selectedLocation?.name ?? 'Select a location to continue'}</p></div><span className={`${styles.status} ${styles[(session?.status || 'idle').toLowerCase()]}`}>{session?.status ?? 'READY'}</span></div>
            {!session ? <div className={styles.startBlock}><p>{selectedLocation?.type === 'RETAIL_STORE' ? `Store audits can start every day at or after ${schedule?.startTime ?? '19:00'} local time.` : `Warehouse audits can start on Sundays at or after ${schedule?.startTime ?? '19:00'} local time.`} Starting an audit locks sales and stock transfers at this location.</p><button className={styles.primary} onClick={startAudit} disabled={busy || !locationId || !!activeSession || (schedule !== null && !schedule.canStartNow)}>{activeSession ? 'An active audit already exists' : busy ? 'Starting…' : schedule && !schedule.canStartNow ? 'Outside audit window' : 'Start stock audit'} <span>→</span></button></div> : <>
              <div className={styles.sessionMeta}><span>Started {new Date(session.startedAt).toLocaleString()}</span><span>{session.countItems.length} active variants</span><span>Count units are product base units</span>{session.status === 'APPROVED' && session.approvedBy && <span>Approved by {session.approvedBy.email}</span>}</div>
              {session.status === 'APPROVED' && session.resolutionReason && <p className={styles.muted}>Approval reason: {session.resolutionReason}</p>}
              <div className={styles.tableWrap}><table><thead><tr><th>Product / variant</th><th>SKU</th>{session.status !== 'ACTIVE' && <><th>Expected</th><th>Count 1</th><th>Recount</th><th>Approved quantity</th><th>Variance</th></>}<th>Count entry</th><th>Status</th></tr></thead><tbody>{session.countItems.map((item) => <tr key={item.id}><td><strong>{item.variant.product.name}</strong><small>{item.variant.name} · {item.variant.product.baseUnit}</small></td><td>{item.variant.sku}</td>{session.status !== 'ACTIVE' && <><td>{item.expectedQtyBase ?? '—'}</td><td>{item.countedQtyBase ?? '—'}</td><td>{item.recountQtyBase ?? '—'}</td><td>{item.approvedQtyBase ?? '—'}</td><td className={item.varianceBase ? styles.variance : ''}>{item.varianceBase ?? '—'}{item.variancePercent !== null && item.variancePercent !== undefined ? ` (${Number(item.variancePercent).toFixed(1)}%)` : ''}</td></>}<td>{session.status === 'ACTIVE' ? <div className={styles.countInput}><input aria-label={`Count ${item.variant.sku}`} type="number" min="0" step="1" value={counts[item.id] ?? ''} onChange={(e) => setCounts((current) => ({ ...current, [item.id]: e.target.value }))} placeholder={item.requiresRecount ? 'Recount' : 'Count'} /><button className={styles.smallButton} disabled={busy || counts[item.id] === undefined || counts[item.id] === ''} onClick={() => void recordCount(item)}>Save</button></div> : '—'}</td><td><span className={item.requiresRecount ? styles.recount : item.highCountAlert ? styles.alertTag : styles.neutralTag}>{item.requiresRecount ? 'Recount required' : item.highCountAlert ? 'High count alert' : item.countedQtyBase === null ? 'Not counted' : 'Counted'}</span>{session.status === 'ACTIVE' && item.countedQtyBase !== null && !item.requiresRecount && <button className={styles.linkButton} onClick={() => void requestRecount(item)}>Request recount</button>}</td></tr>)}</tbody></table></div>
              {session.status === 'ACTIVE' && <div className={styles.actionBar}><p>{session.countItems.filter((item) => item.countedQtyBase === null || (item.requiresRecount && item.recountQtyBase === null)).length} counts remaining. Expected quantities are hidden for blind counting.</p><div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => void abortCurrent()}>Abort audit</button><button className={styles.primary} disabled={busy || session.countItems.some((item) => item.countedQtyBase === null || (item.requiresRecount && item.recountQtyBase === null))} onClick={() => void sessionAction('submit')}>Submit for review →</button></div></div>}
              {canResolve && <form className={styles.actionBar} onSubmit={(e) => { e.preventDefault(); void sessionAction('approve'); }}><label>Manager decision reason<input value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} placeholder="Explain this reconciliation" required /></label><div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => void sessionAction('abort')}>Abort</button><button className={styles.primary} disabled={busy}>Approve adjustments →</button></div></form>}
              {session.status === 'APPROVED' && <div className={styles.resolved}>Approved by manager · {session.resolutionReason || 'No reason recorded'} · stock ledger adjustments posted.</div>}
            </>}
          </article>
          <article className={styles.card}><div className={styles.cardHead}><div><p className={styles.eyebrow}>ARCHIVE</p><h2>Recent location audits</h2><p className={styles.muted}>Resolved audit records remain available for review.</p></div><button className={styles.secondary} onClick={() => void loadSessions()} disabled={!locationId}>Refresh</button></div><div className={styles.history}>{sessions.map((row) => <button key={row.id} className={styles.historyRow} onClick={() => void loadSession(row.id)}><span><strong>{row.id.slice(0, 8)}</strong><small>{new Date(row.startedAt).toLocaleString()} · {row._count.countItems} variants</small></span><span className={styles.status}>{row.status}</span></button>)}{sessions.length === 0 && <p className={styles.empty}>No audits have been run at this location.</p>}</div></article>
        </section>
        <aside className={styles.sideColumn}>
          <article className={styles.card}><p className={styles.eyebrow}>AUDIT CADENCE</p><h2>{selectedLocation?.type === 'RETAIL_STORE' ? 'Daily store audit' : 'Sunday warehouse audit'}</h2><p className={styles.muted}>{selectedLocation?.type === 'RETAIL_STORE' ? `The system starts a blind count at or after ${schedule?.startTime ?? '19:00'} every day.` : `The system starts a blind count on Sunday at or after ${schedule?.startTime ?? '19:00'}.`} The location timezone is used.</p><form className={styles.policyForm} onSubmit={saveSchedule}><div className={styles.cadenceRequired}>Automatic start is required · {schedule?.allowedDays ?? 'Loading cadence…'}</div><label>Start time<input type="time" min="19:00" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} required disabled={!locationId} /></label><button className={styles.secondary} disabled={busy || !locationId || !scheduleTime || scheduleTime < '19:00'}>Save schedule</button></form><div className={styles.policyFoot}>{schedule?.timezone ? `Must be 7:00 PM or later · Location time: ${schedule.timezone}.` : 'Select a location to load its audit cadence.'}{schedule?.lastRunDate ? ` Last started: ${schedule.lastRunDate}.` : ''}</div></article>
          <article className={styles.card}><p className={styles.eyebrow}>COUNT POLICY</p><h2>Variance thresholds</h2><p className={styles.muted}>A count triggers a recount when it exceeds either configured variance. Values are copied into new audit sessions.</p>{actorRole === 'SUPER_ADMIN' ? <form className={styles.policyForm} onSubmit={saveThreshold}><label>Policy scope<select value={policyScope} onChange={(e) => setPolicyScope(e.target.value)}>{thresholds.map((policy) => <option key={policy.scopeKey} value={policy.scopeKey}>{policy.category ? policy.category.name : 'Global default'}</option>)}{categories.filter((category) => !thresholds.some((policy) => policy.categoryId === category.id)).map((category) => <option key={category.id} value={`category:${category.id}`}>{category.name} · inherits default</option>)}</select></label><label>Variance percent<input type="number" min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} required /></label><label>Variance units<input type="number" min="0" step="1" value={units} onChange={(e) => setUnits(e.target.value)} required /></label><label>High-count alert at<input type="number" min="1" step="1" value={highCount} onChange={(e) => setHighCount(e.target.value)} placeholder="Disabled" /></label><label>Change reason<input value={thresholdReason} onChange={(e) => setThresholdReason(e.target.value)} placeholder="Why is this policy changing?" required /></label><button className={styles.secondary} disabled={busy}>Save policy</button></form> : <p className={styles.muted}>Threshold settings apply across locations and are managed by a Super Admin.</p>}<div className={styles.policyFoot}>Starting defaults: over 2% or over 5 units · High-count alerts are off until configured.</div></article>
          <article className={styles.noteCard}><span className={styles.noteIcon}>i</span><div><strong>Stock stays unchanged while counting</strong><p>Only a manager-approved reconciliation appends immutable STOCK_ADJUSTMENT movements to the inventory ledger.</p></div></article>
          {session?.status === 'ACTIVE' && <article className={styles.card}><p className={styles.eyebrow}>FOLLOW-UP</p><h2>Recount required</h2><p className={styles.muted}>Threshold breaches and manager-requested recounts appear here.</p><div className={styles.recountQueue}>{session.countItems.filter((item) => item.requiresRecount).map((item) => <div key={item.id}><span><strong>{item.variant.product.name}</strong><small>{item.variant.sku} · first count {item.countedQtyBase ?? '—'}</small></span><b>{item.recountQtyBase === null ? 'Awaiting recount' : `Recount: ${item.recountQtyBase}`}</b></div>)}{session.countItems.every((item) => !item.requiresRecount) && <p className={styles.empty}>No variants currently require a recount.</p>}</div></article>}
        </aside>
      </div>
    </div>
  </main>;
}
