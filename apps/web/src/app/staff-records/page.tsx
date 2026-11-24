'use client';

import { useAccess } from '@/lib/permissions';
import { useEffect, useState, type FormEvent } from 'react';
import { getStoredSession } from '@/lib/auth';
import { OutletStaffEditor } from './outlet-staff-editor';
import { Feedback } from '@/components/ui/feedback';
import { money, payFields, staffRequest, type PayrollRow } from './records-api';
import styles from './records.module.css';

type DirectoryEntry = { id: string; firstName: string; lastName: string; employeeCode: string; location: { name: string } };
type Profile = {
  staff: DirectoryEntry & {
    designation: string | null; hireDate: string; phone: string | null; address: string | null; isActive: boolean;
    location: { name: string; company: { currency: string; timezone: string } };
    user: { email: string; role: string; canCancelSales: boolean; canProcessReturns: boolean; canCountStockAudits: boolean; discountLimitPercent: string };
  };
  attendance: Array<{ at: string; action: string; late: boolean }>;
  workMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  earlyCheckouts: number;
  sales?: { bills: number; sales: string; previousSales: string; discounts: string; returns: number };
  drawers?: Array<{ closedAt: string; expectedCash: string; countedCash: string; difference: string }>;
  payroll?: PayrollRow[];
  canManagePayroll?: boolean;
  baseSalary?: string | null;
};

