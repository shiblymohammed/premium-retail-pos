'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getStoredSession } from '@/lib/auth';
import { Feedback } from '@/components/ui/feedback';
import { staffRequest } from './records-api';
import styles from './records.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type Contact = { employeeCode: string; firstName: string; lastName: string; hireDate: string; phone: string | null; address?: string | null; designation?: string | null };

export function OutletStaffEditor({ staff, outlet = true, onSaved, onCancel }: {
  staff?: Contact & { id: string }; outlet?: boolean; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [locationId, setLocationId] = useState('');
  const [values, setValues] = useState({
    firstName: staff?.firstName ?? '', lastName: staff?.lastName ?? '', employeeCode: staff?.employeeCode ?? '',
    hireDate: staff?.hireDate.slice(0, 10) ?? '', phone: staff?.phone ?? '', address: staff?.address ?? '', designation: staff?.designation ?? '', email: '', password: '', role: 'STAFF',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (staff) return;
    const token = getStoredSession()?.accessToken;
    const controller = new AbortController();
    void fetch(API_BASE + '/locations', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the assigned stores.');
        const { data } = await response.json();
        const locations = data.filter((row: { type: string; isActive: boolean }) => row.type === 'RETAIL_STORE' && row.isActive);
        setStores(locations);
        setLocationId(locations[0]?.id ?? '');
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [staff]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const { email, password, role, ...contact } = values;
    const profile = { ...contact, phone: contact.phone.trim() || (staff ? null : undefined) };
    try {
      const saved = await staffRequest<{ id: string }>(staff ? `/${staff.id}/${outlet ? 'outlet-profile' : 'profile'}` : '/outlet-staff', undefined,
        staff ? profile : { ...profile, email, password, role, locationId }, staff ? 'PATCH' : 'POST');
      onSaved(saved.id);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the staff profile.'); }
    finally { setSaving(false); }
  }

  return <section className={styles.panel}>
    <h2>{staff ? 'Edit employee details' : 'Add outlet staff'}</h2>
    {error && <Feedback tone="error">{error}</Feedback>}
    <form className={styles.fields} onSubmit={(e) => void submit(e)}>
      {([['firstName', 'First name', 'text', 80], ['lastName', 'Last name', 'text', 80], ['employeeCode', 'Employee code', 'text', 32],
        ['hireDate', 'Joining date', 'date', 10], ['phone', 'Phone', 'tel', 20], ['address', 'Address', 'text', 400],
        ['designation', 'Designation', 'text', 120]] as const).map(([key, label, type, max]) =>
        <label key={key}>{label}<input type={type} value={values[key]} required={['firstName', 'lastName', 'employeeCode', 'hireDate'].includes(key)} maxLength={max}
          onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} /></label>)}
      {!staff && <>
        <label>Email<input type="email" required maxLength={254} value={values.email} onChange={(event) => setValues((previous) => ({ ...previous, email: event.target.value }))} /></label>
        <label>Initial password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={values.password}
          onChange={(event) => setValues((previous) => ({ ...previous, password: event.target.value }))} /></label>
        <label>Role<select value={values.role} onChange={(event) => setValues((previous) => ({ ...previous, role: event.target.value }))}>
          <option value="STAFF">Floor staff</option><option value="CASHIER">Cashier / Sales</option><option value="INVENTORY">Inventory</option>
        </select></label>
        <label>Store<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {stores.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
        </select></label>
      </>}
      <button type="button" className="admin-secondary" disabled={saving} onClick={onCancel}>Cancel</button>
      <button className="admin-primary" disabled={saving || (!staff && !locationId)}>Save staff</button>
    </form>
  </section>;
}
