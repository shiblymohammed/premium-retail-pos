'use client';

import { useAccess } from '@/lib/permissions';
import { useEffect, useState, type FormEvent } from 'react';
import { getStoredSession } from '@/lib/auth';
import { OutletStaffEditor } from './outlet-staff-editor';
import { AdminModal } from '@/components/admin/admin-modal';
import { Feedback } from '@/components/ui/feedback';
import { money, payrollBreakdown, staffRequest, deactivateStaff, type PayrollRow } from './records-api';
import styles from './records.module.css';

type DirectoryEntry = { id: string; firstName: string; lastName: string; employeeCode: string; location: { name: string } };
type Loan = {
  id: string; kind: string; amount: string; monthlyInstallment: string | null; outstanding: string;
  terms: string | null; status: string; collectible: string; scheduled: string | null;
  repayments: Array<{ id: string; amount: string; status: string; isPayrollDeduction: boolean; payrollId: string | null; payrollPeriod?: string | null; paymentReference?: string | null; paymentDate: string }>;
};
type Comparison = {
  includeSales: boolean; includeCash: boolean;
  rows: Array<{ id: string; firstName: string; lastName: string; location: string; currency: string;
    role: string; daysPresent: number; late: number; overtimeMinutes: number; sales: string | null; shortages: string | null;
    bills: number | null; averageBill: string | null; returns: number | null; discounts: string | null }>;
};
const emptyLoan = { kind: 'LOAN', amount: '', monthlyInstallment: '0', terms: '' };
const payrollInputs = { allowances: '0', bonus: '0', deductions: '0',
  overtimeHourlyRate: '0', lateDayDeduction: '0', absentDayDeduction: '0' };
const entryFields = {
  base: 'Basic pay', allowances: 'Allowances', bonus: 'Bonus', deductions: 'Other deductions',
  overtimeHourlyRate: 'Overtime hourly rate', lateDayDeduction: 'Deduction per late day', absentDayDeduction: 'Deduction per absent day',
} as const;

