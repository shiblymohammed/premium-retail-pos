'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import styles from './attendance.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Punch = {
  id: string;
  punchType: 'IN' | 'OUT';
  punchTimestamp: string;
  isLate: boolean;
  targetStartTime: string | null;
  qrVerified: boolean;
  originalTimestamp: string | null;
  correctionReason: string | null;
};

type Today = {
  employee: { id: string; name: string; employeeCode: string };
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  qrRequired: boolean;
  status: 'NOT_STARTED' | 'WORKING' | 'COMPLETED';
  nextAction: 'IN' | 'OUT' | null;
  punches: Punch[];
};

const DEMO_STAFF_TODAY: Today = {
  employee: { id: 'emp_0842', name: 'Ravi Menon', employeeCode: 'EMP-0842' },
  location: { id: 'loc_downtown', name: 'Downtown Store' },
  localDate: new Date().toLocaleDateString('en-CA'),
  timezone: 'Asia/Kolkata',
  targetStartTime: '09:00',
  qrRequired: true,
  status: 'NOT_STARTED',
  nextAction: 'IN',
  punches: [],
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export default function AttendancePage() {
  const [email, setEmail] = useState('ravi.menon@premiumretail.com');
  const [password, setPassword] = useState('Password123!');
  const [token, setToken] = useState('demo_token');
  const [today, setToday] = useState<Today | null>(DEMO_STAFF_TODAY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrToken, setQrToken] = useState('');

  // Handle hash QR code scanning and session sync
  useEffect(() => {
    const authSession = getStoredSession();
    if (authSession?.accessToken) {
      setToken(authSession.accessToken);
    }

    const code = new URLSearchParams(window.location.hash.slice(1)).get('qr');
    if (code) {
      setQrToken(code);
      setNotice('Workplace QR code verified from physical store counter.');
    }
  }, []);

  async function handlePunch() {
    if (!today) return;
    setBusy(true);
    setError('');

    const now = new Date();
    const action = today.nextAction || 'IN';

    // Check if late (if target time is 09:00 and punch is after 09:00)
    let isLate = false;
    if (action === 'IN' && today.targetStartTime) {
      const [targetH, targetM] = today.targetStartTime.split(':').map(Number);
      const targetDate = new Date();
      targetDate.setHours(targetH, targetM, 0, 0);
      isLate = now.getTime() > targetDate.getTime();
    }

    const newPunch: Punch = {
      id: `punch_${Date.now()}`,
      punchType: action,
      punchTimestamp: now.toISOString(),
      isLate,
      targetStartTime: today.targetStartTime,
      qrVerified: Boolean(qrToken) || !today.qrRequired,
      originalTimestamp: null,
      correctionReason: null,
    };

    const nextStatus = action === 'IN' ? 'WORKING' : 'COMPLETED';
    const nextAct = action === 'IN' ? 'OUT' : null;

    setToday({
      ...today,
      status: nextStatus,
      nextAction: nextAct,
      punches: [newPunch, ...today.punches],
    });

    setNotice(
      action === 'IN'
        ? `Clock-in recorded at ${formatTime(now.toISOString())}${isLate ? ` · Marked LATE (after target ${today.targetStartTime})` : ' · On time'}.`
        : `Workday concluded at ${formatTime(now.toISOString())}. Thank you!`
    );

    setBusy(false);
  }

  function simulateQrScan() {
    const fakeToken = `QR_${today?.location.id}_${Math.floor(Date.now() / 60000)}`;
    setQrToken(fakeToken);
    setNotice('Simulated Workplace Counter QR Code scanned! Ready to verify punch.');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b' }}>
      {/* Top Breadcrumb Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 32px',
          height: 58,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
          <span>Workforce</span>
          <span style={{ color: '#cbd5e1' }}>›</span>
          <span style={{ color: '#0f172a', fontWeight: 600 }}>Staff Daily Attendance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="/attendance/manage"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#2563eb',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
            }}
          >
            Supervisor View →
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '36px auto', padding: '0 20px' }}>
        {today && (
          <section className={styles.workCard} style={{ margin: 0, width: '100%' }}>
            {/* Header info */}
            <div className={styles.workHeader}>
              <div>
                <p className={styles.eyebrow}>TODAY · {today.localDate}</p>
                <h1 style={{ margin: '4px 0', fontSize: 24, fontWeight: 750, color: '#0f172a' }}>
                  Hello, {today.employee.name}
                </h1>
                <p className={styles.muted} style={{ fontSize: 12 }}>
                  {today.location.name} <span>·</span> {today.employee.employeeCode}
                </p>
              </div>
              <span className={`${styles.status} ${styles[today.status.toLowerCase()]}`}>
                ● {today.status === 'NOT_STARTED' ? 'Not started' : today.status === 'WORKING' ? 'At work' : 'Completed'}
              </span>
            </div>

            {/* Live Clock Card */}
            <div className={styles.clock} style={{ marginTop: 18 }}>
              <span
                className={`${styles.clockDot} ${today.status === 'WORKING' ? styles.clockDotActive : ''}`}
              />
              <strong>
                {today.status === 'WORKING'
                  ? 'Your shift is currently in progress'
                  : today.status === 'COMPLETED'
                  ? 'Your attendance is completed for today'
                  : 'Ready to start your shift?'}
              </strong>
              <small>
                {today.status === 'NOT_STARTED'
                  ? today.targetStartTime
                    ? `Target start time: ${today.targetStartTime}. Clocking in after will be marked late.`
                    : 'Tap "Start work" to begin recording shift.'
                  : today.status === 'WORKING'
                  ? 'Remember to tap "End work" when concluding your shift.'
                  : 'Your clock-in and clock-out entries have been recorded.'}
              </small>
            </div>

            {/* Workplace QR Verification Simulation */}
            {today.qrRequired && today.status !== 'COMPLETED' && (
              <div
                style={{
                  marginTop: 14,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: qrToken ? '#ecfdf5' : '#fffbeb',
                  border: `1px solid ${qrToken ? '#a7f3d0' : '#fde68a'}`,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ color: qrToken ? '#065f46' : '#92400e' }}>
                    {qrToken ? 'Workplace QR Verified' : 'Workplace QR Required'}
                  </strong>
                  <div style={{ color: qrToken ? '#047857' : '#b45309', fontSize: 11 }}>
                    {qrToken ? 'Phone verified present at counter.' : 'Scan rotating counter display or simulate below.'}
                  </div>
                </div>
                {!qrToken && (
                  <button
                    type="button"
                    onClick={simulateQrScan}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #d97706',
                      background: '#ffffff',
                      color: '#b45309',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Simulate QR Scan
                  </button>
                )}
              </div>
            )}

            {/* Feedback Notices */}
            {error && <p className={styles.error}>{error}</p>}
            {notice && <p className={styles.notice}>{notice}</p>}

            {/* Primary Action Button */}
            {today.nextAction && (
              <button
                className={styles.primary}
                disabled={busy}
                onClick={handlePunch}
                style={{ marginTop: 20 }}
              >
                {busy
                  ? 'Recording…'
                  : today.nextAction === 'IN'
                  ? 'Start work (Clock In)'
                  : 'End work (Clock Out)'}
                <span>→</span>
              </button>
            )}

            {/* Timeline of Punches */}
            <div className={styles.timeline} style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                Today’s Punches
              </h2>
              {today.punches.length ? (
                today.punches.map((punch) => (
                  <div className={styles.punch} key={punch.id}>
                    <span className={styles.punchIcon}>
                      {punch.punchType === 'IN' ? '↗' : '↙'}
                    </span>
                    <span>
                      <strong>
                        {punch.punchType === 'IN' ? 'Work started' : 'Work ended'}{' '}
                        {punch.isLate && <em className={styles.lateStatus}>Late</em>}
                      </strong>
                      <small>
                        {punch.isLate
                          ? `Clocked in after target ${punch.targetStartTime}`
                          : punch.qrVerified
                          ? 'QR verified · physical store presence confirmed'
                          : 'Server recorded'}
                        {punch.correctionReason ? ` · Corrected: ${punch.correctionReason}` : ''}
                      </small>
                    </span>
                    <time>{formatTime(punch.punchTimestamp)}</time>
                  </div>
                ))
              ) : (
                <p className={styles.empty}>No attendance recorded yet today.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
