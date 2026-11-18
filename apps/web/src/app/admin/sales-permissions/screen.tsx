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
  canCancelSales: boolean;
  canProcessReturns: boolean;
  canCountStockAudits: boolean;
  locationScopes?: Array<{ locationId: string }>;
};

type Authority = { role: string; canCancelSales: boolean; canProcessReturns: boolean; permissionsInherited: boolean };

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

export default function SalesPermissionsAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [token, setToken] = useState('');
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [draftPerms, setDraftPerms] = useState<Record<string, { canCancelSales: boolean; canProcessReturns: boolean; canCountStockAudits: boolean }>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [savingUser, setSavingUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadAdminData(accessToken: string, emailStr: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [authorityResponse, usersResponse, locationsResponse] = await Promise.all([
      fetch(`${API_BASE}/users/me/sales-permissions`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
    ]);
    if (!authorityResponse.ok) throw new Error(await errorMessage(authorityResponse));
    if (!usersResponse.ok) throw new Error(await errorMessage(usersResponse));
    if (!locationsResponse.ok) throw new Error(await errorMessage(locationsResponse));

    const [authorityResult, usersResult, locationsResult] = await Promise.all([
      authorityResponse.json(),
      usersResponse.json(),
      locationsResponse.json(),
    ]);

    const currentAuthority = authorityResult.data as Authority;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(currentAuthority.role)) {
      throw new Error('Only Admin and Super Admin accounts can manage sales permissions.');
    }
    const manageableUsers = (usersResult.data as UserRecord[]).filter((user) =>
      user.email.toLowerCase() !== emailStr.trim().toLowerCase() && user.role !== 'SUPER_ADMIN',
    );
    setToken(accessToken);
    setActorEmail(emailStr.trim());
    setAuthority(currentAuthority);
    setUsers(manageableUsers);
    setLocations(locationsResult.data as LocationRecord[]);
    setDraftPerms(
      Object.fromEntries(
        manageableUsers.map((user) => [
          user.id,
          {
            canCancelSales: user.canCancelSales,
            canProcessReturns: user.canProcessReturns,
            canCountStockAudits: user.canCountStockAudits,
          },
        ]),
      ),
    );
    setReasons({});
  }

  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken && ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role)) {
      void loadAdminData(session.accessToken, session.user.email).catch(() => undefined);
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
      await loadAdminData(accessToken, email);
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
      setNotice('Sales permissions loaded successfully.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function saveUserPermissions(user: UserRecord, event?: FormEvent) {
    if (event) event.preventDefault();
    const perms = draftPerms[user.id] || {
      canCancelSales: user.canCancelSales,
      canProcessReturns: user.canProcessReturns,
      canCountStockAudits: user.canCountStockAudits,
    };
    const userReason = (reasons[user.id] || '').trim();
    if (!token) return;

    setSavingUser(user.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}/sales-permissions`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canCancelSales: perms.canCancelSales,
          canProcessReturns: perms.canProcessReturns,
          reason: userReason || undefined,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const updated = result.data as UserRecord;

      const auditResponse = await fetch(`${API_BASE}/users/${user.id}/stock-audit-permission`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canCountStockAudits: perms.canCountStockAudits,
          reason: userReason || undefined,
        }),
      });
      if (!auditResponse.ok) {
        throw new Error(`Sales permissions saved, but stock audit permission failed: ${await errorMessage(auditResponse)}`);
      }
      const auditUpdated = (await auditResponse.json()).data as Pick<UserRecord, 'canCountStockAudits'>;

      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, ...updated, ...auditUpdated } : u)),
      );
      setReasons((current) => ({ ...current, [user.id]: '' }));
      setNotice(`Saved permissions for ${user.email}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save permissions');
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
    setEmail('');
    setPassword('');
    setActorEmail('');
    setError('');
    setNotice('');
    window.location.href = '/login';
  }

  const locationNames = useMemo(() => new Map(locations.map((loc) => [loc.id, loc.name])), [locations]);
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const searchMatch =
          !search.trim() ||
          user.email.toLowerCase().includes(search.trim().toLowerCase()) ||
          user.id.toLowerCase().includes(search.trim().toLowerCase()) ||
          roleLabel(user.role).toLowerCase().includes(search.trim().toLowerCase());
        const scopes = user.locationScopes || [];
        const locationMatch = locationFilter === 'all' || scopes.some((scope) => scope.locationId === locationFilter);
        return searchMatch && locationMatch;
      }),
    [locationFilter, search, users],
  );

  if (!token || !authority) {
    return (
      <main className="login-shell">
        <div className="discount-admin-card">
          <a className="back-link" href="/">← Back to POS</a>
          <div className="brand-mark">P</div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>Sales permissions</h1>
          <p className="muted">Sign in as an Admin or Super Admin to assign cancellation and return permissions.</p>
          <form className="login-form" onSubmit={signIn}>
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Loading…' : 'Sign in'} <span>→</span></button>
          </form>
          <div className="secure-note"><span className="status-dot" /> Permission grants are scoped and audited (OD-08)</div>
        </div>
      </main>
    );
  }

  return (
    <main className="discount-console">
      <header className="discount-console-header">
        <div className="discount-header-account">
          <span className="discount-admin-badge">{authority.role.replaceAll('_', ' ')}</span>
          <span>{actorEmail}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <section className="discount-console-content">
        <div className="discount-breadcrumb">
          <a href="/dashboard" aria-label="Dashboard">⌂</a>
          <span>›</span>
          <span>Settings</span>
          <span>›</span>
          <strong>Sales Permissions</strong>
        </div>

        <div className="discount-page-title">
          <div>
            <h1>Sales Permissions Management</h1>
            <p>Grant permission to cancel finalized sales invoices, process customer returns, and count stock audits (OD-08).</p>
          </div>
        </div>

        <section className="discount-authority-banner">
          <div className="discount-authority-icon">⚿</div>
          <div className="discount-authority-copy">
            <small>Administrator Governance</small>
            <strong>Role Authority: {authority.role.replaceAll('_', ' ')}</strong>
          </div>
          <div className="discount-authority-divider" />
          <span className="discount-info-icon">i</span>
          <p>
            Permissions are restricted to authorized personnel. Invoices cannot be cancelled or returned by default.
            <small>Every permission modification writes an immutable server audit record.</small>
          </p>
        </section>

        <section className="discount-surface users-surface">
          <div className="discount-surface-heading users-heading">
            <div>
              <h2>User Permissions Matrix</h2>
              <p>Configure sales voids, return handling, and audit permissions by user and location.</p>
            </div>
            <div className="discount-filters">
              <label className="discount-search">
                <span>⌕</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email or role…" />
              </label>
              <label className="discount-location-filter">
                <span>⌖</span>
                <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter users by location">
                  <option value="all">All locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error && <div className="discount-feedback error">{error}</div>}
          {notice && <div className="discount-feedback success">{notice}</div>}

          <div className="discount-table-wrap user-table-wrap">
            <table className="discount-table user-limits-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>User / Account</th>
                  <th style={{ width: '13%' }}>Role</th>
                  <th style={{ width: '15%' }}>Store Location</th>
                  <th style={{ width: '14%' }}>Cancel Sales</th>
                  <th style={{ width: '14%' }}>Process Returns</th>
                  <th style={{ width: '12%' }}>Stock Audits</th>
                  <th style={{ width: '10%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const scopes = (user.locationScopes || [])
                    .map((scope) => locationNames.get(scope.locationId))
                    .filter((name): name is string => Boolean(name));
                  const perms = draftPerms[user.id] || {
                    canCancelSales: user.canCancelSales,
                    canProcessReturns: user.canProcessReturns,
                    canCountStockAudits: user.canCountStockAudits,
                  };
                  const isSaving = savingUser === user.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="discount-user-cell">
                          <span className="discount-user-avatar">{user.email.slice(0, 2).toUpperCase()}</span>
                          <span>
                            <strong>{user.email.split('@')[0].replace(/[._-]/g, ' ')}</strong>
                            <small>{user.email}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`discount-role-tag ${user.role.toLowerCase()}`}>{roleLabel(user.role)}</span>
                      </td>
                      <td>
                        <span className="discount-location-cell">
                          <span>⌖</span>
                          {scopes.length ? scopes.join(', ') : 'Platform-wide'}
                        </span>
                      </td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                          <input
                            type="checkbox"
                            checked={perms.canCancelSales}
                            onChange={(e) =>
                              setDraftPerms((curr) => ({
                                ...curr,
                                [user.id]: { ...perms, canCancelSales: e.target.checked },
                              }))
                            }
                          />
                          <span>{perms.canCancelSales ? 'Allowed' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                          <input
                            type="checkbox"
                            checked={perms.canProcessReturns}
                            onChange={(e) =>
                              setDraftPerms((curr) => ({
                                ...curr,
                                [user.id]: { ...perms, canProcessReturns: e.target.checked },
                              }))
                            }
                          />
                          <span>{perms.canProcessReturns ? 'Allowed' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                          <input
                            type="checkbox"
                            checked={perms.canCountStockAudits}
                            onChange={(e) =>
                              setDraftPerms((curr) => ({
                                ...curr,
                                [user.id]: { ...perms, canCountStockAudits: e.target.checked },
                              }))
                            }
                          />
                          <span>{perms.canCountStockAudits ? 'Count' : 'No'}</span>
                        </label>
                      </td>
                      <td>
                        <button
                          className="discount-save-button"
                          disabled={isSaving}
                          onClick={() => void saveUserPermissions(user)}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredUsers.length && (
                  <tr>
                    <td className="discount-empty-row" colSpan={7}>
                      {users.length ? 'No users match these filters.' : 'No assignable active users found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="discount-table-footer">
            <span>
              Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> active accounts
            </span>
            <span>Permissions are immediately validated on /sales-controls and /audits.</span>
          </div>
        </section>
      </section>
    </main>
  );
}