type Profile = {
  staff: DirectoryEntry & {
    userId: string; designation: string | null; hireDate: string; phone: string | null; address: string | null; isActive: boolean;
    location: { name: string; company: { currency: string; timezone: string } };
    user: { email: string; role: string; canCancelSales: boolean; canProcessReturns: boolean; canCountStockAudits: boolean; discountLimitPercent: string; permissionOverrides?: Record<string, boolean> };
  };
  permissionDefinitions?: Record<string, string>;
  permissionDefaults?: { canProcessReturns: boolean; canCancelSales: boolean; canCountStockAudits: boolean; discountLimitPercent: number };
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
  const { can, loading: accessLoading } = useAccess();
  const [actor, setActor] = useState<{ id: string; role: string } | null>(null);
  const manager = actor?.role === 'STORE_MANAGER';
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [view, setView] = useState<'activity' | 'payroll' | 'loans'>('activity');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [collection, setCollection] = useState<{
    loan: Loan; id: string; method: 'MANUAL' | 'NEXT_PAYROLL'; amount: string; reference: string;
  } | null>(null);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [inputs, setInputs] = useState({ base: '', ...payrollInputs });
  const [editingPayroll, setEditingPayroll] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
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
    setActor(getStoredSession()?.user ?? null);
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
    setInputs({ base: '', ...payrollInputs });
  }, [selected, month]);

  useEffect(() => {
    if (!selected || !month) return;
    const controller = new AbortController();
    setProfile(null);
    setReference('');
    setEditingPayroll(false);
    setCorrectionReason('');
    setSchedule([]);
    setAddingLoan(false);
    setCollection(null);
    setError('');
    setLoading(true);
    void staffRequest<Profile>(`/${selected}?month=${encodeURIComponent(month)}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setProfile(result);
        setInputs((current) => ({ ...current, base: current.base || result.baseSalary || '' }));
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
  const draftRecoveries = payroll && !payroll.paidAt ? (profile?.loans ?? []).flatMap((loan) =>
    loan.repayments.filter((payment) => payment.payrollId === payroll.id && payment.status === 'PENDING')
      .map((payment) => ({ loan, payment }))) : [];

  function editPayroll(record: PayrollRow) {
    const basis = record.attendanceBasis;
    setInputs({
      base: record.base, allowances: record.allowances, bonus: record.bonus, deductions: record.deductions,
      overtimeHourlyRate: basis?.overtimeHourlyRate ?? '0', lateDayDeduction: basis?.lateDayDeduction ?? '0',
      absentDayDeduction: basis?.absentDayDeduction ?? '0',
    });
    setSchedule(basis?.scheduledDates ?? []);
    setCorrectionReason('');
    setError('');
    setNotice('');
    setEditingPayroll(true);
  }

  async function savePayroll(event: FormEvent, action: 'save' | 'pay') {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const path = `/${selected}/payroll`;
    const draft = editingPayroll ? payroll : undefined;
    try {
      if (action === 'pay' && payroll) {
        await staffRequest(`${path}/${payroll.id}/pay`, undefined, { reference, expectedRevision: payroll.attendanceBasis?.revision ?? null });
        setNotice('Payroll payment recorded.');
      } else {
        const details = { period: month, scheduledDates: schedule, ...inputs };
        if (draft) {
          await staffRequest(`${path}/${draft.id}`, undefined, {
            ...details, reason: correctionReason, expectedRevision: draft.attendanceBasis?.revision ?? null,
          }, 'PATCH');
          setNotice('Payroll draft updated. Review the new amounts before recording payment.');
        } else {
          await staffRequest(path, undefined, details);
          setNotice('Payroll draft created.');
        }
      }
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

  async function saveCollection(event: FormEvent) {
    event.preventDefault();
    if (!collection || busy) return;
    setBusy(true);
    setError('');
    try {
      const { loan: record, ...details } = collection;
      await staffRequest(`/${selected}/loans/${record.id}/collections`, undefined, details);
      setCollection(null);
      setNotice(details.method === 'MANUAL' ? 'Repayment recorded.' : 'Repayment queued for the next eligible payroll.');
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not collect repayment.');
    } finally { setBusy(false); }
  }

  async function archiveEmployee() {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      await deactivateStaff(profile.staff.userId);
      setArchiveOpen(false);
      setNotice('Staff account archived. Payroll and attendance history remain available.');
      setReload((value) => value + 1);
    } catch (caught) {
      setArchiveOpen(false);
      setError(caught instanceof Error ? caught.message : 'Could not archive this staff account.');
    } finally { setBusy(false); }
  }

  const visibleEmployees = directory.filter((row) =>
    `${row.firstName} ${row.lastName} ${row.employeeCode} ${row.location.name}`.toLowerCase().includes(employeeSearch.trim().toLowerCase()));
  const canMaintainOutlet = manager && !accessLoading && can('staff.manage', true);
  const adminActor = actor?.role === 'SUPER_ADMIN' || actor?.role === 'ADMIN';
  const targetRole = profile?.staff.user.role;
  const canEditAdmin = adminActor && targetRole !== 'SUPER_ADMIN' && (actor?.role === 'SUPER_ADMIN' || targetRole !== 'ADMIN')
    && !accessLoading && can('staff.manage', true);
  const canEdit = profile?.staff.id === selected && profile.staff.userId !== actor?.id &&
    (canEditAdmin || (canMaintainOutlet && ['STAFF', 'CASHIER', 'INVENTORY'].includes(profile.staff.user.role)));
  const activeView = (view === 'payroll' && !profile?.payroll) || (view === 'loans' && !profile?.loans) ? 'activity' : view;

  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}>
      <div><h1>Staff records</h1><p className={styles.muted}>Monthly activity at the employee’s assigned workplace.</p></div>
      {canMaintainOutlet && <button type="button" className="admin-primary" disabled={busy || !!editor} onClick={() => setEditor('new')}>Add outlet staff</button>}
    </header>
    <div className={`${styles.panel} ${styles.filters}`}>
      <label className={styles.search}>Search employees<input type="search" placeholder="Name, employee code or workplace"
        value={employeeSearch} disabled={busy || !!editor} onChange={(event) => setEmployeeSearch(event.target.value)} /></label>
      <label>Employee<select aria-label="Employee" value={selected} disabled={busy || !!editor || !directory.length} onChange={(e) => setSelected(e.target.value)}>
        {!visibleEmployees.some((row) => row.id === selected) && <option value={selected}>{visibleEmployees.length ? 'Select a matching employee' : 'No matching employees'}</option>}
        {visibleEmployees.map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.employeeCode} · {row.location.name}</option>)}
      </select></label>
      <label>Month<input type="month" value={month} disabled={busy || !!editor} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label>
      {canEdit && <button type="button" className="admin-secondary" disabled={busy || !!editor} onClick={() => setEditor('edit')}>Edit employee</button>}
      {canEdit && canEditAdmin && profile?.staff.isActive && <button type="button" className="admin-secondary" disabled={busy || !!editor} onClick={() => setArchiveOpen(true)}>Archive account</button>}
    </div>
    {editor && (editor === 'new' ? canMaintainOutlet : canEdit) && <OutletStaffEditor outlet={manager} staff={editor === 'edit' ? profile?.staff : undefined}
      onCancel={() => setEditor(null)} onSaved={(id) => { setSelected(id); setEditor(null); setReload((value) => value + 1); }} />}
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {archiveOpen && profile && <AdminModal isOpen title="Archive staff account?" onClose={() => { if (!busy) setArchiveOpen(false); }} footer={<>
      <button type="button" className="admin-secondary" disabled={busy} onClick={() => setArchiveOpen(false)}>Cancel</button>
      <button type="button" className="admin-primary" disabled={busy} onClick={() => void archiveEmployee()}>Archive account</button>
    </>}><p>{profile.staff.firstName} {profile.staff.lastName} will lose login access. Payroll and attendance history stay available.</p></AdminModal>}
    {profile && <nav className={styles.tabs} aria-label="Staff record sections">
      {(['activity', ...(profile.payroll ? ['payroll'] : []), ...(profile.loans ? ['loans'] : [])] as typeof view[]).map((section) =>
        <button className={activeView === section ? 'admin-primary' : 'admin-secondary'} key={section} type="button"
          aria-pressed={activeView === section} disabled={busy || !!editor} onClick={() => setView(section)}>
          {section === 'activity' ? 'Activity' : section === 'payroll' ? 'Payroll' : 'Loans & advances'}
        </button>)}
    </nav>}
    {activeView === 'activity' && can('staff.view', true) && <section className={styles.panel}>
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
            <table><thead><tr><th>Employee</th><th>Role and workplace</th><th>Days present</th><th>Late arrivals</th><th>Overtime</th>
              {comparison.includeSales && <><th>Bills</th><th>Billed sales</th><th>Average bill</th><th>Returns</th><th>Discounts</th></>}
              {comparison.includeCash && <th>Cash shortages</th>}
            </tr></thead><tbody>{[...comparison.rows].sort((a, b) => Number(b[order]) - Number(a[order])).map((row) =>
              <tr key={row.id}><th scope="row"><button type="button" className="admin-secondary" disabled={busy || !!editor}
                onClick={() => setSelected(row.id)}>{row.firstName} {row.lastName}</button></th>
                <td>{row.role?.replaceAll('_', ' ')}<br /><small>{row.location}</small></td>
                <td>{row.daysPresent ?? '—'}</td><td>{row.late}</td>
                <td>{row.overtimeMinutes == null ? '—' : `${Math.floor(row.overtimeMinutes / 60)}h ${row.overtimeMinutes % 60}m`}</td>
                {comparison.includeSales && <><td>{row.bills ?? '—'}</td><td>{money(row.sales ?? 0, row.currency)}</td>
                  <td>{row.averageBill == null ? '—' : money(row.averageBill, row.currency)}</td><td>{row.returns ?? '—'}</td>
                  <td>{row.discounts == null ? '—' : money(row.discounts, row.currency)}</td></>}
                {comparison.includeCash && <td>{money(row.shortages ?? 0, row.currency)}</td>}</tr>)}</tbody>
            </table>
          </div>
        </>}
      </>}
    </section>}
    {error && <Feedback tone="error">{error}</Feedback>}
    {loading && <p role="status">Loading staff records…</p>}
    {!loading && !directory.length && !error && <p>No employees in your assigned workplaces.</p>}
    {profile && (() => {
      const { staff, sales, drawers, attendance } = profile;
      const { currency, timezone } = staff.location.company;
      const monthDates = Array.from({ length: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate() },
        (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const access = Object.entries(staff.user.permissionOverrides ?? {}).map(([key, allow]) =>
        `${profile.permissionDefinitions?.[key] ?? key} (${allow ? 'allowed' : 'denied'})`);
      const defaults = profile.permissionDefaults;
      if (defaults) {
        for (const [key, label] of [['canProcessReturns', 'Returns'], ['canCancelSales', 'Cancel sales'], ['canCountStockAudits', 'Count stock']] as const) {
          if (defaults[key] !== staff.user[key]) access.push(`${label} (${staff.user[key] ? 'allowed' : 'denied'})`);
        }
        if (defaults.discountLimitPercent !== Number(staff.user.discountLimitPercent)) access.push(`Discount limit (${staff.user.discountLimitPercent}%)`);
      }
      const localTime = (at: string) => new Date(at).toLocaleString('en-IN', { timeZone: timezone });
      return <>
        {activeView === 'activity' && <div className={styles.grid}>
          <section className={styles.panel}>
            <h2>{staff.firstName} {staff.lastName}</h2>
            <dl className={styles.facts}>{[
              ['Employee code', staff.employeeCode], ['Workplace', staff.location.name], ['Role', staff.user.role.replaceAll('_', ' ')],
              ['Status', staff.isActive ? 'Active' : 'Inactive'], ['Designation', staff.designation], ['Joined', staff.hireDate.slice(0, 10)],
              ['Phone', staff.phone], ['Address', staff.address], ['Email', staff.user.email],
              ['Discount limit', staff.user.discountLimitPercent + '%'],
              ['Permission overrides', access.length ? access.join(', ') : 'Using role defaults'],
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
        </div>}
        {activeView === 'payroll' && profile.payroll && <section className={styles.panel}>
          <h2>{editingPayroll ? 'Edit payroll draft' : 'Payroll'}</h2>
          {payroll && !editingPayroll ? <>
            <dl className={styles.facts}>{[
              ...payrollBreakdown(payroll),
              ['Net pay', money(payroll.net, payroll.currency)],
              ['Status', payroll.paidAt ? `Paid · ${payroll.paymentReference}` : 'Draft'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {payroll.attendanceBasis && <p className={styles.muted}>{payroll.attendanceBasis.overtimeMinutes} overtime minutes · {payroll.attendanceBasis.lateDays} late days · {payroll.attendanceBasis.absences.length} absent scheduled days</p>}
            {!!draftRecoveries.length && <section className={styles.recoveries}>
              <h3>Deductions when paid</h3>
              <div className={styles.scroll}>
                <table>
                  <thead><tr><th>Loan or advance</th><th>Payroll deduction</th><th>Balance after payment</th></tr></thead>
                  <tbody>{draftRecoveries.map(({ loan, payment }) => <tr key={payment.id}>
                    <td>{loan.kind === 'ADVANCE' ? 'Advance' : 'Loan'}{loan.terms && <small>{loan.terms}</small>}</td>
                    <td>{money(payment.amount, payroll.currency)}</td>
                    <td>{money(Number(loan.outstanding) - Number(payment.amount), payroll.currency)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </section>}
            {profile.canManagePayroll && !payroll.paidAt && <form className={styles.fields} onSubmit={(e) => void savePayroll(e, 'pay')}>
              <label>Payment reference<input required maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
              <button type="button" className="admin-secondary" disabled={busy} onClick={() => editPayroll(payroll)}>Edit draft</button>
              <button className="admin-primary" disabled={busy}>Record payment</button>
            </form>}
          </> : profile.canManagePayroll ? <form className={styles.fields} onSubmit={(e) => void savePayroll(e, 'save')}>
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
            {editingPayroll ? <>
              <p className={styles.payrollHelp}>Saving recalculates attendance adjustments and reserved loan deductions.</p>
              <label className={styles.correctionReason}>Reason for correction<input required maxLength={500}
                value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label>
              <button type="button" className="admin-secondary" disabled={busy} onClick={() => { setEditingPayroll(false); setError(''); }}>Cancel edit</button>
            </> : <p className={styles.payrollHelp}>Payroll uses recorded overtime and late arrivals with the rates entered here. To recover an advance or loan, queue a collection in Loans &amp; advances or set a monthly recovery on the loan.</p>}
            <button className="admin-primary" disabled={busy}>{editingPayroll ? 'Save draft' : 'Create payroll record'}</button>
          </form> : <p>No payroll record for this month.</p>}
        </section>}
        {activeView === 'loans' && profile.loans && <section className={styles.panel}>
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
            <label>Monthly recovery (0 for manual only)<input required type="number" min="0" max={loan.amount || '9999999999.99'} step="0.01" value={loan.monthlyInstallment}
              onChange={(event) => setLoan((current) => ({ ...current, monthlyInstallment: event.target.value }))} /></label>
            <label>Payment reference or terms<input required maxLength={500} value={loan.terms}
              onChange={(event) => setLoan((current) => ({ ...current, terms: event.target.value }))} /></label>
            <button className="admin-primary" disabled={busy}>Record loan or advance</button>
          </form>}
          {collection && <form className={`${styles.fields} ${styles.collection}`} onSubmit={saveCollection}>
            <div><strong>Collect {collection.loan.kind === 'ADVANCE' ? 'advance' : 'loan'}</strong><p className={styles.muted}>{money(collection.loan.collectible, currency)} available to collect</p></div>
            <label>Collection method<select value={collection.method} disabled={busy}
              onChange={(event) => setCollection({ ...collection, id: crypto.randomUUID(), method: event.target.value as typeof collection.method })}>
              <option value="MANUAL">Record manual payment</option>
              <option value="NEXT_PAYROLL" disabled={!!collection.loan.scheduled}>Deduct from next payroll</option>
            </select></label>
            <label>Amount<input type="number" required min="0.01" step="0.01" max={collection.loan.collectible} disabled={busy} value={collection.amount}
              onChange={(event) => setCollection({ ...collection, id: crypto.randomUUID(), amount: event.target.value })} /></label>
            {collection.method === 'MANUAL' && <label>Payment reference<input required maxLength={120} disabled={busy} value={collection.reference}
              onChange={(event) => setCollection({ ...collection, id: crypto.randomUUID(), reference: event.target.value })} /></label>}
            {collection.method === 'NEXT_PAYROLL' && <p className={styles.muted}>Applies to the next payroll you create with enough net pay. The balance changes when payroll is marked paid.</p>}
            <button type="button" className="admin-secondary" disabled={busy} onClick={() => setCollection(null)}>Cancel</button>
            <button className="admin-primary" disabled={busy}>{collection.method === 'MANUAL' ? 'Record repayment' : 'Queue deduction'}</button>
          </form>}
          {profile.loans.length ? <div className={styles.scroll} role="region" aria-label="Loans and advances ledger" tabIndex={0}>
            <table><thead><tr><th>Type</th><th>Issued</th><th>Monthly recovery</th><th>Outstanding</th><th>Status</th><th>Reference or terms</th><th>Collections</th></tr></thead>
              <tbody>{profile.loans.map((record) => <tr key={record.id}>
                <td>{record.kind === 'ADVANCE' ? 'Advance' : 'Loan'}</td><td>{money(record.amount, currency)}</td>
                <td>{record.monthlyInstallment ? money(record.monthlyInstallment, currency) : '—'}</td>
                <td>{money(record.outstanding, currency)}</td><td>{record.status.replaceAll('_', ' ')}</td><td>{record.terms || '—'}</td>
                <td><div className={styles.collectionActions}>
                  {record.repayments.length > 0 && <details><summary>{record.repayments.length} collection{record.repayments.length === 1 ? '' : 's'}</summary>
                    <ul>{record.repayments.map((payment) => <li key={payment.id}>{money(payment.amount, currency)} · {payment.isPayrollDeduction ? payment.payrollId ? ['Payroll', payment.payrollPeriod].filter(Boolean).join(' ') : 'Queued for payroll' : 'Manual'}{payment.paymentReference && ` · ${payment.paymentReference}`} · {payment.status === 'CONFIRMED' ? localTime(payment.paymentDate) : 'Pending'}</li>)}</ul>
                  </details>}
                  {profile.canManagePayroll && record.status === 'ACTIVE' && Number(record.collectible) > 0 &&
                    <button type="button" className="admin-secondary" disabled={busy} onClick={() => setCollection({ loan: record, id: crypto.randomUUID(), method: 'MANUAL', amount: record.collectible, reference: '' })}>Collect repayment</button>}
                </div></td>
              </tr>)}</tbody>
            </table></div> : <p>No loans or advances recorded.</p>}
        </section>}
      </>;
    })()}
  </main>;
}
