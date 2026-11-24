import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';

type EmployeeContext = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  isActive: boolean;
  locationId: string;
  user: { isActive: boolean };
  location: { id: string; name: string; isActive: boolean; attendanceStartTime: string | null; company: { timezone: string } };
};

const MANAGERS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(actor: RequestUser) {
    const employee = await this.employeeFor(actor);
    const { start, end } = localDayRange(new Date(), employee.location.company.timezone);
    const punches = await this.prisma.attendance.findMany({
      where: { employeeId: employee.id, punchTimestamp: { gte: start, lt: end } },
      select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, originalTimestamp: true, correctionReason: true },
      orderBy: { punchTimestamp: 'asc' },
    });
    const last = punches.at(-1);
    const status = !last ? 'NOT_STARTED' : last.punchType === 'IN' ? 'WORKING' : 'COMPLETED';
    return {
      employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
      location: { id: employee.location.id, name: employee.location.name },
      localDate: new Intl.DateTimeFormat('en-CA', { timeZone: employee.location.company.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      timezone: employee.location.company.timezone,
      targetStartTime: employee.location.attendanceStartTime,
      status,
      nextAction: status === 'WORKING' ? 'OUT' : status === 'NOT_STARTED' ? 'IN' : null,
      punches,
    };
  }

  async getMyHistory(actor: RequestUser) {
    const employee = await this.employeeFor(actor);
    const now = new Date();
    const today = localDateKey(now, employee.location.company.timezone);
    const [year, month, day] = today.split('-').map(Number);
    const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
    const firstDay = new Date(Date.UTC(year, month - 1, day - weekday - 175));
    const startDate = localDateKey(firstDay, 'UTC');
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    const [endYear, endMonth, endDay] = [tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()];
    const start = localMidnightUtc(startYear, startMonth, startDay, employee.location.company.timezone);
    const end = localMidnightUtc(endYear, endMonth, endDay, employee.location.company.timezone);
    const punches = await this.prisma.attendance.findMany({
      where: { employeeId: employee.id, punchTimestamp: { gte: start, lt: end } },
      select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, originalTimestamp: true, correctionReason: true },
      orderBy: { punchTimestamp: 'asc' },
    });
    const byDay = new Map<string, typeof punches>();
    for (const punch of punches) {
      const key = localDateKey(punch.punchTimestamp, employee.location.company.timezone);
      byDay.set(key, [...(byDay.get(key) ?? []), punch]);
    }
    const days = Array.from({ length: 176 + weekday }, (_, index) => {
      const date = new Date(Date.UTC(startYear, startMonth - 1, startDay + index));
      const dateKey = localDateKey(date, 'UTC');
      const dayPunches = byDay.get(dateKey) ?? [];
      const clockIn = dayPunches.find((punch) => punch.punchType === 'IN') ?? null;
      const clockOut = dayPunches.find((punch) => punch.punchType === 'OUT') ?? null;
      const durationEnd = clockOut?.punchTimestamp ?? (dateKey === today && clockIn ? now : null);
      const workMinutes = clockIn && durationEnd ? Math.max(0, Math.floor((durationEnd.getTime() - clockIn.punchTimestamp.getTime()) / 60_000)) : 0;
      return {
        date: dateKey,
        status: !clockIn ? 'off' : clockIn.isLate ? 'late' : 'present',
        clockInAt: clockIn?.punchTimestamp ?? null,
        clockOutAt: clockOut?.punchTimestamp ?? null,
        isLate: clockIn?.isLate ?? false,
        workMinutes,
      };
    });
    return { employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode }, location: { id: employee.location.id, name: employee.location.name }, timezone: employee.location.company.timezone, days };
  }

  async punch(actor: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "employees" WHERE "user_id" = ${actor.userId} FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('No employee profile is linked to this account');
      const employee = await tx.employee.findUnique({
        where: { id: locked[0].id },
        include: { user: { select: { isActive: true } }, location: { include: { company: { select: { timezone: true } } } } },
      }) as EmployeeContext | null;
      if (!employee || !employee.isActive || !employee.user.isActive) throw new ForbiddenException('This employee profile is inactive');
      if (!employee.location.isActive) throw new ForbiddenException('The assigned workplace is inactive');
      if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(employee.locationId)) throw new ForbiddenException('You are not authorized to mark attendance for this workplace');

      const now = new Date();
      const { start, end } = localDayRange(now, employee.location.company.timezone);
      const punches = await tx.attendance.findMany({
        where: { employeeId: employee.id, punchTimestamp: { gte: start, lt: end } },
        select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, originalTimestamp: true, correctionReason: true },
        orderBy: { punchTimestamp: 'asc' },
      });
      const last = punches.at(-1);
      if (last?.punchType === 'OUT') throw new ConflictException('Your attendance is already complete for today');
      const punchType = last?.punchType === 'IN' ? 'OUT' : 'IN';
      const targetStartTime = punchType === 'IN' ? employee.location.attendanceStartTime ?? null : null;
      const isLate = punchType === 'IN' && targetStartTime !== null && isAfterLocalTarget(now, targetStartTime, employee.location.company.timezone);
      const punch = await tx.attendance.create({
        data: { employeeId: employee.id, locationId: employee.locationId, punchType, punchTimestamp: now, isLate, targetStartTime },
        select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true },
      });
      return {
        employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
        location: { id: employee.location.id, name: employee.location.name },
        punch,
        status: punchType === 'IN' ? 'WORKING' : 'COMPLETED',
        nextAction: punchType === 'IN' ? 'OUT' : null,
      };
    });
  }

  async getLocationAttendanceToday(locationId: string, actor: RequestUser) {
    this.assertManager(actor);
    this.assertLocationScope(locationId, actor);
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { company: { select: { timezone: true } } },
    });
    if (!location) throw new NotFoundException('Location not found');
    const now = new Date();
    const { start, end } = localDayRange(now, location.company.timezone);
    const employees = await this.prisma.employee.findMany({
      where: { locationId, isActive: true, user: { isActive: true } },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        attendances: {
          where: { punchTimestamp: { gte: start, lt: end } },
          select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, originalTimestamp: true, correctionReason: true },
          orderBy: { punchTimestamp: 'asc' },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: location.company.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return {
      location: { id: location.id, name: location.name },
      localDate,
      timezone: location.company.timezone,
      targetStartTime: location.attendanceStartTime,
      employees: employees.map((employee) => {
        const clockIn = employee.attendances.find((punch) => punch.punchType === 'IN') ?? null;
        const clockOut = employee.attendances.find((punch) => punch.punchType === 'OUT') ?? null;
        return {
          employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
          status: clockOut ? 'COMPLETED' : clockIn ? 'WORKING' : 'NOT_STARTED',
          clockInId: clockIn?.id ?? null,
          clockOutId: clockOut?.id ?? null,
          clockInAt: clockIn?.punchTimestamp ?? null,
          clockOutAt: clockOut?.punchTimestamp ?? null,
          isLate: clockIn?.isLate ?? false,
          targetStartTime: clockIn?.targetStartTime ?? location.attendanceStartTime,
          clockInCorrectionReason: clockIn?.correctionReason ?? null,
          clockOutCorrectionReason: clockOut?.correctionReason ?? null,
        };
      }),
    };
  }

  async getLocationTargetStartTime(locationId: string, actor: RequestUser) {
    this.assertManager(actor);
    this.assertLocationScope(locationId, actor);
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, attendanceStartTime: true } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async setLocationTargetStartTime(locationId: string, startTime: string | null, actor: RequestUser) {
    this.assertManager(actor);
    this.assertLocationScope(locationId, actor);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, attendanceStartTime: true } });
      if (!location) throw new NotFoundException('Location not found');
      const updated = await tx.location.update({ where: { id: locationId }, data: { attendanceStartTime: startTime }, select: { id: true, name: true, attendanceStartTime: true } });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId,
        action: 'ATTENDANCE_START_TIME_UPDATED',
        targetEntity: 'Location',
        targetId: locationId,
        beforeValue: JSON.stringify({ attendanceStartTime: location.attendanceStartTime }),
        afterValue: JSON.stringify({ attendanceStartTime: startTime }),
      } });
      return updated;
    });
  }

  async correctPunch(attendanceId: string, timestamp: string, reason: string, actor: RequestUser) {
    this.assertManager(actor);
    const correctedAt = new Date(timestamp);
    if (!Number.isFinite(correctedAt.getTime()) || correctedAt > new Date()) throw new BadRequestException('Corrected attendance time must be a valid time in the past');
    return this.prisma.$transaction(async (tx) => {
      const punch = await tx.attendance.findUnique({
        where: { id: attendanceId },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
      });
      if (!punch) throw new NotFoundException('Attendance punch not found');
      this.assertLocationScope(punch.locationId, actor);
      const location = await tx.location.findUnique({ where: { id: punch.locationId }, include: { company: { select: { timezone: true } } } });
      if (!location) throw new NotFoundException('Punch location not found');
      const originalLocalDate = localDateKey(punch.punchTimestamp, location.company.timezone);
      if (localDateKey(correctedAt, location.company.timezone) !== originalLocalDate) {
        throw new BadRequestException('A punch correction must stay on its original workplace-local date');
      }
      const range = localDayRange(punch.punchTimestamp, location.company.timezone);
      const dayPunches = await tx.attendance.findMany({
        where: { employeeId: punch.employeeId, locationId: punch.locationId, punchTimestamp: { gte: range.start, lt: range.end } },
        select: { id: true, punchType: true, punchTimestamp: true },
        orderBy: { punchTimestamp: 'asc' },
      });
      const timeline = dayPunches.map((item) => ({ ...item, punchTimestamp: item.id === attendanceId ? correctedAt : item.punchTimestamp })).sort((a, b) => a.punchTimestamp.getTime() - b.punchTimestamp.getTime());
      if (timeline.length > 2 || timeline.some((item, index) => item.punchType !== (index % 2 === 0 ? 'IN' : 'OUT'))) {
        throw new ConflictException('This correction would make the daily IN/OUT order invalid');
      }
      const targetStartTime = punch.targetStartTime;
      const isLate = punch.punchType === 'IN' && targetStartTime !== null && isAfterLocalTarget(correctedAt, targetStartTime, location.company.timezone);
      const updated = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          punchTimestamp: correctedAt,
          originalTimestamp: punch.originalTimestamp ?? punch.punchTimestamp,
          correctedByUserId: actor.userId,
          correctionReason: reason.trim(),
          isLate,
        },
        select: { id: true, punchType: true, punchTimestamp: true, originalTimestamp: true, correctionReason: true, correctedByUserId: true, isLate: true, targetStartTime: true },
      });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId,
        action: 'ATTENDANCE_PUNCH_CORRECTED',
        targetEntity: 'Attendance',
        targetId: attendanceId,
        beforeValue: JSON.stringify({ punchType: punch.punchType, punchTimestamp: punch.punchTimestamp, isLate: punch.isLate }),
        afterValue: JSON.stringify({ punchType: punch.punchType, punchTimestamp: correctedAt, isLate, originalTimestamp: punch.originalTimestamp ?? punch.punchTimestamp }),
        reason: reason.trim(),
      } });
      return { employee: punch.employee, location: { id: location.id, name: location.name }, punch: updated };
    });
  }

  async getReport(locationId: string, period: string, requestedDate: string | undefined, actor: RequestUser) {
    this.assertManager(actor);
    this.assertLocationScope(locationId, actor);
    if (!['daily', 'weekly', 'monthly'].includes(period)) throw new BadRequestException('period must be daily, weekly, or monthly');
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, include: { company: { select: { timezone: true } } } });
    if (!location) throw new NotFoundException('Location not found');
    const timezone = location.company.timezone;
    const anchorDate = requestedDate ?? localDateKey(new Date(), timezone);
    const range = reportRange(period as 'daily' | 'weekly' | 'monthly', anchorDate, timezone);
    const employees = await this.prisma.employee.findMany({
      where: { locationId, isActive: true, user: { isActive: true } },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        attendances: {
          where: { locationId, punchTimestamp: { gte: range.start, lt: range.end } },
          select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true },
          orderBy: { punchTimestamp: 'asc' },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const employeeReports = employees.map((employee) => {
      const byDate = new Map<string, typeof employee.attendances>();
      for (const punch of employee.attendances) {
        const date = localDateKey(punch.punchTimestamp, timezone);
        byDate.set(date, [...(byDate.get(date) ?? []), punch]);
      }
      const entries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, punches]) => {
        const clockIn = punches.find((punch) => punch.punchType === 'IN') ?? null;
        const clockOut = punches.find((punch) => punch.punchType === 'OUT') ?? null;
        const workMinutes = clockIn && clockOut && clockOut.punchTimestamp > clockIn.punchTimestamp
          ? Math.round((clockOut.punchTimestamp.getTime() - clockIn.punchTimestamp.getTime()) / 60_000)
          : 0;
        return { date, clockInAt: clockIn?.punchTimestamp ?? null, clockOutAt: clockOut?.punchTimestamp ?? null, isLate: clockIn?.isLate ?? false, targetStartTime: clockIn?.targetStartTime ?? null, workMinutes };
      });
      const presentDays = entries.filter((entry) => entry.clockInAt).length;
      const completedDays = entries.filter((entry) => entry.clockInAt && entry.clockOutAt).length;
      const lateDays = entries.filter((entry) => entry.isLate).length;
      const workMinutes = entries.reduce((sum, entry) => sum + entry.workMinutes, 0);
      return {
        employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
        presentDays, completedDays, lateDays, workMinutes, entries,
      };
    });
    return {
      location: { id: location.id, name: location.name },
      period,
      startDate: range.startDate,
      endDate: range.endDate,
      timezone,
      summary: {
        activeEmployees: employees.length,
        employeesPresent: employeeReports.filter((row) => row.presentDays > 0).length,
        presentDays: employeeReports.reduce((sum, row) => sum + row.presentDays, 0),
        completedDays: employeeReports.reduce((sum, row) => sum + row.completedDays, 0),
        lateDays: employeeReports.reduce((sum, row) => sum + row.lateDays, 0),
        workMinutes: employeeReports.reduce((sum, row) => sum + row.workMinutes, 0),
      },
      employees: employeeReports,
    };
  }

  private async employeeFor(actor: RequestUser): Promise<EmployeeContext> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: actor.userId },
      include: { user: { select: { isActive: true } }, location: { include: { company: { select: { timezone: true } } } } },
    }) as EmployeeContext | null;
    if (!employee) throw new NotFoundException('No employee profile is linked to this account');
    if (!employee.isActive || !employee.user.isActive) throw new ForbiddenException('This employee profile is inactive');
    if (!employee.location.isActive) throw new ForbiddenException('The assigned workplace is inactive');
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(employee.locationId)) throw new ForbiddenException('You are not authorized to view attendance for this workplace');
    return employee;
  }

  private assertManager(actor: RequestUser) {
    if (!MANAGERS.includes(actor.role as Role)) throw new ForbiddenException('Manager access is required for attendance management');
  }

  private assertLocationScope(locationId: string, actor: RequestUser) {
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) throw new ForbiddenException('You are not authorized to access this workplace');
  }
}

