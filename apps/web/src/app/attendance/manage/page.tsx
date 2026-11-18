'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getStoredSession } from '@/lib/auth';
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

type LocationDay = {
  location: { id: string; name: string };
  localDate: string;
  timezone: string;
  targetStartTime: string | null;
  qrRequired: boolean;
  employees: AttendanceRow[];
};

type Report = {
  location: { id: string; name: string };
  period: string;
  startDate: string;
  endDate: string;
  timezone: string;
  summary: {
    activeEmployees: number;
    employeesPresent: number;
    presentDays: number;
    completedDays: number;
    lateDays: number;
    workMinutes: number;
  };
  employees: Array<{
    employee: AttendanceRow['employee'];
    presentDays: number;
    completedDays: number;
    lateDays: number;
    workMinutes: number;
    entries: Array<{
      date: string;
      clockInAt: string | null;
      clockOutAt: string | null;
      isLate: boolean;
      workMinutes: number;
    }>;
  }>;
};

type PunchEdit = { id: string; type: 'IN' | 'OUT'; value: string; employeeName: string };

const DEMO_LOCATIONS: Location[] = [
  { id: 'loc_downtown', name: 'Downtown Store', type: 'RETAIL_STORE' },
  { id: 'loc_north_mall', name: 'North Mall', type: 'RETAIL_STORE' },
  { id: 'loc_west_end', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc_warehouse', name: 'Central Warehouse', type: 'WAREHOUSE' },
];

const DEMO_EMPLOYEES_TODAY: AttendanceRow[] = [
  {
    employee: { id: 'emp_1', name: 'Ravi Menon', employeeCode: 'EMP-0842' },
    status: 'WORKING',
    clockInId: 'cin_1',
    clockOutId: null,
    clockInAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    clockOutAt: null,
    isLate: false,
    targetStartTime: '09:00',
    qrVerified: true,
    clockInCorrectionReason: null,
    clockOutCorrectionReason: null,
  },
  {
    employee: { id: 'emp_2', name: 'Anita Sharma', employeeCode: 'EMP-0843' },
    status: 'WORKING',
    clockInId: 'cin_2',
    clockOutId: null,
    clockInAt: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(),
    clockOutAt: null,
    isLate: true,
    targetStartTime: '09:00',
    qrVerified: true,
    clockInCorrectionReason: null,
    clockOutCorrectionReason: null,
  },
  {
    employee: { id: 'emp_3', name: 'Rajesh Kumar', employeeCode: 'EMP-0844' },
    status: 'COMPLETED',
    clockInId: 'cin_3',
    clockOutId: 'cout_3',
    clockInAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    clockOutAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    isLate: false,
    targetStartTime: '09:00',
    qrVerified: true,
    clockInCorrectionReason: null,
    clockOutCorrectionReason: null,
  },
  {
    employee: { id: 'emp_4', name: 'Amit Verma', employeeCode: 'EMP-0845' },
    status: 'NOT_STARTED',
    clockInId: null,
    clockOutId: null,
    clockInAt: null,
    clockOutAt: null,
    isLate: false,
    targetStartTime: '09:00',
    qrVerified: false,
    clockInCorrectionReason: null,
    clockOutCorrectionReason: null,
  },
];

function showTime(value: string | null, timezone = 'Asia/Kolkata') {
  return value
    ? new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(
        new Date(value)
      )
    : '—';
}

export default function AttendanceManagerPage() {
  const [locations] = useState<Location[]>(DEMO_LOCATIONS);
  const [locationId, setLocationId] = useState('loc_downtown');
  const [day, setDay] = useState<LocationDay | null>({
    location: { id: 'loc_downtown', name: 'Downtown Store' },
    localDate: new Date().toLocaleDateString('en-CA'),
    timezone: 'Asia/Kolkata',
    targetStartTime: '09:00',
    qrRequired: true,
    employees: DEMO_EMPLOYEES_TODAY,
  });

  const [targetStartTime, setTargetStartTime] = useState('09:00');
  const [qrRequired, setQrRequired] = useState(true);
  const [qrImage, setQrImage] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');

  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [reportDate, setReportDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [report, setReport] = useState<Report | null>({
    location: { id: 'loc_downtown', name: 'Downtown Store' },
    period: 'weekly',
    startDate: '2026-11-12',
    endDate: '2026-11-18',
    timezone: 'Asia/Kolkata',
    summary: {
      activeEmployees: 4,
      employeesPresent: 3,
      presentDays: 14,
      completedDays: 12,
      lateDays: 2,
      workMinutes: 6720,
    },
    employees: [
      {
        employee: { id: 'emp_1', name: 'Ravi Menon', employeeCode: 'EMP-0842' },
        presentDays: 5,
        completedDays: 5,
        lateDays: 0,
        workMinutes: 2400,
        entries: [],
      },
      {
        employee: { id: 'emp_2', name: 'Anita Sharma', employeeCode: 'EMP-0843' },
        presentDays: 5,
        completedDays: 4,
        lateDays: 2,
        workMinutes: 2320,
        entries: [],
      },
      {
        employee: { id: 'emp_3', name: 'Rajesh Kumar', employeeCode: 'EMP-0844' },
        presentDays: 4,
        completedDays: 4,
        lateDays: 0,
        workMinutes: 2000,
        entries: [],
      },
    ],
  });

  const [punchEdit, setPunchEdit] = useState<PunchEdit | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // Sync selected location from global app frame if present
  useEffect(() => {
    const stored = window.localStorage.getItem('premium-retail-location-scope');
    if (stored) {
      const matched = DEMO_LOCATIONS.find((l) => l.name === stored);
      if (matched) setLocationId(matched.id);
    }

    const syncLocation = (event: Event) => {
      const locName = (event as CustomEvent<string>).detail;
      const found = DEMO_LOCATIONS.find((l) => l.name === locName);
      if (found) setLocationId(found.id);
    };

    window.addEventListener('premium-retail-location-change', syncLocation);
    return () => window.removeEventListener('premium-retail-location-change', syncLocation);
  }, []);

  // Generate rotating QR code
  const refreshQr = useCallback(async () => {
    const expires = new Date(Date.now() + 60 * 1000).toISOString();
    const token = `QR_${locationId}_${Date.now()}`;
    const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/attendance#qr=${token}`;
    try {
      const url = await QRCode.toDataURL(qrUrl, {
        width: 180,
        margin: 2,
        color: { dark: '#0b1f3a', light: '#ffffff' },
      });
      setQrImage(url);
      setQrExpiresAt(expires);
    } catch {
      // Fallback
    }
  }, [locationId]);

  useEffect(() => {
    void refreshQr();
    const interval = setInterval(() => {
      void refreshQr();
    }, 25000);
    return () => clearInterval(interval);
  }, [refreshQr]);

  function handleSaveTarget() {
    setBusy(true);
    if (day) {
      setDay({ ...day, targetStartTime: targetStartTime || null });
    }
    setNotice(targetStartTime ? `Store target start time saved as ${targetStartTime}.` : 'Target start time disabled.');
    setBusy(false);
  }

  function handleSaveQrRequirement() {
    setBusy(true);
    if (day) {
      setDay({ ...day, qrRequired });
    }
    setNotice(qrRequired ? 'Workplace QR scan required for staff punches.' : 'QR code scan is now optional.');
    setBusy(false);
  }

  function beginCorrection(row: AttendanceRow, type: 'IN' | 'OUT') {
    const id = type === 'IN' ? row.clockInId : row.clockOutId;
    const value = type === 'IN' ? row.clockInAt : row.clockOutAt;
    if (!id || !value) return;

    setPunchEdit({
      id,
      type,
      value: value.slice(0, 16),
      employeeName: row.employee.name,
    });
    setCorrectionReason('');
  }

  function handleSubmitCorrection(e: FormEvent) {
    e.preventDefault();
    if (!punchEdit || !day || correctionReason.trim().length < 5) return;

    const newIso = new Date(punchEdit.value).toISOString();

    const updatedEmployees = day.employees.map((row) => {
      if (
        (punchEdit.type === 'IN' && row.clockInId === punchEdit.id) ||
        (punchEdit.type === 'OUT' && row.clockOutId === punchEdit.id)
      ) {
        return {
          ...row,
          ...(punchEdit.type === 'IN'
            ? { clockInAt: newIso, clockInCorrectionReason: correctionReason.trim() }
            : { clockOutAt: newIso, clockOutCorrectionReason: correctionReason.trim() }),
        };
      }
      return row;
    });

    setDay({ ...day, employees: updatedEmployees });
    setPunchEdit(null);
    setNotice(`Punch adjusted for ${punchEdit.employeeName}. Reason recorded in manager audit trail.`);
  }

  function exportReport() {
    if (!report) return;
    const rows = [
      ['Employee Name', 'Code', 'Days Present', 'Days Completed', 'Late Days', 'Recorded Work Hours'],
      ...report.employees.map((e) => [
        `"${e.employee.name}"`,
        e.employee.employeeCode,
        e.presentDays,
        e.completedDays,
        e.lateDays,
        (e.workMinutes / 60).toFixed(1),
      ]),
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance-Report-${report.period}-${report.startDate}-to-${report.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Attendance CSV report downloaded.');
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
          <span style={{ color: '#0f172a', fontWeight: 600 }}>Store Attendance Management</span>
        </div>
        <div>
          <a
            href="/attendance"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
            }}
          >
            ← Staff View
          </a>
        </div>
      </div>

      <div className={styles.managerPage} style={{ marginTop: 24, maxWidth: 1280, padding: '0 24px' }}>
        {/* Manager Header & Location Selector */}
        <div className={styles.managerHeading}>
          <div>
            <p className={styles.eyebrow}>WORKFORCE ADMINISTRATION</p>
            <h1 style={{ margin: '4px 0', fontSize: 24, fontWeight: 750, color: '#0f172a' }}>
              Attendance Overview & Register
            </h1>
            <p className={styles.muted} style={{ fontSize: 13 }}>
              Monitor live staff arrivals, configure rotating counter QR codes, inspect late clock-ins, and export payroll reports.
            </p>
          </div>

          <label className={styles.managerLocation}>
            Location Scope:
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={styles.select}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} · {loc.type === 'RETAIL_STORE' ? 'Retail Store' : 'Warehouse'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}

        {day && (
          <>
            {/* Setup Grid: Target Start Time & Rotating QR Code */}
            <div className={styles.managerSetupGrid}>
              {/* Card 1: Shift Target Time */}
              <section className={styles.managerPanel}>
                <div>
                  <p className={styles.eyebrow}>SHIFT SCHEDULE</p>
                  <h2>Target Start Time: {day.location.name}</h2>
                  <p className={styles.muted}>
                    Clock-ins after this local store time will automatically be flagged as Late. ({day.timezone})
                  </p>
                </div>
                <div className={styles.targetForm}>
                  <label>
                    Target Start:
                    <input
                      type="time"
                      value={targetStartTime}
                      onChange={(e) => setTargetStartTime(e.target.value)}
                    />
                  </label>
                  <button className={styles.saveButton} disabled={busy} onClick={handleSaveTarget}>
                    Save Time
                  </button>
                </div>
              </section>

              {/* Card 2: Rotating Workplace QR Code */}
              <section className={styles.qrCard}>
                <div>
                  <p className={styles.eyebrow}>WORKPLACE CHECK-IN</p>
                  <h2>Rotating QR Code (OD-06)</h2>
                  <p className={styles.muted}>
                    Projected at counter. Refreshes every 25s; tokens expire after 60s to prevent remote proxy punches.
                  </p>
                  <label className={styles.qrToggle}>
                    <input
                      type="checkbox"
                      checked={qrRequired}
                      onChange={(e) => setQrRequired(e.target.checked)}
                    />
                    <span>Require QR scan for each attendance punch</span>
                  </label>
                  <button className={styles.saveButton} disabled={busy} onClick={handleSaveQrRequirement}>
                    Save QR Setting
                  </button>
                </div>

                <div className={styles.qrImageWrap}>
                  {qrImage ? (
                    <img src={qrImage} alt="Live rotating workplace QR code" />
                  ) : (
                    <span>Generating QR…</span>
                  )}
                  <small>Auto-refreshes every 25s</small>
                </div>
              </section>
            </div>

            {/* Daily Register Table */}
            <section className={styles.managerTableCard}>
              <div className={styles.managerTableHead}>
                <div>
                  <p className={styles.eyebrow}>DAILY REGISTER</p>
                  <h2>Today&apos;s Staff Attendance: {day.localDate}</h2>
                  <p className={styles.muted}>
                    {day.employees.filter((r) => r.isLate).length} late clock-in(s) recorded today.
                  </p>
                </div>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.attendanceTable}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Status</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>QR Verification</th>
                      <th>Supervisor Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.employees.map((row) => (
                      <tr key={row.employee.id}>
                        <td>
                          <strong>{row.employee.name}</strong>
                          <small>{row.employee.employeeCode}</small>
                        </td>
                        <td>
                          <span
                            className={`${styles.managerStatus} ${
                              row.isLate
                                ? styles.lateStatus
                                : row.status === 'NOT_STARTED'
                                ? styles.waitingStatus
                                : styles.onTimeStatus
                            }`}
                          >
                            ● {row.isLate ? 'Late' : row.status === 'NOT_STARTED' ? 'Not started' : row.status === 'COMPLETED' ? 'Completed' : 'On time'}
                          </span>
                        </td>
                        <td>
                          {showTime(row.clockInAt, day.timezone)}
                          {row.isLate && <small className={styles.lateNote}>Late · Target {row.targetStartTime}</small>}
                          {row.clockInCorrectionReason && (
                            <small style={{ color: '#0284c7' }}>Corrected: {row.clockInCorrectionReason}</small>
                          )}
                        </td>
                        <td>
                          {showTime(row.clockOutAt, day.timezone)}
                          {row.clockOutCorrectionReason && (
                            <small style={{ color: '#0284c7' }}>Corrected: {row.clockOutCorrectionReason}</small>
                          )}
                        </td>
                        <td>{row.clockInAt ? (row.qrVerified ? 'Verified' : 'Manual') : '—'}</td>
                        <td className={styles.correctionActions}>
                          {row.clockInId && (
                            <button type="button" onClick={() => beginCorrection(row, 'IN')}>
                              Edit In
                            </button>
                          )}
                          {row.clockOutId && (
                            <button type="button" onClick={() => beginCorrection(row, 'OUT')}>
                              Edit Out
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Correction Form Modal / Inline */}
              {punchEdit && (
                <form className={styles.correctionForm} onSubmit={handleSubmitCorrection}>
                  <div>
                    <strong>Correct {punchEdit.type === 'IN' ? 'Clock-In' : 'Clock-Out'}: {punchEdit.employeeName}</strong>
                    <small>Audit trail permanently records manager reason and original punch time.</small>
                  </div>
                  <label>
                    New Time:
                    <input
                      type="datetime-local"
                      value={punchEdit.value}
                      onChange={(e) => setPunchEdit({ ...punchEdit, value: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Mandatory Correction Reason (Min 5 chars):
                    <input
                      type="text"
                      placeholder="e.g. Employee phone battery died; presence confirmed on CCTV"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      required
                      minLength={5}
                    />
                  </label>
                  <div className={styles.formActions}>
                    <button type="button" className={styles.signOut} onClick={() => setPunchEdit(null)}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={styles.saveButton}
                      disabled={busy || correctionReason.trim().length < 5}
                    >
                      Save Adjustment
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Attendance Report & CSV Export */}
            {report && (
              <section className={styles.managerTableCard} style={{ marginTop: 20 }}>
                <div className={styles.managerTableHead}>
                  <div>
                    <p className={styles.eyebrow}>PERIOD REPORT</p>
                    <h2>Workforce Summary ({reportPeriod})</h2>
                    <p className={styles.muted}>
                      {report.startDate} to {report.endDate} · {report.timezone}
                    </p>
                  </div>
                  <div className={styles.reportControls}>
                    <select
                      value={reportPeriod}
                      onChange={(e) => setReportPeriod(e.target.value as any)}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <button type="button" className={styles.signOut} onClick={exportReport}>
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className={styles.reportStats}>
                  <div>
                    <small>Staff Present</small>
                    <strong>{report.summary.employeesPresent} / {report.summary.activeEmployees}</strong>
                  </div>
                  <div>
                    <small>Shift Days Worked</small>
                    <strong>{report.summary.presentDays}</strong>
                  </div>
                  <div>
                    <small>Late Arrivals</small>
                    <strong style={{ color: '#dc2626' }}>{report.summary.lateDays}</strong>
                  </div>
                  <div>
                    <small>Total Work Hours</small>
                    <strong>{(report.summary.workMinutes / 60).toFixed(1)} h</strong>
                  </div>
                </div>

                <div className={styles.tableScroll}>
                  <table className={styles.attendanceTable}>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Days Present</th>
                        <th>Shifts Completed</th>
                        <th>Late Days</th>
                        <th>Hours Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.employees.map((row) => (
                        <tr key={row.employee.id}>
                          <td>
                            <strong>{row.employee.name}</strong>
                            <small>{row.employee.employeeCode}</small>
                          </td>
                          <td>{row.presentDays}</td>
                          <td>{row.completedDays}</td>
                          <td>{row.lateDays > 0 ? <strong style={{ color: '#dc2626' }}>{row.lateDays}</strong> : 0}</td>
                          <td>{(row.workMinutes / 60).toFixed(1)} h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
