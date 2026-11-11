'use client';

import { FormEvent, useEffect, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type UserRecord = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  canCancelSales: boolean;
  canProcessReturns: boolean;
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

export default function SalesPermissionsAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [token, setToken] = useState('');
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [canCancelSales, setCanCancelSales] = useState(false);
  const [canProcessReturns, setCanProcessReturns] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedUser = users.find((user) => user.id === selectedId);

  useEffect(() => {
    if (!selectedUser) return;
    setCanCancelSales(selectedUser.canCancelSales);
    setCanProcessReturns(selectedUser.canProcessReturns);
    setReason('');
  }, [selectedUser]);

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
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [authorityResponse, usersResponse] = await Promise.all([
        fetch(`${API_BASE}/users/me/sales-permissions`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
      ]);
      if (!authorityResponse.ok) throw new Error(await errorMessage(authorityResponse));
      if (!usersResponse.ok) throw new Error(await errorMessage(usersResponse));
      const currentAuthority = (await authorityResponse.json()).data as Authority;
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentAuthority.role)) {
        throw new Error('Only Admin and Super Admin accounts can manage sales permissions.');
      }
      const usersResult = await usersResponse.json();
      const manageableUsers = (usersResult.data as UserRecord[]).filter((user) =>
        user.email.toLowerCase() !== email.trim().toLowerCase() && user.role !== 'SUPER_ADMIN',
      );
      setToken(accessToken);
      setActorEmail(email.trim());
      setAuthority(currentAuthority);
      setUsers(manageableUsers);
      setSelectedId(manageableUsers[0]?.id || '');
      setPassword('');
      setNotice('Sales permissions loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function savePermissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !token) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/users/${selectedUser.id}/sales-permissions`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ canCancelSales, canProcessReturns, reason }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const updated = result.data as UserRecord;
      setUsers((current) => current.map((user) => user.id === updated.id ? { ...user, ...updated } : user));
      setNotice(`Saved permissions for ${updated.email}.`);
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save sales permissions');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken('');
    setAuthority(null);
    setUsers([]);
    setSelectedId('');
    setEmail('');
    setPassword('');
    setActorEmail('');
    setCanCancelSales(false);
    setCanProcessReturns(false);
    setReason('');
    setError('');
    setNotice('');
  }

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
          <div className="secure-note"><span className="status-dot" /> Permission grants are scoped and audited</div>
        </div>
      </main>
    );
  }

  return (
    <main className="discount-admin-shell">
      <header className="topbar">
        <div className="topbar-brand"><div className="brand-mark small">P</div><div><strong>Premium Retail</strong><span>SALES PERMISSIONS</span></div></div>
        <div className="admin-user-pill"><span>{authority.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'ADMIN'}</span><strong>{actorEmail}</strong></div>
        <button className="text-button" onClick={signOut}>Sign out</button>
      </header>
      <section className="discount-admin-content">
        <div className="admin-nav-links"><a className="back-link" href="/">← POS</a><a className="back-link" href="/admin/discount-limits">Discount limits →</a></div>
        <div className="page-heading admin-heading"><div><div className="eyebrow">ACCESS CONTROL</div><h1>Assign sales permissions</h1><p>Grant only the actions each active user needs. Admin grants are limited to users in their location scope.</p></div></div>
        <div className="policy-note"><strong>Note</strong><span>Super Admin inherits both permissions. Return windows, receipt checks, refund method, and stock inspection rules are separate business rules and remain to be defined.</span></div>
        <div className="discount-admin-grid">
          <section className="limit-form-card">
            <div className="card-eyebrow">ASSIGN USER PERMISSIONS</div>
            {users.length ? (
              <form className="limit-form" onSubmit={savePermissions}>
                <label htmlFor="target-user">User</label>
                <select id="target-user" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.email} · {user.role.replaceAll('_', ' ')}</option>)}
                </select>
                {selectedUser && <div className="permission-toggle"><div><strong>Cancel finalized sales</strong><span>Can initiate a sale cancellation.</span></div><input type="checkbox" checked={canCancelSales} onChange={(event) => setCanCancelSales(event.target.checked)} /></div>}
                {selectedUser && <div className="permission-toggle"><div><strong>Process customer returns</strong><span>Can initiate return handling.</span></div><input type="checkbox" checked={canProcessReturns} onChange={(event) => setCanProcessReturns(event.target.checked)} /></div>}
                <label htmlFor="reason">Reason for this assignment</label>
                <textarea id="reason" rows={3} minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: approved shift supervisor authority" required />
                {error && <div className="alert error">{error}</div>}
                {notice && <div className="alert success">{notice}</div>}
                <button className="primary-button full-width" disabled={busy || !selectedUser} type="submit">{busy ? 'Saving…' : 'Save permissions'} <span>→</span></button>
              </form>
            ) : <div className="empty-state admin-empty"><strong>No assignable users found</strong><span>Only active users you are authorized to manage are listed.</span></div>}
          </section>
          <aside className="limit-info-card">
            <div className="card-eyebrow">AUDIT AND SCOPE</div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>Administrator controlled</strong><p>Only Admin or Super Admin can grant or revoke these permissions.</p></div></div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>Location scoped</strong><p>Admins can manage only users whose assigned locations are within their own scope.</p></div></div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>Reasoned audit</strong><p>Each change records the previous and new permissions, actor, time, and reason.</p></div></div>
            <div className="limit-callout"><strong>Enforcement</strong><span>Cancellation and return endpoints will enforce these grants when their workflows are added.</span></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
