'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import {
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Lock,
  LockOpen,
  MapPin,
  Minus,
  Package,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AUTH_CHANGE_EVENT, getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './audits.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Location = { id: string; name: string; type: string };

type AuditItem = {
  id: string;
  expectedQtyBase?: number;
  countedQtyBase: number | null;
  recountQtyBase: number | null;
  requiresRecount: boolean;
  countedAt?: string | null;
  recountedAt?: string | null;
  recountRequestReason?: string | null;
  countedBy?: { id: string; email: string } | null;
  recountedBy?: { id: string; email: string } | null;
  varianceBase: number | null;
  variancePercent: string | number | null;
  approvedQtyBase?: number | null;
  highCountAlert: boolean;
  variant: {
    id: string;
    sku: string;
    name: string;
    product: { name: string; baseUnit: string };
  };
};

type Session = {
  id: string;
  locationId: string;
  status: 'ACTIVE' | 'SUBMITTED' | 'APPROVED' | 'CLOSED' | 'ABORTED';
  startedAt: string;
  completedAt: string | null;
  resolutionReason?: string | null;
  approvedByUserId?: string | null;
  approvedBy?: { id: string; email: string } | null;
  countItems: AuditItem[];
};

type SessionRow = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  _count: { countItems: number };
};

type Capabilities = { canCount: boolean; canManage: boolean; canChangeThresholds: boolean };

type Threshold = {
  scopeKey: string;
  categoryId: string | null;
  recountVariancePercent: string | number;
  recountVarianceUnits: number;
  highCountAlertQty: number | null;
  category: { id: string; name: string } | null;
};

type Schedule = {
  locationId: string;
  enabled: boolean;
  startTime: string | null;
  timezone: string;
  lastRunDate: string | null;
  locationType: string;
  allowedDays: string;
  earliestStartTime: string | null;
  canStartNow: boolean;
};

type GlobalScheduleResult = {
  storeStartTime: string;
  warehouseStartTime: string;
  storesUpdated: number;
  warehousesUpdated: number;
};

async function auditApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    throw new Error(message || `Audit request failed (${response.status})`);
  }
  return payload.data as T;
}

const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  lock: Lock,
  unlock: LockOpen,
  eye: Eye,
  eyeOff: EyeOff,
  check: Check,
  alert: TriangleAlert,
  clock: Clock,
  mapPin: MapPin,
  rotateCcw: RotateCcw,
  shield: ShieldCheck,
  fileText: FileText,
  x: X,
  clipboard: ClipboardList,
  edit: Pencil,
  play: Play,
  box: Package,
  settings: Settings,
  chevron: ChevronDown,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />;
}

