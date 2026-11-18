'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
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
    x: <path d="M18 6 6 18M6 6l12 12" />
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
      `Stock audit initiated for ${selectedLocation.name}. Location is now FROZEN (ADR-010); sales & transfers locked. Blind Count Mode is active.`
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
    setNotice(`Saved physical count for ${item.variant.sku}.`);
  }

  // Submit counts for manager resolution
  function handleSubmitCounts() {
    if (!session) return;

    // Check if any counts are missing
    const missing = session.countItems.filter((i) => i.countedQtyBase === null);
    if (missing.length > 0) {
      setError(`Cannot submit: ${missing.length} variants have not yet been counted.`);
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
      'Blind counts submitted. Ledger expected stock and variance deltas are now revealed for manager review.'
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
    setNotice(`Recount of ${recountVal} units saved for ${item.variant.sku}. Variance updated.`);
  }

  // Manager approves reconciliation and unfreezes location
  function handleApproveReconciliation(e: FormEvent) {
    e.preventDefault();
    if (!session || !approvalReason.trim()) {
      setError('A documented resolution reason is required before approving ledger adjustments.');
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
      `Reconciliation APPROVED! Compensating STOCK_ADJUSTMENT ledger entries posted. ${selectedLocation.name} is now UNFROZEN and sales are restored.`
    );
  }

  // Abort audit without committing adjustments
  function handleAbortAudit() {
    if (!session) return;
    if (!window.confirm('Abort this stock audit? Counts will be discarded without altering inventory balances, and the location will be unfrozen.')) {
      return;
    }

    setSession({
      ...session,
      status: 'ABORTED',
      completedAt: new Date().toISOString(),
      resolutionReason: 'Aborted by supervisor without posting ledger adjustments.',
    });

    setNotice(`Audit aborted. Location ${selectedLocation.name} is unfrozen.`);
  }

  return (
    <div className={styles.container}>
      {/* Top Breadcrumb Bar */}
      <div className={styles.topBar}>
        <div className={styles.breadcrumb}>
          <span>Inventory Governance</span>
          <span className={styles.separator}>›</span>
          <span className={styles.currentPage}>Physical Stock Audits (ADR-010)</span>
        </div>
        <div className={styles.locationTag}>
          <Icon name="mapPin" size={14} />
          <span>Location: <strong>{selectedLocation.name}</strong></span>
        </div>
      </div>

      <div className={styles.mainContent}>
        {/* ADR-010 Location Freeze Status Banner */}
        {isLocationFrozen ? (
          <div className={styles.freezeAlert}>
            <div className={styles.freezeIconWrap}>
              <Icon name="lock" size={24} />
            </div>
            <div className={styles.freezeText}>
              <h3>LOCATION FROZEN · ADR-010 ENFORCED</h3>
              <p>
                Sales checkout, stock transfer dispatch, and manual cart adjustments at <strong>{selectedLocation.name}</strong> are strictly blocked by <code>AuditLockGuard</code> to eliminate inventory drift while audit is active.
              </p>
            </div>
            <span className={styles.freezeBadge}>LOCKED</span>
          </div>
        ) : (
          <div className={styles.unfrozenBanner}>
            <Icon name="unlock" size={18} />
            <span>Store is in normal operating mode. Next off-hours audit window starts at {schedule?.startTime || '19:00'}.</span>
          </div>
        )}

        {/* Feedback alerts */}
        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <Icon name="check" size={16} />
            <span>{notice}</span>
          </div>
        )}

        {/* Page Heading & Location Switcher */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Stock Audits & Recounts</h1>
            <p className={styles.pageSubtitle}>
              Periodic physical stocktake console. Enforces ADR-010 location freeze, blind count entry (OD-06), variance threshold governance, and supervisor ledger reconciliations.
            </p>
          </div>
          <div className={styles.locationSelectorWrap}>
            <label>Audit Target Location:</label>
            <select
              value={locationId}
              disabled={isLocationFrozen}
              onChange={(e) => {
                setLocationId(e.target.value);
                setSession(null);
              }}
              className={styles.select}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.type === 'RETAIL_STORE' ? 'Retail Store' : 'Warehouse'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Two-Column Grid: Main Audit Console on Left, Policies on Right */}
        <div className={styles.gridContainer}>
          {/* LEFT: Active Session / Count Table */}
          <div className={styles.mainColumn}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.eyebrow}>INVENTORY VERIFICATION</div>
                  <h2>
                    {session ? `Audit Session ${session.id}` : `Stock Audit: ${selectedLocation.name}`}
                  </h2>
                </div>
                <span
                  className={`${styles.sessionStatusBadge} ${
                    styles['status' + (session?.status || 'IDLE')]
                  }`}
                >
                  ● {session?.status || 'READY TO AUDIT'}
                </span>
              </div>

              {!session ? (
                /* Start Audit CTA Box */
                <div className={styles.startBox}>
                  <div className={styles.startInfo}>
                    <h4>Ready to Begin Off-Hours Audit</h4>
                    <p>
                      Initiating an audit will freeze POS sales at <strong>{selectedLocation.name}</strong>. Blind Count Mode will be enabled, concealing expected ledger balances from floor counters until all counts are submitted.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartAudit}
                    disabled={busy}
                    className={styles.btnPrimary}
                  >
                    <Icon name="lock" size={16} />
                    <span>Initiate Audit & Freeze Location</span>
                  </button>
                </div>
              ) : (
                /* Live Audit Session Workspace */
                <div className={styles.sessionWorkspace}>
                  {/* Blind count notice */}
                  {session.status === 'ACTIVE' && (
                    <div className={styles.blindCountBanner}>
                      <Icon name="eyeOff" size={20} />
                      <div>
                        <strong>Blind Count Mode Active (OD-06)</strong>
                        <p>
                          Expected system balances are strictly concealed to prevent cognitive bias. Counters must physically count items on shelves and enter actual base units.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Audit Table */}
                  <div className={styles.tableWrap}>
                    <table className={styles.auditTable}>
                      <thead>
                        <tr>
                          <th>Variant / Product</th>
                          <th>SKU</th>
                          {session.status !== 'ACTIVE' && (
                            <>
                              <th>Expected</th>
                              <th>Count 1</th>
                              <th>Recount</th>
                              <th>Variance</th>
                            </>
                          )}
                          <th>{session.status === 'ACTIVE' ? 'Physical Count Entry' : 'Count Result'}</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.countItems.map((item) => {
                          const isRecountNeeded = item.requiresRecount;
                          const hasVariance = item.varianceBase !== null && item.varianceBase !== 0;

                          return (
                            <tr key={item.id}>
                              <td>
                                <strong>{item.variant.product.name}</strong>
                                <div className={styles.subText}>
                                  {item.variant.name} ({item.variant.product.baseUnit})
                                </div>
                              </td>
                              <td>
                                <span className={styles.skuTag}>{item.variant.sku}</span>
                              </td>

                              {session.status !== 'ACTIVE' && (
                                <>
                                  <td><strong>{item.expectedQtyBase}</strong></td>
                                  <td>{item.countedQtyBase ?? '—'}</td>
                                  <td>
                                    {session.status === 'SUBMITTED' && isRecountNeeded ? (
                                      <div className={styles.recountInputWrap}>
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="Recount"
                                          className={styles.smallInput}
                                          defaultValue={item.recountQtyBase ?? ''}
                                          onBlur={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val)) handleSaveRecount(item, val);
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      item.recountQtyBase ?? '—'
                                    )}
                                  </td>
                                  <td>
                                    {item.varianceBase !== null ? (
                                      <span
                                        className={
                                          item.varianceBase < 0
                                            ? styles.varianceDeficit
                                            : item.varianceBase > 0
                                            ? styles.varianceSurplus
                                            : styles.varianceMatch
                                        }
                                      >
                                        {item.varianceBase > 0 ? `+${item.varianceBase}` : item.varianceBase} units ({item.variancePercent}%)
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </>
                              )}

                              <td>
                                {session.status === 'ACTIVE' ? (
                                  <div className={styles.countInputRow}>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Units counted"
                                      value={counts[item.id] ?? ''}
                                      onChange={(e) =>
                                        setCounts({ ...counts, [item.id]: e.target.value })
                                      }
                                      className={styles.smallInput}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveCount(item)}
                                      className={styles.btnSmall}
                                      disabled={counts[item.id] === undefined || counts[item.id] === ''}
                                    >
                                      Save
                                    </button>
                                  </div>
                                ) : (
                                  <span>{item.recountQtyBase !== null ? item.recountQtyBase : item.countedQtyBase} units</span>
                                )}
                              </td>

                              <td>
                                {session.status === 'ACTIVE' ? (
                                  <span
                                    className={
                                      item.countedQtyBase !== null
                                        ? styles.statusTagDone
                                        : styles.statusTagPending
                                    }
                                  >
                                    {item.countedQtyBase !== null ? 'Counted' : 'Pending'}
                                  </span>
                                ) : isRecountNeeded ? (
                                  <span className={styles.statusTagRecount}>Requires Recount</span>
                                ) : hasVariance ? (
                                  <span className={styles.statusTagVariance}>Variance Noted</span>
                                ) : (
                                  <span className={styles.statusTagMatch}>Verified Match</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ACTIVE Mode Submissions */}
                  {session.status === 'ACTIVE' && (
                    <div className={styles.actionsBar}>
                      <p>
                        {session.countItems.filter((i) => i.countedQtyBase !== null).length} of{' '}
                        {session.countItems.length} items counted.
                      </p>
                      <div className={styles.actionButtons}>
                        <button
                          type="button"
                          onClick={handleAbortAudit}
                          className={styles.btnSecondary}
                        >
                          Abort Audit
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitCounts}
                          className={styles.btnPrimary}
                        >
                          <Icon name="check" size={16} />
                          <span>Submit Counts for Manager Review →</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUBMITTED Mode: Manager Reconciliation Decision */}
                  {session.status === 'SUBMITTED' && (
                    <form onSubmit={handleApproveReconciliation} className={styles.approvalBox}>
                      <div className={styles.approvalHeading}>
                        <Icon name="shield" size={20} />
                        <div>
                          <h4>Manager Reconciliation Approval</h4>
                          <p>
                            Review all variances above. Enter mandatory root-cause justification to post compensating <code>STOCK_ADJUSTMENT</code> movements and unfreeze the location.
                          </p>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Mandatory Audit Resolution Reason *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 2 damaged packs written off behind rack 4; stock updated"
                          value={approvalReason}
                          onChange={(e) => setApprovalReason(e.target.value)}
                          className={styles.input}
                        />
                      </div>

                      <div className={styles.approvalActions}>
                        <button
                          type="button"
                          onClick={handleAbortAudit}
                          className={styles.btnSecondary}
                        >
                          Abort Without Adjustments
                        </button>
                        <button type="submit" className={styles.btnSuccess}>
                          <Icon name="check" size={16} />
                          <span>Approve Adjustments & Unfreeze Store</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* APPROVED / COMPLETED Mode */}
                  {session.status === 'APPROVED' && (
                    <div className={styles.approvedNotice}>
                      <Icon name="check" size={20} />
                      <div>
                        <strong>Audit Approved & Committed</strong>
                        <p>
                          Resolved by {session.approvedBy?.email || 'Store Manager'}. Adjustments committed to inventory ledger; store is unfrozen.
                        </p>
                        <p className={styles.reasonQuote}>&quot;{session.resolutionReason}&quot;</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audit History Card */}
            <div className={styles.card} style={{ marginTop: 20 }}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.eyebrow}>AUDIT ARCHIVE</div>
                  <h2>Historical Stock Audits at {selectedLocation.name}</h2>
                </div>
              </div>
              <div className={styles.historyList}>
                {sessions.map((row) => (
                  <div key={row.id} className={styles.historyItem}>
                    <div>
                      <strong>{row.id}</strong>
                      <div className={styles.subText}>
                        Started {new Date(row.startedAt).toLocaleDateString()} · {row._count.countItems} variants audited
                      </div>
                    </div>
                    <span className={styles.statusApproved}>● {row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Governance Policies & Cadence */}
          <div className={styles.sideColumn}>
            {/* Cadence Card */}
            <div className={styles.card}>
              <div className={styles.eyebrow}>OFF-HOURS POLICY</div>
              <h3>Audit Cadence Schedule</h3>
              <p className={styles.sideSubtext}>
                Physical audits are restricted to off-hours windows to prevent retail business disruption.
              </p>

              <div className={styles.cadenceInfoBox}>
                <div><strong>Store Type:</strong> {selectedLocation.type === 'RETAIL_STORE' ? 'Retail Store' : 'Central Warehouse'}</div>
                <div><strong>Allowed Window:</strong> {schedule?.allowedDays}</div>
                <div><strong>Earliest Start:</strong> {schedule?.startTime || '19:00'} ({schedule?.timezone})</div>
              </div>

              <div className={styles.formGroup} style={{ marginTop: 12 }}>
                <label>Designated Off-Hours Start Time:</label>
                <input
                  type="time"
                  min="19:00"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className={styles.input}
                />
                <small className={styles.fieldNote}>Must be 7:00 PM (19:00) or later after store closing.</small>
              </div>
            </div>

            {/* Threshold Governance Card */}
            <div className={styles.card} style={{ marginTop: 20 }}>
              <div className={styles.eyebrow}>GOVERNANCE RULES</div>
              <h3>Variance Recount Thresholds</h3>
              <p className={styles.sideSubtext}>
                Counts exceeding these tolerances trigger an automatic mandatory recount before manager reconciliation is permitted.
              </p>

              <div className={styles.policyForm}>
                <div className={styles.formGroup}>
                  <label>Recount Variance Tolerance (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    className={styles.input}
                  />
                  <small className={styles.fieldNote}>Discrepancies &gt; {percent}% require recount.</small>
                </div>

                <div className={styles.formGroup}>
                  <label>Recount Absolute Unit Tolerance:</label>
                  <input
                    type="number"
                    min="1"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    className={styles.input}
                  />
                  <small className={styles.fieldNote}>Discrepancies &gt; {units} units require recount.</small>
                </div>

                <div className={styles.formGroup}>
                  <label>High-Count Typo Alert (Qty):</label>
                  <input
                    type="number"
                    min="1"
                    value={highCount}
                    onChange={(e) => setHighCount(e.target.value)}
                    className={styles.input}
                  />
                  <small className={styles.fieldNote}>Counts &gt; {highCount} flag typo warning.</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
