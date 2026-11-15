import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';

describe('AttendanceService basic daily punches', () => {
  afterEach(() => jest.useRealTimers());
  const actor = { userId: 'user-id', email: 'staff@example.test', role: Role.SUPER_ADMIN, locationIds: [] };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-qr-token'),
    decode: jest.fn().mockReturnValue({ exp: 1_800_000_060 }),
    verifyAsync: jest.fn().mockResolvedValue({ purpose: 'attendance-check-in', locationId: 'location-id' }),
  };
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
    return { service: new AttendanceService(prisma as any, jwt as any), prisma, tx };
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

  it('does not allow another punch after the daily OUT punch', async () => {
    const { service, tx } = setup([{ id: 'out', punchType: 'OUT', punchTimestamp: new Date() }]);
    await expect(service.punch(actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.attendance.create).not.toHaveBeenCalled();
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
    const result = await new AttendanceService(prisma as any, jwt as any).getLocationAttendanceToday('location-id', manager);
    expect(result.employees[0]).toEqual(expect.objectContaining({ isLate: true, clockInAt, targetStartTime: '09:30' }));
  });

  it('blocks managers from viewing attendance outside their location scope', async () => {
    const prisma = { location: { findUnique: jest.fn() }, employee: { findMany: jest.fn() } };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['another-location'] };
    await expect(new AttendanceService(prisma as any, jwt as any).getLocationAttendanceToday('location-id', manager)).rejects.toBeInstanceOf(ForbiddenException);
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
    const result = await new AttendanceService(prisma as any, jwt as any).setLocationTargetStartTime('location-id', '09:00', manager);
    expect(result.attendanceStartTime).toBe('09:00');
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ATTENDANCE_START_TIME_UPDATED', targetId: 'location-id' }) }));
  });

  it('issues a signed workplace QR that expires after one minute', async () => {
    const prisma = { location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', name: 'Store' }) } };
    const manager = { ...actor, role: Role.STORE_MANAGER, locationIds: ['location-id'] };
    const result = await new AttendanceService(prisma as any, jwt as any).issueLocationQr('location-id', manager);
    expect(result.token).toBe('signed-qr-token');
    expect(result.rotationSeconds).toBe(60);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'location-id' }), expect.objectContaining({ expiresIn: 60, audience: 'attendance-qr' }));
  });

  it('requires a QR and stores a valid matching location scan', async () => {
    const qrEmployee = { ...employee, location: { ...employee.location, attendanceQrRequired: true } };
    const { service, tx } = setup([], qrEmployee);
    const result = await service.punch(actor, 'signed-qr-token');
    expect(result.punch.qrVerified).toBe(true);
    expect(tx.attendance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ qrVerified: true }) }));
    jwt.verifyAsync.mockResolvedValueOnce({ purpose: 'attendance-check-in', locationId: 'other-location' });
    await expect(service.punch(actor, 'wrong-location-token')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a required punch without a QR scan', async () => {
    const qrEmployee = { ...employee, location: { ...employee.location, attendanceQrRequired: true } };
    const { service, tx } = setup([], qrEmployee);
    await expect(service.punch(actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.attendance.create).not.toHaveBeenCalled();
  });

  it('corrects a punch with reason while keeping the original timestamp in the audit trail', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    const original = new Date('2026-11-15T03:00:00.000Z');
    const corrected = new Date('2026-11-15T03:15:00.000Z');
    const tx = {
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
    const result = await new AttendanceService(prisma as any, jwt as any).correctPunch('punch-id', corrected.toISOString(), 'Manager approved correction', manager);
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
    const result = await new AttendanceService(prisma as any, jwt as any).getReport('location-id', 'daily', '2026-11-15', manager);
    expect(result.summary).toEqual(expect.objectContaining({ employeesPresent: 1, completedDays: 1, lateDays: 1, workMinutes: 540 }));
    expect(result.employees[0].entries[0].date).toBe('2026-11-15');
  });
});
