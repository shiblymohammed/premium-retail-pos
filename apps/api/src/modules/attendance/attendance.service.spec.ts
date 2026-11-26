import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AttendanceService, attendanceDay, shiftMetrics } from './attendance.service';

describe('AttendanceService basic daily punches', () => {
  afterEach(() => jest.useRealTimers());
  const actor = { userId: 'user-id', email: 'staff@example.test', role: Role.SUPER_ADMIN, locationIds: [] };
  const employee = {
    id: 'employee-id', firstName: 'Taylor', lastName: 'Staff', employeeCode: 'EMP-1', isActive: true, locationId: 'location-id',
    user: { isActive: true }, location: { id: 'location-id', name: 'Store', isActive: true, attendanceStartTime: null, company: { timezone: 'Asia/Kolkata' } },
  };

  function setup(todayPunches: Array<{ id: string; punchType: string; punchTimestamp: Date }> = [], employeeContext = employee) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: employee.id }]),
      employee: { findUnique: jest.fn().mockResolvedValue(employeeContext) },
      attendance: {
        findMany: jest.fn().mockResolvedValue(todayPunches),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'punch-id', ...data })),
      },
    };
    const prisma = {
      employee: { findUnique: jest.fn().mockResolvedValue(employee) },
      attendance: tx.attendance,
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    return { service: new AttendanceService(prisma as any), prisma, tx };
  }

  it('starts a workday with a server-timestamped IN punch', async () => {
    const { service, tx } = setup();
    const result = await service.punch(actor);
    expect(result.punch.punchType).toBe('IN');
    expect(result.status).toBe('WORKING');
    expect(result.punch.punchTimestamp).toBeInstanceOf(Date);
    expect(tx.attendance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ employeeId: employee.id, locationId: employee.locationId, punchType: 'IN' }) }));
  });

  it('marks a clock-in late after the location target and snapshots the target', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T04:00:01.000Z')); // 09:30:01 at the test location
    const scheduledEmployee = { ...employee, location: { ...employee.location, attendanceStartTime: '09:30' } };
    const { service, tx } = setup([], scheduledEmployee);
    const result = await service.punch(actor);
    expect(result.punch).toEqual(expect.objectContaining({ isLate: true, targetStartTime: '09:30' }));
    expect(tx.attendance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isLate: true, targetStartTime: '09:30' }) }));
  });

  it('does not mark a clock-in late exactly at the location target', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T04:00:00.000Z')); // 09:30 at the test location
    const scheduledEmployee = { ...employee, location: { ...employee.location, attendanceStartTime: '09:30' } };
    const { service } = setup([], scheduledEmployee);
    const result = await service.punch(actor);
    expect(result.punch).toEqual(expect.objectContaining({ isLate: false, targetStartTime: '09:30' }));
  });

  it('records OUT after an IN punch', async () => {
    const { service } = setup([{ id: 'in', punchType: 'IN', punchTimestamp: new Date() }]);
    const result = await service.punch(actor);
    expect(result.punch.punchType).toBe('OUT');
    expect(result.status).toBe('COMPLETED');
  });

  it('requires an explicit clock-in to resume after a daily OUT punch', async () => {
    const { service, tx } = setup([{ id: 'out', punchType: 'OUT', punchTimestamp: new Date() }]);
    await expect(service.punch(actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.attendance.create).not.toHaveBeenCalled();
  });

  it('continues a shift after workplace midnight and keeps its overtime on the start date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T21:30:00Z')); // 03:00 local on Nov 16
    const clockIn = {
      id: 'overnight-in', punchType: 'IN', punchTimestamp: new Date('2026-11-15T16:30:00Z'),
      scheduledEndAt: new Date('2026-11-15T20:30:00Z'),
      breaks: [{ startedAt: new Date('2026-11-15T19:00:00Z'), endedAt: new Date('2026-11-15T19:30:00Z') }],
    };
    const { service, tx } = setup([clockIn]);
    await expect(service.getToday(actor)).resolves.toMatchObject({ status: 'WORKING', nextAction: 'OUT' });
    await expect(service.punch(actor, 'OUT')).resolves.toMatchObject({ workMinutes: 270, breakMinutes: 30, overtimeMinutes: 60 });
    const clockOut = { id: 'overnight-out', punchType: 'OUT', punchTimestamp: new Date() };
    tx.attendance.findMany.mockResolvedValue([clockIn, clockOut]);
    const history = await service.getMyHistory(actor);
    expect(history.days.find((day) => day.date === '2026-11-15')).toMatchObject({ clockOutAt: clockOut.punchTimestamp, workMinutes: 270, overtimeMinutes: 60 });
    expect(history.days.find((day) => day.date === '2026-11-16')).toMatchObject({ status: 'off', workMinutes: 0 });
  });

  it('saves the scheduled end on the following date for an overnight schedule', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T16:30:00Z')); // 22:00 local
    const scheduled = { ...employee, location: { ...employee.location, attendanceStartTime: '22:00', attendanceEndTime: '02:00' } };
    const { service } = setup([], scheduled);
    await expect(service.punch(actor, 'IN')).resolves.toMatchObject({
      punch: { scheduledEndAt: new Date('2026-11-15T20:30:00Z'), isLate: false },
    });
  });

  it('clocks back in without recording a second late arrival', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T09:00:00Z'));
    const { service, tx } = setup([
      { id: 'in', punchType: 'IN', punchTimestamp: new Date('2026-11-15T03:30:00Z') },
      { id: 'out', punchType: 'OUT', punchTimestamp: new Date('2026-11-15T07:30:00Z') },
    ]);
    await expect(service.punch(actor, 'IN')).resolves.toMatchObject({
      nextAction: 'OUT', status: 'WORKING', workMinutes: 240, earlyMinutes: 0,
    });
    expect(tx.attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ punchType: 'IN', isLate: false, targetStartTime: null }),
    }));
  });

  it('adds worked intervals, deducts breaks and excludes the same-day time away', () => {
    const time = (time: string) => new Date(`2026-11-15T${time}Z`);
    const scheduledEndAt = time('18:00:00');
    const day = attendanceDay([
      { punchType: 'IN', punchTimestamp: time('09:00:00'), scheduledEndAt,
        breaks: [{ startedAt: time('10:00:00'), endedAt: time('10:15:00') }] },
      { punchType: 'OUT', punchTimestamp: time('12:00:00') },
      { punchType: 'IN', punchTimestamp: time('14:00:00'), scheduledEndAt,
        breaks: [{ startedAt: time('18:05:00'), endedAt: time('18:15:00') }] },
      { punchType: 'OUT', punchTimestamp: time('18:30:00') },
    ]);
    expect(day).toMatchObject({ workMinutes: 425, breakMinutes: 25, overtimeMinutes: 20, earlyMinutes: 0 });
    expect(day.clockOut?.punchTimestamp).toEqual(time('18:30:00'));
  });

  it('requires the employee account to have access to the assigned workplace', async () => {
    const { service } = setup();
    await expect(service.getToday({ ...actor, role: Role.STAFF, locationIds: [] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows the saved late status and clock-in time in the scoped manager register', async () => {
    const clockInAt = new Date('2026-11-15T04:15:00.000Z');
    const prisma = {
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store', attendanceStartTime: '09:30', company: { timezone: 'Asia/Kolkata' } }) },
      employee: { findMany: jest.fn().mockResolvedValue([{
        id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName,
        attendances: [{ id: 'late-in', punchType: 'IN', punchTimestamp: clockInAt, isLate: true, targetStartTime: '09:30' }],
      }]) },
    };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['location-id'] };
    const result = await new AttendanceService(prisma as any).getLocationAttendanceToday('location-id', manager);
    expect(result.employees[0]).toEqual(expect.objectContaining({ isLate: true, clockInAt, targetStartTime: '09:30' }));
  });

  it('blocks managers from viewing attendance outside their location scope', async () => {
    const prisma = { location: { findUnique: jest.fn() }, employee: { findMany: jest.fn() } };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['another-location'] };
    await expect(new AttendanceService(prisma as any).getLocationAttendanceToday('location-id', manager)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
  });

  it('saves a scoped location target and audits the change', async () => {
    const tx = {
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store', attendanceStartTime: null }),
        update: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store', attendanceStartTime: '09:00' }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'event-id' }) },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['location-id'] };
    const result = await new AttendanceService(prisma as any).setLocationTargetStartTime('location-id', '09:00', manager);
    expect(result.attendanceStartTime).toBe('09:00');
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ATTENDANCE_START_TIME_UPDATED', targetId: 'location-id' }) }));
  });

  it('records attendance at locations with the old QR requirement enabled', async () => {
    const legacyEmployee = { ...employee, location: { ...employee.location, attendanceQrRequired: true } };
    const { service } = setup([], legacyEmployee);
    const result = await service.punch(actor);
    expect(result.punch.punchType).toBe('IN');
  });

  it('corrects a punch with reason while keeping the original timestamp in the audit trail', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    const original = new Date('2026-11-15T03:00:00.000Z');
    const corrected = new Date('2026-11-15T03:15:00.000Z');
    const tx = {
      $queryRaw: jest.fn(),
      attendance: {
        findUnique: jest.fn().mockResolvedValue({ id: 'punch-id', employeeId: employee.id, locationId: employee.locationId, punchType: 'IN', punchTimestamp: original, originalTimestamp: null, targetStartTime: '08:30', isLate: false, employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, employeeCode: employee.employeeCode } }),
        findMany: jest.fn().mockResolvedValue([{ id: 'punch-id', punchType: 'IN', punchTimestamp: original }]),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'punch-id', punchType: 'IN', ...data })),
      },
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store', company: { timezone: 'Asia/Kolkata' } }) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'event-id' }) },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['location-id'] };
    const result = await new AttendanceService(prisma as any).correctPunch('punch-id', corrected.toISOString(), 'Manager approved correction', manager);
    expect(result.punch.originalTimestamp).toEqual(original);
    expect(result.punch.punchTimestamp).toEqual(corrected);
    expect(result.punch.isLate).toBe(true);
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ATTENDANCE_PUNCH_CORRECTED', reason: 'Manager approved correction' }) }));
  });

  it('builds a local-date report with late and worked-time totals', async () => {
    const clockIn = new Date('2026-11-15T03:30:00.000Z');
    const clockOut = new Date('2026-11-15T12:30:00.000Z');
    const prisma = {
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store', company: { timezone: 'Asia/Kolkata' } }) },
      employee: { findMany: jest.fn().mockResolvedValue([{
        id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName,
        attendances: [
          { id: 'in', punchType: 'IN', punchTimestamp: clockIn, isLate: true, targetStartTime: '09:00' },
          { id: 'out', punchType: 'OUT', punchTimestamp: clockOut, isLate: false, targetStartTime: null },
        ],
      }]) },
    };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['location-id'] };
    const result = await new AttendanceService(prisma as any).getReport('location-id', 'daily', '2026-11-15', manager);
    expect(result.summary).toEqual(expect.objectContaining({ employeesPresent: 1, completedDays: 1, lateDays: 1, workMinutes: 540 }));
    expect(result.employees[0].entries[0].date).toBe('2026-11-15');
  });
});

describe('shift metrics', () => {
  const at = (time: string) => new Date(`2026-11-25T${time}:00Z`);

  it('counts only worked minutes after the scheduled end as overtime', () => {
    const shift = {
      punchTimestamp: at('09:00'), scheduledEndAt: at('17:00'),
      breaks: [{ startedAt: at('12:00'), endedAt: at('12:30') }, { startedAt: at('16:50'), endedAt: at('17:10') }],
    };
    expect(shiftMetrics(shift, at('17:40'))).toEqual({
      workMinutes: 470, breakMinutes: 50, overtimeMinutes: 30, earlyMinutes: 0, onBreak: false,
    });
  });

  it('flags an early check-out from the saved scheduled end and stops time on an open break', () => {
    const shift = { punchTimestamp: at('09:00'), scheduledEndAt: at('17:00') };
    expect(shiftMetrics(shift, at('16:50'))).toMatchObject({ earlyMinutes: 10, overtimeMinutes: 0 });
    expect(shiftMetrics({ ...shift, breaks: [{ startedAt: at('12:00'), endedAt: null }] }, null, at('12:30')))
      .toMatchObject({ workMinutes: 180, breakMinutes: 30, overtimeMinutes: 0, onBreak: true });
  });
});
