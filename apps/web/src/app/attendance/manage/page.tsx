'use client';

import { useAccess } from '@/lib/permissions';
import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Eye,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Timer,
  TriangleAlert,
  UserRoundX,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { ATTENDANCE_MANAGER_ROLES, LOCATION_KEY } from '@/components/layout/nav-data';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

async function attendanceRequest<T>(route: string, signal?: AbortSignal, body?: object): Promise<T> {
  const token = getStoredSession()?.accessToken;
  if (!token) throw new Error('Sign in again to access attendance.');
  const response = await fetch(API + route, {
    cache: 'no-store', signal,
    method: body ? 'PATCH' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const { data, message } = await response.json();
  if (!response.ok) throw new Error(message || 'Could not load attendance.');
  return data;
}

type ReportEntry = {
  date: string; clockInAt: string | null; clockOutAt: string | null;
  targetStartTime: string | null; isLate: boolean; workMinutes: number; breakMinutes?: number; overtimeMinutes?: number; earlyMinutes?: number;
};
type AttendanceReport = {
  timezone: string;
  employees: Array<{ employee: AttendanceRow['employee']; entries: ReportEntry[]; presentDays: number; lateDays: number; workMinutes: number; earlyDays?: number; breakMinutes?: number; overtimeMinutes?: number }>;
};
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './oversight.module.css';

type Location = { id: string; name: string; type: string };

type AttendanceRow = {
  employee: { id: string; name: string; employeeCode: string };
  status: 'NOT_STARTED' | 'WORKING' | 'COMPLETED';
  workMinutes?: number;
  breakMinutes?: number;
  earlyMinutes?: number;
  overtimeMinutes?: number;
  onBreak?: boolean;
  clockInId: string | null;
  clockOutId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  isLate: boolean;
  targetStartTime: string | null;
  targetEndTime?: string | null;
  clockInCorrectionReason: string | null;
  clockOutCorrectionReason: string | null;
};

type LocationDay = {
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  targetEndTime?: string | null;
  employees: AttendanceRow[];
};

type PunchEdit = { id: string; type: 'IN' | 'OUT'; value: string; employeeName: string };

/** One calendar day of attendance for one employee. */
type DayStatus = 'ontime' | 'late' | 'absent' | 'off' | 'pending' | 'future';
type DayRecord = {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  inMin: number | null; // minutes after local midnight
  outMin: number | null;
  workMin: number;
  breakMin?: number;
  earlyMin?: number;
  overtimeMin?: number;
  lateBy: number;
  corrected?: boolean;
};

type Employee = { id: string; name: string; employeeCode: string; role: string; locationId: string };

const TIMEZONE = 'Asia/Kolkata';
const HISTORY_DAYS = 26 * 7; // ~6 months shown in the attendance grid

// ---------- time helpers ----------
const localParts = (d: Date, timezone = TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
};
const minutesOf = (iso: string | null, timezone: string) => iso ? localParts(new Date(iso), timezone).minutes : null;
const hhmmToMin = (v: string | null) => {
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmtMin = (m: number | null) => {
  if (m === null) return '—';
  const h = Math.floor(m / 60) % 24;
  const mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
};
const fmtDur = (m: number) => (m <= 0 ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayOfWeek = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
const prettyDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });
const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Today's record from a live attendance row. */
function recordFromLive(row: AttendanceRow | undefined, today: string, targetMin: number | null, timezone: string): DayRecord {
  if (!row || !row.clockInAt) return { date: today, status: 'pending', inMin: null, outMin: null, workMin: 0, lateBy: 0 };
  const inMin = minutesOf(row.clockInAt, timezone);
  const outMin = minutesOf(row.clockOutAt, timezone);
  const endMs = row.clockOutAt ? new Date(row.clockOutAt).getTime() : Date.now();
  const workMin = Math.max(0, Math.round((endMs - new Date(row.clockInAt).getTime()) / 60000));
  const lateBy = row.isLate && inMin !== null && targetMin !== null ? Math.max(1, inMin - targetMin) : 0;
  return { date: today, status: row.isLate ? 'late' : 'ontime', inMin, outMin, workMin: row.workMinutes ?? workMin, breakMin: row.breakMinutes, earlyMin: row.earlyMinutes, overtimeMin: row.overtimeMinutes, lateBy, corrected: !!(row.clockInCorrectionReason || row.clockOutCorrectionReason) };
}

const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  search: Search,
  chevL: ChevronLeft,
  chevR: ChevronRight,
  check: Check,
  clock: Clock,
  alert: TriangleAlert,
  userX: UserRoundX,
  users: UsersRound,
  hours: Timer,
  download: Download,
  settings: Settings,
  x: X,
  edit: Pencil,
  eye: Eye,
  store: Store,
  shield: ShieldCheck,
  calendar: CalendarDays,
  refresh: RefreshCw,
  arrowIn: LogIn,
  arrowOut: LogOut,
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" />;
}

type Filter = 'all' | 'ontime' | 'late' | 'missing';
type ReportPeriod = 'daily' | 'weekly' | 'monthly';

const STATUS_LABEL: Record<DayStatus, string> = {
  ontime: 'On time', late: 'Late', absent: 'Absent', off: 'Day off', pending: 'Not clocked in', future: '',
};

export default function AttendanceManagerPage() {
  const initialDate = useMemo(() => localParts(new Date()).date, []);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [monthHistory, setMonthHistory] = useState<AttendanceReport | null>(null);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [day, setDay] = useState<LocationDay>({
    location: { id: '', name: '' },
    localDate: initialDate,
    timezone: TIMEZONE,
    targetStartTime: null,
    employees: [],
  });

  const today = day.localDate;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { can } = useAccess();
  const [role, setRole] = useState('');
  const canManage = can('attendance.manage', ATTENDANCE_MANAGER_ROLES.includes(role));
  const [targetEndTime, setTargetEndTime] = useState('');
  const [targetStartTime, setTargetStartTime] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('weekly');
  const [reportDate, setReportDate] = useState(initialDate);

  const [punchEdit, setPunchEdit] = useState<PunchEdit | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setRole(getStoredSession()?.user.role ?? '');
    setLoadingLocations(true);
    void attendanceRequest<Location[]>('/locations?isActive=true', controller.signal).then((available) => {
      setLocations(available);
      const scope = window.localStorage.getItem(LOCATION_KEY);
      setLocationId(available.find((item) => item.name === scope)?.id ?? available[0]?.id ?? '');
    }).catch((caught: Error) => {
      if (!controller.signal.aborted) setError(caught.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingLocations(false);
    });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const sync = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      const next = locations.find((item) => item.name === name);
      if (next) setLocationId(next.id);
    };
    window.addEventListener('premium-retail-location-change', sync);
    return () => window.removeEventListener('premium-retail-location-change', sync);
  }, [locations]);

  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    let initialize = true;
    async function loadDay() {
      try {
        const result = await attendanceRequest<LocationDay>(`/attendance/locations/${locationId}/today`, controller.signal);
        if (controller.signal.aborted) return;
        setDay(result);
        if (initialize) {
          initialize = false;
          setSelectedDate(result.localDate);
          setReportDate(result.localDate);
          setTargetStartTime(result.targetStartTime || '');
          setTargetEndTime(result.targetEndTime || '');
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError((caught as Error).message);
      }
    }
    setError('');
    setViewing(null);
    setPunchEdit(null);
    setSettingsOpen(false);
    void loadDay();
    const timer = window.setInterval(loadDay, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [locationId, revision]);

  const monthDate = selectedDate.slice(0, 7) + '-01';
  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    setMonthHistory(null);
    setHistoryStatus('Loading attendance records…');
    void attendanceRequest<AttendanceReport>(`/attendance/locations/${locationId}/reports?period=monthly&date=${monthDate}`, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setMonthHistory(result);
      setHistoryStatus('');
    }).catch((caught: Error) => {
      if (!controller.signal.aborted) setHistoryStatus(caught.message);
    });
    return () => controller.abort();
  }, [locationId, monthDate, revision]);

  useEffect(() => {
    if (!locationId || day.location.id !== locationId) return;
    const controller = new AbortController();
    setReport(null);
    setReportError('');
    void attendanceRequest<AttendanceReport>(`/attendance/locations/${locationId}/reports?period=${reportPeriod}&date=${reportDate}`, controller.signal).then((result) => {
      if (!controller.signal.aborted) setReport(result);
    }).catch((caught: Error) => {
      if (!controller.signal.aborted) setReportError(caught.message);
    });
    return () => controller.abort();
  }, [locationId, day.location.id, reportPeriod, reportDate, revision]);

  // Escape closes panels; clicks elsewhere close the row menu; notices fade
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPunchEdit(null); setViewing(null); setMenuFor(null); } };
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenuFor(null); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const targetMin = hhmmToMin(day.targetStartTime);
  const location = locations.find((l) => l.id === locationId) ?? locations[0];
  const staff: Employee[] = day.employees.map(({ employee }) => ({ ...employee, role: 'Employee', locationId }));

  const histories: Record<string, DayRecord[]> = {};
  for (const emp of staff) {
    const entries: DayRecord[] = (monthHistory?.employees.find((row) => row.employee.id === emp.id)?.entries ?? []).map((entry) => {
      const inMin = minutesOf(entry.clockInAt, day.timezone);
      const target = hhmmToMin(entry.targetStartTime);
      return {
        date: entry.date, status: !entry.clockInAt ? 'pending' : entry.isLate ? 'late' : 'ontime',
        inMin, outMin: minutesOf(entry.clockOutAt, day.timezone), workMin: entry.workMinutes, breakMin: entry.breakMinutes, earlyMin: entry.earlyMinutes, overtimeMin: entry.overtimeMinutes,
        lateBy: entry.isLate && target !== null && inMin !== null ? Math.max(1, inMin - target) : 0,
      };
    });
    const live = day.employees.find((row) => row.employee.id === emp.id);
    histories[emp.id] = [...entries.filter((entry) => entry.date !== today), recordFromLive(live, today, hhmmToMin(live?.targetStartTime ?? day.targetStartTime), day.timezone)];
  }

  // ---------- Register for the selected date ----------
  const isToday = selectedDate === today;
  const register = staff.map((emp) => {
    const rec = histories[emp.id].find((r) => r.date === selectedDate) ?? { date: selectedDate, status: 'future' as DayStatus, inMin: null, outMin: null, workMin: 0, lateBy: 0 };
    const live = isToday ? day.employees.find((r) => r.employee.id === emp.id) ?? null : null;
    return { emp, rec, live };
  });
  const counted = register.filter((r) => r.rec.status !== 'off');
  const present = counted.filter((r) => r.rec.inMin !== null);
  const onTime = present.filter((r) => r.rec.status === 'ontime');
  const late = present.filter((r) => r.rec.status === 'late');
  const missing = counted.filter((r) => r.rec.inMin === null);
  const workingNow = isToday ? register.filter((r) => r.live?.status === 'WORKING').length : 0;
  const totalWork = present.reduce((s, r) => s + r.rec.workMin, 0);
  const avgLate = late.length ? Math.round(late.reduce((s, r) => s + r.rec.lateBy, 0) / late.length) : 0;
  const avgIn = present.length ? Math.round(present.reduce((s, r) => s + (r.rec.inMin ?? 0), 0) / present.length) : null;

  const q = search.trim().toLowerCase();
  const visible = register.filter((r) => {
    if (q && !`${r.emp.name} ${r.emp.employeeCode} ${r.emp.role}`.toLowerCase().includes(q)) return false;
    if (filter === 'ontime') return r.rec.status === 'ontime';
    if (filter === 'late') return r.rec.status === 'late';
    if (filter === 'missing') return r.rec.inMin === null && r.rec.status !== 'off';
    return true;
  });

  // ---------- Report (computed from the same history) ----------
  const reportRange = useMemo(() => {
    if (reportPeriod === 'daily') return { start: reportDate, end: reportDate };
    if (reportPeriod === 'weekly') { const start = addDays(reportDate, -dayOfWeek(reportDate)); return { start, end: addDays(start, 6) }; }
    const start = `${reportDate.slice(0, 8)}01`;
    const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); next.setUTCDate(0);
    return { start, end: next.toISOString().slice(0, 10) };
  }, [reportPeriod, reportDate]);
  const reportRows = (report?.employees ?? []).map((row) => ({
    emp: { ...row.employee, role: 'Employee', locationId },
    presentDays: row.presentDays, lateDays: row.lateDays, workMinutes: row.workMinutes, earlyDays: row.earlyDays ?? 0, breakMinutes: row.breakMinutes ?? 0, overtimeMinutes: row.overtimeMinutes ?? 0,
    punctual: row.presentDays ? Math.round((row.presentDays - row.lateDays) / row.presentDays * 100) : null,
  }));

  async function handleSaveSettings() {
    setSaving(true);
    setError('');
    try {
      const route = `/attendance/locations/${locationId}`;
      await attendanceRequest(route + '/target-time', undefined, { startTime: targetStartTime || null, endTime: targetEndTime || null });
      setDay((current) => ({ ...current, targetStartTime: targetStartTime || null, targetEndTime: targetEndTime || null }));
      setNotice('Shift settings saved.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function beginCorrection(row: AttendanceRow, type: 'IN' | 'OUT') {
    setMenuFor(null);
    const id = type === 'IN' ? row.clockInId : row.clockOutId;
    const value = type === 'IN' ? row.clockInAt : row.clockOutAt;
    if (!id || !value) return;
    const local = new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setPunchEdit({ id, type, value: local, employeeName: row.employee.name });
    setCorrectionReason('');
  }

  async function handleSubmitCorrection(e: FormEvent) {
    e.preventDefault();
    if (!punchEdit || correctionReason.trim().length < 5 || saving) return;
    setSaving(true);
    setError('');
    try {
      await attendanceRequest(`/attendance/punches/${punchEdit.id}/correct`, undefined, {
        punchTimestamp: new Date(punchEdit.value).toISOString(), reason: correctionReason.trim(),
      });
      setPunchEdit(null);
      setRevision((value) => value + 1);
      setNotice('Attendance correction saved.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function exportReport() {
    if (!report || !location) return;
    const header = ['Employee', 'Code', 'Location', 'Days present', 'Late days', 'On-time %', 'Hours worked', 'Early checkouts', 'Break minutes', 'Overtime minutes'];
    const rows = reportRows.map((r) => [r.emp.name, r.emp.employeeCode, location.name, r.presentDays, r.lateDays, r.punctual ?? '', (r.workMinutes / 60).toFixed(1), r.earlyDays, r.breakMinutes, r.overtimeMinutes]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance-${location.name.replace(/\s+/g, '-')}-${reportPeriod}-${reportRange.start}-to-${reportRange.end}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Attendance report downloaded (${reportRows.length} employees).`);
  }

  const statusPill = (rec: DayRecord, live: AttendanceRow | null) => {
    if (rec.status === 'late') return <span className={`${styles.pill} ${styles.pillLate}`}><i />Late · {rec.lateBy}m</span>;
    if (rec.status === 'ontime') return <span className={`${styles.pill} ${styles.pillOk}`}><i />On time</span>;
    if (rec.status === 'absent') return <span className={`${styles.pill} ${styles.pillAbsent}`}><i />Absent</span>;
    if (rec.status === 'off') return <span className={`${styles.pill} ${styles.pillOff}`}><i />Day off</span>;
    if (rec.status === 'pending') return <span className={`${styles.pill} ${styles.pillPending}`}><i />{live ? 'Not clocked in' : 'No record'}</span>;
    return <span className={`${styles.pill} ${styles.pillOff}`}><i />—</span>;
  };

  // Last 14 days strip for each row
  const strip = (empId: string) => {
    const end = selectedDate;
    const recs = histories[empId];
    return Array.from({ length: 14 }, (_, i) => addDays(end, i - 13)).map((d) => recs.find((r) => r.date === d) ?? { date: d, status: 'future' as DayStatus, inMin: null, outMin: null, workMin: 0, lateBy: 0 });
  };

  if (!location) {
    return (
      <div className={`${styles.page} app-page`}>
        <header className={styles.header}>
          <div className={styles.headerTitle}><h1>Attendance Oversight</h1></div>
        </header>
        <section className={styles.tableCard}>
          <div className={styles.empty} role="status">
            <Icon name="users" size={24} />
            <strong>{loadingLocations ? 'Loading locations…' : error ? 'Could not load locations' : 'No active locations in your scope'}</strong>
            {error && <p>{error}</p>}
            {error && <button type="button" className="admin-secondary" onClick={() => setRevision((value) => value + 1)}>Try again</button>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header ---------- */}
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Attendance Oversight</h1>
          <div className={styles.dateNav} role="group" aria-label="Choose day">
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, -1))} aria-label="Previous day"><Icon name="chevL" size={15} /></button>
            <label className={styles.dateLabel}>
              <Icon name="calendar" size={14} />
              <span>{isToday ? 'Today, ' : ''}{prettyDate(selectedDate)}</span>
              <input type="date" value={selectedDate} max={today} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} aria-label="Pick a date" />
            </label>
            <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, 1))} disabled={isToday} aria-label="Next day"><Icon name="chevR" size={15} /></button>
            {!isToday && <button type="button" className={styles.todayBtn} onClick={() => setSelectedDate(today)}>Today</button>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <PillDropdown<string>
            value={locationId}
            heading="Location"
            ariaLabel="Location"
            icon={<Icon name="store" size={14} />}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            disabled={saving}
            onChange={(id) => setLocationId(id)}
          />
          {canManage && <button type="button" className={styles.ghostButton} onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}><Icon name="settings" size={15} /> Shift settings</button>}
          <button type="button" className={styles.primaryButton} onClick={exportReport} disabled={!report || day.location.id !== locationId}><Icon name="download" size={15} /> Export report</button>
        </div>
      </header>

      {error && <Feedback tone="error" onDismiss={() => setError('')}>{error} <button type="button" className="admin-secondary" onClick={() => setRevision((value) => value + 1)}>Reload attendance</button></Feedback>}
      {day.location.id !== locationId ? <p role="status">{error ? 'Attendance unavailable for this location.' : 'Loading location attendance…'}</p> : <>
      {notice && <Feedback tone="success" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {/* ---------- Summary cards ---------- */}
      <section className={styles.summaryGrid} aria-label="Attendance summary">
        <article className={`${styles.summaryCard} ${styles.cardGreen}`}>
          <div className={styles.summaryTop}><span>Present</span><i><Icon name="users" size={16} /></i></div>
          <strong className={styles.summaryValue}>{present.length}<em> / {counted.length}</em></strong>
          <div className={styles.split}>
            <span><b>{onTime.length}</b> on time</span>
            <span><b>{late.length}</b> late</span>
            {isToday && <span><b>{workingNow}</b> working now</span>}
          </div>
        </article>
        <article className={`${styles.summaryCard} ${styles.cardAmber}`}>
          <div className={styles.summaryTop}><span>Late arrivals</span><i><Icon name="clock" size={16} /></i></div>
          <strong className={styles.summaryValue}>{late.length}</strong>
          <div className={styles.split}><span>{late.length ? <>avg <b>{avgLate} min</b> after {fmtMin(targetMin)}</> : 'No late arrivals recorded'}</span></div>
        </article>
        <article className={`${styles.summaryCard} ${styles.cardRed}`}>
          <div className={styles.summaryTop}><span>{isToday ? 'Not clocked in' : 'No recorded punch'}</span><i><Icon name="userX" size={16} /></i></div>
          <strong className={styles.summaryValue}>{missing.length}</strong>
          <div className={styles.split}><span>{missing.length ? missing.map((m) => m.emp.name.split(' ')[0]).join(', ') : 'No missing punches'}</span></div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryTop}><span>Hours worked</span><i><Icon name="hours" size={16} /></i></div>
          <strong className={styles.summaryValue}>{fmtDur(totalWork)}</strong>
          <div className={styles.split}><span>avg clock-in <b>{fmtMin(avgIn)}</b></span></div>
        </article>
      </section>

      {/* ---------- Shift settings (collapsible) ---------- */}
      {settingsOpen && canManage && (
        <section className={styles.settings}>
          <div className={styles.settingBlock}>
            <h3><Icon name="clock" size={15} /> Shift hours</h3>
            <p>If the end time is earlier than the start time, the shift ends the next day. Breaks are excluded from worked time and overtime.</p>
            <div className={styles.inline}>
              <label>Shift start <input type="time" value={targetStartTime} onChange={(e) => setTargetStartTime(e.target.value)} aria-label="Shift start time" /></label>
              <label>Shift end <input type="time" value={targetEndTime} onChange={(e) => setTargetEndTime(e.target.value)} aria-label="Shift end time" /></label>
            </div>
            <button type="button" className={styles.primaryButton} onClick={handleSaveSettings} disabled={saving}><Icon name="check" size={15} /> Save settings</button>
          </div>
        </section>
      )}

      {/* ---------- Daily register ---------- */}
      <section className={styles.tableCard}>
        <div className={styles.tableTop}>
          <div className={styles.tabs} role="tablist" aria-label="Filter staff">
            {([
              ['all', 'Everyone', register.length],
              ['ontime', 'On time', onTime.length],
              ['late', 'Late', late.length],
              ['missing', isToday ? 'Not in' : 'Absent', missing.length],
            ] as Array<[Filter, string, number]>).map(([key, label, n]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? styles.tabOn : ''} onClick={() => setFilter(key)}>{label}<span>{n}</span></button>
            ))}
          </div>
          <label className={styles.search}>
            <Icon name="search" size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" aria-label="Search employee" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear"><Icon name="x" size={12} /></button>}
          </label>
        </div>

        <div className={styles.headRow}>
          <span>Employee</span><span>Clock in &amp; out</span><span>Worked</span><span>Status</span><span>Last 14 days</span><span />
        </div>
        <ul className={styles.rows}>
          {visible.map(({ emp, rec, live }) => {
            const span = rec.inMin !== null ? Math.min(100, (rec.workMin / (9 * 60)) * 100) : 0;
            return (
              <li key={emp.id} className={styles.row}>
                <button type="button" className={styles.person} onClick={() => setViewing(emp)}>
                  <span className={`${styles.avatar} ${styles[`av${Number(emp.id.slice(4)) % 5}`]}`}>{initials(emp.name)}</span>
                  <span><strong>{emp.name}</strong><small>{emp.employeeCode} · {emp.role}</small></span>
                </button>

                <span className={styles.times}>
                  <span className={rec.status === 'late' ? styles.lateText : ''}><Icon name="arrowIn" size={13} /> {fmtMin(rec.inMin)}{live?.clockInCorrectionReason ? <em title={`Corrected: ${live.clockInCorrectionReason}`}>edited</em> : null}</span>
                  <span className={styles.line} aria-hidden="true"><i style={{ width: `${span}%` }} className={rec.status === 'late' ? styles.lineLate : ''} /></span>
                  <span><Icon name="arrowOut" size={13} /> {live?.status === 'WORKING' ? <b className={styles.workingText}>{live.onBreak ? 'On break' : 'Working'}</b> : fmtMin(rec.outMin)}{live?.clockOutCorrectionReason ? <em title={`Corrected: ${live.clockOutCorrectionReason}`}>edited</em> : null}</span>
                </span>

                <span className={styles.worked}>{fmtDur(rec.workMin)}
                  {!!rec.breakMin && <small> · {rec.breakMin}m break</small>}
                  {!!rec.earlyMin && <small> · {rec.earlyMin}m early</small>}
                  {!!rec.overtimeMin && <small> · {rec.overtimeMin}m overtime</small>}
                </span>

                <span>{statusPill(rec, live)}</span>

                <span className={styles.strip} aria-label="Last 14 days">
                  {strip(emp.id).map((d) => <i key={d.date} className={styles[`cell_${d.status}`]} title={`${prettyDate(d.date, { day: 'numeric', month: 'short' })}: ${STATUS_LABEL[d.status] || 'Upcoming'}${d.inMin !== null ? ` · in ${fmtMin(d.inMin)}` : ''}`} />)}
                </span>

                <span className={styles.rowActions}>
                  <button type="button" className={styles.viewButton} onClick={() => setViewing(emp)}><Icon name="eye" size={14} /> View</button>
                  {canManage && live && live.clockInAt && (
                    <span className={styles.menuWrap} data-row-menu>
                      <button type="button" className={styles.moreButton} onClick={() => setMenuFor(menuFor === emp.id ? null : emp.id)} aria-label={`Correct punches for ${emp.name}`} aria-expanded={menuFor === emp.id}><Icon name="edit" size={14} /></button>
                      {menuFor === emp.id && (
                        <div className={styles.menu} role="menu">
                          <button type="button" role="menuitem" onClick={() => beginCorrection(live, 'IN')}><Icon name="arrowIn" size={14} /> Correct clock-in</button>
                          <button type="button" role="menuitem" onClick={() => beginCorrection(live, 'OUT')} disabled={!live.clockOutAt}><Icon name="arrowOut" size={14} /> Correct clock-out</button>
                        </div>
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {!visible.length && <div className={styles.empty}><Icon name="users" size={24} /><strong>{staff.length ? 'No one matches' : `No staff at ${location.name}`}</strong><p>{staff.length ? 'Try another filter or name.' : 'Pick another location.'}</p></div>}
        <footer className={styles.legend}>
          <span><i className={styles.cell_ontime} /> On time</span>
          <span><i className={styles.cell_late} /> Late</span>
          <span><i className={styles.cell_absent} /> Absent</span>
          <span><i className={styles.cell_off} /> Day off</span>
          <span className={styles.legendNote}>Shift {fmtMin(targetMin)} – {fmtMin(hhmmToMin(day.targetEndTime ?? null))}</span>
        </footer>
      </section>

      {/* ---------- Report ---------- */}
      {!isToday && historyStatus && <p role="status">{historyStatus}</p>}
      <section className={styles.reportCard}>
        <div className={styles.reportHead}>
          <div><div className="heading-with-info"><h2>Attendance report</h2><InfoHint label="About the attendance report">Review staff attendance for the selected location and date range.</InfoHint></div><p>{location.name} · {prettyDate(reportRange.start, { day: 'numeric', month: 'short' })} – {prettyDate(reportRange.end, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
          <div className={styles.reportTools}>
            <div className={styles.segmented} role="group" aria-label="Report period">
              {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map((p) => <button key={p} type="button" className={reportPeriod === p ? styles.segOn : ''} onClick={() => setReportPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
            </div>
            <input type="date" className={styles.dateInput} value={reportDate} max={today} onChange={(e) => e.target.value && setReportDate(e.target.value)} aria-label="Report date" />
            <button type="button" className={styles.iconButton} onClick={exportReport} disabled={!report || day.location.id !== locationId} title="Download CSV" aria-label="Download CSV"><Icon name="download" size={16} /></button>
          </div>
        </div>
        <div className={styles.reportTable}>
          <div className={styles.reportRowHead}><span>Employee</span><span>On time</span><span className={styles.num}>Present</span><span className={styles.num}>Late</span><span className={styles.num}>Hours</span></div>
          {reportRows.map((r) => (
            <div key={r.emp.id} className={styles.reportRow}>
              <button type="button" className={styles.person} onClick={() => setViewing(r.emp)}>
                <span className={`${styles.avatar} ${styles.avatarSm} ${styles[`av${Number(r.emp.id.slice(4)) % 5}`]}`}>{initials(r.emp.name)}</span>
                <span><strong>{r.emp.name}</strong><small>{r.emp.role}</small></span>
              </button>
              <span>{r.punctual === null ? '—' : `${r.punctual}%`}</span>
              <span className={styles.num}>{r.presentDays}</span>
              <span className={`${styles.num} ${r.lateDays ? styles.lateText : ''}`}>{r.lateDays}</span>
              <span className={styles.num}>{(r.workMinutes / 60).toFixed(1)}
                {(r.earlyDays > 0 || r.breakMinutes > 0 || r.overtimeMinutes > 0) &&
                  <small style={{ display: 'block', fontWeight: 400 }}>{r.earlyDays} early · {r.breakMinutes}m break · {r.overtimeMinutes}m OT</small>}
              </span>
            </div>
          ))}
          {reportError ? <Feedback tone="error">{reportError}</Feedback> : !report ? <p role="status">Loading report…</p> : !reportRows.length && <div className={styles.empty}><p>No staff at this location.</p></div>}
        </div>
      </section>

      {/* ---------- Employee attendance view ---------- */}
      </>}
      {viewing && <EmployeeView emp={viewing} history={histories[viewing.id] ?? []} today={today} targetMin={targetMin} live={day.employees.find((r) => r.employee.id === viewing.id) ?? null} location={locations.find((l) => l.id === viewing.locationId)?.name ?? ''} onClose={() => setViewing(null)} onCorrect={beginCorrection} />}

      {/* ---------- Correction dialog ---------- */}
      {punchEdit && (
        <div className={styles.backdrop} onClick={() => setPunchEdit(null)}>
          <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="fix-title" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmitCorrection}>
            <div className={styles.modalHead}>
              <span className={styles.modalIcon}><Icon name="edit" size={18} /></span>
              <div><h2 id="fix-title">Correct {punchEdit.type === 'IN' ? 'clock-in' : 'clock-out'}</h2><p>{punchEdit.employeeName}</p></div>
              <button type="button" className={styles.closeButton} onClick={() => setPunchEdit(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.field}><span>Correct time</span><input type="datetime-local" value={punchEdit.value} onChange={(e) => setPunchEdit({ ...punchEdit, value: e.target.value })} required /></label>
              <label className={styles.field}><span>Reason <em>required, at least 5 characters</em></span><textarea rows={3} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="e.g. Forgot to scan, confirmed on CCTV" required minLength={5} /></label>
              <p className={styles.hint}><Icon name="shield" size={13} /> The original time and your reason are kept in the audit trail.</p>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={styles.ghostButton} onClick={() => setPunchEdit(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={correctionReason.trim().length < 5}><Icon name="check" size={15} /> Save correction</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ================= Employee attendance view (slide-over) ================= */

function EmployeeView({ emp, history, today, targetMin, live, location, onClose, onCorrect }: {
  emp: Employee;
  history: DayRecord[];
  today: string;
  targetMin: number | null;
  live: AttendanceRow | null;
  location: string;
  onClose: () => void;
  onCorrect: (row: AttendanceRow, type: 'IN' | 'OUT') => void;
}) {
  const [range, setRange] = useState<30 | 90 | 182>(30);
  const byDate = useMemo(() => new Map(history.map((r) => [r.date, r])), [history]);

  // Grid: 26 week columns × 7 weekday rows, ending with the current week
  const weeks = 26;
  const gridStart = addDays(today, -dayOfWeek(today) - (weeks - 1) * 7);
  const columns = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = addDays(gridStart, w * 7 + d);
    return date > today ? { date, status: 'future' as DayStatus, inMin: null, outMin: null, workMin: 0, lateBy: 0 } : byDate.get(date) ?? { date, status: 'off' as DayStatus, inMin: null, outMin: null, workMin: 0, lateBy: 0 };
  }));
  // Label the first week of each month; drop the opening partial month if the next label is too close
  const monthLabels = columns.map((col, i) => {
    const first = col[0].date;
    const prev = i ? columns[i - 1][0].date : '';
    return !prev || first.slice(5, 7) !== prev.slice(5, 7) ? prettyDate(first, { month: 'short' }) : '';
  });
  const nextLabel = monthLabels.findIndex((m, i) => i > 0 && m);
  if (nextLabel > 0 && nextLabel < 3) monthLabels[0] = '';

  const recent = history.filter((r) => r.date > addDays(today, -range) && r.status !== 'off' && r.status !== 'future');
  const presentRecs = recent.filter((r) => r.inMin !== null);
  const lateDays = recent.filter((r) => r.status === 'late').length;
  const absentDays = recent.filter((r) => r.status === 'absent').length;
  const attendanceRate = recent.filter((r) => r.status !== 'pending').length ? Math.round((presentRecs.length / recent.filter((r) => r.status !== 'pending').length) * 100) : 0;
  const onTimeRate = presentRecs.length ? Math.round(((presentRecs.length - lateDays) / presentRecs.length) * 100) : 0;
  const avgIn = presentRecs.length ? Math.round(presentRecs.reduce((s, r) => s + (r.inMin ?? 0), 0) / presentRecs.length) : null;
  const avgWork = presentRecs.length ? Math.round(presentRecs.reduce((s, r) => s + r.workMin, 0) / presentRecs.length) : 0;
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.status === 'off' || r.status === 'pending') continue;
    if (r.status === 'ontime') streak++; else break;
  }
  const lastDays = [...history].reverse().filter((r) => r.status !== 'off').slice(0, 8);
  const todayRec = byDate.get(today);

  const cellShade = (r: DayRecord) => (r.status === 'ontime' ? (r.workMin >= 8 * 60 ? styles.g3 : r.workMin >= 7.5 * 60 ? styles.g2 : styles.g1) : '');

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="emp-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHead}>
          <span className={`${styles.avatar} ${styles.avatarLg} ${styles[`av${Number(emp.id.slice(4)) % 5}`]}`}>{initials(emp.name)}</span>
          <div>
            <h2 id="emp-title">{emp.name}</h2>
            <p>{emp.employeeCode} · {emp.role} · {location}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>

        <div className={styles.drawerBody}>
          {/* Today */}
          <div className={styles.todayCard}>
            <div><small>Today</small><b>{todayRec ? (STATUS_LABEL[todayRec.status] || '—') : '—'}{todayRec?.status === 'late' ? ` · ${todayRec.lateBy} min` : ''}</b></div>
            <div><small>Clock in</small><b>{fmtMin(todayRec?.inMin ?? null)}</b></div>
            <div><small>Clock out</small><b>{live?.status === 'WORKING' ? 'Working' : fmtMin(todayRec?.outMin ?? null)}</b></div>
            <div><small>Worked</small><b>{fmtDur(todayRec?.workMin ?? 0)}</b></div>
            {live?.clockInAt && (
              <div className={styles.todayActions}>
                <button type="button" className={styles.linkButton} onClick={() => onCorrect(live, 'IN')}><Icon name="edit" size={13} /> Fix clock-in</button>
                {live.clockOutAt && <button type="button" className={styles.linkButton} onClick={() => onCorrect(live, 'OUT')}><Icon name="edit" size={13} /> Fix clock-out</button>}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className={styles.statsHead}>
            <h3>Performance</h3>
            <div className={styles.segmented} role="group" aria-label="Stats range">
              {([30, 90, 182] as const).map((d) => <button key={d} type="button" className={range === d ? styles.segOn : ''} onClick={() => setRange(d)}>{d === 182 ? '6 mo' : `${d} days`}</button>)}
            </div>
          </div>
          <div className={styles.stats}>
            <div className={styles.statBig}>
              <svg viewBox="0 0 64 64" className={styles.ring} aria-hidden="true">
                <circle cx="32" cy="32" r="26" className={styles.ringTrack} />
                <circle cx="32" cy="32" r="26" className={styles.ringFill} strokeDasharray={`${(attendanceRate / 100) * 163.4} 163.4`} />
              </svg>
              <span><b>{attendanceRate}%</b><small>attendance</small></span>
            </div>
            <div><small>On time</small><b className={styles.okText}>{onTimeRate}%</b></div>
            <div><small>Late days</small><b className={lateDays ? styles.lateText : ''}>{lateDays}</b></div>
            <div><small>Absent days</small><b className={absentDays ? styles.absentText : ''}>{absentDays}</b></div>
            <div><small>Avg clock-in</small><b>{fmtMin(avgIn)}</b></div>
            <div><small>Avg day</small><b>{fmtDur(avgWork)}</b></div>
            <div><small>On-time streak</small><b>{streak} day{streak === 1 ? '' : 's'}</b></div>
          </div>

          {/* GitHub-style attendance grid */}
          <div className={styles.gridCard}>
            <div className={styles.gridHead}><h3>Last 6 months</h3><small>Each square is one day · hover for details</small></div>
            <div className={styles.contrib}>
              <div className={styles.dayLabels}><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
              <div className={styles.weeks}>
                <div className={styles.months}>{monthLabels.map((m, i) => <span key={i}>{m}</span>)}</div>
                <div className={styles.cells}>
                  {columns.map((col, w) => (
                    <div key={w} className={styles.col}>
                      {col.map((r) => (
                        <i
                          key={r.date}
                          className={`${styles.cell} ${styles[`cell_${r.status}`]} ${cellShade(r)} ${r.date === today ? styles.cellToday : ''}`}
                          title={r.status === 'future' ? '' : `${prettyDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${STATUS_LABEL[r.status]}${r.status === 'late' ? ` by ${r.lateBy} min` : ''}${r.inMin !== null ? ` · ${fmtMin(r.inMin)} – ${r.outMin !== null ? fmtMin(r.outMin) : 'working'} (${fmtDur(r.workMin)})` : ''}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.gridLegend}>
              <span>On time</span><i className={`${styles.cell} ${styles.cell_ontime} ${styles.g1}`} /><i className={`${styles.cell} ${styles.cell_ontime} ${styles.g2}`} /><i className={`${styles.cell} ${styles.cell_ontime} ${styles.g3}`} />
              <span>Late</span><i className={`${styles.cell} ${styles.cell_late}`} />
              <span>Absent</span><i className={`${styles.cell} ${styles.cell_absent}`} />
              <span>Day off</span><i className={`${styles.cell} ${styles.cell_off}`} />
            </div>
            <p className={styles.gridNote}>Darker green means a longer working day. Late is measured against the shift start ({fmtMin(targetMin)}).</p>
          </div>

          {/* Recent days */}
          <div className={styles.recent}>
            <h3>Recent days</h3>
            {lastDays.map((r) => (
              <div key={r.date} className={styles.recentRow}>
                <span className={`${styles.dot} ${styles[`cell_${r.status}`]}`} />
                <span className={styles.recentDate}>{r.date === today ? 'Today' : prettyDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className={styles.recentTimes}>{r.inMin !== null ? `${fmtMin(r.inMin)} – ${r.date === today && live?.status === 'WORKING' ? 'now' : fmtMin(r.outMin)}` : STATUS_LABEL[r.status]}</span>
                <span className={styles.recentDur}>{fmtDur(r.workMin)}</span>
                <span className={`${styles.miniPill} ${styles[`mp_${r.status}`]}`}>{r.status === 'late' ? `+${r.lateBy}m` : STATUS_LABEL[r.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
