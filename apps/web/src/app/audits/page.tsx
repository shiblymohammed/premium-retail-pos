'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
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

const DEMO_LOCATIONS: Location[] = [
  { id: 'loc_downtown', name: 'Downtown Store', type: 'RETAIL_STORE' },
  { id: 'loc_north_mall', name: 'North Mall', type: 'RETAIL_STORE' },
  { id: 'loc_west_end', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc_warehouse', name: 'Central Warehouse', type: 'WAREHOUSE' },
];

const INITIAL_DEMO_ITEMS: AuditItem[] = [
  {
    id: 'item_1',
    expectedQtyBase: 27,
    countedQtyBase: null,
    recountQtyBase: null,
    requiresRecount: false,
    varianceBase: null,
    variancePercent: null,
    highCountAlert: false,
    variant: {
      id: 'var_1',
      sku: 'BEV-1048',
      name: 'Medium roast - 250 g',
      product: { name: 'Arabica Ground Coffee', baseUnit: 'pack' },
    },
  },
  {
    id: 'item_2',
    expectedQtyBase: 8,
    countedQtyBase: null,
    recountQtyBase: null,
    requiresRecount: false,
    varianceBase: null,
    variancePercent: null,
    highCountAlert: false,
    variant: {
      id: 'var_2',
      sku: 'BEV-1056',
      name: 'Lemon Mint - 25 bags',
      product: { name: 'Green Tea Bags', baseUnit: 'pack' },
    },
  },
  {
    id: 'item_3',
    expectedQtyBase: 9,
    countedQtyBase: null,
    recountQtyBase: null,
    requiresRecount: false,
    varianceBase: null,
    variancePercent: null,
    highCountAlert: false,
    variant: {
      id: 'var_3',
      sku: 'SNK-4172',
      name: 'Classic salted - 52 g',
      product: { name: 'Potato Chips', baseUnit: 'pack' },
    },
  },
  {
    id: 'item_4',
    expectedQtyBase: 42,
    countedQtyBase: null,
    recountQtyBase: null,
    requiresRecount: false,
    varianceBase: null,
    variancePercent: null,
    highCountAlert: false,
    variant: {
      id: 'var_4',
      sku: 'SNK-4180',
      name: '72% Cacao - 100 g',
      product: { name: 'Organic Dark Chocolate', baseUnit: 'pack' },
    },
  },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    unlock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>,
    eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    rotateCcw: <><path d="M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    play: <path d="M7 5v14l11-7z" />,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
    chevron: <path d="m6 9 6 6 6-6" />
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

export default function AuditsPage() {
  const [email, setEmail] = useState('manager.downtown@premiumretail.com');
  const [password, setPassword] = useState('Password123!');
  const [token, setToken] = useState('demo_token');
  const [locations, setLocations] = useState<Location[]>(DEMO_LOCATIONS);
  const [locationId, setLocationId] = useState('loc_downtown');
  const [sessions, setSessions] = useState<SessionRow[]>([
    {
      id: 'audit_7891',
      status: 'APPROVED',
      startedAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 7 * 86400 * 1000 + 3600 * 1000).toISOString(),
      _count: { countItems: 24 },
    },
    {
      id: 'audit_6542',
      status: 'APPROVED',
      startedAt: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 14 * 86400 * 1000 + 4200 * 1000).toISOString(),
      _count: { countItems: 22 },
    },
  ]);
  const [session, setSession] = useState<Session | null>(null);

  // Policy threshold settings
  const [thresholds, setThresholds] = useState<Threshold[]>([
    {
      scopeKey: 'default',
      categoryId: null,
      recountVariancePercent: 2.0,
      recountVarianceUnits: 5,
      highCountAlertQty: 100,
      category: null,
    },
  ]);
  const [policyScope, setPolicyScope] = useState('default');
  const [percent, setPercent] = useState('2.0');
  const [units, setUnits] = useState('5');
  const [highCount, setHighCount] = useState('100');
  const [thresholdReason, setThresholdReason] = useState('');

  // Schedule settings
  const [scheduleTime, setScheduleTime] = useState('19:00');
  const [schedule, setSchedule] = useState<Schedule | null>({
    locationId: 'loc_downtown',
    enabled: true,
    startTime: '19:00',
    timezone: 'Asia/Kolkata',
    lastRunDate: '2026-11-12',
    locationType: 'RETAIL_STORE',
    allowedDays: 'Daily after closing',
    earliestStartTime: '19:00',
    canStartNow: true,
  });

  // Count entry inputs
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [approvalReason, setApprovalReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync selected location from global app frame if present
  useEffect(() => {
    const authSession = getStoredSession();
    if (authSession?.accessToken) {
      setToken(authSession.accessToken);
    }

    const stored = window.localStorage.getItem('premium-retail-location-scope');
    if (stored) {
      const matched = DEMO_LOCATIONS.find((l) => l.name === stored);
      if (matched) setLocationId(matched.id);
    }

    const syncLocation = (event: Event) => {
      const locName = (event as CustomEvent<string>).detail;
      const found = DEMO_LOCATIONS.find((l) => l.name === locName);
      if (found) {
        setLocationId(found.id);
        setSession(null);
      }
    };

    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, []);

  const selectedLocation = locations.find((l) => l.id === locationId) || locations[0];
  const isLocationFrozen = session?.status === 'ACTIVE' || session?.status === 'SUBMITTED';

  // Start a new physical audit session
  function handleStartAudit() {
    setBusy(true);
    setError('');
    const newSessionId = `audit_${Math.floor(1000 + Math.random() * 9000)}`;

    const newSession: Session = {
      id: newSessionId,
      locationId: selectedLocation.id,
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      completedAt: null,
      countItems: INITIAL_DEMO_ITEMS.map((item) => ({
        ...item,
        countedQtyBase: null,
        recountQtyBase: null,
        requiresRecount: false,
        varianceBase: null,
        variancePercent: null,
      })),
    };

    setSession(newSession);
    setCounts({});
    setNotice(
      `Stock count started at ${selectedLocation.name}. Sales and transfers are paused until you finish.`
    );
    setBusy(false);
  }

  // Counter inputs blind count for a line
  function handleSaveCount(item: AuditItem) {
    const val = Number(counts[item.id]);
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid count of 0 or greater.');
      return;
    }

    if (!session) return;
    setError('');

    const updatedItems = session.countItems.map((ci) => {
      if (ci.id === item.id) {
        return {
          ...ci,
          countedQtyBase: val,
        };
      }
      return ci;
    });

    setSession({ ...session, countItems: updatedItems });
    setNotice(`Saved: ${item.variant.product.name}.`);
  }

  // Submit counts for manager resolution
  function handleSubmitCounts() {
    if (!session) return;

    // Check if any counts are missing
    const missing = session.countItems.filter((i) => i.countedQtyBase === null);
    if (missing.length > 0) {
      setError(`Please count ${missing.length} more product${missing.length === 1 ? '' : 's'} before finishing.`);
      return;
    }

    setError('');
    // Calculate variances and evaluate against thresholds
    const maxPercentThreshold = Number(percent) || 2.0;
    const maxUnitsThreshold = Number(units) || 5;

    const evaluatedItems: AuditItem[] = session.countItems.map((ci) => {
      const expected = ci.expectedQtyBase || 0;
      const counted = ci.countedQtyBase || 0;
      const variance = counted - expected;
      const variancePct = expected > 0 ? (Math.abs(variance) / expected) * 100 : 0;
      const needsRecount = Math.abs(variance) > maxUnitsThreshold || variancePct > maxPercentThreshold;

      return {
        ...ci,
        varianceBase: variance,
        variancePercent: variancePct.toFixed(1),
        requiresRecount: needsRecount,
        highCountAlert: counted >= 100,
      };
    });

    setSession({
      ...session,
      status: 'SUBMITTED',
      countItems: evaluatedItems,
    });

    setNotice(
      'Counting finished. You can now see the expected quantities and any differences.'
    );
  }

  // Counter or manager submits a recount value
  function handleSaveRecount(item: AuditItem, recountVal: number) {
    if (!session) return;
    const expected = item.expectedQtyBase || 0;
    const variance = recountVal - expected;
    const variancePct = expected > 0 ? (Math.abs(variance) / expected) * 100 : 0;

    const updatedItems = session.countItems.map((ci) => {
      if (ci.id === item.id) {
        return {
          ...ci,
          recountQtyBase: recountVal,
          varianceBase: variance,
          variancePercent: variancePct.toFixed(1),
          requiresRecount: false, // cleared once recounted
        };
      }
      return ci;
    });

    setSession({ ...session, countItems: updatedItems });
    setNotice(`New count saved for ${item.variant.product.name}: ${recountVal}.`);
  }

  // Manager approves reconciliation and unfreezes location
  function handleApproveReconciliation(e: FormEvent) {
    e.preventDefault();
    if (!session || !approvalReason.trim()) {
      setError('Please add a short note explaining the differences before approving.');
      return;
    }

    const updatedItems = session.countItems.map((ci) => ({
      ...ci,
      approvedQtyBase: ci.recountQtyBase !== null ? ci.recountQtyBase : ci.countedQtyBase,
    }));

    const closedSession: Session = {
      ...session,
      status: 'APPROVED',
      completedAt: new Date().toISOString(),
      resolutionReason: approvalReason.trim(),
      approvedBy: { id: 'usr_mgr', email: 'store.manager@premiumretail.com' },
      countItems: updatedItems,
    };

    setSession(closedSession);
    setSessions([
      {
        id: session.id,
        status: 'APPROVED',
        startedAt: session.startedAt,
        completedAt: new Date().toISOString(),
        _count: { countItems: session.countItems.length },
      },
      ...sessions,
    ]);

    setNotice(
      `Stock count approved. Stock levels are updated and sales have resumed at ${selectedLocation.name}.`
    );
  }

  // Abort audit without committing adjustments
  function handleAbortAudit() {
    if (!session) return;
    if (!window.confirm('Cancel this stock count? Your counts will be discarded, stock will not change, and sales will resume.')) {
      return;
    }

    setSession({
      ...session,
      status: 'ABORTED',
      completedAt: new Date().toISOString(),
      resolutionReason: 'Aborted by supervisor without posting ledger adjustments.',
    });

    setNotice(`Stock count cancelled. Sales have resumed at ${selectedLocation.name}.`);
  }

  // ---------- Derived view data ----------
  const items = session?.countItems ?? [];
  const countedCount = items.filter((i) => i.countedQtyBase !== null).length;
  const progressPct = items.length ? Math.round((countedCount / items.length) * 100) : 0;
  const recountCount = items.filter((i) => i.requiresRecount).length;
  const mismatchCount = items.filter((i) => (i.varianceBase ?? 0) !== 0).length;
  const lastAudit = sessions[0];
  const isFinished = session?.status === 'APPROVED' || session?.status === 'ABORTED';
  const highCountLimit = Number(highCount) || 100;
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
      text: `You'll count what's on the shelves at ${selectedLocation.name}. Sales and transfers pause while you count, so nothing moves.`,
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
      text: `Nothing was changed and sales have resumed at ${selectedLocation.name}.`,
    };
    return {
      tone: styles.heroDone, icon: 'check', eyebrow: 'Completed',
      title: 'All done, stock is updated',
      text: `Sales have resumed at ${selectedLocation.name}. Approved by ${session.approvedBy?.email || 'Store Manager'}${session.completedAt ? ` at ${fmtTime(session.completedAt)}` : ''}.`,
    };
  })();

  return (
    <div className={styles.page}>
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
          onChange={(next) => { setLocationId(next); setSession(null); }}
        />
      </header>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          <Icon name="alert" size={16} /><span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}
      {notice && !error && (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          <Icon name="check" size={16} /><span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ---------- At-a-glance tiles ---------- */}
      <section className={styles.tiles} aria-label="Stock count overview">
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${styles.tileBlue}`}><Icon name="box" size={18} /></span>
          <div>
            <small>Products on the sheet</small>
            <strong>{session ? <>{countedCount}<em> / {items.length} counted</em></> : <>{INITIAL_DEMO_ITEMS.length}<em> to count</em></>}</strong>
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
            <strong>{sessions.length}<em> completed</em></strong>
            <span className={styles.tileSub}>{sessions.reduce((s, r) => s + r._count.countItems, 0)} products checked</span>
          </div>
        </div>
        <div className={styles.tile}>
          <span className={`${styles.tileIcon} ${isLocationFrozen ? styles.tileAmber : styles.tileBlue}`}><Icon name={isLocationFrozen ? 'lock' : 'clock'} size={18} /></span>
          <div>
            <small>{isLocationFrozen ? 'Store status' : 'Count window opens'}</small>
            <strong>{isLocationFrozen ? 'Sales paused' : schedule?.startTime || '19:00'}</strong>
            <span className={styles.tileSub}>{isLocationFrozen ? 'until the count is finished' : `${schedule?.allowedDays} · ${schedule?.timezone}`}</span>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
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
                  <button type="button" onClick={handleStartAudit} disabled={busy} className={styles.primaryButton}>
                    <Icon name="play" size={16} /> {isFinished ? 'Start a new count' : 'Start counting'}
                  </button>
                  <span className={styles.heroHint}>
                    {lastAudit ? <>Last count: <b>{fmtDate(lastAudit.startedAt)}</b> · {plural(lastAudit._count.countItems, 'product')}</> : 'No previous counts'}
                  </span>
                </>
              )}
              {session?.status === 'ACTIVE' && (
                <>
                  <div className={styles.heroProgress}>
                    <span><b>{countedCount}</b> of {plural(items.length, 'product')} counted</span>
                    <span className={styles.track}><i style={{ width: `${progressPct}%` }} /></span>
                  </div>
                  <button type="button" onClick={handleAbortAudit} className={styles.textButton}>Cancel count</button>
                  <button type="button" onClick={handleSubmitCounts} className={styles.primaryButton} disabled={countedCount < items.length} title={countedCount < items.length ? 'Count every product first' : undefined}>
                    <Icon name="check" size={16} /> Finish counting
                  </button>
                </>
              )}
            </div>
            )}

            {isLocationFrozen && (
              <div className={styles.pausedNote}><Icon name="lock" size={14} /> Sales and transfers are paused at {selectedLocation.name} until this count is finished or cancelled.</div>
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
                  const done = item.countedQtyBase !== null;
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

                      {session.status === 'ACTIVE' && (
                        <div className={styles.itemCount}>
                          <div className={styles.countRow}>
                          <div className={styles.counter}>
                            <button type="button" onClick={() => setCounts({ ...counts, [item.id]: String(Math.max(0, (Number(draft) || 0) - 1)) })} aria-label="One less">−</button>
                            <input type="number" min="0" inputMode="numeric" placeholder="0" value={draft} onChange={(e) => setCounts({ ...counts, [item.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && draft !== '') handleSaveCount(item); }} aria-label={`How many ${item.variant.product.name}`} />
                            <button type="button" onClick={() => setCounts({ ...counts, [item.id]: String((Number(draft) || 0) + 1) })} aria-label="One more">+</button>
                          </div>
                          <span className={styles.unit}>{unit}s</span>
                          {done && String(item.countedQtyBase) === draft ? (
                            <span className={styles.savedTag}><Icon name="check" size={13} /> Saved</span>
                          ) : (
                            <button type="button" onClick={() => handleSaveCount(item)} className={styles.saveButton} disabled={draft === ''}>Save</button>
                          )}
                          </div>
                          {typo && <span className={styles.typo}><Icon name="alert" size={12} /> That&apos;s a lot. Please double-check.</span>}
                        </div>
                      )}

                      {session.status !== 'ACTIVE' && (
                        <div className={styles.itemResult}>
                          <div className={styles.numbers}>
                            <div><small>Expected</small><b>{expected}</b></div>
                            <div><small>You counted</small><b>{item.recountQtyBase ?? item.countedQtyBase ?? '—'}</b></div>
                            <div><small>Difference</small><b className={diff < 0 ? styles.neg : diff > 0 ? styles.pos : ''}>{diff > 0 ? `+${diff}` : diff}</b></div>
                          </div>
                          {session.status === 'SUBMITTED' && item.requiresRecount ? (
                            <label className={styles.recount}>
                              <span>Count again</span>
                              <input type="number" min="0" placeholder={String(finalCount)} defaultValue={item.recountQtyBase ?? ''} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) handleSaveRecount(item, v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={`New count for ${item.variant.product.name}`} />
                            </label>
                          ) : (
                            <span className={`${styles.badge} ${diff === 0 ? styles.badgeGood : styles.badgeWarn}`}>{diff === 0 ? 'Matches' : diff < 0 ? `${Math.abs(diff)} missing` : `${diff} extra`}</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {session.status === 'SUBMITTED' && (
                <form onSubmit={handleApproveReconciliation} className={styles.finish}>
                  <label className={styles.field}>
                    <span>What caused the differences?</span>
                    <textarea rows={2} required placeholder="e.g. 2 packs were damaged and thrown away" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} />
                  </label>
                  <div className={styles.finishActions}>
                    <button type="button" onClick={handleAbortAudit} className={styles.textButton}>Cancel count</button>
                    <button type="submit" className={styles.successButton}><Icon name="check" size={16} /> Approve &amp; update stock</button>
                  </div>
                </form>
              )}

              {isFinished && session.resolutionReason && (
                <p className={styles.note}><Icon name="fileText" size={14} /> {session.resolutionReason}</p>
              )}
            </section>
          )}

          {/* ---------- Preview of the count sheet (before starting) ---------- */}
          {!session && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3>On this count sheet</h3>
                  <p className={styles.cardSub}>{plural(INITIAL_DEMO_ITEMS.length, 'product')} at {selectedLocation.name}. Expected quantities stay hidden until you finish counting.</p>
                </div>
                <span className={styles.hiddenChip}><Icon name="eyeOff" size={13} /> Quantities hidden</span>
              </div>
              <ul className={styles.previewGrid}>
                {INITIAL_DEMO_ITEMS.map((item) => (
                  <li key={item.id}>
                    <span className={styles.thumb}>{initials(item.variant.product.name)}</span>
                    <div>
                      <strong>{item.variant.product.name}</strong>
                      <small>{item.variant.name}</small>
                    </div>
                    <span className={styles.skuChip}>{item.variant.sku}</span>
                  </li>
                ))}
              </ul>
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

          <details className={`${styles.card} ${styles.settings}`}>
            <summary>
              <span><Icon name="settings" size={16} /> Count settings</span>
              <Icon name="chevron" size={16} />
            </summary>
            <div className={styles.settingsBody}>
              <div className={styles.settingGroup}>
                <h4>When counts can start</h4>
                <p>{schedule?.allowedDays}, from {schedule?.startTime || '19:00'} ({schedule?.timezone}).</p>
                <label className={styles.field}>
                  <span>Start time</span>
                  <input type="time" min="19:00" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                  <small>Must be 7:00 PM or later, after the store closes.</small>
                </label>
              </div>
              <div className={styles.settingGroup}>
                <h4>When to ask for a second count</h4>
                <label className={styles.inline}>
                  <span>Difference over</span>
                  <input type="number" step="0.1" min="0" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Percent difference" />
                  <em>%</em>
                </label>
                <label className={styles.inline}>
                  <span>or more than</span>
                  <input type="number" min="1" value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Unit difference" />
                  <em>units</em>
                </label>
                <label className={styles.inline}>
                  <span>Warn if a count is over</span>
                  <input type="number" min="1" value={highCount} onChange={(e) => setHighCount(e.target.value)} aria-label="High count warning" />
                  <em>units</em>
                </label>
              </div>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}