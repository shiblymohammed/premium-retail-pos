'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './discount.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export interface LocationRecord {
  id: string;
  name: string;
  type: string;
}

export interface UserRecord {
  id: string;
  name?: string;
  email: string;
  employeeCode?: string;
  role: string;
  isActive: boolean;
  discountLimitPercent: string | number;
  lastReason?: string;
  lastUpdated?: string;
  locationScopes?: Array<{ locationId: string; location?: { name: string } }>;
}

export interface Authority {
  role: string;
  unlimited: boolean;
  discountLimitPercent: string | number | null;
}

interface HistoryEntry {
  id: string;
  when: string;
  userId?: string;
  name: string;
  from: number;
  to: number;
  reason: string;
  by?: string;
}

/** Only cashiers can finish a sale (POST /sales is cashier-only), so only their limit is used at checkout. */
type Tier = 'none' | 'standard' | 'senior' | 'above';
type TierFilter = 'ALL' | 'NONE' | 'UPTO5' | 'OVER5';

const roleLabels: Record<string, string> = {
  STORE_MANAGER: 'Store manager',
  CASHIER: 'Cashier',
  STAFF: 'Floor staff',
  CENTRAL_MANAGER: 'Central warehouse',
  WAREHOUSE_MANAGER: 'Warehouse manager',
  SUB_WAREHOUSE_MANAGER: 'Sub-warehouse',
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
};

const PRESETS = [
  { value: 0, label: 'No discount' },
  { value: 5, label: 'Standard' },
  { value: 10, label: 'Senior' },
];
const REASON_CHIPS = ['Promoted to senior cashier', 'New cashier set-up', 'Back to standard limit', 'Quarterly policy review'];

