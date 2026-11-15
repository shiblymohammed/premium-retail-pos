'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import styles from './attendance.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type Today = {
  employee: { id: string; name: string; employeeCode: string };
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  qrRequired: boolean;
  status: 'NOT_STARTED' | 'WORKING' | 'COMPLETED';
  nextAction: 'IN' | 'OUT' | null;
  punches: Array<{ id: string; punchType: 'IN' | 'OUT'; punchTimestamp: string; isLate: boolean; targetStartTime: string | null; qrVerified: boolean; originalTimestamp: string | null; correctionReason: string | null }>;
};

async function resultData<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : `Request failed (${response.status})`);
  return result.data as T;
}

function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function AttendancePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrToken, setQrToken] = useState('');

  const loadToday = useCallback(async (accessToken: string) => {
    const value = await resultData<Today>(await fetch(`${API_BASE}/attendance/me/today`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }));
    setToday(value);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const login = await resultData<{ accessToken: string }>(await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
      await loadToday(login.accessToken);
      setToken(login.accessToken); setPassword(''); setNotice('Signed in.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  }

  async function markAttendance() {
    if (!token) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await resultData<{ punch: { punchType: 'IN' | 'OUT'; punchTimestamp: string; isLate: boolean; targetStartTime: string | null; qrVerified: boolean } }>(await fetch(`${API_BASE}/attendance/me/punch`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(qrToken ? { qrToken } : {}) }));
      await loadToday(token);
      if (qrToken) {
        setQrToken('');
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }
      setNotice(result.punch.isLate
        ? `Work started at ${time(result.punch.punchTimestamp, today?.timezone ?? 'UTC')} and marked late (target ${result.punch.targetStartTime}).`
        : `${result.punch.punchType === 'IN' ? 'Work started' : 'Work ended'} at ${time(result.punch.punchTimestamp, today?.timezone ?? 'UTC')}${result.punch.qrVerified ? ' · QR verified' : ''}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not record attendance'); }
    finally { setBusy(false); }
  }

  function signOut() { setToken(''); setToday(null); setEmail(''); setPassword(''); setError(''); setNotice(''); }

  useEffect(() => { if (!token) return; const id = window.setInterval(() => { void loadToday(token).catch(() => undefined); }, 60_000); return () => window.clearInterval(id); }, [loadToday, token]);
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('qr');
    if (code) { setQrToken(code); setNotice('Workplace QR scanned. Sign in and mark attendance before the code expires.'); }
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.header}><a className={styles.brand} href="/dashboard"><span className={styles.brandMark}>P</span><span><strong>Premium Retail</strong><small>STAFF ATTENDANCE</small></span></a><span className={styles.headerActions}>{token && <a className={styles.signOut} href="/attendance/manage">Manager view</a>}{token && <button className={styles.signOut} onClick={signOut}>Sign out</button>}</span></header>
      {!token ? <section className={styles.loginCard}><p className={styles.eyebrow}>STAFF WORKSPACE</p><h1>Attendance</h1><p className={styles.muted}>Sign in with your staff account to start or end your workday.</p><form onSubmit={signIn} className={styles.form}><label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button></form></section> : today && <section className={styles.workCard}>
        <div className={styles.workHeader}><div><p className={styles.eyebrow}>TODAY · {today.localDate}</p><h1>Hello, {today.employee.name.split(' ')[0]}</h1><p className={styles.muted}>{today.location.name} <span>·</span> {today.employee.employeeCode}</p></div><span className={`${styles.status} ${styles[today.status.toLowerCase()]}`}>{today.status === 'NOT_STARTED' ? 'Not started' : today.status === 'WORKING' ? 'At work' : 'Completed'}</span></div>
        <div className={styles.clock}><span className={`${styles.clockDot} ${today.status === 'WORKING' ? styles.clockDotActive : ''}`} /><strong>{today.status === 'WORKING' ? 'Your workday is in progress' : today.status === 'COMPLETED' ? 'Your attendance is complete' : 'Ready to start?'}</strong><small>{today.qrRequired && !qrToken ? 'Scan the current workplace QR code before marking your next punch.' : qrToken ? 'Workplace QR is ready to verify this punch.' : today.status === 'WORKING' ? 'Remember to end your workday before leaving.' : today.status === 'COMPLETED' ? 'Your start and end times are recorded below.' : today.targetStartTime ? `Target start time: ${today.targetStartTime}. Clocking in later will be marked late.` : 'Tap once when you begin work.'}</small></div>
        {error && <p className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}
        {today.nextAction && <button className={styles.primary} disabled={busy || (today.qrRequired && !qrToken)} onClick={() => void markAttendance()}>{busy ? 'Recording…' : today.nextAction === 'IN' ? 'Start work' : 'End work'} <span>→</span></button>}
        <div className={styles.timeline}><h2>Today’s punches</h2>{today.punches.length ? today.punches.map((punch) => <div className={styles.punch} key={punch.id}><span className={styles.punchIcon}>{punch.punchType === 'IN' ? '↗' : '↙'}</span><span><strong>{punch.punchType === 'IN' ? 'Work started' : 'Work ended'} {punch.isLate && <em className={styles.lateStatus}>Late</em>}</strong><small>{punch.isLate ? `After target ${punch.targetStartTime}` : punch.qrVerified ? 'QR verified · server recorded' : 'Server recorded'}{punch.correctionReason ? ` · Corrected: ${punch.correctionReason}` : ''}{punch.originalTimestamp ? ' · Original time retained in manager audit log' : ''}</small></span><time>{time(punch.punchTimestamp, today.timezone)}</time></div>) : <p className={styles.empty}>No attendance recorded yet today.</p>}</div>
      </section>}
      <footer className={styles.footer}>Attendance times are recorded by the server using your workplace’s local date.</footer>
    </main>
  );
}
