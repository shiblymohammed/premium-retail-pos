'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  History,
  Info,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Split,
  Store,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
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

// ---------- icons ----------
const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  cashier: ShoppingCart,
  target: Target,
  up: TrendingUp,
  down: TrendingDown,
  shield: ShieldCheck,
  history: History,
  layers: Layers,
  search: Search,
  store: Store,
  user: UserRound,
  more: Ellipsis,
  close: X,
  check: Check,
  info: Info,
  alert: TriangleAlert,
  lock: Lock,
  copy: Copy,
  split: Split,
  receipt: ReceiptText,
  edit: Pencil,
  chevron: ChevronDown,
  grid: LayoutGrid,
  list: List,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name];
  return Glyph ? <Glyph size={size} strokeWidth={1.8} aria-hidden="true" /> : null;
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
  // Session & authority from the authenticated API
  const [token, setToken] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  // Keep privileged authority hidden until the API confirms the current role.
  const [authority, setAuthority] = useState<Authority>({ role: '', unlimited: false, discountLimitPercent: 0 });

  // Data
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [menuFor, setMenuFor] = useState<string | null>(null);

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
          setHistory([]);
        }
        if (Array.isArray(locsData?.data) && locsData.data.length > 0) setLocations(locsData.data);
      })
      .catch(() => {
        // Keep empty states when the API is unavailable; never present sample users as live data.
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
  const retailStores = locations.filter((l) => l.type === 'RETAIL_STORE');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cashiers.filter((u) => {
      const searchOk = !q || displayName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.employeeCode || '').toLowerCase().includes(q);
      const locOk = locationFilter === 'ALL' || (u.locationScopes || []).some((s) => s.locationId === locationFilter);
      return searchOk && locOk;
    });
  }, [cashiers, search, locationFilter]);
  const filtersActive = search.trim() !== '' || locationFilter !== 'ALL';
  const resetFilters = () => { setSearch(''); setLocationFilter('ALL'); };

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
  /** Saves one limit through the API; never report a local-only change as persisted. */
  const saveLimit = async (u: UserRecord, value: number, why: string): Promise<string | null> => {
    if (!token) return 'Sign in again before changing discount limits.';
    {
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

  const rowMenu = (u: UserRecord, v: number) => (
    <>
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
    </>
  );

  // ---------- numbers for the three stat cards ----------
  const STORE_COLORS = ['#3e64a0', '#6f8fc4', '#a9bee0', '#cfdcef'];
  const storeBreak = retailStores
    .map((s) => ({ id: s.id, name: s.name, count: cashiers.filter((u) => (u.locationScopes || []).some((x) => x.locationId === s.id)).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const TIER_COLOR: Record<Tier, string> = { none: '#c4c9d2', standard: '#5a7fb8', senior: '#3fa96b', above: '#e5a53a' };
  const mix = (() => {
    const map = new Map<number, number>();
    cashiers.forEach((u) => { const v = Number(u.discountLimitPercent); map.set(v, (map.get(v) || 0) + 1); });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([v, n]) => ({ v, n, color: TIER_COLOR[tierOf(v)] }));
  })();
  const CIRC = 2 * Math.PI * 28;
  let donutOffset = 0;
  const highest = Math.max(0, ...cashiers.map((u) => Number(u.discountLimitPercent)));
  const average = cashiers.length ? cashiers.reduce((s, u) => s + Number(u.discountLimitPercent), 0) / cashiers.length : 0;
  const meterScale = Math.max(20, highest);
  const recent = history.slice(0, 5);

  return (
    <div className={`${styles.page} app-page`}>
      <header className={styles.header}>
        <div>
          <h1>Discount Limits</h1>
          <p>The most each cashier can take off a bill. Click a cashier to change their limit.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghostButton} onClick={() => setHistoryOpen(true)}><Icon name="history" size={16} /> History</button>
          {canManage && <button type="button" className={styles.primaryButton} onClick={openBulk}><Icon name="layers" size={16} /> Set for all cashiers</button>}
        </div>
      </header>

      {!canManage && (
        <div className={styles.readOnly}><Icon name="lock" size={16} /><span>You can view limits here. Only an Admin or Super Admin can change them.</span></div>
      )}
      {error && <Feedback tone="error" onDismiss={() => setError('')}>{error}</Feedback>}

      {/* Stat cards, same pattern as the Dashboard */}
      <section className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statTeal}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}><span className={styles.statIcon}><Icon name="cashier" size={16} /></span><h3>Cashiers</h3></div>
            <div>
              <div className={styles.statValue}>{kpis.count}</div>
              <div className={styles.statMeta}><span className={styles.deltaBlue}>{kpis.storeCount} {kpis.storeCount === 1 ? 'store' : 'stores'}</span></div>
            </div>
          </div>
          <div className={styles.miniChart}>
            <span className={styles.miniCaption}>Cashiers by store</span>
            <div className={styles.splitBar}>
              {storeBreak.map((s, i) => <i key={s.id} style={{ flex: s.count, background: STORE_COLORS[i % STORE_COLORS.length] }} />)}
            </div>
            <ul className={styles.legend}>
              {storeBreak.slice(0, 3).map((s, i) => (
                <li key={s.id}><i style={{ background: STORE_COLORS[i % STORE_COLORS.length] }} /><span>{s.name.replace(' Retail Store', '').replace(' Store', '')}</span><b>{s.count}</b></li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statViolet}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}><span className={styles.statIcon}><Icon name="target" size={16} /></span><h3>Most common</h3></div>
            <div>
              <div className={styles.statValue}>{kpis.common ? pct(kpis.common[0]) : '—'}</div>
              <div className={styles.statMeta}>{kpis.common ? <><span className={styles.deltaViolet}>{kpis.common[1]} of {kpis.count}</span> cashiers</> : 'No cashiers yet'}</div>
            </div>
          </div>
          <div className={`${styles.miniChart} ${styles.donutWrap}`}>
            <svg className={styles.donut} viewBox="0 0 72 72" aria-hidden="true">
              <circle cx="36" cy="36" r="28" className={styles.donutTrack} />
              {mix.map((m) => {
                const len = (m.n / Math.max(1, cashiers.length)) * CIRC;
                const seg = <circle key={m.v} cx="36" cy="36" r="28" className={styles.donutSeg} stroke={m.color} strokeDasharray={`${Math.max(0, len - 2)} ${CIRC}`} strokeDashoffset={-donutOffset} />;
                donutOffset += len;
                return seg;
              })}
              <text x="36" y="35" textAnchor="middle" className={styles.donutValue}>{pct(Math.round(average * 10) / 10)}</text>
              <text x="36" y="44" textAnchor="middle" className={styles.donutLabel}>average</text>
            </svg>
            <ul className={styles.legend}>
              {mix.slice(0, 3).map((m) => (
                <li key={m.v}><i style={{ background: m.color }} /><span>{pct(m.v)}</span><b>{m.n}</b></li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statGreen}`}>
          <div className={styles.statMain}>
            <div className={styles.statHead}><span className={styles.statIcon}><Icon name="shield" size={16} /></span><div className="heading-with-info"><h3>Your authority</h3><InfoHint label="About your discount authority">Your role controls which limits you can assign to cashiers.</InfoHint></div></div>
            <div>
              <div className={styles.statValue}>{canManage ? (authority.unlimited ? 'No cap' : pct(maximumAuthority)) : 'View only'}</div>
              <div className={styles.statMeta}>{canManage ? <><span className={styles.deltaGreen}>up to {pct(maximumAuthority)}</span></> : 'Ask an admin to change limits'}</div>
            </div>
          </div>
          <div className={styles.miniChart}>
            <span className={styles.miniCaption}>Limits given</span>
            <div className={styles.meters}>
              <div className={styles.meter}>
                <div className={styles.meterTop}><span>Highest</span><b>{pct(highest)}</b></div>
                <div className={styles.meterTrack}><i style={{ width: `${(highest / meterScale) * 100}%`, background: '#e5a53a' }} /></div>
              </div>
              <div className={styles.meter}>
                <div className={styles.meterTop}><span>Average</span><b>{pct(Math.round(average * 10) / 10)}</b></div>
                <div className={styles.meterTrack}><i style={{ width: `${(average / meterScale) * 100}%`, background: '#3fa96b' }} /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.mainGrid}>
        {/* Cashier list */}
        <section className={styles.listCard}>
          <div className={styles.listHeader}>
            <div>
              <h2>Cashiers <span className={styles.countChip}>{filtered.length}</span></h2>
              <p>Only cashiers bill customers, so only they need a limit.</p>
            </div>
            <div className={styles.toolbarRight}>
              <PillDropdown heading="Store" ariaLabel="Filter by store" icon={<Icon name="store" size={14} />} value={locationFilter} options={[{ value: 'ALL', label: 'All stores' }, ...retailStores.map((l) => ({ value: l.id, label: l.name }))]} onChange={setLocationFilter} />
              <label className={styles.search}>
                <Icon name="search" size={15} />
                <input type="search" placeholder="Search cashier…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cashiers" />
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <strong>{cashiers.length ? 'No cashier found' : 'No cashiers yet'}</strong>
              <span>{cashiers.length ? 'Try another name or store.' : 'Add a cashier in the User Directory first.'}</span>
              {filtersActive && <button type="button" className={styles.linkButton} onClick={resetFilters}>Clear search</button>}
            </div>
          ) : (
            <>
              <div className={styles.boxHead}><span>Cashier</span><span>Limit</span><span className={styles.hideNarrow}>Last change</span><span /></div>
              <ul className={styles.boxRows}>
                {filtered.map((u) => {
                  const v = Number(u.discountLimitPercent);
                  const tier = tierOf(v);
                  const stores = storesOf(u);
                  return (
                    <li key={u.id} className={styles.boxRow} onClick={() => openPerson(u)} onKeyDown={(e) => { if (e.key === 'Enter') openPerson(u); }} tabIndex={0}>
                      <div className={styles.person}>
                        <span className={`${styles.avatar} ${styles.avCashier}`}>{initials(displayName(u))}</span>
                        <div style={{ minWidth: 0 }}>
                          <strong>{displayName(u)}</strong>
                          <small>{stores[0] || 'No store'}{stores.length > 1 ? ` +${stores.length - 1}` : ''}</small>
                        </div>
                      </div>
                      <div className={styles.limitCell}>
                        <span className={`${styles.bigPct} ${STATUS_CLASS[tier]}`}>{pct(v)}</span>
                        <div>
                          <b>{v > 0 ? `Up to ${rupeesOff(v)} off` : 'No discount'}</b>
                          <small>{v > 0 ? 'on a ₹1,000 bill' : 'full price only'}</small>
                        </div>
                      </div>
                      <div className={`${styles.lastChange} ${styles.hideNarrow}`} title={u.lastReason}>
                        <b>{u.lastUpdated || '—'}</b>
                        <span>{u.lastReason || 'No changes yet'}</span>
                      </div>
                      <div className={styles.actions} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} data-row-menu>
                        <button type="button" className={`${styles.ghostButton} ${styles.smallButton}`} onClick={() => openPerson(u)}>
                          {canManage ? <><Icon name="edit" size={13} /> Change</> : 'View'}
                        </button>
                        {rowMenu(u, v)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Side column */}
        <div className={styles.sideCol}>
          <section className={styles.sideCard}>
            <div className={styles.sideHead}>
              <div><h2>Recent changes</h2><p>Every change is saved with a reason.</p></div>
              <button type="button" className={`${styles.primaryButton} ${styles.smallButton}`} onClick={() => setHistoryOpen(true)}>View all</button>
            </div>
            {recent.length ? (
              <ul className={styles.changeList}>
                {recent.map((h) => {
                  const up = h.to > h.from;
                  return (
                    <li key={h.id}>
                      <span className={`${styles.changeIcon} ${up ? styles.changeUp : styles.changeDown}`}><Icon name={up ? 'up' : 'down'} size={15} /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.changeTop}><strong>{h.name}</strong><b>{pct(h.from)} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {pct(h.to)}</b></div>
                        <span title={h.reason}>{h.reason}</span>
                        <small>{h.when}</small>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.noHistory}>No changes yet.</p>
            )}
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideHead}><div><h2>How it works</h2><p>Checked by the till when a sale is finished.</p></div></div>
            <ul className={styles.rules}>
              <li><i><Icon name="receipt" size={15} /></i><div><strong>One limit per bill</strong><span>All discounts on a bill together must stay within it.</span></div></li>
              <li><i><Icon name="split" size={15} /></i><div><strong>Item or bill discount</strong><span>A bill can use one kind, not both.</span></div></li>
              <li><i><Icon name="lock" size={15} /></i><div><strong>Over the limit is blocked</strong><span>The till stops the sale straight away.</span></div></li>
            </ul>
          </section>
        </div>
      </div>

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
                    <b>{pct(current)}</b><span className={styles.arrow}><ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span><b className={next > current ? styles.up : styles.down}>{pct(next)}</b>
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
                      <div className={styles.delta}><b>{pct(h.from)} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {pct(h.to)}</b></div>
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
                        <small>{same ? `Already ${pct(from)}` : <>{pct(from)} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {bulkPercent === '' ? '…' : pct(bulkValue)}</>}</small>
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
                  <div className={styles.delta}><b>{pct(h.from)} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {pct(h.to)}</b><em>{h.when}</em></div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.noHistory}>No changes made in this session yet. Older changes are kept in the server&apos;s audit log.</p>
          )}
        </Drawer>
      )}

      {toast && <Feedback toast tone="success">{toast}</Feedback>}
    </div>
  );
}