export default function AuditsPage() {
  const [token, setToken] = useState('');
  const [capabilities, setCapabilities] = useState<Capabilities>({ canCount: false, canManage: false, canChangeThresholds: false });
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [policyScope, setPolicyScope] = useState('default');
  const [percent, setPercent] = useState('2.0');
  const [units, setUnits] = useState('5');
  const [highCount, setHighCount] = useState('');
  const [thresholdReason, setThresholdReason] = useState('');
  const [scheduleTime, setScheduleTime] = useState('19:00');
  const [globalStoreTime, setGlobalStoreTime] = useState('19:00');
  const [globalWarehouseTime, setGlobalWarehouseTime] = useState('19:00');
  const [globalScheduleReason, setGlobalScheduleReason] = useState('');
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [approvalReason, setApprovalReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedLocation = locations.find((l) => l.id === locationId) || locations[0];
  const isLocationFrozen = session?.status === 'ACTIVE' || session?.status === 'SUBMITTED';
  const locationName = selectedLocation?.name ?? 'your assigned location';

  useEffect(() => {
    let requestVersion = 0;
    const loadAuditAccess = async () => {
      const version = ++requestVersion;
      const accessToken = getStoredSession()?.accessToken ?? '';
      setToken(accessToken);
      setLocations([]);
      setLocationId('');
      setSession(null);
      setSessions([]);
      setSchedule(null);
      setThresholds([]);
      setCapabilities({ canCount: false, canManage: false, canChangeThresholds: false });
      setLoading(Boolean(accessToken));
      setError(accessToken ? '' : 'Sign in with an authorized account to access stock audits.');
      if (!accessToken) return;
      try {
        const [caps, locationRows] = await Promise.all([
          auditApi<Capabilities>('/audits/capabilities', accessToken),
          auditApi<Location[]>('/locations?isActive=true', accessToken),
        ]);
        if (version !== requestVersion) return;
        setCapabilities(caps);
        setLocations(locationRows);
        const storedName = window.localStorage.getItem('premium-retail-location-scope');
        const requestedId = new URLSearchParams(window.location.search).get('locationId');
        const selected = locationRows.find((loc) => loc.id === requestedId)
          ?? locationRows.find((loc) => loc.name === storedName)
          ?? locationRows[0];
        if (!selected) throw new Error('No active locations are assigned to this account. Ask an administrator to assign a location.');
        setLocationId(selected.id);
        window.localStorage.setItem('premium-retail-location-scope', selected.name);
        window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: selected.name }));
      } catch (caught) {
        if (version === requestVersion) setError(caught instanceof Error ? caught.message : 'Could not load audit access.');
      } finally {
        if (version === requestVersion) setLoading(false);
      }
    };
    void loadAuditAccess();
    const handleAuthChange = () => void loadAuditAccess();
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    return () => {
      requestVersion += 1;
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    };
  }, []);

  useEffect(() => {
    if (!token || !locationId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await auditApi<SessionRow[]>(`/audits/locations/${encodeURIComponent(locationId)}/sessions`, token);
        if (cancelled) return;
        setSessions(rows);
        const resumable = rows.find((row) => row.status === 'ACTIVE' || row.status === 'SUBMITTED');
        const current = resumable ? await auditApi<Session>(`/audits/sessions/${encodeURIComponent(resumable.id)}`, token) : null;
        if (cancelled) return;
        setSession(current);
        setCounts({});
        const [scheduleResult, thresholdRows] = await Promise.all([
          auditApi<Schedule>(`/audits/locations/${encodeURIComponent(locationId)}/schedule`, token),
          capabilities.canManage ? auditApi<Threshold[]>('/audits/thresholds', token) : Promise.resolve<Threshold[]>([]),
        ]);
        if (cancelled) return;
        setSchedule(scheduleResult);
        setScheduleTime(scheduleResult.startTime ?? '19:00');
        setThresholds(thresholdRows);
        const global = thresholdRows.find((row) => row.scopeKey === 'default');
        if (global) {
          setPercent(String(global.recountVariancePercent));
          setUnits(String(global.recountVarianceUnits));
          setHighCount(global.highCountAlertQty === null ? '' : String(global.highCountAlertQty));
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load this location’s audits.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, locationId, capabilities.canManage]);

  useEffect(() => {
    const syncLocation = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      const found = locations.find((location) => location.name === name);
      if (found && !isLocationFrozen) {
        setLocationId(found.id);
        setError('');
      } else if (isLocationFrozen && selectedLocation && name !== selectedLocation.name) {
        window.localStorage.setItem('premium-retail-location-scope', selectedLocation.name);
        window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: selectedLocation.name }));
      }
    };
    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, [locations, isLocationFrozen, selectedLocation]);

  async function refreshLocationData() {
    if (!token || !locationId) return;
    const rows = await auditApi<SessionRow[]>(`/audits/locations/${encodeURIComponent(locationId)}/sessions`, token);
    setSessions(rows);
    const resumable = rows.find((row) => row.status === 'ACTIVE' || row.status === 'SUBMITTED');
    setSession(resumable ? await auditApi<Session>(`/audits/sessions/${encodeURIComponent(resumable.id)}`, token) : null);
  }

  async function handleStartAudit() {
    if (!selectedLocation || !token) return;
    setBusy(true);
    setError('');
    try {
      await auditApi<Session>(`/audits/locations/${encodeURIComponent(locationId)}/sessions`, token, { method: 'POST' });
      await refreshLocationData();
      setNotice(`Stock count started at ${locationName}. Sales and transfers are paused until review is complete.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the stock audit.');
    } finally { setBusy(false); }
  }

  async function handleSaveCount(item: AuditItem) {
    const val = Number(counts[item.id]);
    if (!Number.isInteger(val) || val < 0 || val > 2147483647) {
      setError('Enter a whole number of base units from 0 to 2,147,483,647.');
      return;
    }
    if (!session || !token) return;
    setBusy(true);
    setError('');
    try {
      await auditApi(`/audits/sessions/${encodeURIComponent(session.id)}/items/${encodeURIComponent(item.id)}/count`, token, {
        method: 'POST', body: JSON.stringify({ quantityBaseUnits: val }),
      });
      await refreshLocationData();
      setNotice(`Saved the ${item.requiresRecount ? 'recount' : 'count'} for ${item.variant.product.name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this count.');
    } finally { setBusy(false); }
  }

  async function handleSubmitCounts() {
    if (!session || !token) return;
    setBusy(true);
    setError('');
    try {
      await auditApi(`/audits/sessions/${encodeURIComponent(session.id)}/submit`, token, { method: 'POST' });
      await refreshLocationData();
      setNotice('Count submitted. A manager must review and approve any stock adjustments.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not submit the audit.'); }
    finally { setBusy(false); }
  }

  function handleApproveReconciliation(e: FormEvent) {
    e.preventDefault();
    if (!session || !approvalReason.trim() || !token) {
      setError('Please add a short note explaining the differences before approving.');
      return;
    }
    setBusy(true); setError('');
    void (async () => {
      try {
        await auditApi(`/audits/sessions/${encodeURIComponent(session.id)}/approve`, token, { method: 'POST', body: JSON.stringify({ reason: approvalReason.trim() }) });
        setApprovalReason(''); await refreshLocationData();
        setNotice(`Stock count approved. Stock levels are updated and sales have resumed at ${selectedLocation?.name ?? 'this location'}.`);
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve the audit.'); }
      finally { setBusy(false); }
    })();
  }

  async function handleAbortAudit() {
    if (!session || !token || !capabilities.canManage) return;
    const reason = window.prompt('Why is this audit being aborted?');
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try {
      await auditApi(`/audits/sessions/${encodeURIComponent(session.id)}/abort`, token, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      await refreshLocationData();
      setNotice(`Audit aborted. No stock adjustment was posted; sales resumed at ${selectedLocation?.name ?? 'this location'}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not abort the audit.'); }
    finally { setBusy(false); }
  }

  async function handleRequestRecount(item: AuditItem) {
    if (!session || !token || !capabilities.canManage) return;
    const reason = window.prompt(`Why does ${item.variant.product.name} need another physical count?`);
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try {
      await auditApi(`/audits/sessions/${encodeURIComponent(session.id)}/items/${encodeURIComponent(item.id)}/recount-required`, token, {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      await refreshLocationData();
      setNotice(`Recount requested for ${item.variant.product.name}. The audit is open again for an authorized counter.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request a recount.'); }
    finally { setBusy(false); }
  }

  async function handleSaveSchedule() {
    if (!token || !locationId || !capabilities.canManage) return;
    setBusy(true); setError('');
    try {
      const saved = await auditApi<Schedule>(`/audits/locations/${encodeURIComponent(locationId)}/schedule`, token, {
        method: 'PATCH', body: JSON.stringify({ enabled: true, startTime: scheduleTime }),
      });
      setSchedule(saved);
      setNotice('Audit start window saved. Audits are started by a manager or authorized counter during this window.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the audit window.'); }
    finally { setBusy(false); }
  }

  async function handleSaveAllSchedules() {
    if (!token || !capabilities.canChangeThresholds) return;
    if (globalStoreTime < '19:00' || globalWarehouseTime < '19:00') {
      setError('Store and warehouse audit windows must start at or after 7:00 PM.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await auditApi<GlobalScheduleResult>('/audits/schedule/all', token, {
        method: 'PATCH',
        body: JSON.stringify({
          storeStartTime: globalStoreTime,
          warehouseStartTime: globalWarehouseTime,
          reason: globalScheduleReason.trim(),
        }),
      });
      setGlobalScheduleReason('');
      if (selectedLocation?.type === 'RETAIL_STORE') setScheduleTime(result.storeStartTime);
      else setScheduleTime(result.warehouseStartTime);
      await refreshLocationData();
      setNotice(`Global schedule saved: ${result.storesUpdated} stores and ${result.warehousesUpdated} warehouses updated.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the global audit schedule.'); }
    finally { setBusy(false); }
  }

  async function handleSaveThresholds() {
    if (!token || !capabilities.canChangeThresholds) return;
    const selectedPolicy = thresholds.find((threshold) => threshold.scopeKey === policyScope);
    setBusy(true); setError('');
    try {
      const saved = await auditApi<Threshold>('/audits/thresholds', token, {
        method: 'POST',
        body: JSON.stringify({
          categoryId: selectedPolicy?.categoryId ?? null,
          recountVariancePercent: Number(percent),
          recountVarianceUnits: Number(units),
          highCountAlertQty: highCount.trim() ? Number(highCount) : null,
          reason: thresholdReason.trim(),
        }),
      });
      setThresholds((current) => [...current.filter((item) => item.scopeKey !== saved.scopeKey), saved]);
      setThresholdReason('');
      setNotice('Count policy saved. New audit sessions will use these thresholds.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the count policy.'); }
    finally { setBusy(false); }
  }

  // ---------- Derived view data ----------
  const items = session?.countItems ?? [];
  const countedCount = items.filter((i) => i.countedAt || i.countedQtyBase != null).length;
  const progressPct = items.length ? Math.round((countedCount / items.length) * 100) : 0;
  const recountCount = items.filter((i) => i.requiresRecount && !i.recountedAt && i.recountQtyBase == null).length;
  const mismatchCount = items.filter((i) => (i.varianceBase ?? 0) !== 0).length;
  const lastAudit = sessions.find((row) => row.status === 'APPROVED' || row.status === 'CLOSED');
  const isFinished = session?.status === 'APPROVED' || session?.status === 'ABORTED';
  const canSubmit = items.length > 0 && items.every((item) => Boolean(item.countedAt || item.countedQtyBase != null)
    && (!item.requiresRecount || Boolean(item.recountedAt || item.recountQtyBase != null)));
  const highCountLimit = highCount.trim() ? Number(highCount) : Number.POSITIVE_INFINITY;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const duration = (a: string, b: string | null) => (b ? `${Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))} min` : '—');
  const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Three plain-language steps
  const steps = ['Start', 'Count', 'Review & finish'];
  const currentStep = !session ? 0 : session.status === 'ACTIVE' ? 1 : session.status === 'SUBMITTED' ? 2 : 3;

  const hero = (() => {
    if (!session) return {
      tone: styles.heroIdle, icon: 'clipboard', eyebrow: 'Step 1 of 3',
      title: 'Start a stock count',
      text: `You'll count what's on the shelves at ${locationName}. Sales and transfers pause while you count, so nothing moves.`,
    };
    if (session.status === 'ACTIVE') return {
      tone: styles.heroActive, icon: 'edit', eyebrow: 'Step 2 of 3',
      title: 'Count each product',
      text: 'Enter how many you can see on the shelf. Expected quantities stay hidden until you finish, so the count stays honest.',
    };
    if (session.status === 'SUBMITTED') return {
      tone: recountCount ? styles.heroWarn : styles.heroActive, icon: 'eye', eyebrow: 'Step 3 of 3',
      title: recountCount ? `${plural(recountCount, 'product')} need${recountCount === 1 ? 's' : ''} a second count` : 'Check the results',
      text: recountCount
        ? 'The difference is bigger than allowed. Count those items again, then approve.'
        : `${mismatchCount ? plural(mismatchCount, 'product') + ' differ slightly.' : 'Everything matches.'} Add a short note and approve to update stock.`,
    };
    if (session.status === 'ABORTED') return {
      tone: styles.heroIdle, icon: 'x', eyebrow: 'Cancelled',
      title: 'Stock count cancelled',
      text: `Nothing was changed and sales have resumed at ${locationName}.`,
    };
    return {
      tone: styles.heroDone, icon: 'check', eyebrow: 'Completed',
      title: 'All done, stock is updated',
      text: `Sales have resumed at ${locationName}. Approved by ${session.approvedBy?.email || 'Store Manager'}${session.completedAt ? ` at ${fmtTime(session.completedAt)}` : ''}.`,
    };
  })();

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Stock Audits</h1>
          <p>Count what&apos;s on your shelves and fix any stock differences.</p>
        </div>
        <PillDropdown<string>
          value={locationId}
          heading="Store to count"
          ariaLabel="Store to count"
          icon={<Icon name="mapPin" size={14} />}
          disabled={isLocationFrozen}
          title={isLocationFrozen ? 'Finish or cancel the current count to switch stores' : undefined}
          options={locations.map((loc) => ({ value: loc.id, label: `${loc.name}${loc.type === 'WAREHOUSE' ? ' (Warehouse)' : ''}` }))}
          onChange={(next) => {
            const selected = locations.find((location) => location.id === next);
            if (!selected) return;
            setLocationId(next); setSession(null); setError('');
            window.localStorage.setItem('premium-retail-location-scope', selected.name);
            window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: selected.name }));
          }}
        />
      </header>

      {error && <Feedback tone="error" onDismiss={() => setError('')} action={!token && <a href="/login?returnUrl=%2Faudits">Sign in</a>}>{error}</Feedback>}
      {notice && !error && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {/* ---------- At-a-glance tiles ---------- */}
      <section className={styles.tiles} aria-label="Stock count overview">
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${styles.tileBlue}`}><Icon name="box" size={18} /></span>
          <div>
            <small>Products on the sheet</small>
            <strong>{session ? <>{countedCount}<em> / {items.length} counted</em></> : <>—<em> loaded when audit starts</em></>}</strong>
          </div>
        </div>
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${styles.tileGreen}`}><Icon name="check" size={18} /></span>
          <div>
            <small>Last count</small>
            <strong>{lastAudit ? fmtDate(lastAudit.startedAt) : '—'}</strong>
            {lastAudit && <span className={styles.tileSub}>{duration(lastAudit.startedAt, lastAudit.completedAt)} · approved</span>}
          </div>
        </div>
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${styles.tileViolet}`}><Icon name="clipboard" size={18} /></span>
          <div>
            <small>Counts recorded</small>
            <strong>{sessions.filter((row) => row.status === 'APPROVED' || row.status === 'CLOSED').length}<em> completed</em></strong>
            <span className={styles.tileSub}>{sessions.reduce((s, r) => s + r._count.countItems, 0)} product lines in history</span>
          </div>
        </div>
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${isLocationFrozen ? styles.tileAmber : styles.tileBlue}`}><Icon name={isLocationFrozen ? 'lock' : 'clock'} size={18} /></span>
          <div>
            <small>{isLocationFrozen ? 'Location status' : 'Audit window'}</small>
            <strong>{isLocationFrozen ? 'Movements paused' : schedule?.startTime || '19:00'}</strong>
            <span className={styles.tileSub}>{isLocationFrozen ? 'until manager approval or abort' : `${schedule?.allowedDays ?? 'Schedule loading'} · ${schedule?.timezone ?? ''}`}</span>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        {loading && <div className={styles.card} role="status">Loading authorized audit data…</div>}
        <main className={styles.main}>
          {/* ---------- "What to do now" card ---------- */}
          <section className={`${styles.hero} ${hero.tone} ${!session || isFinished ? styles.heroWithArt : ''}`}>
            {/* Decorative shelf + checklist illustration (start / finished screens only) */}
            {(!session || isFinished) && (
            <svg className={styles.heroArt} viewBox="0 0 220 160" aria-hidden="true">
              <rect x="18" y="20" width="132" height="122" rx="10" fill="#ffffff" opacity="0.75" />
              <rect x="18" y="58" width="132" height="5" fill="#c8d6ea" />
              <rect x="18" y="100" width="132" height="5" fill="#c8d6ea" />
              <rect x="30" y="32" width="22" height="26" rx="4" fill="#a9bfdf" />
              <rect x="56" y="38" width="18" height="20" rx="4" fill="#d4dfef" />
              <rect x="78" y="30" width="26" height="28" rx="4" fill="#7f9cc9" />
              <rect x="108" y="40" width="20" height="18" rx="4" fill="#c3d2e8" />
              <rect x="30" y="74" width="28" height="26" rx="4" fill="#d4dfef" />
              <rect x="62" y="80" width="20" height="20" rx="4" fill="#a9bfdf" />
              <rect x="86" y="72" width="24" height="28" rx="4" fill="#c3d2e8" />
              <rect x="114" y="78" width="24" height="22" rx="4" fill="#7f9cc9" />
              <rect x="30" y="114" width="40" height="22" rx="4" fill="#c3d2e8" />
              <rect x="74" y="118" width="22" height="18" rx="4" fill="#a9bfdf" />
              <g transform="translate(128 56)">
                <rect width="74" height="92" rx="10" fill="#ffffff" stroke="#c8d6ea" strokeWidth="2" />
                <rect x="24" y="-6" width="26" height="12" rx="4" fill="#5a7fb8" />
                {[18, 38, 58].map((y, n) => (
                  <g key={y}>
                    <rect x="12" y={y} width="12" height="12" rx="3" fill={n < 2 ? '#2f9e5b' : '#e5e9ef'} />
                    {n < 2 && <path d={`M15 ${y + 6}l2.5 2.5 4-5`} stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                    <rect x="30" y={y + 3} width={n === 1 ? 26 : 32} height="6" rx="3" fill="#dce5f2" />
                  </g>
                ))}
              </g>
            </svg>
            )}
            <div className={styles.heroBody}>
              <span className={styles.heroIcon}><Icon name={hero.icon} size={24} /></span>
              <div className={styles.heroText}>
                <span className={styles.eyebrow}>{hero.eyebrow}</span>
                <h2>{hero.title}</h2>
                <p>{hero.text}</p>
              </div>
            </div>

            {/* simple 3-step progress */}
            <ol className={styles.steps} aria-label="Progress">
              {steps.map((label, idx) => {
                const state = idx < currentStep ? styles.stepDone : idx === currentStep ? styles.stepNow : '';
                return (
                  <li key={label} className={state} aria-current={idx === currentStep ? 'step' : undefined}>
                    <span>{idx < currentStep ? <Icon name="check" size={12} /> : idx + 1}</span>
                    {label}
                  </li>
                );
              })}
            </ol>

            {session?.status !== 'SUBMITTED' && (
            <div className={styles.heroActions}>
              {(!session || isFinished) && (
                <>
                  <button type="button" onClick={handleStartAudit} disabled={busy || loading || !capabilities.canManage || !schedule?.canStartNow} className={styles.primaryButton}>
                    <Icon name="play" size={16} /> {isFinished ? 'Start a new count' : schedule?.canStartNow ? 'Start counting' : 'Audit window closed'}
                  </button>
                  <span className={styles.heroHint}>
                    {!capabilities.canManage ? 'A manager starts audits during the scheduled window.' : lastAudit ? <>Last approved count: <b>{fmtDate(lastAudit.startedAt)}</b> · {plural(lastAudit._count.countItems, 'product')}</> : 'No approved audits yet'}
                  </span>
                </>
              )}
              {session?.status === 'ACTIVE' && (
                <>
                  <div className={styles.heroProgress}>
                    <span><b>{countedCount}</b> of {plural(items.length, 'product')} counted</span>
                    <span className={styles.track}><i style={{ width: `${progressPct}%` }} /></span>
                  </div>
                  {capabilities.canManage && <button type="button" onClick={handleAbortAudit} className={styles.textButton} disabled={busy}>Abort audit</button>}
                  <button type="button" onClick={handleSubmitCounts} className={styles.primaryButton} disabled={busy || !canSubmit} title={!canSubmit ? 'Save every count and any required recount first' : undefined}>
                    <Icon name="check" size={16} /> Finish counting
                  </button>
                </>
              )}
            </div>
            )}

            {isLocationFrozen && (
              <div className={styles.pausedNote}><Icon name="lock" size={14} /> Sales and transfers are paused at {locationName} until a manager approves or aborts this audit.</div>
            )}
          </section>

          {/* ---------- Product list ---------- */}
          {session && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h3>{session.status === 'ACTIVE' ? 'Products to count' : 'Results'}</h3>
                <span className={styles.muted}>{plural(items.length, 'product')}</span>
              </div>

              <ul className={styles.list}>
                {items.map((item) => {
                  const expected = item.expectedQtyBase ?? 0;
                  const finalCount = item.recountQtyBase ?? item.countedQtyBase ?? 0;
                  const diff = item.varianceBase ?? 0;
                  const draft = counts[item.id] ?? '';
                  const unit = item.variant.product.baseUnit;
                  const done = Boolean(item.countedAt || item.countedQtyBase != null);
                  const canEditCount = capabilities.canCount && (!done || (item.requiresRecount && !item.recountedAt));
                  const typo = draft !== '' && Number(draft) > highCountLimit;
                  return (
                    <li key={item.id} className={`${styles.item} ${item.requiresRecount ? styles.itemWarn : ''} ${session.status === 'ACTIVE' && done ? styles.itemDone : ''}`}>
                      <div className={styles.itemInfo}>
                        <span className={styles.thumb}>{initials(item.variant.product.name)}</span>
                        <div>
                          <strong>{item.variant.product.name}</strong>
                          <small>{item.variant.name} · {item.variant.sku}</small>
                        </div>
                      </div>

                      {session.status === 'ACTIVE' && capabilities.canCount && (
                        <div className={styles.itemCount}>
                          <div className={styles.countRow}>
                          <div className={styles.counter}>
                            <button type="button" onClick={() => setCounts({ ...counts, [item.id]: String(Math.max(0, (Number(draft) || 0) - 1)) })} aria-label="One less" disabled={!canEditCount || busy}><Minus size="1em" className="inline-icon" aria-hidden="true" /></button>
                            <input type="number" min="0" inputMode="numeric" placeholder={item.requiresRecount ? 'Enter recount' : '0'} value={draft} disabled={!canEditCount || busy} onChange={(e) => setCounts({ ...counts, [item.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && draft !== '') void handleSaveCount(item); }} aria-label={`How many ${item.variant.product.name}`} />
                            <button type="button" onClick={() => setCounts({ ...counts, [item.id]: String((Number(draft) || 0) + 1) })} aria-label="One more" disabled={!canEditCount || busy}><Plus size="1em" className="inline-icon" aria-hidden="true" /></button>
                          </div>
                          <span className={styles.unit}>{unit}s</span>
                          {done && (!item.requiresRecount || item.recountedAt) ? (
                            <span className={styles.savedTag}><Icon name="check" size={13} /> Saved</span>
                          ) : (
                            <button type="button" onClick={() => void handleSaveCount(item)} className={styles.saveButton} disabled={draft === '' || busy}>Save</button>
                          )}
                          </div>
                          {item.requiresRecount && !item.recountedAt && <span className={styles.typo}><Icon name="rotateCcw" size={12} /> Threshold exceeded. Enter a second count.</span>}
                          {typo && <span className={styles.typo}><Icon name="alert" size={12} /> That&apos;s a lot. Please double-check.</span>}
                        </div>
                      )}

                      {session.status === 'ACTIVE' && !capabilities.canCount && (
                        <div className={styles.itemResult}><span className={styles.badge}>Waiting for authorized counters</span></div>
                      )}

                      {session.status !== 'ACTIVE' && (
                        <div className={styles.itemResult}>
                          <div className={styles.numbers}>
                            <div><small>Expected</small><b>{capabilities.canManage || session.status === 'APPROVED' ? expected : 'Hidden until manager review'}</b></div>
                            <div><small>You counted</small><b>{item.recountQtyBase ?? item.countedQtyBase ?? '—'}</b></div>
                            <div><small>Difference</small><b className={diff < 0 ? styles.neg : diff > 0 ? styles.pos : ''}>{capabilities.canManage || session.status === 'APPROVED' ? (diff > 0 ? `+${diff}` : diff) : 'Pending manager review'}</b></div>
                          </div>
                          {capabilities.canManage && <span className={styles.tileSub}>
                            Counted {item.countedBy?.email ? `by ${item.countedBy.email}` : ''}{item.countedAt ? ` · ${fmtDate(item.countedAt)} ${fmtTime(item.countedAt)}` : ''}
                            {item.recountedAt ? ` · Recount ${item.recountedBy?.email ? `by ${item.recountedBy.email}` : ''} ${fmtTime(item.recountedAt)}` : ''}
                          </span>}
                          {capabilities.canManage && item.recountRequestReason && <span className={styles.tileSub}>Recount requested: {item.recountRequestReason}</span>}
                          {capabilities.canManage && item.highCountAlert && <span className={`${styles.badge} ${styles.badgeWarn}`}>High-count alert</span>}
                          {!capabilities.canManage && session.status === 'SUBMITTED' ? (
                            <span className={styles.badge}>Submitted · awaiting manager review</span>
                          ) : item.requiresRecount && item.recountedAt ? (
                            <span className={`${styles.badge} ${styles.badgeWarn}`}>Recount recorded</span>
                          ) : capabilities.canManage && session.status === 'SUBMITTED' && item.requiresRecount ? (
                            <div className={styles.finishActions}>
                              <span className={`${styles.badge} ${styles.badgeWarn}`}>Recount required before submission</span>
                              <button type="button" onClick={() => void handleRequestRecount(item)} className={styles.textButton} disabled={busy}>Request another recount</button>
                            </div>
                          ) : capabilities.canManage && session.status === 'SUBMITTED' ? (
                            <button type="button" onClick={() => void handleRequestRecount(item)} className={styles.textButton} disabled={busy}>Request recount</button>
                          ) : (
                            <span className={`${styles.badge} ${diff === 0 ? styles.badgeGood : styles.badgeWarn}`}>{diff === 0 ? 'Matches' : diff < 0 ? `${Math.abs(diff)} missing` : `${diff} extra`}</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {session.status === 'SUBMITTED' && capabilities.canManage && (
                <form onSubmit={handleApproveReconciliation} className={styles.finish}>
                  <label className={styles.field}>
                    <span>What caused the differences?</span>
                    <textarea rows={2} required placeholder="e.g. 2 packs were damaged and thrown away" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} />
                  </label>
                  <div className={styles.finishActions}>
                    <button type="button" onClick={handleAbortAudit} className={styles.textButton} disabled={busy}>Abort audit</button>
                    <button type="submit" className={styles.successButton} disabled={busy}><Icon name="check" size={16} /> Approve &amp; update stock</button>
                  </div>
                </form>
              )}

              {isFinished && session.resolutionReason && (
                <p className={styles.note}><Icon name="fileText" size={14} /> {session.resolutionReason}</p>
              )}
            </section>
          )}

          {/* ---------- Preview of the count sheet (before starting) ---------- */}
          {!session && !loading && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <div className="heading-with-info"><h3>Audit scope</h3><InfoHint label="About the audit scope">This identifies the location and the stock included in the selected count.</InfoHint></div>
                  <p className={styles.cardSub}>The count sheet is created from active product variants when an authorized manager starts the audit.</p>
                </div>
                <span className={styles.hiddenChip}><Icon name="eyeOff" size={13} /> Blind count</span>
              </div>
              <p className={styles.cardSub}>Store audits can start daily after 7:00 PM local time. Warehouse audits can start Sundays after 7:00 PM. Starting the audit pauses stock movements for this location.</p>
            </section>
          )}

          {/* ---------- How it works (only before the first step) ---------- */}
          {!session && (
            <section className={styles.card}>
              <div className={styles.cardHead}><h3>How a stock count works</h3></div>
              <ol className={styles.howTo}>
                <li><span>1</span><div><strong>Start</strong><p>Sales and transfers pause so stock doesn&apos;t change while you count.</p></div></li>
                <li><span>2</span><div><strong>Count</strong><p>Enter what you see on the shelf for each product.</p></div></li>
                <li><span>3</span><div><strong>Review &amp; finish</strong><p>Check any differences, add a note and approve. Stock updates and sales resume.</p></div></li>
              </ol>
            </section>
          )}
        </main>

        {/* ---------- Side: history + settings ---------- */}
        <aside className={styles.side}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Past counts</h3>
              <a href="/reports?tab=auditVariances" className={styles.link}>See details</a>
            </div>
            <ul className={styles.history}>
              {sessions.length === 0 && <li className={styles.cardSub}>No audit history for this location yet.</li>}
              {sessions.map((row) => (
                <li key={row.id}>
                  <span className={styles.historyIcon}><Icon name="check" size={13} /></span>
                  <div>
                    <strong>{fmtDate(row.startedAt)}</strong>
                    <small>{plural(row._count.countItems, 'product')} · {duration(row.startedAt, row.completedAt)}</small>
                  </div>
                  <span className={`${styles.badge} ${row.status === 'APPROVED' ? styles.badgeGood : ''}`}>{row.status === 'APPROVED' ? 'Approved' : row.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${styles.card} ${styles.tips}`}>
            <div className={styles.cardHead}><h3>Tips for an accurate count</h3></div>
            <ul>
              <li><Icon name="box" size={15} /><span>Check the back room and display shelves, not just the front.</span></li>
              <li><Icon name="edit" size={15} /><span>Count single packs, not cartons. Open cartons and count what&apos;s inside.</span></li>
              <li><Icon name="alert" size={15} /><span>Damaged items still count. Mention them in the final note.</span></li>
              <li><Icon name="check" size={15} /><span>Save each product as you go, so nothing is lost if you&apos;re interrupted.</span></li>
            </ul>
          </section>

          {capabilities.canManage && <details className={`${styles.card} ${styles.settings}`}>
            <summary>
              <span><Icon name="settings" size={16} /> Count settings</span>
              <Icon name="chevron" size={16} />
            </summary>
            <div className={styles.settingsBody}>
              {capabilities.canChangeThresholds && <div className={styles.settingGroup}>
                <h4>Global audit times · Super Admin</h4>
                <p>Apply the same local start time to every active store and warehouse. Stores run daily; warehouses run Sundays.</p>
                <div className={styles.globalScheduleGrid}>
                  <label className={styles.field}>
                    <span>All stores · daily</span>
                    <input type="time" min="19:00" value={globalStoreTime} disabled={busy} onChange={(e) => setGlobalStoreTime(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>All warehouses · Sundays</span>
                    <input type="time" min="19:00" value={globalWarehouseTime} disabled={busy} onChange={(e) => setGlobalWarehouseTime(e.target.value)} />
                  </label>
                </div>
                <label className={styles.field}>
                  <span>Reason for global change</span>
                  <input value={globalScheduleReason} maxLength={500} disabled={busy} onChange={(e) => setGlobalScheduleReason(e.target.value)} placeholder="Why are all audit times changing?" />
                  <small>Times must be 7:00 PM or later in each location&apos;s local time zone. Existing active audits are not interrupted.</small>
                </label>
                <button type="button" className={styles.saveButton} onClick={() => void handleSaveAllSchedules()} disabled={busy || globalStoreTime < '19:00' || globalWarehouseTime < '19:00' || globalScheduleReason.trim().length < 3}>Apply to all active locations</button>
              </div>}
              <div className={styles.settingGroup}>
                <h4>When counts can start</h4>
                <p>{schedule?.allowedDays}, from {schedule?.startTime || '19:00'} ({schedule?.timezone}).</p>
                <label className={styles.field}>
                  <span>Start time</span>
                  <input type="time" min="19:00" value={scheduleTime} disabled={busy} onChange={(e) => setScheduleTime(e.target.value)} />
                  <small>Must be 7:00 PM or later. This opens the window; an authorized person starts the physical count.</small>
                </label>
                <button type="button" className={styles.saveButton} onClick={() => void handleSaveSchedule()} disabled={busy || scheduleTime < '19:00'}>Save start window</button>
              </div>
              <div className={styles.settingGroup}>
                <h4>When to ask for a second count</h4>
                <label className={styles.field}>
                  <span>Policy scope</span>
                  <select value={policyScope} disabled={!capabilities.canChangeThresholds || busy} onChange={(event) => {
                    const scope = event.target.value;
                    setPolicyScope(scope);
                    const policy = thresholds.find((threshold) => threshold.scopeKey === scope);
                    if (policy) {
                      setPercent(String(policy.recountVariancePercent));
                      setUnits(String(policy.recountVarianceUnits));
                      setHighCount(policy.highCountAlertQty === null ? '' : String(policy.highCountAlertQty));
                    }
                  }}>
                    {thresholds.map((threshold) => <option key={threshold.scopeKey} value={threshold.scopeKey}>{threshold.category?.name ?? 'Global default'}</option>)}
                  </select>
                </label>
                <label className={styles.inline}>
                  <span>Difference over</span>
                  <input type="number" step="0.1" min="0" max="100" value={percent} disabled={!capabilities.canChangeThresholds || busy} onChange={(e) => setPercent(e.target.value)} aria-label="Percent difference" />
                  <em>%</em>
                </label>
                <label className={styles.inline}>
                  <span>or more than</span>
                  <input type="number" min="0" value={units} disabled={!capabilities.canChangeThresholds || busy} onChange={(e) => setUnits(e.target.value)} aria-label="Unit difference" />
                  <em>units</em>
                </label>
                <label className={styles.inline}>
                  <span>Warn if a count is over</span>
                  <input type="number" min="1" value={highCount} placeholder="Disabled" disabled={!capabilities.canChangeThresholds || busy} onChange={(e) => setHighCount(e.target.value)} aria-label="High count warning" />
                  <em>{highCount ? 'units' : 'off'}</em>
                </label>
                {capabilities.canChangeThresholds && <>
                  <label className={styles.field}><span>Reason for policy change</span><input value={thresholdReason} maxLength={500} onChange={(event) => setThresholdReason(event.target.value)} placeholder="Why is this policy changing?" /></label>
                  <button type="button" className={styles.saveButton} onClick={() => void handleSaveThresholds()} disabled={busy || !thresholdReason.trim()}>Save count policy</button>
                </>}
              </div>
            </div>
          </details>}
        </aside>
      </div>
    </div>
  );
}
