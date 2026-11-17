'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { revokeSession } from '@/lib/auth';
import styles from '../attendance.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type Location = { id: string; name: string; type: string };
type AttendanceRow = {
  employee: { id: string; name: string; employeeCode: string };
  status: 'NOT_STARTED' | 'WORKING' | 'COMPLETED';
  clockInId: string | null;
  clockOutId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  isLate: boolean;
  targetStartTime: string | null;
  qrVerified: boolean;
  clockInCorrectionReason: string | null;
  clockOutCorrectionReason: string | null;
};
type LocationDay = { location: { id: string; name: string }; localDate: string; timezone: string; targetStartTime: string | null; qrRequired: boolean; employees: AttendanceRow[] };
type Report = {
  location: { id: string; name: string }; period: string; startDate: string; endDate: string; timezone: string;
  summary: { activeEmployees: number; employeesPresent: number; presentDays: number; completedDays: number; lateDays: number; workMinutes: number };
  employees: Array<{ employee: AttendanceRow['employee']; presentDays: number; completedDays: number; lateDays: number; workMinutes: number; entries: Array<{ date: string; clockInAt: string | null; clockOutAt: string | null; isLate: boolean; workMinutes: number }> }>;
};
type PunchEdit = { id: string; type: 'IN' | 'OUT'; value: string };

async function data<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : `Request failed (${response.status})`);
  return result.data as T;
}

function showTime(value: string | null, timezone: string) {
  return value ? new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
}

function localInputTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function localInputToIso(value: string, timezone: string) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = wallClockAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate));
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute));
    const diff = wallClockAsUtc - displayedAsUtc;
    if (!diff) break;
    candidate += diff;
  }
  return new Date(candidate).toISOString();
}

