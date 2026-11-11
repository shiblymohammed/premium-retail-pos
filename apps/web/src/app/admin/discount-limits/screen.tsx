'use client';

import { FormEvent, useEffect, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type UserRecord = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  discountLimitPercent: string | number;
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

export default function DiscountLimitsAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [token, setToken] = useState('');
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [limit, setLimit] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedUser = users.find((user) => user.id === selectedId);

  useEffect(() => {
    if (!selectedUser) return;
    setLimit(String(selectedUser.discountLimitPercent));
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
        fetch(`${API_BASE}/users/me/discount-limit`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
      ]);
      if (!authorityResponse.ok) throw new Error(await errorMessage(authorityResponse));
      if (!usersResponse.ok) throw new Error(await errorMessage(usersResponse));
      const authorityResult = await authorityResponse.json();
      const usersResult = await usersResponse.json();
      const currentAuthority = authorityResult.data as Authority;
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentAuthority.role)) {
        throw new Error('Only Admin and Super Admin accounts can manage discount limits.');
      }
      const manageableUsers = (usersResult.data as UserRecord[]).filter((user) =>
        user.email.toLowerCase() !== email.trim().toLowerCase() && user.role !== 'SUPER_ADMIN',
      );
      setToken(accessToken);
      setActorEmail(email.trim());
      setAuthority(currentAuthority);
      setUsers(manageableUsers);
      setSelectedId(manageableUsers[0]?.id || '');
      setPassword('');
      setNotice('Discount authority loaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !token) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/users/${selectedUser.id}/discount-limit`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountLimitPercent: Number(limit), reason }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const updated = result.data as UserRecord;
      setUsers((current) => current.map((user) => user.id === updated.id ? { ...user, ...updated } : user));
      setNotice(`Saved ${updated.discountLimitPercent}% for ${updated.email}.`);
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save discount limit');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken('');
    setAuthority(null);
    setUsers([]);
    setSelectedId('');
    setLimit('0');
    setReason('');
    setEmail('');
    setActorEmail('');
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

  const maxLimit = authority.unlimited ? 100 : Number(authority.discountLimitPercent || 0);

  return (
    <main className="discount-admin-shell">
      <header className="topbar">
        <div className="topbar-brand"><div className="brand-mark small">P</div><div><strong>Premium Retail</strong><span>DISCOUNT AUTHORITY</span></div></div>
        <div className="admin-user-pill"><span>{authority.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'ADMIN'}</span><strong>{actorEmail}</strong></div>
        <button className="text-button" onClick={signOut}>Sign out</button>
      </header>
      <section className="discount-admin-content">
        <div className="admin-nav-links"><a className="back-link" href="/">← POS</a><a className="back-link" href="/admin/sales-permissions">Sales permissions →</a></div>
        <div className="page-heading admin-heading"><div><div className="eyebrow">ACCESS CONTROL</div><h1>Assign discount limits</h1><p>Set the maximum percentage each user may discount. The API enforces changes within your authority.</p></div></div>
        <div className="policy-note"><strong>Policy</strong><span>Limits apply to each line and the total bill. Discounts cannot be stacked. Super Admin is uncapped; new users start at 0%.</span></div>
        <div className="discount-admin-grid">
          <section className="limit-form-card">
            <div className="card-eyebrow">ASSIGN USER LIMIT</div>
            {users.length ? (
              <form className="limit-form" onSubmit={saveLimit}>
                <label htmlFor="target-user">User</label>
                <select id="target-user" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.email} · {user.role.replaceAll('_', ' ')}</option>)}
                </select>
                {selectedUser && <div className="current-limit">Current limit <strong>{selectedUser.discountLimitPercent}%</strong></div>}
                <label htmlFor="limit">Maximum discount (%)</label>
                <div className="percent-input"><input id="limit" type="number" min="0" max={maxLimit} step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} required /><span>%</span></div>
                <span className="field-hint">Your maximum assignable limit: {authority.unlimited ? '100%' : `${maxLimit}%`}</span>
                <label htmlFor="reason">Reason for this assignment</label>
                <textarea id="reason" rows={3} minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: approved store promotion authority" required />
                {error && <div className="alert error">{error}</div>}
                {notice && <div className="alert success">{notice}</div>}
                <button className="primary-button full-width" disabled={busy || !selectedUser} type="submit">{busy ? 'Saving…' : 'Save discount limit'} <span>→</span></button>
              </form>
            ) : <div className="empty-state admin-empty"><strong>No assignable users found</strong><span>Only active users you are authorized to manage are listed.</span></div>}
          </section>
          <aside className="limit-info-card">
            <div className="card-eyebrow">HOW IT WORKS</div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>Line and bill checks</strong><p>The same assigned percentage cap is checked on each line and across the total bill.</p></div></div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>No stacking</strong><p>Line discounts and a bill-level discount cannot be combined to bypass the cap.</p></div></div>
            <div className="rule-row"><span className="rule-check">✓</span><div><strong>Audited assignments</strong><p>Every change stores the old limit, new limit, assigning user, time, and reason.</p></div></div>
            <div className="limit-callout"><strong>Over-limit approval</strong><span>Checkout approval and discount application will be enabled with sale finalization.</span></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