function localDayRange(now: Date, timezone: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [year, month, day] = date.split('-').map(Number);
  const start = localMidnightUtc(year, month, day, timezone);
  const end = localMidnightUtc(year, month, day + 1, timezone);
  return { start, end };
}

function localDateKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function reportRange(period: 'daily' | 'weekly' | 'monthly', date: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date must use YYYY-MM-DD format');
  const [year, month, day] = date.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  if (anchor.getUTCFullYear() !== year || anchor.getUTCMonth() !== month - 1 || anchor.getUTCDate() !== day) {
    throw new BadRequestException('date must be a valid calendar date');
  }
  let startParts: [number, number, number] = [year, month, day];
  let endParts: [number, number, number];
  if (period === 'daily') {
    endParts = [year, month, day + 1];
  } else if (period === 'weekly') {
    const offset = (anchor.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(year, month - 1, day - offset));
    startParts = [monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()];
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    endParts = [nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate()];
  } else {
    startParts = [year, month, 1];
    endParts = [month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1];
  }
  const startDate = `${String(startParts[0]).padStart(4, '0')}-${String(startParts[1]).padStart(2, '0')}-${String(startParts[2]).padStart(2, '0')}`;
  const endExclusiveDate = `${String(endParts[0]).padStart(4, '0')}-${String(endParts[1]).padStart(2, '0')}-${String(endParts[2]).padStart(2, '0')}`;
  const dayBeforeEnd = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] - 1));
  const endDate = `${String(dayBeforeEnd.getUTCFullYear()).padStart(4, '0')}-${String(dayBeforeEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(dayBeforeEnd.getUTCDate()).padStart(2, '0')}`;
  return {
    start: localMidnightUtc(...startParts, timezone),
    end: localMidnightUtc(...endParts, timezone),
    startDate,
    endDate,
    endExclusiveDate,
  };
}

function localMidnightUtc(year: number, month: number, day: number, timezone: string) {
  let candidate = new Date(Date.UTC(year, month - 1, day));
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(candidate);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
    const difference = Date.UTC(year, month - 1, day) - displayedAsUtc;
    if (!difference) break;
    candidate = new Date(candidate.getTime() + difference);
  }
  return candidate;
}

function isAfterLocalTarget(timestamp: Date, target: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const actualSeconds = Number(values.hour) * 3600 + Number(values.minute) * 60 + Number(values.second);
  const [targetHour, targetMinute] = target.split(':').map(Number);
  return actualSeconds > targetHour * 3600 + targetMinute * 60;
}
