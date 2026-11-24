'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Feedback } from '@/components/ui/feedback';
import { getStoredSession } from '@/lib/auth';
import styles from '../../../staff-records/records.module.css';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type Staff = { id: string; email: string; role: string; isActive: boolean };
type StaffAccess = { permissionOverrides: Record<string, boolean>; definitions: Record<string, string> };
const categories = { sales: 'Sales', cash: 'Cash', stock: 'Inventory', products: 'Catalogue', transfers: 'Transfers',
  purchasing: 'Purchasing', customers: 'Customer accounts', staff: 'Team', attendance: 'Attendance', payroll: 'Payroll' };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredSession()?.accessToken;
  const response = await fetch(API + '/users' + path, {
    cache: 'no-store', ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body && { 'Content-Type': 'application/json' }) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Could not load staff access');
  return payload.data;
}

export default function StaffPermissionsPage() {
  const [people, setPeople] = useState<Staff[]>([]);
  const [id, setId] = useState('');
  const [profile, setProfile] = useState<StaffAccess | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void request<Staff[]>('?isActive=true', { signal: controller.signal }).then((staff) => {
      const eligible = staff.filter((user) => user.role !== 'SUPER_ADMIN');
      setPeople(eligible);
      const requested = new URLSearchParams(window.location.search).get('user');
      setId(eligible.find((person) => person.id === requested)?.id ?? '');
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setNotice('');
    setError('');
    void request<StaffAccess>(`/${id}/permissions`, { signal: controller.signal }).then((access) => {
      setProfile(access);
      setOverrides(access.permissionOverrides);
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await request(`/${id}/permissions`, { method: 'PATCH', body: JSON.stringify(overrides) });
      setNotice('Staff access saved.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save access.'); }
    finally { setSaving(false); }
  }

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}><div><Link href="/admin/sales-permissions">Permissions</Link><h1>Per-person permissions</h1>
      <p className={styles.muted}>Allow or deny an action for one person, or use their role default. Assigned locations still limit access.</p></div></header>
    <div className={styles.fields}><label>Staff account<select aria-label="Staff account" value={id} disabled={saving} onChange={(event) => {
      setProfile(null); setId(event.target.value); setNotice('');
    }}>
      <option value="">Choose a staff account</option>
      {people.map((person) => <option key={person.id} value={person.id}>{person.email} · {person.role.replaceAll('_', ' ')}</option>)}
    </select></label></div>
    {loading && <p role="status">Loading access…</p>}
    {error && <Feedback tone="error">{error}</Feedback>}
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {profile && id && <form onSubmit={(event) => void save(event)} className={styles.panel}>
      <div className={styles.grid}>{Object.entries(categories).map(([prefix, title]) => <fieldset className={styles.panel} key={prefix} disabled={saving}>
        <legend>{title}</legend>
        {Object.entries(profile.definitions).filter(([key]) => key.startsWith(prefix + '.')).map(([key, label]) => <div className={styles.fields} key={key}>
          <label>{label}<select aria-label={label} value={overrides[key] === undefined ? 'default' : overrides[key] ? 'allow' : 'deny'}
            onChange={(event) => setOverrides((current) => {
              const next = { ...current };
              if (event.target.value === 'default') delete next[key];
              else next[key] = event.target.value === 'allow';
              return next;
            })}>
            <option value="default">Use role default</option><option value="allow">Allow</option><option value="deny">Deny</option>
          </select></label>
        </div>)}
      </fieldset>)}</div>
      <div className={styles.fields}>
        <button className="admin-primary" disabled={saving}>Save access</button>
        <Link className="admin-secondary" href="/admin/sales-permissions">Returns, cancellations and stock counting</Link>
        <Link className="admin-secondary" href="/admin/discount-limits">Discount limits</Link>
      </div>
    </form>}
  </main>;
}
