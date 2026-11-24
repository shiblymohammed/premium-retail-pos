'use client';

import { ConfirmAction } from '@/components/ui/confirm-action';
import { InfoHint } from '@/components/ui/info-hint';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock, Info, MapPin, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import styles from './attendance.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type Punch = {
  id: string;
  punchType: 'IN' | 'OUT';
  punchTimestamp: string;
  scheduledEndAt?: string | null;
  breaks?: Array<{ id: string; startedAt: string; endedAt: string | null }>;
  isLate: boolean;
  targetStartTime: string | null;
  originalTimestamp: string | null;
  correctionReason: string | null;
};

type Today = {
  employee: { id: string; name: string; employeeCode: string };
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  targetEndTime?: string | null;
  onBreak?: boolean;
  breakMinutes?: number;
  overtimeMinutes?: number;
  earlyMinutes?: number;
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
  breakMinutes?: number;
  overtimeMinutes?: number;
  earlyMinutes?: number;
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
  const [apiToken, setApiToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const [clockNow, setClockNow] = useState<Date | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);

  useEffect(() => {
    const session = getStoredSession();
    const now = new Date();
    setClockNow(now);
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);

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
            setHistory((historyPayload.data.days as Array<{ date: string; status: HistoryDay['status']; clockInAt: string | null; clockOutAt: string | null; workMinutes: number; breakMinutes: number; overtimeMinutes: number; earlyMinutes: number }>).map((day) => ({
              date: day.date,
              status: day.status,
              clockIn: day.clockInAt ? formatTime(day.clockInAt, timezone) : '—',
              clockOut: day.clockOutAt ? formatTime(day.clockOutAt, timezone) : '—',
              hours: day.workMinutes ? formatWorkMinutes(day.workMinutes) : '—',
              workMinutes: day.workMinutes,
              breakMinutes: day.breakMinutes, overtimeMinutes: day.overtimeMinutes, earlyMinutes: day.earlyMinutes,
            })));
          } catch (caught) {
            setHistory([]);
            setError(caught instanceof Error ? caught.message : 'Attendance history is temporarily unavailable.');
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : 'Could not load your attendance.';
          if (message.toLowerCase().includes('employee profile')) {
            setApiToken('');
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
  function netShiftMs(inPunch: Punch, until: Date) {
    const end = until.getTime();
    const start = new Date(inPunch.punchTimestamp).getTime();
    const breakMs = (inPunch.breaks ?? []).reduce((sum, pause) => sum + Math.max(0,
      Math.min(end, pause.endedAt ? new Date(pause.endedAt).getTime() : end) - Math.max(start, new Date(pause.startedAt).getTime())), 0);
    return Math.max(0, end - start - breakMs);
  }

  const elapsedEnd = clockOut ? new Date(clockOut.punchTimestamp) : clockNow;
  const elapsed = clockIn && elapsedEnd ? formatDuration(netShiftMs(clockIn, elapsedEnd)) : '00:00:00';

  function updateTodayPattern(punches: Punch[], metrics?: Today) {
    if (!today) return;
    const inPunch = punches.find((punch) => punch.punchType === 'IN');
    const outPunch = punches.find((punch) => punch.punchType === 'OUT');
    if (!inPunch) return;
    const end = outPunch ? new Date(outPunch.punchTimestamp) : new Date();
    const workMinutes = Math.floor(netShiftMs(inPunch, end) / 60_000);
    const nextDay: HistoryDay = {
      date: today.localDate,
      status: inPunch.isLate ? 'late' : 'present',
      clockIn: formatTime(inPunch.punchTimestamp, today.timezone),
      clockOut: outPunch ? formatTime(outPunch.punchTimestamp, today.timezone) : '—',
      hours: workMinutes ? formatWorkMinutes(workMinutes) : '—',
      workMinutes,
      breakMinutes: metrics?.breakMinutes, overtimeMinutes: metrics?.overtimeMinutes, earlyMinutes: metrics?.earlyMinutes,
    };
    setHistory((days) => [...days.filter((day) => day.date !== today.localDate), nextDay].sort((a, b) => a.date.localeCompare(b.date)));
  }

  async function handlePunch() {
    if (!today?.nextAction || !apiToken || busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/attendance/me/punch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: today.nextAction }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not record attendance. Please try again.');
      const result = payload.data;
      const next: Today = {
        ...today,
        employee: result.employee || today.employee,
        location: result.location || today.location,
        status: result.status,
        onBreak: result.onBreak, breakMinutes: result.breakMinutes, overtimeMinutes: result.overtimeMinutes, earlyMinutes: result.earlyMinutes,
        nextAction: result.nextAction,
        punches: [...today.punches, result.punch],
      };
      setToday(next);
      setClockNow(new Date());
      updateTodayPattern(next.punches, next);
      setNotice(`${result.punch.punchType === 'IN' ? 'Clock-in' : 'Clock-out'} recorded at ${formatTime(result.punch.punchTimestamp, today.timezone)}${result.punch.isLate ? ` · Late after ${result.punch.targetStartTime}` : ''}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record attendance. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleBreak() {
    if (today?.status !== 'WORKING' || !apiToken || busy) return;
    setBusy(true);
    setError('');
    try {
      const action = today.onBreak ? 'end' : 'start';
      const response = await fetch(`${API_BASE}/attendance/me/break/${action}`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiToken}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not record your break.');
      const updated: Today = payload.data;
      setToday(updated);
      setClockNow(new Date());
      updateTodayPattern(updated.punches, updated);
      setNotice(action === 'start' ? 'Break started.' : 'Break ended.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record your break.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className={`${styles.page} app-page`}><div className={styles.loading}>Loading your attendance…</div></main>;
  if (!today) return <main className={`${styles.page} app-page`}><div className={styles.loadError}><strong>Attendance unavailable</strong><p>{error || 'Your account does not have an employee attendance profile.'}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div></main>;

  const statusLabel = today.status === 'NOT_STARTED' ? 'Not clocked in' : today.status === 'WORKING' ? (today.onBreak ? 'On break' : 'On shift') : 'Shift complete';
  const statusClass = today.status === 'WORKING' ? styles.live : today.status === 'COMPLETED' ? styles.done : styles.waiting;
  const patternHistory = history.map((day) => {
    if (day.date !== today.localDate || today.status !== 'WORKING' || !clockIn || !clockNow) return day;
    const workMinutes = Math.floor(netShiftMs(clockIn, clockNow) / 60_000);
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
        <div className={styles.breadcrumb}><span>Workforce</span><b><ChevronRight size="1em" className="inline-icon" aria-hidden="true" /></b><strong>My attendance</strong></div>
        <header className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>STAFF WORKSPACE · {today.employee.employeeCode}</p><h1>My attendance</h1><p className={styles.subtitle}>Record today’s shift and review your recent attendance.</p></div>
          <div className={styles.headingMeta}><span className={styles.locationPin}><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span><span><strong>{today.location.name}</strong><small>{longDate}</small></span></div>
        </header>

        <section className={styles.summaryGrid} aria-label="Attendance summary">
          <article className={styles.summaryCard}><span className={styles.summaryIcon}><Clock size="1em" className="inline-icon" aria-hidden="true" /></span><div><small>SHIFT STATUS</small><strong className={statusClass}>{statusLabel}</strong></div><i className={today.status === 'WORKING' ? styles.statusIndicatorLive : ''} /></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}><ArrowUpRight size="1em" className="inline-icon" aria-hidden="true" /></span><div><small>TARGET START</small><strong>{today.targetStartTime || 'Not set'}</strong><em>{clockIn?.isLate ? 'Late arrival recorded' : 'Store schedule'}</em></div></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}><Timer size="1em" className="inline-icon" aria-hidden="true" /></span><div><small>TIME WORKED</small><strong className={styles.duration}>{today.status === 'WORKING' ? elapsed : today.status === 'COMPLETED' ? elapsed : '—'}</strong><em>{today.status === 'WORKING' ? 'Live · hours : minutes' : today.status === 'COMPLETED' ? 'Today’s total' : 'Starts after clock-in'}</em></div></article>
          <article className={styles.summaryCard}><span className={styles.summaryIcon}><Check size="1em" className="inline-icon" aria-hidden="true" /></span><div><small>LAST 6 MONTHS</small><strong>{historySummary.shifts} shifts</strong><em>{historySummary.late} late arrivals</em></div></article>
        </section>

        {(error || notice) && <div className={`${styles.feedback} ${error ? styles.feedbackError : styles.feedbackSuccess}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

        <section className={styles.mainGrid}>
          <article id="shift" className={styles.actionPanel}>
            <div className={styles.panelHeading}><div><span className={styles.sectionLabel}>TODAY · {today.localDate}</span><div className="heading-with-info"><h2>Shift check-in</h2><InfoHint label="About shift check-in">Attendance entries are recorded against your assigned location.</InfoHint></div><p>Manage your punches for today.</p></div><span className={`${styles.statusPill} ${statusClass}`}><i />{statusLabel}</span></div>

            <div className={styles.shiftSummary}>
              {today.status === 'NOT_STARTED' && <>
                <div><small>Local time</small><strong>{clockValue}</strong><p>{today.targetStartTime ? `Scheduled start ${today.targetStartTime}` : 'Clock in when you’re ready to start.'}</p></div>
                <button className="admin-primary" type="button" disabled={busy} onClick={handlePunch}>
                  <ArrowUpRight size={18} /> {busy ? 'Saving…' : 'Clock in'}
                </button>
              </>}
              {today.status === 'WORKING' && <>
                <div><small>Time worked</small><strong>{elapsed}</strong><p>Clocked in at {clockIn ? formatTime(clockIn.punchTimestamp, today.timezone) : '—'}</p></div>
                <div className={styles.breakActions}>
                  <button type="button" className={today.onBreak ? 'admin-primary' : 'admin-secondary'} disabled={busy} onClick={() => void handleBreak()}>{today.onBreak ? 'End break' : 'Start break'}</button>
                  <button className="admin-secondary" type="button" disabled={busy || today.onBreak} onClick={() => setConfirmOut(true)}>
                    <ArrowDownLeft size={18} /> Clock out
                  </button>
                </div>
              </>}
              {today.status === 'COMPLETED' && <div>
                <small>Net time worked</small><strong>{elapsed}</strong>
                <p>{clockIn ? formatTime(clockIn.punchTimestamp, today.timezone) : '—'} to {clockOut ? formatTime(clockOut.punchTimestamp, today.timezone) : '—'}</p>
              </div>}
            </div>
            {clockIn && <p className={styles.shiftMetrics}>
              {clockIn.scheduledEndAt ? `Scheduled end ${formatTime(clockIn.scheduledEndAt, today.timezone)}` : today.targetEndTime ? `Shift end setting ${today.targetEndTime}` : 'No scheduled end recorded'}
              {' · '}Breaks {formatWorkMinutes(today.breakMinutes ?? 0)}
              {(today.overtimeMinutes ?? 0) > 0 && ` · Overtime ${formatWorkMinutes(today.overtimeMinutes!)}`}
              {(today.earlyMinutes ?? 0) > 0 && ` · Clocked out ${today.earlyMinutes} min early`}
            </p>}
            {clockIn?.breaks?.map((pause) => <div className={styles.shiftMetrics} key={pause.id}>
              Break {formatTime(pause.startedAt, today.timezone)} – {pause.endedAt ? formatTime(pause.endedAt, today.timezone) : 'in progress'}
            </div>)}
            {confirmOut && <ConfirmAction title="Clock out now?" confirmLabel="Yes, clock out" cancelLabel="No, stay on shift"
              onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); void handlePunch(); }}>
              This records the end of today’s shift at {today.location.name}.
            </ConfirmAction>}

            <div className={styles.todayTimeline}>
              <div className={styles.subheading}><div><span className={styles.sectionLabel}>PUNCH RECORD</span><h3>Today’s activity</h3></div><span>{today.punches.length} {today.punches.length === 1 ? 'entry' : 'entries'}</span></div>
              {today.punches.length ? today.punches.slice().reverse().map((punch) => <div className={styles.punchRow} key={punch.id}><span className={`${styles.punchMarker} ${punch.punchType === 'OUT' ? styles.punchMarkerOut : ''}`}>{punch.punchType === 'IN' ? <ArrowUpRight size="1em" className="inline-icon" aria-hidden="true" /> : <ArrowDownLeft size="1em" className="inline-icon" aria-hidden="true" />}</span><div><strong>{punch.punchType === 'IN' ? 'Clocked in' : 'Clocked out'}{punch.isLate && <em className={styles.lateBadge}>Late</em>}</strong><small>{punch.isLate ? `After scheduled start at ${punch.targetStartTime}` : 'Time recorded'}{punch.correctionReason ? ` · Corrected: ${punch.correctionReason}` : ''}</small></div><time>{formatTime(punch.punchTimestamp, today.timezone)}</time></div>) : <div className={styles.noPunches}><span><Clock size="1em" className="inline-icon" aria-hidden="true" /></span><p>No punches yet today. Your clock-in and clock-out will appear here.</p></div>}
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
              <div className={styles.recentList}>{recentHistory.length ? recentHistory.map((day) => <div className={styles.recentRow} key={day.date}><span className={`${styles.recentMark} ${styles[`recent_${day.status}`]}`}>{day.status === 'late' ? <ArrowUpRight size="1em" className="inline-icon" aria-hidden="true" /> : <Check size="1em" className="inline-icon" aria-hidden="true" />}</span><div className={styles.recentDate}><strong>{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day.date}T12:00:00`))}</strong><small>{HISTORY_LABEL[day.status]}</small></div><div className={styles.recentTimes}><strong>{day.clockIn} <span><ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span> {day.clockOut}</strong><small>{day.hours}</small></div></div>) : <p className={styles.emptyRecent}>No previous clock-ins found for this period.</p>}</div>
              <div className={styles.recentFooter}><span className={styles.legendDot} /> On time <span className={`${styles.legendDot} ${styles.legendLate}`} /> Late</div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
