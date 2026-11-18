'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type LocationRecord = { id: string; name: string; type: string };
type UserRecord = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  discountLimitPercent: string | number;
  locationScopes?: Array<{ locationId: string }>;
};
type Authority = { role: string; unlimited: boolean; discountLimitPercent: string | number | null };

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

function roleLabel(role: string) {
  return role.replaceAll('_', ' ');
}

function roleDescription(role: string) {
  if (role === 'CASHIER') return 'Cashier sale discounts use the assigned cap.';
  if (role === 'STORE_MANAGER') return 'Manager sale discounts use the assigned cap.';
  return 'No discount permission unless a cap is assigned.';
}

export default function DiscountLimitsAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [token, setToken] = useState('');
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [savingUser, setSavingUser] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auditInfoOpen, setAuditInfoOpen] = useState(false);
  const [openActionsUser, setOpenActionsUser] = useState('');

  async function loadAuthorityData(accessToken: string, emailStr: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [authorityResponse, usersResponse, locationsResponse] = await Promise.all([
      fetch(`${API_BASE}/users/me/discount-limit`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
    ]);
    if (!authorityResponse.ok) throw new Error(await errorMessage(authorityResponse));
    if (!usersResponse.ok) throw new Error(await errorMessage(usersResponse));
    if (!locationsResponse.ok) throw new Error(await errorMessage(locationsResponse));
    const [authorityResult, usersResult, locationsResult] = await Promise.all([
      authorityResponse.json(), usersResponse.json(), locationsResponse.json(),
    ]);
    const currentAuthority = authorityResult.data as Authority;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(currentAuthority.role)) {
      throw new Error('Only Admin and Super Admin accounts can manage discount limits.');
    }
    const manageableUsers = (usersResult.data as UserRecord[]).filter((user) =>
      user.email.toLowerCase() !== emailStr.trim().toLowerCase() && user.role !== 'SUPER_ADMIN',
    );
    setToken(accessToken);
    setActorEmail(emailStr.trim());
    setAuthority(currentAuthority);
    setUsers(manageableUsers);
    setLocations(locationsResult.data as LocationRecord[]);
    setDraftLimits(Object.fromEntries(manageableUsers.map((user) => [user.id, String(user.discountLimitPercent)])));
    setReasons({});
  }

  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken && ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role)) {
      void loadAuthorityData(session.accessToken, session.user.email).catch(() => undefined);
    }
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const accessToken: string = result.data.accessToken;
      await loadAuthorityData(accessToken, email);
      setStoredSession({
        accessToken,
        user: {
          id: 'usr_admin',
          email,
          role: 'SUPER_ADMIN',
          name: email.split('@')[0].toUpperCase(),
        },
        expiresAt: Date.now() + 86400 * 1000,
      });
      setPassword('');
      setNotice('Discount authority loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit(user: UserRecord, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !authority) return;
    const nextLimit = Number(draftLimits[user.id] ?? user.discountLimitPercent);
    const reason = (reasons[user.id] || '').trim();
    const maximum = authority.unlimited ? 100 : Number(authority.discountLimitPercent || 0);
    if (!Number.isFinite(nextLimit) || nextLimit < 0 || nextLimit > maximum || Math.round(nextLimit * 100) !== nextLimit * 100) {
      setError(`Enter a limit from 0% to ${maximum}% with up to two decimal places.`);
      return;
    }
    if (reason.length < 3) {
      setError('Enter a reason of at least 3 characters before saving.');
      return;
    }
    setSavingUser(user.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}/discount-limit`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountLimitPercent: nextLimit, reason }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const updated = result.data as UserRecord;
      setUsers((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setDraftLimits((current) => ({ ...current, [updated.id]: String(updated.discountLimitPercent) }));
      setReasons((current) => ({ ...current, [updated.id]: '' }));
      setNotice(`Saved ${updated.discountLimitPercent}% for ${updated.email}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save discount limit');
    } finally {
      setSavingUser('');
    }
  }

  function signOut() {
    void clearStoredSession();
    setToken('');
    setAuthority(null);
    setUsers([]);
    setLocations([]);
    setDraftLimits({});
    setReasons({});
    setEmail('');
    setActorEmail('');
    setError('');
    setNotice('');
    window.location.href = '/login';
  }

  const maximum = authority?.unlimited ? 100 : Number(authority?.discountLimitPercent || 0);
  const locationNames = useMemo(() => new Map(locations.map((location) => [location.id, location.name])), [locations]);
  const filteredUsers = useMemo(() => users.filter((user) => {
    const searchMatch = !search.trim() || user.email.toLowerCase().includes(search.trim().toLowerCase())
      || user.id.toLowerCase().includes(search.trim().toLowerCase()) || roleLabel(user.role).toLowerCase().includes(search.trim().toLowerCase());
    const scopes = user.locationScopes || [];
    const locationMatch = locationFilter === 'all' || scopes.some((scope) => scope.locationId === locationFilter);
    return searchMatch && locationMatch;
  }), [locationFilter, search, users]);

  if (!token || !authority) {
    return (
      <main className="login-shell">
        <div className="discount-admin-card">
          <a className="back-link" href="/">← Back to POS</a>
          <div className="brand-mark">P</div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>Discount authority</h1>
          <p className="muted">Sign in as an Admin or Super Admin to assign user discount limits.</p>
          <form className="login-form" onSubmit={signIn}>
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Loading…' : 'Sign in'} <span>→</span></button>
          </form>
          <div className="secure-note"><span className="status-dot" /> Limits are enforced and audited by the API</div>
        </div>
      </main>
    );
  }

  const roles = ['CASHIER', 'STORE_MANAGER', 'STAFF'];
  return (
    <main className="discount-console">
      <header className="discount-console-header">
        <div className="discount-header-account"><span className="discount-admin-badge">{authority.role.replaceAll('_', ' ')}</span><span>{actorEmail}</span><button onClick={signOut}>Sign out</button></div>
      </header>

      <section className="discount-console-content">
        <div className="discount-breadcrumb"><a href="/dashboard" aria-label="Dashboard">⌂</a><span>›</span><span>Settings</span><span>›</span><strong>Discount Limits</strong></div>
        <div className="discount-page-title"><div><h1>Discount Limits Management</h1><p>Configure and enforce maximum discount limits for roles and individual users (OD-07).</p></div><button className="discount-audit-button" onClick={() => setAuditInfoOpen(true)}><span>▤</span> View Audit Logs</button></div>

        <section className="discount-authority-banner"><div className="discount-authority-icon">◇</div><div className="discount-authority-copy"><small>Your Administrator Authority</small><strong>Maximum Discount Cap: {maximum.toFixed(2)}%</strong></div><div className="discount-authority-divider"/><span className="discount-info-icon">i</span><p>You can assign discount limits up to {maximum.toFixed(2)}% for any user.<small>Limits above this value are blocked as per policy OD-07.</small></p></section>

        <section className="discount-surface role-overview-surface">
          <div className="discount-surface-heading"><div><h2>Role Default Templates</h2><p>Review the active discount limits currently assigned to users in each role.</p></div><span className="discount-readonly-tag">ROLE SUMMARY</span></div>
          <div className="discount-table-wrap">
            <table className="discount-table role-overview-table"><thead><tr><th>Role</th><th>Active users</th><th>Current assigned limits</th><th>Discount policy</th></tr></thead><tbody>
              {roles.map((role) => {
                const roleUsers = users.filter((user) => user.role === role);
                const limits = roleUsers.map((user) => Number(user.discountLimitPercent));
                const range = limits.length ? `${Math.min(...limits).toFixed(2)}% – ${Math.max(...limits).toFixed(2)}%` : 'No users';
                return <tr key={role}><td><span className={`discount-role-icon ${role.toLowerCase()}`}>{role === 'STORE_MANAGER' ? '♛' : role === 'CASHIER' ? '♙' : '♟'}</span><span className={`discount-role-tag ${role.toLowerCase()}`}>{roleLabel(role)}</span></td><td>{roleUsers.length}</td><td className="discount-range-cell">{range}</td><td className="discount-description">{roleDescription(role)} <small>Line and bill use the same cap.</small></td></tr>;
              })}
            </tbody></table>
          </div>
          <div className="discount-surface-footnote">Role-wide template values are not stored in the current API. Edit individual user caps below; each cap applies to line and bill discounts.</div>
        </section>

        <section className="discount-surface users-surface">
          <div className="discount-surface-heading users-heading"><div><h2>Per-User Discount Limits</h2><p>Override discount limits for specific users by store location.</p></div><div className="discount-filters"><label className="discount-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email or account ID…" /></label><label className="discount-location-filter"><span>⌖</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter users by location"><option value="all">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div></div>
          {error && <div className="discount-feedback error">{error}</div>}{notice && <div className="discount-feedback success">{notice}</div>}
          <div className="discount-table-wrap user-table-wrap"><table className="discount-table user-limits-table"><thead><tr><th>User / Account</th><th>Role</th><th>Store Location</th><th>Maximum Discount Limit</th><th>Change reason</th><th>Actions</th></tr></thead><tbody>
            {filteredUsers.map((user) => {
              const scopes = (user.locationScopes || []).map((scope) => locationNames.get(scope.locationId)).filter((name): name is string => Boolean(name));
              const exceedsAuthority = Number(draftLimits[user.id] ?? user.discountLimitPercent) > maximum;
              return <tr key={user.id}>
                <td><div className="discount-user-cell"><span className="discount-user-avatar">{user.email.slice(0, 2).toUpperCase()}</span><span><strong>{user.email.split('@')[0].replace(/[._-]/g, ' ')}</strong><small>{user.email} · {user.id.slice(0, 8)}</small></span></div></td>
                <td><span className={`discount-role-tag ${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span></td>
                <td><span className="discount-location-cell"><span>⌖</span>{scopes.length ? scopes.join(', ') : 'Platform-wide'}</span></td>
                <td><div className="discount-limit-control"><span>Line</span><label className={exceedsAuthority ? 'over-authority' : ''}><input aria-label={`Discount limit for ${user.email}`} type="number" min="0" step="0.01" value={draftLimits[user.id] ?? String(user.discountLimitPercent)} onChange={(event) => setDraftLimits((current) => ({ ...current, [user.id]: event.target.value }))} /><span>%</span></label><span>Bill</span><strong>{draftLimits[user.id] ?? String(user.discountLimitPercent)}%</strong></div>{exceedsAuthority && <small className="discount-limit-error">Exceeds your {maximum.toFixed(2)}% authority.</small>}</td>
                <td><input className="discount-reason-input" aria-label={`Reason for ${user.email}`} value={reasons[user.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="Why is this changing?" maxLength={500} /></td>
                <td><div className="discount-row-actions"><form onSubmit={(event) => void saveLimit(user, event)}><button className="discount-save-button" disabled={savingUser === user.id || exceedsAuthority || (reasons[user.id] || '').trim().length < 3}>{savingUser === user.id ? 'Saving…' : '▣ Save'}</button></form><button className="discount-row-menu-trigger" aria-label={`More actions for ${user.email}`} aria-expanded={openActionsUser === user.id} onClick={() => setOpenActionsUser((current) => current === user.id ? '' : user.id)}>⋮</button>{openActionsUser === user.id && <div className="discount-row-menu"><button onClick={() => { setDraftLimits((current) => ({ ...current, [user.id]: String(user.discountLimitPercent) })); setReasons((current) => ({ ...current, [user.id]: '' })); setOpenActionsUser(''); }}>Reset to saved limit</button><button onClick={() => { navigator.clipboard?.writeText(user.email); setNotice(`Copied ${user.email}.`); setOpenActionsUser(''); }}>Copy email</button></div>}</div></td>
              </tr>;
            })}
            {!filteredUsers.length && <tr><td className="discount-empty-row" colSpan={6}>{users.length ? 'No users match these filters.' : 'No assignable active users found for your account.'}</td></tr>}
          </tbody></table></div>
          <div className="discount-table-footer"><span>Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> active users</span><span>Each change is recorded with its previous value, new value, reason, and administrator.</span></div>
        </section>
        <div className="discount-policy-footnote">A user's assigned percentage is the shared cap for line and bill discounts. Discount stacking remains blocked by the server.</div>
      </section>

      {auditInfoOpen && <div className="discount-info-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditInfoOpen(false); }}><section className="discount-info-modal" role="dialog" aria-modal="true" aria-labelledby="discount-audit-title"><button className="discount-info-close" onClick={() => setAuditInfoOpen(false)} aria-label="Close">×</button><span className="discount-info-icon large">i</span><h2 id="discount-audit-title">Discount audit trail</h2><p>Every saved limit change is written to the server audit log with the previous value, new value, administrator, timestamp, and reason.</p><div className="discount-audit-unavailable">The current API does not yet provide an audit-log listing screen.</div><button className="discount-audit-dismiss" onClick={() => setAuditInfoOpen(false)}>Close</button></section></div>}
    </main>
  );
}
