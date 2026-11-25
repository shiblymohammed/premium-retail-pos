'use client';

import { useAccess } from '@/lib/permissions';
import { useEffect, useState, type FormEvent } from 'react';
import { getStoredSession } from '@/lib/auth';
import { OutletStaffEditor } from './outlet-staff-editor';
import { Feedback } from '@/components/ui/feedback';
import { money, payFields, staffRequest, type PayrollRow } from './records-api';
import styles from './records.module.css';

type DirectoryEntry = { id: string; firstName: string; lastName: string; employeeCode: string; location: { name: string } };
type Loan = {
  id: string; kind: string; amount: string; monthlyInstallment: string | null; outstanding: string;
  terms: string | null; status: string;
};
type Comparison = {
  includeSales: boolean; includeCash: boolean;
  rows: Array<{ id: string; firstName: string; lastName: string; location: string; currency: string;
    late: number; sales: string | null; shortages: string | null }>;
};
const emptyLoan = { kind: 'LOAN', amount: '', monthlyInstallment: '', terms: '' };
const payrollInputs = { allowances: '0', bonus: '0', deductions: '0', advanceRecovery: '0',
  overtimeHourlyRate: '0', lateDayDeduction: '0', absentDayDeduction: '0' };
const entryFields = {
  base: 'Basic pay', allowances: 'Allowances', bonus: 'Bonus', deductions: 'Other deductions', advanceRecovery: 'Manual recovery',
  overtimeHourlyRate: 'Overtime hourly rate', lateDayDeduction: 'Deduction per late day', absentDayDeduction: 'Deduction per absent day',
} as const;

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
  loans?: Loan[];
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
  const [inputs, setInputs] = useState({ base: '', ...payrollInputs });
  const [schedule, setSchedule] = useState<string[]>([]);
  const [loan, setLoan] = useState(emptyLoan);
  const [addingLoan, setAddingLoan] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonError, setComparisonError] = useState('');
  const [order, setOrder] = useState<'late' | 'sales' | 'shortages'>('late');
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
    setSchedule([]);
    setAddingLoan(false);
    setError('');
    setLoading(true);
    void staffRequest<Profile>(`/${selected}?month=${encodeURIComponent(month)}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setProfile(result);
        setInputs({ base: result.baseSalary ?? '', ...payrollInputs });
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, month, reload]);

  useEffect(() => {
    if (!comparisonOpen || !month) return;
    const controller = new AbortController();
    setComparison(null);
    setComparisonError('');
    void staffRequest<Comparison>(`/comparison?month=${encodeURIComponent(month)}`, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setComparison(data); })
      .catch((error) => { if (!controller.signal.aborted) setComparisonError(error.message); });
    return () => controller.abort();
  }, [comparisonOpen, month]);

  const payroll = profile?.payroll?.find((row) => row.period === month);
  async function save(event: FormEvent, record?: PayrollRow) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await staffRequest(record ? `/${selected}/payroll/${record.id}/pay` : `/${selected}/payroll`, undefined,
        record ? { reference } : { period: month, scheduledDates: schedule, ...inputs });
      setReload((previous) => previous + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save payroll.');
    } finally {
      setBusy(false);
    }
  }

  async function saveLoan(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await staffRequest(`/${selected}/loans`, undefined, loan);
      setLoan(emptyLoan);
      setAddingLoan(false);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record this recovery schedule.');
    } finally { setBusy(false); }
  }

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}><div><h1>Staff records</h1><p className={styles.muted}>Monthly activity at the employee’s assigned workplace.</p></div></header>
    <div className={styles.fields}>
      <label>Employee<select value={selected} disabled={busy || !!editor || !directory.length} onChange={(e) => setSelected(e.target.value)}>
        {directory.map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.employeeCode} · {row.location.name}</option>)}
      </select></label>
      <label>Month<input type="month" value={month} disabled={busy || !!editor} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label>
    </div>
    {can('staff.view', true) && <section className={styles.panel}>
      <button className="admin-secondary" type="button" aria-expanded={comparisonOpen} onClick={() => setComparisonOpen(!comparisonOpen)}>
        {comparisonOpen ? 'Hide staff comparison' : 'Compare staff for this month'}
      </button>
      {comparisonOpen && <>
        {comparisonError ? <Feedback tone="error">{comparisonError}</Feedback> : !comparison ? <p role="status">Loading comparison…</p> : <>
          <div className={styles.fields}>
            <label>Sort by<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
              <option value="late">Late arrivals</option>
              {comparison.includeSales && <option value="sales">Billed sales</option>}
              {comparison.includeCash && <option value="shortages">Cash shortages</option>}
            </select></label>
          </div>
          <div className={styles.scroll} tabIndex={0} role="region" aria-label="Monthly staff comparison">
            <table><thead><tr><th>Employee</th><th>Workplace</th><th>Late arrivals</th>
              {comparison.includeSales && <th>Billed sales</th>}{comparison.includeCash && <th>Cash shortages</th>}
            </tr></thead><tbody>{[...comparison.rows].sort((a, b) => Number(b[order]) - Number(a[order])).map((row) =>
              <tr key={row.id}><th scope="row"><button type="button" className="admin-secondary" disabled={busy || !!editor}
                onClick={() => setSelected(row.id)}>{row.firstName} {row.lastName}</button></th><td>{row.location}</td><td>{row.late}</td>
                {comparison.includeSales && <td>{money(row.sales ?? 0, row.currency)}</td>}
                {comparison.includeCash && <td>{money(row.shortages ?? 0, row.currency)}</td>}</tr>)}</tbody>
            </table>
          </div>
        </>}
      </>}
    </section>}
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
      const monthDates = Array.from({ length: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate() },
        (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
              ...Object.entries(payFields).map(([key, label]) => [label, money(payroll[key as keyof typeof payFields] ?? 0, payroll.currency)]),
              ['Net pay', money(payroll.net, payroll.currency)],
              ['Status', payroll.paidAt ? `Paid · ${payroll.paymentReference}` : 'Pending payment'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {payroll.attendanceBasis && <p className={styles.muted}>{payroll.attendanceBasis.overtimeMinutes} overtime minutes · {payroll.attendanceBasis.lateDays} late days · {payroll.attendanceBasis.absences.length} absent scheduled days</p>}
            {profile.canManagePayroll && !payroll.paidAt && <form className={styles.fields} onSubmit={(e) => void save(e, payroll)}>
              <label>Payment reference<input required maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
              <button className="admin-primary" disabled={busy}>Record payment</button>
            </form>}
          </> : profile.canManagePayroll ? <form className={styles.fields} onSubmit={(e) => void save(e)}>
            {Object.entries(entryFields).map(([key, label]) => {
              const field = key as keyof typeof entryFields;
              return <label key={field}>{label}<input required type="number" min="0" max="9999999999.99" step="0.01"
                value={inputs[field]} onChange={(e) => setInputs((previous) => ({ ...previous, [field]: e.target.value }))} /></label>;
            })}
            <fieldset className={styles.schedule}>
              <legend>Scheduled work dates for absence deductions</legend>
              <p className={styles.muted}>Select completed days this employee was expected to work. Leave holidays and approved leave unselected.</p>
              <div>{monthDates.filter((date) => date < today && date >= staff.hireDate.slice(0, 10)).map((date) =>
                <label key={date}><input type="checkbox" checked={schedule.includes(date)} aria-label={date}
                  onChange={(event) => setSchedule((previous) => event.target.checked ? [...previous, date] : previous.filter((day) => day !== date))} />{date.slice(-2)}</label>)}</div>
            </fieldset>
            <p className={styles.muted}>Payroll uses recorded overtime and late arrivals with the rates entered here. Scheduled loan and advance recovery is added automatically.</p>
            <button className="admin-primary" disabled={busy}>Create payroll record</button>
          </form> : <p>No payroll record for this month.</p>}
        </section>}
        {profile.loans && <section className={styles.panel}>
          <div className={styles.top}><h2>Loans and advances</h2>
            {profile.canManagePayroll && <button type="button" className="admin-secondary" onClick={() => { setAddingLoan(!addingLoan); setLoan(emptyLoan); }}>
              {addingLoan ? 'Close form' : 'Record an issued loan or advance'}
            </button>}
          </div>
          {addingLoan && <form className={styles.fields} onSubmit={saveLoan}>
            <label>Type<select value={loan.kind} onChange={(event) => setLoan((current) => ({ ...current, kind: event.target.value }))}>
              <option value="LOAN">Loan</option><option value="ADVANCE">Advance</option></select></label>
            <label>Issued amount<input required type="number" min="0.01" max="9999999999.99" step="0.01" value={loan.amount}
              onChange={(event) => setLoan((current) => ({ ...current, amount: event.target.value }))} /></label>
            <label>Monthly recovery<input required type="number" min="0.01" max={loan.amount || '9999999999.99'} step="0.01" value={loan.monthlyInstallment}
              onChange={(event) => setLoan((current) => ({ ...current, monthlyInstallment: event.target.value }))} /></label>
            <label>Payment reference or terms<input required maxLength={500} value={loan.terms}
              onChange={(event) => setLoan((current) => ({ ...current, terms: event.target.value }))} /></label>
            <button className="admin-primary" disabled={busy}>Save recovery schedule</button>
          </form>}
          {profile.loans.length ? <div className={styles.scroll} role="region" aria-label="Loans and advances ledger" tabIndex={0}>
            <table><thead><tr><th>Type</th><th>Issued</th><th>Monthly recovery</th><th>Outstanding</th><th>Status</th><th>Reference or terms</th></tr></thead>
              <tbody>{profile.loans.map((record) => <tr key={record.id}>
                <td>{record.kind === 'ADVANCE' ? 'Advance' : 'Loan'}</td><td>{money(record.amount, currency)}</td>
                <td>{record.monthlyInstallment ? money(record.monthlyInstallment, currency) : '—'}</td>
                <td>{money(record.outstanding, currency)}</td><td>{record.status.replaceAll('_', ' ')}</td><td>{record.terms || '—'}</td>
              </tr>)}</tbody>
            </table></div> : <p>No loans or advances recorded.</p>}
        </section>}
      </>;
    })()}
  </main>;
}