export default function StaffRecordsPage() {
  const { can } = useAccess();
  const [manager, setManager] = useState(false);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [inputs, setInputs] = useState({ base: '', allowances: '0', bonus: '0', deductions: '0', advanceRecovery: '0' });
  const [reference, setReference] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = new Date();
    setManager(getStoredSession()?.user.role === 'STORE_MANAGER');
    setMonth((current) => current || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const controller = new AbortController();
    void staffRequest<DirectoryEntry[]>('', controller.signal).then((rows) => {
      setDirectory(rows);
      setSelected((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
      if (!rows.length) setLoading(false);
    }).catch((error) => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!selected || !month) return;
    const controller = new AbortController();
    setProfile(null);
    setReference('');
    setError('');
    setLoading(true);
    void staffRequest<Profile>(`/${selected}?month=${encodeURIComponent(month)}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setProfile(result);
        setInputs({ base: result.baseSalary ?? '', allowances: '0', bonus: '0', deductions: '0', advanceRecovery: '0' });
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, month, reload]);

  const payroll = profile?.payroll?.find((row) => row.period === month);
  async function save(event: FormEvent, record?: PayrollRow) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await staffRequest(record ? `/${selected}/payroll/${record.id}/pay` : `/${selected}/payroll`, undefined,
        record ? { reference } : { period: month, ...inputs });
      setReload((previous) => previous + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save payroll.');
    } finally {
      setBusy(false);
    }
  }

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}><div><h1>Staff records</h1><p className={styles.muted}>Monthly activity at the employee’s assigned workplace.</p></div></header>
    <div className={styles.fields}>
      <label>Employee<select value={selected} disabled={busy || !!editor || !directory.length} onChange={(e) => setSelected(e.target.value)}>
        {directory.map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.employeeCode} · {row.location.name}</option>)}
      </select></label>
      <label>Month<input type="month" value={month} disabled={busy || !!editor} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label>
    </div>
    {can('staff.manage', manager) && <div className={styles.fields}>
      <button type="button" className="admin-secondary" disabled={!!editor} onClick={() => setEditor('new')}>Add outlet staff</button>
      {profile && ['STAFF', 'CASHIER', 'INVENTORY'].includes(profile.staff.user.role) &&
        <button type="button" className="admin-secondary" disabled={!!editor} onClick={() => setEditor('edit')}>Edit selected staff</button>}
    </div>}
    {editor && <OutletStaffEditor staff={editor === 'edit' ? profile?.staff : undefined}
      onCancel={() => setEditor(null)} onSaved={(id) => { setSelected(id); setEditor(null); setReload((value) => value + 1); }} />}
    {error && <Feedback tone="error">{error}</Feedback>}
    {loading && <p role="status">Loading staff records…</p>}
    {!loading && !directory.length && !error && <p>No employees in your assigned workplaces.</p>}
    {profile && (() => {
      const { staff, sales, drawers, attendance } = profile;
      const { currency, timezone } = staff.location.company;
      const localTime = (at: string) => new Date(at).toLocaleString('en-IN', { timeZone: timezone });
      return <>
        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2>{staff.firstName} {staff.lastName}</h2>
            <dl className={styles.facts}>{[
              ['Employee code', staff.employeeCode], ['Workplace', staff.location.name], ['Role', staff.user.role.replaceAll('_', ' ')],
              ['Status', staff.isActive ? 'Active' : 'Inactive'], ['Designation', staff.designation], ['Joined', staff.hireDate.slice(0, 10)],
              ['Phone', staff.phone], ['Address', staff.address], ['Email', staff.user.email],
              ['Discount limit', staff.user.discountLimitPercent + '%'],
              ['Permissions', [staff.user.canProcessReturns && 'Returns', staff.user.canCancelSales && 'Cancel sales', staff.user.canCountStockAudits && 'Count stock'].filter(Boolean).join(', ') || 'Role defaults'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
          </section>
          {sales && <section className={styles.panel}><h2>Sales performance</h2>
            <dl className={styles.facts}>{[
              ['Bills', sales.bills], ['Billed sales', money(sales.sales, currency)], ['Average bill', money(sales.bills ? Number(sales.sales) / sales.bills : 0, currency)],
              ['Previous month’s sales', money(sales.previousSales, currency)], ['Discounts', money(sales.discounts, currency)], ['Returns processed', sales.returns],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </section>}
          <section className={styles.panel}><h2>Attendance</h2>
            <p>{Math.floor(profile.workMinutes / 60)}h {profile.workMinutes % 60}m across completed shifts</p>
            <p>{profile.breakMinutes} min of breaks · {profile.overtimeMinutes} min overtime · {profile.earlyCheckouts} early checkouts</p>
            {attendance.length ? <div className={styles.scroll}><table><thead><tr><th>Time</th><th>Punch</th><th>Status</th></tr></thead><tbody>{attendance.map((entry, index) =>
              <tr key={index}><td>{localTime(entry.at)}</td><td>{entry.action === 'IN' ? 'Clock in' : 'Clock out'}</td><td>{entry.late ? 'Late' : '—'}</td></tr>)}</tbody></table></div> : <p>No punches for this month.</p>}
          </section>
          {drawers && <section className={styles.panel}><h2>Cash drawers</h2>
            {drawers.length ? <div className={styles.scroll}><table><thead><tr><th>Closed</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead><tbody>{drawers.map((entry, index) =>
              <tr key={index}><td>{localTime(entry.closedAt)}</td><td>{money(entry.expectedCash, currency)}</td><td>{money(entry.countedCash, currency)}</td><td>{money(entry.difference, currency)}</td></tr>)}</tbody></table></div> : <p>No closed drawers for this month.</p>}
          </section>}
        </div>
        {profile.payroll && <section className={styles.panel}>
          <h2>Payroll</h2>
          {payroll ? <>
            <dl className={styles.facts}>{[
              ...Object.entries(payFields).map(([key, label]) => [label, money(payroll[key as keyof typeof payFields], payroll.currency)]),
              ['Net pay', money(payroll.net, payroll.currency)],
              ['Status', payroll.paidAt ? `Paid · ${payroll.paymentReference}` : 'Pending payment'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {profile.canManagePayroll && !payroll.paidAt && <form className={styles.fields} onSubmit={(e) => void save(e, payroll)}>
              <label>Payment reference<input required maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
              <button className="admin-primary" disabled={busy}>Record payment</button>
            </form>}
          </> : profile.canManagePayroll ? <form className={styles.fields} onSubmit={(e) => void save(e)}>
            {Object.entries(payFields).map(([key, label]) => {
              const field = key as keyof typeof payFields;
              return <label key={field}>{label}<input required type="number" min="0" max="9999999999.99" step="0.01"
                value={inputs[field]} onChange={(e) => setInputs((previous) => ({ ...previous, [field]: e.target.value }))} /></label>;
            })}
            <button className="admin-primary" disabled={busy}>Create payroll record</button>
          </form> : <p>No payroll record for this month.</p>}
        </section>}
      </>;
    })()}
  </main>;
}