export default function AttendanceManagerPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [day, setDay] = useState<LocationDay | null>(null);
  const [targetStartTime, setTargetStartTime] = useState('');
  const [qrRequired, setQrRequired] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportDate, setReportDate] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [punchEdit, setPunchEdit] = useState<PunchEdit | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReport = useCallback(async (accessToken: string, id: string, period: 'daily' | 'weekly' | 'monthly', date: string) => {
    const value = await data<Report>(await fetch(`${API_BASE}/attendance/locations/${id}/reports?period=${period}&date=${date}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
    setReport(value);
  }, []);

  const loadQr = useCallback(async (accessToken: string, id: string) => {
    const value = await data<{ token: string; expiresAt: string }>(await fetch(`${API_BASE}/attendance/locations/${id}/qr-code`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
    const qrUrl = `${window.location.origin}/attendance#qr=${encodeURIComponent(value.token)}`;
    setQrImage(await QRCode.toDataURL(qrUrl, { width: 208, margin: 2, color: { dark: '#0b1f3a', light: '#ffffff' } }));
    setQrExpiresAt(value.expiresAt);
  }, []);

  const loadLocation = useCallback(async (accessToken: string, id: string) => {
    if (!id) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [today, setting] = await Promise.all([
      data<LocationDay>(await fetch(`${API_BASE}/attendance/locations/${id}/today`, { headers, cache: 'no-store' })),
      data<{ attendanceStartTime: string | null; attendanceQrRequired: boolean }>(await fetch(`${API_BASE}/attendance/locations/${id}/target-time`, { headers, cache: 'no-store' })),
    ]);
    setDay(today);
    setTargetStartTime(setting.attendanceStartTime ?? '');
    setQrRequired(setting.attendanceQrRequired);
    const date = reportDate || today.localDate;
    if (!reportDate) setReportDate(today.localDate);
    await loadReport(accessToken, id, reportPeriod, date);
  }, [loadReport, reportDate, reportPeriod]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const login = await data<{ accessToken: string }>(await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
      const scopedLocations = await data<Location[]>(await fetch(`${API_BASE}/locations?isActive=true`, { headers: { Authorization: `Bearer ${login.accessToken}` }, cache: 'no-store' }));
      if (!scopedLocations.length) throw new Error('No active locations are assigned to this account.');
      await loadLocation(login.accessToken, scopedLocations[0].id);
      await loadQr(login.accessToken, scopedLocations[0].id);
      setToken(login.accessToken); setPassword(''); setLocations(scopedLocations); setLocationId(scopedLocations[0].id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in. Use a manager or admin account.'); }
    finally { setBusy(false); }
  }

  async function chooseLocation(id: string) {
    setLocationId(id); setBusy(true); setError(''); setNotice('');
    try { await Promise.all([loadLocation(token, id), loadQr(token, id)]); setPunchEdit(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load attendance'); }
    finally { setBusy(false); }
  }

  async function saveTarget() {
    setBusy(true); setError(''); setNotice('');
    try {
      await data(await fetch(`${API_BASE}/attendance/locations/${locationId}/target-time`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ startTime: targetStartTime || null }) }));
      await loadLocation(token, locationId);
      setNotice(targetStartTime ? `Late arrival threshold saved as ${targetStartTime}.` : 'Late-arrival marking is turned off for this location.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the target time'); }
    finally { setBusy(false); }
  }

  async function saveQrRequirement() {
    setBusy(true); setError(''); setNotice('');
    try {
      await data(await fetch(`${API_BASE}/attendance/locations/${locationId}/qr-settings`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ required: qrRequired }) }));
      await loadLocation(token, locationId);
      setNotice(qrRequired ? 'Staff must scan a fresh workplace QR code for each punch.' : 'QR verification is optional at this location.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save QR settings'); }
    finally { setBusy(false); }
  }

  async function runReport() {
    if (!token || !locationId || !reportDate) return;
    setBusy(true); setError('');
    try { await loadReport(token, locationId, reportPeriod, reportDate); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this report'); }
    finally { setBusy(false); }
  }

  function exportReport() {
    if (!report) return;
    const rows = [['Employee', 'Code', 'Date', 'Clock in', 'Clock out', 'Late', 'Work minutes']];
    for (const item of report.employees) for (const entry of item.entries) {
      rows.push([item.employee.name, item.employee.employeeCode, entry.date, entry.clockInAt ? showTime(entry.clockInAt, report.timezone) : '', entry.clockOutAt ? showTime(entry.clockOutAt, report.timezone) : '', entry.isLate ? 'Yes' : 'No', String(entry.workMinutes)]);
    }
    const csv = rows.map((row) => row.map((field) => `"${field.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `attendance-${report.period}-${report.startDate}-to-${report.endDate}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function beginCorrection(row: AttendanceRow, type: 'IN' | 'OUT') {
    const id = type === 'IN' ? row.clockInId : row.clockOutId;
    const value = type === 'IN' ? row.clockInAt : row.clockOutAt;
    if (!id || !value || !day) return;
    setPunchEdit({ id, type, value: localInputTime(value, day.timezone) });
    setCorrectionReason(''); setError(''); setNotice('');
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!punchEdit || !day || !correctionReason.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await data(await fetch(`${API_BASE}/attendance/punches/${punchEdit.id}/correct`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ punchTimestamp: localInputToIso(punchEdit.value, day.timezone), reason: correctionReason.trim() }) }));
      setPunchEdit(null); setCorrectionReason('');
      await Promise.all([loadLocation(token, locationId), loadReport(token, locationId, reportPeriod, reportDate)]);
      setNotice('Punch corrected. The original time and reason are retained in the audit trail.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not correct this punch'); }
    finally { setBusy(false); }
  }

  function signOut() { void revokeSession(token); setToken(''); setLocations([]); setLocationId(''); setDay(null); setReport(null); setQrImage(''); setError(''); setNotice(''); }

  useEffect(() => {
    if (!token || !locationId) return;
    const id = window.setInterval(() => { void loadLocation(token, locationId).catch(() => undefined); }, 60_000);
    return () => window.clearInterval(id);
  }, [loadLocation, locationId, token]);

  useEffect(() => {
    if (!token || !locationId) return;
    const id = window.setInterval(() => { void loadQr(token, locationId).catch(() => undefined); }, 25_000);
    return () => window.clearInterval(id);
  }, [loadQr, locationId, token]);

  return <main className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/dashboard"><span className={styles.brandMark}>P</span><span><strong>Premium Retail</strong><small>ATTENDANCE MANAGEMENT</small></span></a>{token && <button className={styles.signOut} onClick={signOut}>Sign out</button>}</header>
    {!token ? <section className={styles.loginCard}><p className={styles.eyebrow}>MANAGER WORKSPACE</p><h1>Attendance overview</h1><p className={styles.muted}>Set store attendance rules, review punches, and prepare period summaries. Access follows your assigned locations.</p><form onSubmit={signIn} className={styles.form}><label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button></form></section> : <section className={styles.managerPage}>
      <div className={styles.managerHeading}><div><p className={styles.eyebrow}>STAFF OPERATIONS · TODAY</p><h1>Attendance overview</h1><p className={styles.muted}>Late status is saved at clock-in using each location’s local time.</p></div><label className={styles.managerLocation}>Location<select value={locationId} onChange={(event) => void chooseLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.type.replaceAll('_', ' ')}</option>)}</select></label></div>
      {error && <p className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}
      {day && <>
        <div className={styles.managerSetupGrid}>
          <section className={styles.managerPanel}><div><p className={styles.eyebrow}>LOCATION START TIME</p><h2>{day.location.name}</h2><p className={styles.muted}>Clock-ins after this local time are marked late. {day.timezone}</p></div><div className={styles.targetForm}><label>Expected start<input type="time" value={targetStartTime} onChange={(event) => setTargetStartTime(event.target.value)} /></label><button className={styles.saveButton} disabled={busy} onClick={() => void saveTarget()}>{busy ? 'Saving…' : 'Save time'}</button></div></section>
          <section className={styles.qrCard}><div><p className={styles.eyebrow}>WORKPLACE CHECK-IN</p><h2>Rotating QR code</h2><p className={styles.muted}>Refreshes automatically. Each code expires after 60 seconds.</p><label className={styles.qrToggle}><input type="checkbox" checked={qrRequired} onChange={(event) => setQrRequired(event.target.checked)} /><span>Require QR scan for each attendance punch</span></label><button className={styles.saveButton} disabled={busy} onClick={() => void saveQrRequirement()}>{busy ? 'Saving…' : 'Save QR setting'}</button></div><div className={styles.qrImageWrap}>{qrImage ? <img src={qrImage} alt="Rotating attendance QR code for this location" /> : <span>Loading QR…</span>}<small>Valid until {qrExpiresAt ? showTime(qrExpiresAt, day.timezone) : '—'}</small></div></section>
        </div>
        <section className={styles.managerTableCard}><div className={styles.managerTableHead}><div><p className={styles.eyebrow}>DAILY REGISTER</p><h2>Staff attendance</h2><p className={styles.muted}>{day.localDate} · {day.employees.filter((row) => row.isLate).length} late clock-in{day.employees.filter((row) => row.isLate).length === 1 ? '' : 's'}</p></div><button className={styles.signOut} disabled={busy} onClick={() => void chooseLocation(locationId)}>Refresh</button></div><div className={styles.tableScroll}><table className={styles.attendanceTable}><thead><tr><th>Employee</th><th>Status</th><th>Clock in</th><th>Clock out</th><th>QR</th><th>Corrections</th></tr></thead><tbody>{day.employees.map((row) => <tr key={row.employee.id}><td><strong>{row.employee.name}</strong><small>{row.employee.employeeCode}</small></td><td><span className={`${styles.managerStatus} ${row.isLate ? styles.lateStatus : row.status === 'NOT_STARTED' ? styles.waitingStatus : styles.onTimeStatus}`}>{row.isLate ? 'Late' : row.status === 'NOT_STARTED' ? 'Not started' : row.status === 'COMPLETED' ? 'Completed' : 'On time'}</span></td><td>{showTime(row.clockInAt, day.timezone)}{row.isLate && <small className={styles.lateNote}>After target {row.targetStartTime}</small>}{row.clockInCorrectionReason && <small>Corrected: {row.clockInCorrectionReason}</small>}</td><td>{showTime(row.clockOutAt, day.timezone)}{row.clockOutCorrectionReason && <small>Corrected: {row.clockOutCorrectionReason}</small>}</td><td>{row.clockInAt ? row.qrVerified ? 'Verified' : 'Manual' : '—'}</td><td className={styles.correctionActions}>{row.clockInId && <button onClick={() => beginCorrection(row, 'IN')}>Edit in</button>}{row.clockOutId && <button onClick={() => beginCorrection(row, 'OUT')}>Edit out</button>}</td></tr>)}</tbody></table>{!day.employees.length && <p className={styles.empty}>No active staff are assigned to this location.</p>}</div>{punchEdit && <form className={styles.correctionForm} onSubmit={(event) => void submitCorrection(event)}><div><strong>Correct {punchEdit.type === 'IN' ? 'clock-in' : 'clock-out'}</strong><small>Time is interpreted in {day.timezone}; the original is kept in the audit log.</small></div><label>Correct time<input type="datetime-local" value={punchEdit.value} onChange={(event) => setPunchEdit({ ...punchEdit, value: event.target.value })} required /></label><label>Reason<input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} minLength={5} maxLength={500} placeholder="Explain the correction" required /></label><div className={styles.formActions}><button type="button" className={styles.signOut} onClick={() => setPunchEdit(null)}>Cancel</button><button className={styles.saveButton} disabled={busy || correctionReason.trim().length < 5}>{busy ? 'Saving…' : 'Save correction'}</button></div></form>}</section>
        {report && <section className={styles.managerTableCard}><div className={styles.managerTableHead}><div><p className={styles.eyebrow}>ATTENDANCE REPORT</p><h2>{reportPeriod[0].toUpperCase() + reportPeriod.slice(1)} summary</h2><p className={styles.muted}>{report.startDate} to {report.endDate} · {report.timezone}</p></div><div className={styles.reportControls}><select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as 'daily' | 'weekly' | 'monthly')} aria-label="Report period"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} aria-label="Report date" /><button className={styles.saveButton} disabled={busy} onClick={() => void runReport()}>Generate</button><button className={styles.signOut} disabled={!report.employees.length} onClick={exportReport}>Export CSV</button></div></div><div className={styles.reportStats}><div><small>Staff present</small><strong>{report.summary.employeesPresent} / {report.summary.activeEmployees}</strong></div><div><small>Present days</small><strong>{report.summary.presentDays}</strong></div><div><small>Late arrivals</small><strong>{report.summary.lateDays}</strong></div><div><small>Recorded hours</small><strong>{(report.summary.workMinutes / 60).toFixed(1)} h</strong></div></div><div className={styles.tableScroll}><table className={styles.attendanceTable}><thead><tr><th>Employee</th><th>Days present</th><th>Days completed</th><th>Late days</th><th>Hours recorded</th></tr></thead><tbody>{report.employees.map((row) => <tr key={row.employee.id}><td><strong>{row.employee.name}</strong><small>{row.employee.employeeCode}</small></td><td>{row.presentDays}</td><td>{row.completedDays}</td><td>{row.lateDays}</td><td>{(row.workMinutes / 60).toFixed(1)} h</td></tr>)}</tbody></table>{!report.employees.length && <p className={styles.empty}>No active employees are assigned to this location.</p>}</div></section>}
      </>}
    </section>}
    <footer className={styles.footer}>Attendance uses server timestamps and the workplace’s configured timezone.</footer>
  </main>;
}
