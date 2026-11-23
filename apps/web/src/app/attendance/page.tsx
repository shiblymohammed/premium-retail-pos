'use client';

import { useEffect, useMemo, useState } from 'react';
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

type HistoryDay = {
  date: string;
  status: 'present' | 'late' | 'absent' | 'off' | 'future';
  clockIn: string;
  clockOut: string;
  hours: string;
  workMinutes: number;
};

const HISTORY_LABEL: Record<HistoryDay['status'], string> = {
  present: 'On time', late: 'Late arrival', absent: 'No attendance', off: 'No punch recorded', future: 'Not yet',
};

function pad(value: number) { return String(value).padStart(2, '0'); }

function formatTime(iso: string, timezone?: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(iso));
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatWorkMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function prettyDay(dateKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`));
}

export default function AttendancePage() {
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);

  useEffect(() => {
    const session = getStoredSession();
    const now = new Date();
    setClockNow(now);
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);

    const code = new URLSearchParams(window.location.hash.slice(1)).get('qr');
    if (code) {
      setQrToken(code);
      setNotice('Attendance QR link received. The server will verify it when you record your punch.');
    }

    if (!session?.accessToken) {
      setError('Sign in with an employee account to view attendance.');
      setLoading(false);
    } else {
      setApiToken(session.accessToken);
      void (async () => {
        try {
          const headers = { Authorization: `Bearer ${session.accessToken}` };
          let response: Response | null = null;
          let payload: { message?: string; data?: Today } = {};
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              response = await fetch(`${API_BASE}/attendance/me/today`, { headers, cache: 'no-store' });
            } catch (caught) {
              if (attempt === 0) {
                await new Promise((resolve) => window.setTimeout(resolve, 350));
                continue;
              }
              throw caught;
            }
            payload = await response.json().catch(() => ({}));
            if (response.ok) break;
            if (response.status >= 500 && attempt === 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 350));
              continue;
            }
            throw new Error(payload.message || 'Could not load your attendance. Please sign in with your employee account.');
          }
          if (!response?.ok || !payload.data) throw new Error(payload.message || 'Could not load your attendance. Please try again.');
          setToday(payload.data as Today);
          try {
            const historyResponse = await fetch(`${API_BASE}/attendance/me/history`, { headers, cache: 'no-store' });
            const historyPayload = await historyResponse.json().catch(() => ({}));
            if (!historyResponse.ok) throw new Error(historyPayload.message || 'Attendance history is temporarily unavailable.');
            const timezone = historyPayload.data.timezone as string;
            setHistory((historyPayload.data.days as Array<{ date: string; status: HistoryDay['status']; clockInAt: string | null; clockOutAt: string | null; workMinutes: number }>).map((day) => ({
              date: day.date,
              status: day.status,
              clockIn: day.clockInAt ? formatTime(day.clockInAt, timezone) : '—',
              clockOut: day.clockOutAt ? formatTime(day.clockOutAt, timezone) : '—',
              hours: day.workMinutes ? formatWorkMinutes(day.workMinutes) : '—',
              workMinutes: day.workMinutes,
            })));
          } catch (caught) {
            setHistory([]);
            setError(caught instanceof Error ? caught.message : 'Attendance history is temporarily unavailable.');
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : 'Could not load your attendance.';
          if (message.toLowerCase().includes('employee profile')) {
            setApiToken('');
            setProfileMissing(true);
            setToday(null);
            setNotice('An administrator must link an employee profile to this account before attendance can be recorded.');
          } else {
            setError(message);
          }
        } finally {
          setLoading(false);
        }
      })();
    }
    return () => window.clearInterval(timer);
  }, []);

  const historySummary = useMemo(() => history.reduce((summary, day) => {
    if (day.status === 'present' || day.status === 'late') summary.shifts += 1;
    if (day.status === 'late') summary.late += 1;
    return summary;
  }, { shifts: 0, late: 0 }), [history]);

  const recentHistory = useMemo(() => history.filter((day) => ['present', 'late'].includes(day.status) && (!today || day.date < today.localDate)).slice(-7).reverse(), [history, today]);

  const clockIn = today?.punches.find((punch) => punch.punchType === 'IN');
  const clockOut = today?.punches.find((punch) => punch.punchType === 'OUT');
  const elapsed = clockIn && clockNow
    ? formatDuration((clockOut ? new Date(clockOut.punchTimestamp) : clockNow).getTime() - new Date(clockIn.punchTimestamp).getTime())
    : '00:00';

  function updateTodayPattern(punches: Punch[]) {
    if (!today) return;
    const inPunch = punches.find((punch) => punch.punchType === 'IN');
    const outPunch = punches.find((punch) => punch.punchType === 'OUT');
    if (!inPunch) return;
    const end = outPunch ? new Date(outPunch.punchTimestamp) : new Date();
    const workMinutes = Math.max(0, Math.floor((end.getTime() - new Date(inPunch.punchTimestamp).getTime()) / 60_000));
    const nextDay: HistoryDay = {
      date: today.localDate,
      status: inPunch.isLate ? 'late' : 'present',
      clockIn: formatTime(inPunch.punchTimestamp, today.timezone),
      clockOut: outPunch ? formatTime(outPunch.punchTimestamp, today.timezone) : '—',
      hours: workMinutes ? formatWorkMinutes(workMinutes) : '—',
      workMinutes,
    };
    setHistory((days) => [...days.filter((day) => day.date !== today.localDate), nextDay].sort((a, b) => a.date.localeCompare(b.date)));
  }

  async function handlePunch() {
    if (!today) return;
    setBusy(true);
    setError('');

    if (apiToken) {
      try {
        const response = await fetch(`${API_BASE}/attendance/me/punch`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(qrToken ? { qrToken } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Could not record attendance. Please try again.');
        const result = payload.data;
        const next: Today = {
          ...today,
          employee: result.employee || today.employee,
          location: result.location || today.location,
          status: result.status,
          nextAction: result.nextAction,
          punches: [...today.punches, result.punch],
        };
        setToday(next);
        updateTodayPattern(next.punches);
        setNotice(`${result.punch.punchType === 'IN' ? 'Clock-in' : 'Clock-out'} recorded at ${formatTime(result.punch.punchTimestamp, today.timezone)}${result.punch.isLate ? ` · Late after ${result.punch.targetStartTime}` : ''}.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not record attendance. Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const now = new Date();
    const action = today.nextAction || 'IN';
    let isLate = false;
    if (action === 'IN' && today.targetStartTime) {
      const [targetH, targetM] = today.targetStartTime.split(':').map(Number);
      const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: today.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
      const localMinutes = Number(localParts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(localParts.find((part) => part.type === 'minute')?.value || 0);
      isLate = localMinutes > targetH * 60 + targetM;
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
    const punches = [...today.punches, newPunch];
    setToday({ ...today, status: nextStatus, nextAction: action === 'IN' ? 'OUT' : null, punches });
    updateTodayPattern(punches);
    setNotice(action === 'IN'
      ? `Clock-in recorded at ${formatTime(now.toISOString())}${isLate ? ` · Marked late after ${today.targetStartTime}` : ' · On time'}.`
      : `Clock-out recorded at ${formatTime(now.toISOString())}.`);
    setClockNow(now);
    setBusy(false);
  }

  if (loading) return <main className={`${styles.page} app-page`}><div className={styles.loading}>Loading your attendance…</div></main>;
  if (!today) return <main className={`${styles.page} app-page`}><div className={styles.loadError}><strong>Attendance unavailable</strong><p>{error || 'Your account does not have an employee attendance profile.'}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div></main>;

  const statusLabel = today.status === 'NOT_STARTED' ? 'Not clocked in' : today.status === 'WORKING' ? 'On shift' : 'Shift complete';
  const statusClass = today.status === 'WORKING' ? styles.live : today.status === 'COMPLETED' ? styles.done : styles.waiting;
  const patternHistory = history.map((day) => {
    if (day.date !== today.localDate || today.status !== 'WORKING' || !clockIn || !clockNow) return day;
    const workMinutes = Math.max(0, Math.floor((clockNow.getTime() - new Date(clockIn.punchTimestamp).getTime()) / 60_000));
    return { ...day, workMinutes, hours: formatWorkMinutes(workMinutes) };
  });
  const historyMap = new Map(patternHistory.map((day) => [day.date, day]));
  const weekStart = -((new Date(`${today.localDate}T12:00:00Z`).getUTCDay() + 6) % 7) - 25 * 7;
  const historyWeeks = Array.from({ length: 26 }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const date = addDays(today.localDate, weekStart + week * 7 + weekday);
    return historyMap.get(date) ?? { date, status: date > today.localDate ? 'future' as const : 'off' as const, clockIn: '—', clockOut: '—', hours: '—', workMinutes: 0 };
  }));
  const monthLabels = historyWeeks.map((week, index) => index === 0 || week[0].date.slice(5, 7) !== historyWeeks[index - 1][0].date.slice(5, 7) ? prettyDay(week[0].date, { month: 'short' }) : '');
  const nextMonthLabel = monthLabels.findIndex((label, index) => index > 0 && Boolean(label));
  if (nextMonthLabel > 0 && nextMonthLabel < 3) monthLabels[0] = '';
  const heatCellTitle = (day: HistoryDay) => {
    if (day.status === 'future') return '';
    const date = prettyDay(day.date, { weekday: 'short', day: 'numeric', month: 'short' });
    const attendance = HISTORY_LABEL[day.status];
    return `${date} · ${attendance}${day.status === 'late' ? ' · Late arrival' : ''}${day.clockIn !== '—' ? ` · ${day.clockIn} – ${day.clockOut}${day.clockOut === '—' ? ' (working)' : ''} (${day.hours})` : ''}`;
  };
  const clockValue = clockNow ? new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(clockNow) : '—';
  const longDate = clockNow ? new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(clockNow) : today.localDate;

  return (
    <main className={`${styles.page} app-page`}>
      <div className={styles.content}>
        <div className={styles.breadcrumb}><span>Workforce</span><b>›</b><strong>My attendance</strong></div>
        <header className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>STAFF WORKSPACE · {today.employee.employeeCode}</p><h1>My attendance</h1><p className={styles.subtitle}>Record today’s shift and review your recent attendance.</p></div>
          <div className={styles.headingMeta}><span className={styles.locationPin}>⌖</span><span><strong>{today.location.name}</strong><small>{longDate}</small></span></div>
        </header>

        <section className={styles.summaryGrid} aria-label="Attendance summary">
          <article className={styles.summaryCard}><span className={styles.summaryIcon}>◷</span><div><small>SHIFT STATUS</small><strong className={statusClass}>{statusLabel}</strong></div><i className={today.status === 'WORKING' ? styles.statusIndicatorLive : ''} /></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}>↗</span><div><small>TARGET START</small><strong>{today.targetStartTime || 'Not set'}</strong><em>{clockIn?.isLate ? 'Late arrival recorded' : 'Store schedule'}</em></div></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}>⏱</span><div><small>TIME ON SHIFT</small><strong className={styles.duration}>{today.status === 'WORKING' ? elapsed : today.status === 'COMPLETED' ? elapsed : '—'}</strong><em>{today.status === 'WORKING' ? 'Live · hours : minutes' : today.status === 'COMPLETED' ? 'Today’s total' : 'Starts after clock-in'}</em></div></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}>✓</span><div><small>LAST 6 MONTHS</small><strong>{historySummary.shifts} shifts</strong><em>{historySummary.late} late arrivals</em></div></article>
        </section>

        {(error || notice) && <div className={`${styles.feedback} ${profileMissing ? styles.feedbackPreview : error ? styles.feedbackError : styles.feedbackSuccess}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

        <section className={styles.mainGrid}>
          <article className={styles.actionPanel}>
            <div className={styles.panelHeading}><div><span className={styles.sectionLabel}>TODAY · {today.localDate}</span><h2>Shift check-in</h2><p>Clock in when you’re ready to begin, then clock out at the end of your shift.</p></div><span className={`${styles.statusPill} ${statusClass}`}><i />{statusLabel}</span></div>

            {!profileMissing && today.qrRequired && today.status !== 'COMPLETED' && <div className={`${styles.qrNotice} ${qrToken ? styles.qrVerified : ''}`}><span className={styles.qrIcon}>{qrToken ? '✓' : '⌗'}</span><div><strong>{qrToken ? 'Store verification ready' : 'Store QR check required'}</strong><small>{qrToken ? 'The current counter code will be checked by the server.' : 'Open this page from the current attendance QR displayed at your store.'}</small></div></div>}

            <div className={styles.shiftControls}>
              {today.status === 'NOT_STARTED' && <>
                <div className={styles.localClock}><span>LOCAL TIME</span><strong>{clockValue}</strong><small>{today.targetStartTime ? `Scheduled start · ${today.targetStartTime}` : 'Ready when you are'}</small></div>
                <button className={styles.attendanceOrb} type="button" disabled={busy || Boolean(apiToken && today.qrRequired && !qrToken)} onClick={handlePunch} aria-label="Clock in and start your shift">
                  <span className={styles.orbIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v9m-6.4-6.4a9 9 0 1 0 12.8 0" /></svg></span>
                  <strong>{busy ? 'Saving…' : 'Clock in'}</strong><small>Start shift</small>
                </button>
                {profileMissing && <div className={styles.profileNotice}><span>i</span><div><strong>Attendance unavailable</strong><small>No employee profile is linked to this account. Ask an administrator to create or link your employee record before clocking in.</small></div></div>}
              </>}

              {today.status === 'WORKING' && <div className={styles.activeShift}>
                <div className={styles.timerCircle}><span className={styles.timerLive}><i /> SHIFT IN PROGRESS</span><strong>{elapsed}</strong><small>HOURS : MINUTES</small><em>Clocked in at {clockIn ? formatTime(clockIn.punchTimestamp) : '—'}</em></div>
                <button className={styles.clockOutAction} type="button" disabled={busy} onClick={handlePunch}><span aria-hidden="true">↙</span><strong>{busy ? 'Saving…' : 'Clock out'}</strong><small>Finish today’s shift</small></button>
              </div>}

              {today.status === 'COMPLETED' && <div className={styles.completedShift}><span className={styles.completedIcon}>✓</span><small>SHIFT COMPLETE</small><strong>{elapsed}</strong><p>{clockIn ? `Clocked in ${formatTime(clockIn.punchTimestamp)}` : 'Clock-in recorded'} · {clockOut ? `Clocked out ${formatTime(clockOut.punchTimestamp)}` : 'Clock-out recorded'}</p></div>}
            </div>

            {!profileMissing && <div className={styles.policyNote}><span>i</span><p>{today.targetStartTime ? `Scheduled start is ${today.targetStartTime}. A later clock-in is recorded as late.` : 'Your manager has not set a shift start time yet.'} All times use the store’s local time.</p></div>}

            <div className={styles.todayTimeline}>
              <div className={styles.subheading}><div><span className={styles.sectionLabel}>PUNCH RECORD</span><h3>Today’s activity</h3></div><span>{today.punches.length} {today.punches.length === 1 ? 'entry' : 'entries'}</span></div>
              {today.punches.length ? today.punches.slice().reverse().map((punch) => <div className={styles.punchRow} key={punch.id}><span className={`${styles.punchMarker} ${punch.punchType === 'OUT' ? styles.punchMarkerOut : ''}`}>{punch.punchType === 'IN' ? '↗' : '↙'}</span><div><strong>{punch.punchType === 'IN' ? 'Clocked in' : 'Clocked out'}{punch.isLate && <em className={styles.lateBadge}>Late</em>}</strong><small>{punch.isLate ? `After scheduled start at ${punch.targetStartTime}` : punch.qrVerified ? 'Store verification recorded' : 'Time recorded on this device'}{punch.correctionReason ? ` · Corrected: ${punch.correctionReason}` : ''}</small></div><time>{formatTime(punch.punchTimestamp)}</time></div>) : <div className={styles.noPunches}><span>◷</span><p>No punches yet today. Your clock-in and clock-out will appear here.</p></div>}
            </div>
          </article>

          <div className={styles.historyColumn}>
            <article className={styles.historyPanel}>
              <div className={styles.historyHeading}><div><span className={styles.sectionLabel}>ATTENDANCE PATTERN</span><h2>Last 6 months</h2><p>Each square represents one day · hover for the shift details.</p></div><div className={styles.historyCount}><strong>{historySummary.shifts}</strong><small>shifts</small></div></div>
              <div className={styles.contrib}>
                <div className={styles.dayLabels}><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
                <div className={styles.weeks} role="img" aria-label={`Attendance pattern over six months: ${historySummary.shifts} recorded shifts, ${historySummary.late} late arrivals`}>
                  <div className={styles.months}>{monthLabels.map((label, index) => <span key={index}>{label}</span>)}</div>
                  <div className={styles.cells}>{historyWeeks.map((week, weekIndex) => <div className={styles.heatWeek} key={weekIndex}>{week.map((day) => {
                    const shade = day.status === 'present' ? day.workMinutes >= 480 ? styles.g3 : day.workMinutes >= 450 ? styles.g2 : styles.g1 : '';
                    return <i key={day.date} className={`${styles.heatCell} ${styles[`heat_${day.status}`]} ${shade} ${day.date === today.localDate ? styles.heatToday : ''}`} title={heatCellTitle(day)} />;
                  })}</div>)}</div>
                </div>
              </div>
              {!history.length && <p className={styles.emptyHistory}>No attendance history is available for this period.</p>}
              <div className={styles.gridLegend}><span>On time</span><i className={`${styles.heatCell} ${styles.heat_present} ${styles.g1}`} /><i className={`${styles.heatCell} ${styles.heat_present} ${styles.g2}`} /><i className={`${styles.heatCell} ${styles.heat_present} ${styles.g3}`} /><span>Late</span><i className={`${styles.heatCell} ${styles.heat_late}`} /><span>Absent</span><i className={`${styles.heatCell} ${styles.heat_absent}`} /><span>No record</span><i className={`${styles.heatCell} ${styles.heat_off}`} /></div>
              <p className={styles.gridNote}>Darker green means a longer recorded shift. A day without a punch is left neutral; no schedule is inferred.</p>
            </article>

            <article className={styles.recentPanel}>
              <div className={styles.subheading}><div><span className={styles.sectionLabel}>RECENT RECORDS</span><h3>Previous workdays</h3></div><span>Latest 7</span></div>
              <div className={styles.recentList}>{recentHistory.length ? recentHistory.map((day) => <div className={styles.recentRow} key={day.date}><span className={`${styles.recentMark} ${styles[`recent_${day.status}`]}`}>{day.status === 'late' ? '↗' : '✓'}</span><div className={styles.recentDate}><strong>{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day.date}T12:00:00`))}</strong><small>{HISTORY_LABEL[day.status]}</small></div><div className={styles.recentTimes}><strong>{day.clockIn} <span>→</span> {day.clockOut}</strong><small>{day.hours}</small></div></div>) : <p className={styles.emptyRecent}>No previous clock-ins found for this period.</p>}</div>
              <div className={styles.recentFooter}><span className={styles.legendDot} /> On time <span className={`${styles.legendDot} ${styles.legendLate}`} /> Late</div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
