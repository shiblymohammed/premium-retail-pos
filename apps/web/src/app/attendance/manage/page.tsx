'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './oversight.module.css';

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

type LocationDay = {
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  qrRequired: boolean;
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
  lateBy: number;
  corrected?: boolean;
};

type Employee = { id: string; name: string; employeeCode: string; role: string; locationId: string };

const TIMEZONE = 'Asia/Kolkata';
const HISTORY_DAYS = 26 * 7; // ~6 months shown in the attendance grid

const DEMO_LOCATIONS: Location[] = [
  { id: 'loc_downtown', name: 'Downtown Store', type: 'RETAIL_STORE' },
  { id: 'loc_north_mall', name: 'North Mall', type: 'RETAIL_STORE' },
  { id: 'loc_west_end', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc_warehouse', name: 'Central Warehouse', type: 'WAREHOUSE' },
];

const EMPLOYEES: Employee[] = [
  { id: 'emp_1', name: 'Ravi Menon', employeeCode: 'EMP-0842', role: 'Cashier', locationId: 'loc_downtown' },
  { id: 'emp_2', name: 'Anita Sharma', employeeCode: 'EMP-0843', role: 'Cashier', locationId: 'loc_downtown' },
  { id: 'emp_3', name: 'Rajesh Kumar', employeeCode: 'EMP-0844', role: 'Senior cashier', locationId: 'loc_downtown' },
  { id: 'emp_4', name: 'Amit Verma', employeeCode: 'EMP-0845', role: 'Stock associate', locationId: 'loc_downtown' },
  { id: 'emp_5', name: 'Priya Nair', employeeCode: 'EMP-0851', role: 'Cashier', locationId: 'loc_north_mall' },
  { id: 'emp_6', name: 'Kabir Rao', employeeCode: 'EMP-0852', role: 'Stock associate', locationId: 'loc_north_mall' },
  { id: 'emp_7', name: 'Maya Das', employeeCode: 'EMP-0861', role: 'Cashier', locationId: 'loc_west_end' },
  { id: 'emp_8', name: 'Neel Shah', employeeCode: 'EMP-0862', role: 'Floor supervisor', locationId: 'loc_west_end' },
];

/** How reliable each demo employee is (drives the generated history). */
const PROFILES: Record<string, { late: number; absent: number }> = {
  emp_1: { late: 0.04, absent: 0.02 },
  emp_2: { late: 0.28, absent: 0.04 },
  emp_3: { late: 0.08, absent: 0.03 },
  emp_4: { late: 0.12, absent: 0.12 },
  emp_5: { late: 0.06, absent: 0.02 },
  emp_6: { late: 0.2, absent: 0.08 },
  emp_7: { late: 0.1, absent: 0.05 },
  emp_8: { late: 0.03, absent: 0.01 },
};

const blankRow = (emp: Employee): AttendanceRow => ({
  employee: { id: emp.id, name: emp.name, employeeCode: emp.employeeCode },
  status: 'NOT_STARTED', clockInId: null, clockOutId: null, clockInAt: null, clockOutAt: null,
  isLate: false, targetStartTime: '09:00', qrVerified: false, clockInCorrectionReason: null, clockOutCorrectionReason: null,
});

// Today's demo punches sit at fixed shift times (store time, IST). A punch that would be
// in the future is left out, so the register always looks like a real day so far.
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const atStoreTime = (hhmm: string) => new Date(`${istToday()}T${hhmm}:00+05:30`).toISOString();
const demoRow = (emp: Employee, n: number, inAt: string | null, outAt: string | null, qrVerified = true): AttendanceRow => {
  const now = Date.now();
  const inIso = inAt ? atStoreTime(inAt) : null;
  if (!inIso || new Date(inIso).getTime() > now) return blankRow(emp);
  const outIso = outAt ? atStoreTime(outAt) : null;
  const done = !!outIso && new Date(outIso).getTime() <= now;
  return {
    ...blankRow(emp),
    status: done ? 'COMPLETED' : 'WORKING',
    clockInId: `cin_${n}`,
    clockInAt: inIso,
    clockOutId: done ? `cout_${n}` : null,
    clockOutAt: done ? outIso : null,
    isLate: (inAt as string) > '09:00', // same rule as the API: clock-in after the shift start
    qrVerified,
  };
};

const DEMO_EMPLOYEES_TODAY: AttendanceRow[] = [
  demoRow(EMPLOYEES[0], 1, '08:52', '18:05'),
  demoRow(EMPLOYEES[1], 2, '09:18', '18:30'),
  demoRow(EMPLOYEES[2], 3, '08:45', '17:10'),
  demoRow(EMPLOYEES[3], 4, null, null),
  demoRow(EMPLOYEES[4], 5, '08:57', '18:00'),
  demoRow(EMPLOYEES[5], 6, '09:26', '18:40', false),
  demoRow(EMPLOYEES[6], 7, null, null),
  demoRow(EMPLOYEES[7], 8, '08:40', '17:30'),
];

// ---------- time helpers ----------
const localParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
};
const todayLocal = () => localParts(new Date()).date;
const minutesOf = (iso: string | null) => (iso ? localParts(new Date(iso)).minutes : null);
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