const FALLBACK_LOCATIONS: LocationRecord[] = [
  { id: 'loc-1', name: 'Downtown Flagship Store', type: 'RETAIL_STORE' },
  { id: 'loc-2', name: 'North Mall Retail Store', type: 'RETAIL_STORE' },
  { id: 'loc-3', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc-4', name: 'Main Central Warehouse', type: 'CENTRAL_WAREHOUSE' },
];

const FALLBACK_USERS: UserRecord[] = [
  { id: 'usr-003', name: 'Asha Patel', email: 'manager@premiumretail.com', employeeCode: 'EMP-MGR-0841', role: 'STORE_MANAGER', isActive: true, discountLimitPercent: 20, lastReason: 'Downtown Store Manager authority adjustment', lastUpdated: '18-Nov-2026', locationScopes: [{ locationId: 'loc-1' }, { locationId: 'loc-2' }] },
  { id: 'usr-006', name: 'Ravi Menon', email: 'cashier@premiumretail.com', employeeCode: 'EMP-CSH-0842', role: 'CASHIER', isActive: true, discountLimitPercent: 5, lastReason: 'Initial checkout terminal provision', lastUpdated: '15-Nov-2026', locationScopes: [{ locationId: 'loc-1' }] },
  { id: 'usr-007', name: 'Neel Shah', email: 'n.shah@premiumretail.com', employeeCode: 'EMP-CSH-0843', role: 'CASHIER', isActive: true, discountLimitPercent: 5, lastReason: 'Downtown Store cashier lane 2 setup', lastUpdated: '14-Nov-2026', locationScopes: [{ locationId: 'loc-1' }] },
  { id: 'usr-008', name: 'Maya Das', email: 'm.das@premiumretail.com', employeeCode: 'EMP-CSH-0844', role: 'CASHIER', isActive: true, discountLimitPercent: 10, lastReason: 'Promoted to senior cashier for West End lane 1', lastUpdated: '12-Nov-2026', locationScopes: [{ locationId: 'loc-3' }] },
  { id: 'usr-010', name: 'Kabir Rao', email: 'k.rao@premiumretail.com', employeeCode: 'EMP-CSH-0845', role: 'CASHIER', isActive: true, discountLimitPercent: 5, lastReason: 'North Mall retail store cashier onboarding', lastUpdated: '10-Nov-2026', locationScopes: [{ locationId: 'loc-2' }] },
  { id: 'usr-012', name: 'Divya Nair', email: 'd.nair@premiumretail.com', employeeCode: 'EMP-CSH-0846', role: 'CASHIER', isActive: true, discountLimitPercent: 5, lastReason: 'North Mall POS terminal lane 2 provision', lastUpdated: '08-Nov-2026', locationScopes: [{ locationId: 'loc-2' }] },
  { id: 'usr-004', name: 'Vikram Singh', email: 'warehouse@premiumretail.com', employeeCode: 'EMP-WH-0501', role: 'CENTRAL_MANAGER', isActive: true, discountLimitPercent: 0, lastReason: 'Central Hub logistics manager - zero discount allowance', lastUpdated: '01-Nov-2026', locationScopes: [{ locationId: 'loc-4' }] },
  { id: 'usr-005', name: 'Rajesh Kumar', email: 'subwarehouse@premiumretail.com', employeeCode: 'EMP-WH-0502', role: 'SUB_WAREHOUSE_MANAGER', isActive: true, discountLimitPercent: 0, lastReason: 'Regional sub-warehouse manager - zero discount allowance', lastUpdated: '01-Nov-2026', locationScopes: [{ locationId: 'loc-4' }] },
  { id: 'usr-009', name: 'Priya Sharma', email: 'staff@premiumretail.com', employeeCode: 'EMP-STF-0109', role: 'STAFF', isActive: true, discountLimitPercent: 0, lastReason: 'Floor staff - discount permissions restricted', lastUpdated: '25-Oct-2026', locationScopes: [{ locationId: 'loc-1' }] },
  { id: 'usr-011', name: 'Anita Verma', email: 'a.verma@premiumretail.com', employeeCode: 'EMP-STF-0110', role: 'STAFF', isActive: true, discountLimitPercent: 0, lastReason: 'Floor assistant - discount permissions restricted', lastUpdated: '20-Oct-2026', locationScopes: [{ locationId: 'loc-3' }] },
];

const FALLBACK_HISTORY: HistoryEntry[] = [
  { id: 'h1', when: 'Today, 17:42', userId: 'usr-008', name: 'Maya Das', from: 5, to: 10, reason: 'Promoted to senior cashier for West End outlet lane 1' },
  { id: 'h3', when: '14-Nov-2026', userId: 'usr-006', name: 'Ravi Menon', from: 0, to: 5, reason: 'Initial checkout terminal provision' },
  { id: 'h4', when: '10-Nov-2026', userId: 'usr-010', name: 'Kabir Rao', from: 0, to: 5, reason: 'North Mall retail store onboarding' },
];

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

// ---------- helpers ----------
const displayName = (u: UserRecord) => u.name || u.email.split('@')[0];
const initials = (name: string) => name.split(/[\s.]+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
const pct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
const tierOf = (v: number): Tier => (v === 0 ? 'none' : v <= 5 ? 'standard' : v <= 10 ? 'senior' : 'above');
const TIER_LABEL: Record<Tier, string> = { none: 'No discount', standard: 'Standard', senior: 'Senior', above: 'Above guide' };
const TIER_CLASS: Record<Tier, string> = { none: styles.tierNone, standard: styles.tierStandard, senior: styles.tierStandard, above: styles.tierHigh };
const STATUS_CLASS: Record<Tier, string> = { none: styles.statusNone, standard: styles.statusStandard, senior: styles.statusSenior, above: styles.statusAbove };
const rupeesOff = (limit: number) => `₹${Math.round(limit * 10).toLocaleString('en-IN')}`;
const todayLabel = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
const tierMatch = (v: number, f: TierFilter) => (f === 'NONE' ? v === 0 : f === 'UPTO5' ? v > 0 && v <= 5 : f === 'OVER5' ? v > 5 : true);

// ---------- icons ----------
const PATHS: Record<string, React.ReactNode> = {
  cashier: <><rect x="3" y="10" width="18" height="10" rx="2" /><path d="M7 10V6h10v4M7 15h2M11 15h2M15 15h2" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  up: <><path d="m6 15 6-6 6 6" /><path d="M12 9v11" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  store: <><path d="M3 9 5 4h14l2 5M4 9v11h16V9" /><path d="M3 9h18a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  split: <><path d="M4 6h16M4 12h7M4 18h16" /><path d="m15 10 4 2-4 2" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// ---------- right-side panel ----------
function Drawer({ head, onClose, footer, children, label }: { head: React.ReactNode; onClose: () => void; footer: React.ReactNode; children: React.ReactNode; label: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={label}>
        <header className={styles.drawerHead}>
          {head}
          <button ref={closeRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
        <footer className={styles.drawerFoot}>{footer}</footer>
      </aside>
    </div>
  );
}

// ---------- limit picker (presets + slider + number) ----------
function LimitPicker({ value, onChange, max }: { value: string; onChange: (v: string) => void; max: number }) {
  const num = Number(value);
  const sliderMax = Math.min(max, 30);
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>New limit</p>
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p.value} type="button" disabled={p.value > max} className={`${styles.preset} ${num === p.value && value !== '' ? styles.presetOn : ''}`} onClick={() => onChange(String(p.value))}>
            <b>{p.value}%</b>
            <small>{p.label}</small>
          </button>
        ))}
      </div>
      <div className={styles.sliderRow}>
        <input className={styles.slider} type="range" min={0} max={sliderMax} step={0.5} value={Number.isFinite(num) ? Math.min(num, sliderMax) : 0} onChange={(e) => onChange(e.target.value)} aria-label="Discount limit" />
        <label className={styles.pctInput}>
          <input type="number" min={0} max={max} step={0.5} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Discount limit in percent" />
          <em>%</em>
        </label>
      </div>
      <div className={styles.scale}><span>0%</span><span>{pct(sliderMax / 2)}</span><span>{pct(sliderMax)}{max > sliderMax ? ' (type more if needed)' : ''}</span></div>
    </div>
  );
}