/** Small deterministic random generator so demo history is stable between reloads. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds past attendance for one employee (Sundays are days off). */
function buildHistory(emp: Employee, targetMin: number, today: string): DayRecord[] {
  const rand = seeded(emp.id);
  const profile = PROFILES[emp.id] ?? { late: 0.1, absent: 0.05 };
  const records: DayRecord[] = [];
  for (let i = HISTORY_DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const r = rand();
    const jitter = rand();
    if (dayOfWeek(date) === 6) { records.push({ date, status: 'off', inMin: null, outMin: null, workMin: 0, lateBy: 0 }); continue; }
    if (r < profile.absent) { records.push({ date, status: 'absent', inMin: null, outMin: null, workMin: 0, lateBy: 0 }); continue; }
    const late = r < profile.absent + profile.late;
    const inMin = late ? targetMin + 5 + Math.round(jitter * 45) : targetMin - 15 + Math.round(jitter * 14);
    const workMin = 7 * 60 + Math.round(rand() * 120);
    records.push({ date, status: late ? 'late' : 'ontime', inMin, outMin: inMin + workMin, workMin, lateBy: late ? inMin - targetMin : 0 });
  }
  return records;
}

/** Today's record from a live attendance row. */
function recordFromLive(row: AttendanceRow | undefined, today: string, targetMin: number | null): DayRecord {
  if (!row || !row.clockInAt) return { date: today, status: 'pending', inMin: null, outMin: null, workMin: 0, lateBy: 0 };
  const inMin = minutesOf(row.clockInAt);
  const outMin = minutesOf(row.clockOutAt);
  const endMs = row.clockOutAt ? new Date(row.clockOutAt).getTime() : Date.now();
  const workMin = Math.max(0, Math.round((endMs - new Date(row.clockInAt).getTime()) / 60000));
  const lateBy = row.isLate && inMin !== null && targetMin !== null ? Math.max(1, inMin - targetMin) : 0;
  return { date: today, status: row.isLate ? 'late' : 'ontime', inMin, outMin, workMin, lateBy, corrected: !!(row.clockInCorrectionReason || row.clockOutCorrectionReason) };
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    chevL: <path d="m15 18-6-6 6-6" />,
    chevR: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>,
    userX: <><circle cx="10" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 13-6.2M17 15l4 4M21 15l-4 4" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
    hours: <><path d="M5 3h14M5 21h14M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.1 2.5-2.5 2.5h-3C9.1 12.5 8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10Z" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.8-3 8.1-7 10-4-1.9-7-5.2-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
    arrowIn: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H3" />,
    arrowOut: <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

type Filter = 'all' | 'ontime' | 'late' | 'missing';
type ReportPeriod = 'daily' | 'weekly' | 'monthly';

const STATUS_LABEL: Record<DayStatus, string> = {
  ontime: 'On time', late: 'Late', absent: 'Absent', off: 'Day off', pending: 'Not clocked in', future: '',
};

export default function AttendanceManagerPage() {
  const today = useMemo(() => todayLocal(), []);
  const [locations] = useState<Location[]>(DEMO_LOCATIONS);
  const [locationId, setLocationId] = useState('loc_downtown');
  const [day, setDay] = useState<LocationDay>({
    location: { id: 'loc_downtown', name: 'Downtown Store' },
    localDate: today,
    timezone: TIMEZONE,
    targetStartTime: '09:00',
    qrRequired: true,
    employees: DEMO_EMPLOYEES_TODAY,
  });

  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [targetStartTime, setTargetStartTime] = useState('09:00');
  const [qrRequired, setQrRequired] = useState(true);
  const [qrImage, setQrImage] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('weekly');
  const [reportDate, setReportDate] = useState(today);

  const [punchEdit, setPunchEdit] = useState<PunchEdit | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [notice, setNotice] = useState('');

  // Follow the store chosen in the top bar
  useEffect(() => {
    const apply = (name: string | null) => { const found = DEMO_LOCATIONS.find((l) => l.name === name); if (found) setLocationId(found.id); };
    apply(window.localStorage.getItem('premium-retail-location-scope'));
    const sync = (event: Event) => apply((event as CustomEvent<string>).detail);
    window.addEventListener('premium-retail-location-change', sync);
    return () => window.removeEventListener('premium-retail-location-change', sync);
  }, []);

  // Rotating check-in QR (same behaviour as before: new code every 25 s, valid 60 s)
  const refreshQr = useCallback(async () => {
    const expires = new Date(Date.now() + 60 * 1000).toISOString();
    const token = `QR_${locationId}_${Date.now()}`;
    const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/attendance#qr=${token}`;
    try {
      setQrImage(await QRCode.toDataURL(qrUrl, { width: 180, margin: 1, color: { dark: '#1f2f4d', light: '#ffffff' } }));
      setQrExpiresAt(expires);
    } catch {
      // QR generation failed; keep the previous code
    }
  }, [locationId]);
  useEffect(() => {
    void refreshQr();
    const interval = window.setInterval(() => void refreshQr(), 25000);
    return () => window.clearInterval(interval);
  }, [refreshQr]);
  useEffect(() => {
    const tick = () => setSecondsLeft(qrExpiresAt ? Math.max(0, Math.round((new Date(qrExpiresAt).getTime() - Date.now()) / 1000)) : 0);
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [qrExpiresAt]);

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
  const staff = EMPLOYEES.filter((e) => e.locationId === locationId);

  // Full history per employee (past days generated + today from the live register)
  const histories = useMemo(() => {
    const map: Record<string, DayRecord[]> = {};
    for (const emp of EMPLOYEES) {
      const live = day.employees.find((r) => r.employee.id === emp.id);
      map[emp.id] = [...buildHistory(emp, targetMin ?? 540, today), recordFromLive(live, today, targetMin)];
    }
    return map;
  }, [day.employees, targetMin, today]);

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
  const reportRows = staff.map((emp) => {
    const recs = histories[emp.id].filter((r) => r.date >= reportRange.start && r.date <= reportRange.end && r.date <= today);
    const presentDays = recs.filter((r) => r.inMin !== null).length;
    const lateDays = recs.filter((r) => r.status === 'late').length;
    const absentDays = recs.filter((r) => r.status === 'absent').length;
    const workDays = presentDays + absentDays;
    const workMinutes = recs.reduce((s, r) => s + r.workMin, 0);
    return { emp, presentDays, lateDays, absentDays, workMinutes, rate: workDays ? Math.round((presentDays / workDays) * 100) : 0, punctual: presentDays ? Math.round(((presentDays - lateDays) / presentDays) * 100) : 0 };
  });

  // ---------- actions ----------
  function handleSaveSettings() {
    setDay((d) => ({ ...d, targetStartTime: targetStartTime || null, qrRequired }));
    setNotice(`Saved: shift starts at ${targetStartTime ? fmtMin(hhmmToMin(targetStartTime)) : 'no fixed time'}, QR scan ${qrRequired ? 'required' : 'optional'}.`);
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

  function handleSubmitCorrection(e: FormEvent) {
    e.preventDefault();
    if (!punchEdit || correctionReason.trim().length < 5) return;
    const newIso = new Date(punchEdit.value).toISOString();
    setDay((d) => ({
      ...d,
      employees: d.employees.map((row) => {
        if ((punchEdit.type === 'IN' && row.clockInId === punchEdit.id) || (punchEdit.type === 'OUT' && row.clockOutId === punchEdit.id)) {
          const updated = punchEdit.type === 'IN'
            ? { ...row, clockInAt: newIso, clockInCorrectionReason: correctionReason.trim() }
            : { ...row, clockOutAt: newIso, clockOutCorrectionReason: correctionReason.trim() };
          // Re-check lateness against the shift start, as the server does after a correction
          if (punchEdit.type === 'IN' && targetMin !== null) updated.isLate = (minutesOf(newIso) ?? 0) > targetMin;
          return updated;
        }
        return row;
      }),
    }));
    setPunchEdit(null);
    setNotice(`${punchEdit.type === 'IN' ? 'Clock-in' : 'Clock-out'} corrected for ${punchEdit.employeeName}. The reason is saved in the audit trail.`);
  }

  function exportReport() {
    const header = ['Employee', 'Code', 'Role', 'Location', 'Days present', 'Late days', 'Absent days', 'Attendance %', 'On-time %', 'Hours worked'];
    const rows = reportRows.map((r) => [r.emp.name, r.emp.employeeCode, r.emp.role, location.name, r.presentDays, r.lateDays, r.absentDays, r.rate, r.punctual, (r.workMinutes / 60).toFixed(1)]);
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

  return (
    <div className={styles.page}>
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
            onChange={setLocationId}
          />
          <button type="button" className={styles.ghostButton} onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}><Icon name="settings" size={15} /> Shift &amp; QR</button>
          <button type="button" className={styles.primaryButton} onClick={exportReport}><Icon name="download" size={15} /> Export report</button>
        </div>
      </header>

      {notice && (
        <div className={styles.notice} role="status"><Icon name="check" size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="x" size={14} /></button></div>
      )}

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
          <div className={styles.split}><span>{late.length ? <>avg <b>{avgLate} min</b> after {fmtMin(targetMin)}</> : 'Everyone arrived on time'}</span></div>
        </article>
        <article className={`${styles.summaryCard} ${styles.cardRed}`}>
          <div className={styles.summaryTop}><span>{isToday ? 'Not clocked in' : 'Absent'}</span><i><Icon name="userX" size={16} /></i></div>
          <strong className={styles.summaryValue}>{missing.length}</strong>
          <div className={styles.split}><span>{missing.length ? missing.map((m) => m.emp.name.split(' ')[0]).join(', ') : 'Full team present'}</span></div>
        </article>
        <article className={styles.summaryCard}>
          <div className={styles.summaryTop}><span>Hours worked</span><i><Icon name="hours" size={16} /></i></div>
          <strong className={styles.summaryValue}>{fmtDur(totalWork)}</strong>
          <div className={styles.split}><span>avg clock-in <b>{fmtMin(avgIn)}</b></span></div>
        </article>
      </section>

      {/* ---------- Shift & QR settings (collapsible) ---------- */}
      {settingsOpen && (
        <section className={styles.settings}>
          <div className={styles.settingBlock}>
            <h3><Icon name="clock" size={15} /> Shift start time</h3>
            <p>Clock-ins after this time count as <b>late</b>.</p>
            <div className={styles.inline}>
              <input type="time" value={targetStartTime} onChange={(e) => setTargetStartTime(e.target.value)} aria-label="Shift start time" />
              <label className={styles.switch}><input type="checkbox" checked={qrRequired} onChange={(e) => setQrRequired(e.target.checked)} /><i aria-hidden="true" /><span>Require QR scan to clock in</span></label>
            </div>
            <button type="button" className={styles.primaryButton} onClick={handleSaveSettings}><Icon name="check" size={15} /> Save settings</button>
          </div>
          <div className={styles.qrBlock}>
            {qrImage ? <img src={qrImage} alt={`Clock-in QR code for ${location.name}`} /> : <span className={styles.qrPlaceholder}><Icon name="qr" size={40} /></span>}
            <div>
              <h3><Icon name="qr" size={15} /> Clock-in QR · {location.name}</h3>
              <p>Show this at the counter. Staff scan it with the Attendance page to clock in or out.</p>
              <div className={styles.qrTimer}><span style={{ width: `${(secondsLeft / 60) * 100}%` }} /></div>
              <small>New code in {Math.max(0, secondsLeft - 35)}s · expires in {secondsLeft}s</small>
              <button type="button" className={styles.linkButton} onClick={() => void refreshQr()}><Icon name="refresh" size={13} /> New code now</button>
            </div>
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
                  <span><Icon name="arrowOut" size={13} /> {live?.status === 'WORKING' ? <b className={styles.workingText}>Working</b> : fmtMin(rec.outMin)}{live?.clockOutCorrectionReason ? <em title={`Corrected: ${live.clockOutCorrectionReason}`}>edited</em> : null}</span>
                </span>

                <span className={styles.worked}>{fmtDur(rec.workMin)}{live && !live.qrVerified && live.clockInAt && <small title="Clocked in without scanning the QR code">no QR</small>}</span>

                <span>{statusPill(rec, live)}</span>

                <span className={styles.strip} aria-label="Last 14 days">
                  {strip(emp.id).map((d) => <i key={d.date} className={styles[`cell_${d.status}`]} title={`${prettyDate(d.date, { day: 'numeric', month: 'short' })}: ${STATUS_LABEL[d.status] || 'Upcoming'}${d.inMin !== null ? ` · in ${fmtMin(d.inMin)}` : ''}`} />)}
                </span>

                <span className={styles.rowActions}>
                  <button type="button" className={styles.viewButton} onClick={() => setViewing(emp)}><Icon name="eye" size={14} /> View</button>
                  {live && live.clockInAt && (
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
          <span className={styles.legendNote}>Shift starts {fmtMin(targetMin)} · {day.qrRequired ? 'QR scan required' : 'QR optional'}</span>
        </footer>
      </section>

      {/* ---------- Report ---------- */}
      <section className={styles.reportCard}>
        <div className={styles.reportHead}>
          <div><h2>Attendance report</h2><p>{location.name} · {prettyDate(reportRange.start, { day: 'numeric', month: 'short' })} – {prettyDate(reportRange.end, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
          <div className={styles.reportTools}>
            <div className={styles.segmented} role="group" aria-label="Report period">
              {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map((p) => <button key={p} type="button" className={reportPeriod === p ? styles.segOn : ''} onClick={() => setReportPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
            </div>
            <input type="date" className={styles.dateInput} value={reportDate} max={today} onChange={(e) => e.target.value && setReportDate(e.target.value)} aria-label="Report date" />
            <button type="button" className={styles.iconButton} onClick={exportReport} title="Download CSV" aria-label="Download CSV"><Icon name="download" size={16} /></button>
          </div>
        </div>
        <div className={styles.reportTable}>
          <div className={styles.reportRowHead}><span>Employee</span><span>Attendance</span><span className={styles.num}>Present</span><span className={styles.num}>Late</span><span className={styles.num}>Absent</span><span className={styles.num}>Hours</span></div>
          {reportRows.map((r) => (
            <div key={r.emp.id} className={styles.reportRow}>
              <button type="button" className={styles.person} onClick={() => setViewing(r.emp)}>
                <span className={`${styles.avatar} ${styles.avatarSm} ${styles[`av${Number(r.emp.id.slice(4)) % 5}`]}`}>{initials(r.emp.name)}</span>
                <span><strong>{r.emp.name}</strong><small>{r.emp.role}</small></span>
              </button>
              <span className={styles.rateCell}>
                <span className={styles.rateBar}><i style={{ width: `${r.rate}%` }} className={r.rate >= 90 ? styles.rateGood : r.rate >= 75 ? styles.rateMid : styles.rateBad} /></span>
                <b>{r.rate}%</b>
              </span>
              <span className={styles.num}>{r.presentDays}</span>
              <span className={`${styles.num} ${r.lateDays ? styles.lateText : ''}`}>{r.lateDays}</span>
              <span className={`${styles.num} ${r.absentDays ? styles.absentText : ''}`}>{r.absentDays}</span>
              <span className={styles.num}>{(r.workMinutes / 60).toFixed(1)}</span>
            </div>
          ))}
          {!reportRows.length && <div className={styles.empty}><p>No staff at this location.</p></div>}
        </div>
      </section>

      {/* ---------- Employee attendance view ---------- */}
      {viewing && <EmployeeView emp={viewing} history={histories[viewing.id]} today={today} targetMin={targetMin} live={day.employees.find((r) => r.employee.id === viewing.id) ?? null} location={locations.find((l) => l.id === viewing.locationId)?.name ?? ''} onClose={() => setViewing(null)} onCorrect={beginCorrection} />}

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