export default function DiscountLimitsAdmin() {
  // Session & authority (demo defaults when nobody is signed in)
  const [token, setToken] = useState('');
  const [actorEmail, setActorEmail] = useState('admin@premiumretail.com');
  const [authority, setAuthority] = useState<Authority>({ role: 'SUPER_ADMIN', unlimited: true, discountLimitPercent: 100 });

  // Data
  const [users, setUsers] = useState<UserRecord[]>(FALLBACK_USERS);
  const [locations, setLocations] = useState<LocationRecord[]>(FALLBACK_LOCATIONS);
  const [history, setHistory] = useState<HistoryEntry[]>(FALLBACK_HISTORY);

  // Filters
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);

  // Feedback
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Panels
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [newLimit, setNewLimit] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStore, setBulkStore] = useState('ALL');
  const [bulkPercent, setBulkPercent] = useState('5');
  const [bulkReason, setBulkReason] = useState('Quarterly operational discount policy update');

  // Load the signed-in user's authority and the real lists when the API is reachable
  useEffect(() => {
    const session = getStoredSession();
    if (session?.user?.email) setActorEmail(session.user.email);
    if (session?.user?.role) {
      setAuthority({ role: session.user.role, unlimited: session.user.role === 'SUPER_ADMIN', discountLimitPercent: session.user.role === 'SUPER_ADMIN' ? 100 : 50 });
    }
    if (!session?.accessToken) return;
    setToken(session.accessToken);
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
      fetch(`${API_BASE}/users/me/discount-limit`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
    ])
      .then(async ([authRes, usersRes, locsRes]) => {
        if (!(authRes.ok && usersRes.ok && locsRes.ok)) return;
        const [authData, usersData, locsData] = await Promise.all([authRes.json(), usersRes.json(), locsRes.json()]);
        if (authData?.data) setAuthority(authData.data);
        if (Array.isArray(usersData?.data) && usersData.data.length > 0) {
          setUsers(usersData.data.filter((u: UserRecord) => u.email.toLowerCase() !== session.user?.email.toLowerCase()));
          setHistory([]); // demo history doesn't belong to real accounts
        }
        if (Array.isArray(locsData?.data) && locsData.data.length > 0) setLocations(locsData.data);
      })
      .catch(() => {
        // API not reachable: keep the demo data
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenuFor(null); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  // ---------- who may change limits (same rules as the API) ----------
  const viewerRole = authority.role;
  const canManage = viewerRole === 'SUPER_ADMIN' || viewerRole === 'ADMIN';
  const maximumAuthority = authority.unlimited ? 100 : Number(authority.discountLimitPercent || 0);

  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const storesOf = useCallback(
    (u: UserRecord) => (u.locationScopes || []).map((s) => s.location?.name || locationMap.get(s.locationId) || s.locationId).filter(Boolean),
    [locationMap],
  );

  // Cashiers are the only people who bill; everyone else's limit isn't used at checkout
  const cashiers = useMemo(() => users.filter((u) => u.role === 'CASHIER'), [users]);
  const admins = useMemo(() => users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'), [users]);
  const others = useMemo(() => users.filter((u) => u.role !== 'CASHIER' && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN'), [users]);
  const retailStores = locations.filter((l) => l.type === 'RETAIL_STORE');

  const baseCashiers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cashiers.filter((u) => {
      const searchOk = !q || displayName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.employeeCode || '').toLowerCase().includes(q);
      const locOk = locationFilter === 'ALL' || (u.locationScopes || []).some((s) => s.locationId === locationFilter);
      return searchOk && locOk;
    });
  }, [cashiers, search, locationFilter]);
  const filtered = baseCashiers.filter((u) => tierMatch(Number(u.discountLimitPercent), tierFilter));
  const tierCounts: Record<TierFilter, number> = {
    ALL: baseCashiers.length,
    NONE: baseCashiers.filter((u) => tierMatch(Number(u.discountLimitPercent), 'NONE')).length,
    UPTO5: baseCashiers.filter((u) => tierMatch(Number(u.discountLimitPercent), 'UPTO5')).length,
    OVER5: baseCashiers.filter((u) => tierMatch(Number(u.discountLimitPercent), 'OVER5')).length,
  };
  const filtersActive = search.trim() !== '' || locationFilter !== 'ALL' || tierFilter !== 'ALL';
  const resetFilters = () => { setSearch(''); setLocationFilter('ALL'); setTierFilter('ALL'); };

  const kpis = useMemo(() => {
    const limits = cashiers.map((u) => Number(u.discountLimitPercent));
    const freq = new Map<number, number>();
    limits.forEach((v) => freq.set(v, (freq.get(v) || 0) + 1));
    const common = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const top = cashiers.reduce<UserRecord | null>((best, u) => (!best || Number(u.discountLimitPercent) > Number(best.discountLimitPercent) ? u : best), null);
    const storeCount = new Set(cashiers.flatMap((u) => (u.locationScopes || []).map((s) => s.locationId))).size;
    return { count: cashiers.length, storeCount, common, top };
  }, [cashiers]);

  // ---------- saving ----------
  /** Saves one limit. With a signed-in session it goes to the API; in the demo it updates locally. */
  const saveLimit = async (u: UserRecord, value: number, why: string): Promise<string | null> => {
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/users/${u.id}/discount-limit`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ discountLimitPercent: value, reason: why }),
        });
        if (!res.ok) return await errorMessage(res);
      } catch {
        return 'Could not reach the server. Nothing was changed.';
      }
    }
    const from = Number(u.discountLimitPercent);
    setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, discountLimitPercent: value, lastReason: why, lastUpdated: todayLabel() } : item)));
    setHistory((prev) => [{ id: `h${Date.now()}-${u.id}`, when: 'Just now', userId: u.id, name: displayName(u), from, to: value, reason: why, by: actorEmail }, ...prev]);
    return null;
  };

  const viewing = cashiers.find((u) => u.id === viewingId) ?? null;
  const openPerson = (u: UserRecord) => {
    setViewingId(u.id);
    setNewLimit(String(Number(u.discountLimitPercent)));
    setReason('');
    setFormError('');
    setMenuFor(null);
  };
  const closePerson = useCallback(() => setViewingId(null), []);

  const validLimit = (raw: string) => {
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || value < 0 || value > maximumAuthority) {
      return `Choose a limit between 0% and ${pct(maximumAuthority)}${authority.unlimited ? '' : ' (your own limit)'}.`;
    }
    if (Math.round(value * 100) !== value * 100) return 'Use at most two decimal places.';
    return '';
  };

  const submitPerson = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewing) return;
    const problemText = validLimit(newLimit);
    if (problemText) return setFormError(problemText);
    if (reason.trim().length < 3) return setFormError('Write a short reason (at least 3 characters). It is saved with the change.');
    const value = Number(newLimit);
    setSaving(true);
    const problem = await saveLimit(viewing, value, reason.trim());
    setSaving(false);
    if (problem) return setFormError(problem);
    setViewingId(null);
    setToast(value === 0 ? `${displayName(viewing)} can no longer give discounts.` : `${displayName(viewing)} can now give up to ${pct(value)} off a bill.`);
  };

  const applyQuickPreset = async (u: UserRecord, value: number, label: string) => {
    setMenuFor(null);
    if (value > maximumAuthority) return setError(`You can only set limits up to ${pct(maximumAuthority)}.`);
    const problem = await saveLimit(u, value, `Fast-assigned ${value}% ${label} via directory quick action`);
    if (problem) setError(`${displayName(u)}: ${problem}`);
    else setToast(`Set ${pct(value)} for ${displayName(u)}.`);
  };

  const copySummary = (u: UserRecord) => {
    setMenuFor(null);
    const stores = storesOf(u).join(', ') || 'No store';
    const text = `${displayName(u)} · Cashier · Discount limit ${pct(Number(u.discountLimitPercent))} per bill · ${stores}`;
    void navigator.clipboard?.writeText(text);
    setToast(`Copied ${displayName(u)}'s discount summary.`);
  };

  // ---------- set for all cashiers (optionally one store) ----------
  const bulkTargets = cashiers.filter((u) => bulkStore === 'ALL' || (u.locationScopes || []).some((s) => s.locationId === bulkStore));
  const bulkValue = Number(bulkPercent);
  const submitBulk = async (e: FormEvent) => {
    e.preventDefault();
    const problemText = validLimit(bulkPercent);
    if (problemText) return setFormError(problemText);
    if (bulkReason.trim().length < 3) return setFormError('Write a short reason (at least 3 characters).');
    const toChange = bulkTargets.filter((u) => Number(u.discountLimitPercent) !== bulkValue);
    if (toChange.length === 0) return setFormError(`These cashiers already have ${pct(bulkValue)}.`);
    setSaving(true);
    const failures: string[] = [];
    for (const u of toChange) {
      const problem = await saveLimit(u, bulkValue, bulkReason.trim());
      if (problem) failures.push(`${displayName(u)} (${problem})`);
    }
    setSaving(false);
    setBulkOpen(false);
    const done = toChange.length - failures.length;
    if (done) setToast(`Updated ${done} ${done === 1 ? 'cashier' : 'cashiers'} to ${pct(bulkValue)}.`);
    if (failures.length) setError(`Not changed: ${failures.join('; ')}`);
  };
  const openBulk = () => { setFormError(''); setBulkOpen(true); };
  const closeBulk = useCallback(() => setBulkOpen(false), []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const storeCashierCount = (id: string) => cashiers.filter((u) => id === 'ALL' || (u.locationScopes || []).some((s) => s.locationId === id)).length;

  const scaleMax = Math.max(20, ...cashiers.map((u) => Number(u.discountLimitPercent)));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Discount Limits</h1>
          <p>How much each cashier can take off a bill. Only cashiers bill customers, so this limit only applies to them.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghostButton} onClick={() => setHistoryOpen(true)}><Icon name="history" size={16} /> Change history</button>
          {canManage && <button type="button" className={styles.primaryButton} onClick={openBulk}><Icon name="layers" size={16} /> Set for all cashiers</button>}
        </div>
      </header>

      {!canManage && (
        <div className={styles.readOnly}><Icon name="lock" size={16} /><span>You can see every cashier&apos;s limit here. Only an Admin or Super Admin can change them.</span></div>
      )}
      {error && (
        <div className={styles.errorNotice}><Icon name="alert" size={16} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>
      )}

      {/* Summary cards */}
      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryTop}><span>Cashiers</span><i><Icon name="cashier" size={16} /></i></div>
          <div className={styles.summaryValue}>{kpis.count}</div>
          <div className={styles.summaryFoot}><span className={styles.chip}>{kpis.storeCount} {kpis.storeCount === 1 ? 'store' : 'stores'}</span> can bill customers</div>
        </div>
        <button type="button" className={`${styles.summaryCard} ${styles.summaryBlue} ${kpis.common && tierFilter !== 'ALL' ? styles.summaryOn : ''}`} onClick={() => kpis.common && setTierFilter(tierFilter !== 'ALL' ? 'ALL' : kpis.common[0] === 0 ? 'NONE' : kpis.common[0] <= 5 ? 'UPTO5' : 'OVER5')}>
          <div className={styles.summaryTop}><span>Most common limit</span><i><Icon name="target" size={16} /></i></div>
          <div className={styles.summaryValue}>{kpis.common ? pct(kpis.common[0]) : '—'}</div>
          <div className={styles.summaryFoot}>{kpis.common ? <><span className={`${styles.chip} ${styles.chipBlue}`}>{kpis.common[1]} of {kpis.count}</span> cashiers · click to filter</> : 'No cashiers yet'}</div>
        </button>
        <button type="button" className={styles.summaryCard} onClick={() => kpis.top && openPerson(kpis.top)} disabled={!kpis.top}>
          <div className={styles.summaryTop}><span>Highest limit</span><i className={styles.toneAmber}><Icon name="up" size={16} /></i></div>
          <div className={styles.summaryValue}>{kpis.top ? pct(Number(kpis.top.discountLimitPercent)) : '—'}</div>
          <div className={styles.summaryFoot}>{kpis.top ? <><span className={`${styles.chip} ${styles.chipAmber}`}>{displayName(kpis.top)}</span> {storesOf(kpis.top)[0] || 'No store'}</> : '—'}</div>
        </button>
        <div className={styles.summaryCard}>
          <div className={styles.summaryTop}><span>Your authority</span><i className={styles.toneGreen}><Icon name="shield" size={16} /></i></div>
          <div className={styles.summaryValue}>{canManage ? (authority.unlimited ? 'No cap' : pct(maximumAuthority)) : 'View only'}</div>
          <div className={styles.summaryFoot}>{canManage ? <><span className={`${styles.chip} ${styles.chipGreen}`}>up to {pct(maximumAuthority)}</span> for any cashier</> : 'Ask an admin to change a limit'}</div>
        </div>
      </section>

      {/* Cashiers and their limits */}
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="Filter by limit">
            {([['ALL', 'All cashiers'], ['NONE', 'No discount'], ['UPTO5', 'Up to 5%'], ['OVER5', 'Over 5%']] as [TierFilter, string][]).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tierFilter === key} className={tierFilter === key ? styles.tabOn : ''} onClick={() => setTierFilter(key)}>
                {label} <em>{tierCounts[key]}</em>
              </button>
            ))}
          </div>
          <div className={styles.toolbarRight}>
            <PillDropdown heading="Store" ariaLabel="Filter by store" icon={<Icon name="store" size={14} />} value={locationFilter} options={[{ value: 'ALL', label: 'All stores' }, ...retailStores.map((l) => ({ value: l.id, label: l.name }))]} onChange={setLocationFilter} />
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <input type="search" placeholder="Search name, email or ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cashiers" />
            </label>
          </div>
        </div>

        <div className={`${styles.listHead} ${styles.cashierGrid}`} role="row">
          <span>Cashier</span>
          <span>Store</span>
          <span>Discount limit</span>
          <span className={styles.colExample}>Level</span>
          <span className={styles.colChange}>Last change</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <strong>{cashiers.length ? 'No cashier matches these filters' : 'No cashiers yet'}</strong>
            <span>{cashiers.length ? 'Try a different search, or clear the filters.' : 'Add a cashier in the User Directory, then set their limit here.'}</span>
            {filtersActive && <button type="button" className={styles.linkButton} onClick={resetFilters}>Clear filters</button>}
          </div>
        ) : (
          filtered.map((u) => {
            const v = Number(u.discountLimitPercent);
            const tier = tierOf(v);
            const stores = storesOf(u);
            return (
              <div key={u.id} className={`${styles.row} ${styles.cashierGrid}`} role="button" tabIndex={0} onClick={() => openPerson(u)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerson(u); } }}>
                <div className={styles.person}>
                  <span className={`${styles.avatar} ${styles.avCashier}`}>{initials(displayName(u))}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{displayName(u)}</strong>
                    <small>{u.employeeCode || u.id.slice(0, 8)} · {u.email}</small>
                  </div>
                </div>
                <div className={styles.store} title={stores.join(', ')}>
                  <span>{stores[0] || 'No store'}</span>
                  {stores.length > 1 && <em>+{stores.length - 1}</em>}
                </div>
                <div className={`${styles.limit} ${TIER_CLASS[tier]}`}>
                  <div className={styles.limitTop}>
                    <b>{pct(v)}</b>
                    <small>{v > 0 ? `up to ${rupeesOff(v)} off ₹1,000` : 'full price only'}</small>
                  </div>
                  <div className={styles.bar}><i style={{ width: `${Math.min(100, (v / scaleMax) * 100)}%` }} /></div>
                </div>
                <div className={styles.colExample}>
                  <span className={`${styles.status} ${STATUS_CLASS[tier]}`}><i />{TIER_LABEL[tier]}</span>
                </div>
                <div className={`${styles.lastChange} ${styles.colChange}`} title={u.lastReason}>
                  <b>{u.lastUpdated || '—'}</b>
                  <span>{u.lastReason || 'No changes recorded yet'}</span>
                </div>
                <div className={styles.actions} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} data-row-menu>
                  <button type="button" className={`${styles.ghostButton} ${styles.smallButton}`} onClick={() => openPerson(u)}>
                    {canManage ? <><Icon name="edit" size={13} /> Change</> : 'View'}
                  </button>
                  <button type="button" className={styles.iconButton} aria-label={`More options for ${displayName(u)}`} aria-expanded={menuFor === u.id} onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}>
                    <Icon name="more" size={16} />
                  </button>
                  {menuFor === u.id && (
                    <div className={styles.menu} role="menu">
                      {canManage && (
                        <>
                          <p>Quick set</p>
                          {[{ v: 5, l: 'Standard POS' }, { v: 10, l: 'Senior POS' }, { v: 0, l: 'Restricted' }].map((p) => (
                            <button key={p.v} type="button" role="menuitem" disabled={p.v > maximumAuthority || p.v === v} onClick={() => void applyQuickPreset(u, p.v, p.l)}>
                              <span>{p.v === 0 ? 'No discount' : `${p.v}%`}</span><small>{p.v === 0 ? '0%' : p.l.replace(' POS', '')}</small>
                            </button>
                          ))}
                          <hr />
                        </>
                      )}
                      <button type="button" role="menuitem" onClick={() => copySummary(u)}><span>Copy summary</span><Icon name="copy" size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className={styles.listFoot}>
          <span>Showing <b>{filtered.length}</b> of <b>{cashiers.length}</b> cashiers{filtersActive && <> · <button type="button" className={styles.linkButton} onClick={resetFilters}>Clear filters</button></>}</span>
          <span>One limit covers item and bill discounts</span>
        </div>
      </section>

      {/* Guide: suggestions, the real checkout rules, and who can set limits */}
      <section className={styles.guide}>
        <div className={styles.guideCard}>
          <h2>Suggested cashier limits</h2>
          <p>A starting point. You can give any cashier more or less.</p>
          <div className={styles.roleGuide}>
            <div className={styles.roleTile}>
              <b style={{ color: '#3e64a0' }}>5%</b>
              <strong>Standard cashier</strong>
              <span>For everyday courtesy discounts, such as a regular customer or a small defect on an item.</span>
            </div>
            <div className={styles.roleTile}>
              <b style={{ color: '#3e64a0' }}>10%</b>
              <strong>Senior cashier</strong>
              <span>For experienced cashiers, usually with the store manager&apos;s approval.</span>
            </div>
            <div className={styles.roleTile}>
              <b style={{ color: '#6b7280' }}>0%</b>
              <strong>No discounts</strong>
              <span>The cashier can still bill at full price, but can&apos;t take anything off.</span>
            </div>
          </div>
        </div>
        <div className={styles.guideCard}>
          <h2>How the checkout uses it</h2>
          <p>These rules are checked by the server when a sale is finished.</p>
          <ul className={styles.rules}>
            <li><i><Icon name="cashier" size={15} /></i><div><strong>Only cashiers can bill</strong><span>Managers, warehouse and floor staff can&apos;t finish a sale, so a limit does nothing for them.</span></div></li>
            <li><i><Icon name="split" size={15} /></i><div><strong>Item or bill discount, not both</strong><span>A bill can have discounts on single items or one discount on the whole bill, never both.</span></div></li>
            <li><i><Icon name="receipt" size={15} /></i><div><strong>The total can&apos;t go over the limit</strong><span>All the discounts on a bill together must stay within the cashier&apos;s %. If not, the sale is blocked.</span></div></li>
            <li><i><Icon name="history" size={15} /></i><div><strong>Every change is recorded</strong><span>A reason is required. The old and new limit, who changed it and when are all saved.</span></div></li>
          </ul>
        </div>
      </section>

      <section className={styles.guide}>
        <div className={styles.guideCard}>
          <h2>Who can set limits</h2>
          <p>Store managers and other roles can only view this page.</p>
          <ul className={styles.rules}>
            <li><i><Icon name="shield" size={15} /></i><div><strong>Super admin</strong><span>Can give a cashier any limit, up to 100%.</span></div></li>
            <li><i><Icon name="user" size={15} /></i><div><strong>Admin</strong><span>Can set limits for cashiers in their own stores, but never higher than the admin&apos;s own limit.</span></div></li>
          </ul>
          {admins.length > 0 && (
            <div className={styles.affected} style={{ marginTop: 14 }}>
              {admins.map((a) => (
                <div key={a.id}>
                  <span>{displayName(a)} <small>· {roleLabels[a.role]}</small></span>
                  <small>{a.role === 'SUPER_ADMIN' ? 'No cap' : `Can set up to ${pct(Number(a.discountLimitPercent))}`}</small>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.guideCard}>
          <button type="button" className={styles.othersToggle} onClick={() => setOthersOpen((o) => !o)} aria-expanded={othersOpen}>
            <div>
              <h2>Other staff ({others.length})</h2>
              <p>They can&apos;t bill, so a discount limit doesn&apos;t apply to them.</p>
            </div>
            <span className={othersOpen ? styles.chevOpen : ''}><Icon name="chevron" size={16} /></span>
          </button>
          {othersOpen && (
            <>
              <div className={styles.affected}>
                {others.map((o) => (
                  <div key={o.id}>
                    <span>{displayName(o)} <small>· {roleLabels[o.role] || o.role}</small></span>
                    <small>{storesOf(o)[0] || '—'}</small>
                  </div>
                ))}
              </div>
              <p className={styles.sectionHint} style={{ marginTop: 10 }}>If someone moves to a cashier role, they appear in the list above. Check their limit then.</p>
            </>
          )}
        </div>
      </section>

      {/* Cashier panel */}
      {viewing && (() => {
        const current = Number(viewing.discountLimitPercent);
        const tier = tierOf(current);
        const next = Number(newLimit);
        const changed = newLimit !== '' && Number.isFinite(next) && next !== current;
        const personHistory = history.filter((h) => h.userId === viewing.id);
        const stores = storesOf(viewing);
        return (
          <Drawer
            label={`Discount limit for ${displayName(viewing)}`}
            onClose={closePerson}
            head={<>
              <span className={`${styles.avatar} ${styles.avCashier}`}>{initials(displayName(viewing))}</span>
              <div><h2>{displayName(viewing)}</h2><p>Cashier · {viewing.employeeCode || viewing.email}</p></div>
            </>}
            footer={canManage ? (
              <>
                <button type="button" className={styles.ghostButton} onClick={closePerson}>Cancel</button>
                <button type="submit" form="limit-form" className={styles.primaryButton} disabled={saving || !changed || reason.trim().length < 3}>{saving ? 'Saving…' : 'Save change'}</button>
              </>
            ) : (
              <><small><Icon name="lock" size={14} /> View only</small><button type="button" className={styles.primaryButton} onClick={closePerson}>Close</button></>
            )}
          >
            <div className={`${styles.hero} ${TIER_CLASS[tier]}`}>
              <div className={styles.heroValue}>{Number.isInteger(current) ? current : current.toFixed(1)}<em>%</em></div>
              <div className={styles.heroText}>
                <span className={styles.tierPill}><i /> {TIER_LABEL[tier]}</span>
                {tier === 'none' ? <span>Can bill at full price but can&apos;t give any discount.</span>
                  : <span>On a <b>₹1,000</b> bill they can take off up to <b>{rupeesOff(current)}</b>, on single items or the whole bill.</span>}
              </div>
            </div>

            {canManage ? (
              <form id="limit-form" className={styles.section} onSubmit={submitPerson} style={{ gap: 20 }}>
                <LimitPicker value={newLimit} onChange={(v) => { setNewLimit(v); setFormError(''); }} max={maximumAuthority} />
                {changed && (
                  <div className={styles.change}>
                    <b>{pct(current)}</b><span className={styles.arrow}>→</span><b className={next > current ? styles.up : styles.down}>{pct(next)}</b>
                    <small>{next > 0 ? `Up to ${rupeesOff(next)} off a ₹1,000 bill` : 'No discounts at checkout'}</small>
                  </div>
                )}
                <label className={styles.field}>
                  <span>Reason for the change <em>required, saved in the history</em></span>
                  <textarea value={reason} maxLength={500} placeholder="e.g. Promoted to senior cashier" onChange={(e) => { setReason(e.target.value); setFormError(''); }} />
                </label>
                <div className={styles.reasonChips}>
                  {REASON_CHIPS.map((r) => <button key={r} type="button" onClick={() => setReason(r)}>{r}</button>)}
                </div>
                {!authority.unlimited && <div className={styles.infoBox}><Icon name="info" size={16} /><span>You can&apos;t set a limit higher than your own ({pct(maximumAuthority)}).</span></div>}
                {formError && <p className={styles.error}><Icon name="alert" size={15} /> {formError}</p>}
              </form>
            ) : (
              <div className={styles.infoBox}><Icon name="lock" size={16} /><span>Only an Admin or Super Admin can change discount limits.</span></div>
            )}

            <div className={styles.section}>
              <p className={styles.sectionLabel}>Details</p>
              <div className={styles.details}>
                <div><small>Email</small><b title={viewing.email}>{viewing.email}</b></div>
                <div><small>Status</small><b>{viewing.isActive ? 'Active' : 'Inactive'}</b></div>
                <div><small>Store</small><b title={stores.join(', ')}>{stores.join(', ') || 'No store'}</b></div>
                <div><small>Last changed</small><b>{viewing.lastUpdated || '—'}</b></div>
              </div>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionLabel}>History</p>
              {personHistory.length ? (
                <ul className={styles.history}>
                  {personHistory.map((h) => (
                    <li key={h.id}>
                      <span className={styles.historyIcon}><Icon name="history" size={15} /></span>
                      <div style={{ minWidth: 0 }}><strong>{h.reason}</strong><span>{h.when}{h.by ? ` · by ${h.by}` : ''}</span></div>
                      <div className={styles.delta}><b>{pct(h.from)} → {pct(h.to)}</b></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.noHistory}>{viewing.lastReason ? `Last note: “${viewing.lastReason}”` : 'No changes recorded yet.'}</p>
              )}
            </div>
          </Drawer>
        );
      })()}

      {/* Set for all cashiers panel */}
      {bulkOpen && (
        <Drawer
          label="Set a limit for all cashiers"
          onClose={closeBulk}
          head={<><span className={styles.headIcon}><Icon name="layers" /></span><div><h2>Set for all cashiers</h2><p>Give every cashier, or every cashier in one store, the same limit.</p></div></>}
          footer={<>
            <button type="button" className={styles.ghostButton} onClick={closeBulk}>Cancel</button>
            <button type="submit" form="bulk-form" className={styles.primaryButton} disabled={saving || bulkTargets.length === 0}>{saving ? 'Saving…' : `Apply to ${bulkTargets.length} ${bulkTargets.length === 1 ? 'cashier' : 'cashiers'}`}</button>
          </>}
        >
          <form id="bulk-form" className={styles.section} onSubmit={submitBulk} style={{ gap: 20 }}>
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Which cashiers</p>
              <div className={styles.roleChoices}>
                {[{ id: 'ALL', name: 'All stores' }, ...retailStores].map((s) => (
                  <button key={s.id} type="button" className={`${styles.roleChoice} ${bulkStore === s.id ? styles.roleChoiceOn : ''}`} onClick={() => { setBulkStore(s.id); setFormError(''); }} aria-pressed={bulkStore === s.id}>
                    <strong>{s.name}</strong>
                    <small>{storeCashierCount(s.id)} {storeCashierCount(s.id) === 1 ? 'cashier' : 'cashiers'}</small>
                  </button>
                ))}
              </div>
            </div>
            <LimitPicker value={bulkPercent} onChange={(v) => { setBulkPercent(v); setFormError(''); }} max={maximumAuthority} />
            <label className={styles.field}>
              <span>Reason <em>required, saved for each cashier</em></span>
              <textarea value={bulkReason} maxLength={500} onChange={(e) => { setBulkReason(e.target.value); setFormError(''); }} />
            </label>
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Who will change</p>
              {bulkTargets.length ? (
                <div className={styles.affected}>
                  {bulkTargets.map((u) => {
                    const from = Number(u.discountLimitPercent);
                    const same = bulkPercent !== '' && from === bulkValue;
                    return (
                      <div key={u.id}>
                        <span>{displayName(u)} <small>· {storesOf(u)[0] || 'No store'}</small></span>
                        <small>{same ? `Already ${pct(from)}` : `${pct(from)} → ${bulkPercent === '' ? '…' : pct(bulkValue)}`}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.noHistory}>There are no cashiers in this store.</p>
              )}
            </div>
            {formError && <p className={styles.error}><Icon name="alert" size={15} /> {formError}</p>}
          </form>
        </Drawer>
      )}

      {/* Change history panel */}
      {historyOpen && (
        <Drawer
          label="Change history"
          onClose={closeHistory}
          head={<><span className={styles.headIcon}><Icon name="history" /></span><div><h2>Change history</h2><p>Every limit change, newest first. Changes can&apos;t be edited or deleted.</p></div></>}
          footer={<button type="button" className={styles.primaryButton} onClick={closeHistory}>Close</button>}
        >
          <div className={styles.infoBox}><Icon name="info" size={16} /><span>For each change the system keeps the old limit, the new limit, who made it, when, and the reason.</span></div>
          {history.length ? (
            <ul className={styles.history}>
              {history.map((h) => (
                <li key={h.id}>
                  <span className={`${styles.avatar} ${styles.avCashier}`}>{initials(h.name)}</span>
                  <div style={{ minWidth: 0 }}><strong>{h.name}</strong><span title={h.reason}>{h.reason}</span></div>
                  <div className={styles.delta}><b>{pct(h.from)} → {pct(h.to)}</b><em>{h.when}</em></div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.noHistory}>No changes made in this session yet. Older changes are kept in the server&apos;s audit log.</p>
          )}
        </Drawer>
      )}

      {toast && <div className={styles.toast} role="status"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}
