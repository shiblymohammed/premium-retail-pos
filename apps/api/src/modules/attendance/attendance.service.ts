import { can, PermissionKey } from '../../common/decorators/permission.decorator';
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
  location: { id: string; name: string; isActive: boolean; attendanceStartTime: string | null; attendanceEndTime?: string | null; company: { timezone: string } };
};

const MANAGERS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

const shiftFields = {
  scheduledEndAt: true,
  breaks: { select: { id: true, startedAt: true, endedAt: true }, orderBy: { startedAt: 'asc' } },
} satisfies Prisma.AttendanceSelect;

type Shift = {
  punchTimestamp: Date;
  scheduledEndAt?: Date | null;
  breaks?: Array<{ startedAt: Date; endedAt: Date | null }>;
};

function shiftDuration(clockIn: Shift, finishedAt: Date | null, activeUntil?: Date) {
  const start = clockIn.punchTimestamp.getTime();
  const finish = (finishedAt ?? activeUntil ?? clockIn.punchTimestamp).getTime();
  const scheduled = clockIn.scheduledEndAt?.getTime();
  const overlap = (from: number, breakStart: number, breakEnd: number) => Math.max(0, Math.min(finish, breakEnd) - Math.max(from, breakStart));
  let breakMs = 0;
  let overtimeBreakMs = 0;
  for (const pause of clockIn.breaks ?? []) {
    const breakEnd = pause.endedAt?.getTime() ?? finish;
    breakMs += overlap(start, pause.startedAt.getTime(), breakEnd);
    if (scheduled !== undefined) overtimeBreakMs += overlap(Math.max(start, scheduled), pause.startedAt.getTime(), breakEnd);
  }
  return {
    workMs: Math.max(0, finish - start - breakMs),
    breakMs,
    overtimeMs: finishedAt && scheduled !== undefined ? Math.max(0, finish - Math.max(start, scheduled) - overtimeBreakMs) : 0,
    earlyMinutes: finishedAt && scheduled !== undefined ? Math.ceil(Math.max(0, scheduled - finish) / 60_000) : 0,
    onBreak: !finishedAt && (clockIn.breaks ?? []).some((pause) => !pause.endedAt),
  };
}

export function shiftMetrics(clockIn: Shift | null, finishedAt: Date | null, activeUntil?: Date) {
  if (!clockIn) return { workMinutes: 0, breakMinutes: 0, overtimeMinutes: 0, earlyMinutes: 0, onBreak: false };
  const { workMs, breakMs, overtimeMs, ...state } = shiftDuration(clockIn, finishedAt, activeUntil);
  return {
    workMinutes: Math.floor(workMs / 60_000), breakMinutes: Math.floor(breakMs / 60_000),
    overtimeMinutes: Math.floor(overtimeMs / 60_000), ...state,
  };
}

export function attendanceDay<T extends Shift & { punchType: string }>(punches: T[], now?: Date) {
  const clockIn = punches.find((punch) => punch.punchType === 'IN') ?? null;
  const clockOut = punches.at(-1)?.punchType === 'OUT' ? punches.at(-1)! : null;
  let workMs = 0;
  let breakMs = 0;
  let overtimeMs = 0;
  let earlyMinutes = 0;
  let onBreak = false;
  for (const [index, punch] of punches.entries()) {
    if (punch.punchType !== 'IN') continue;
    const next = punches[index + 1];
    const finishedAt = next?.punchType === 'OUT' ? next.punchTimestamp : null;
    const interval = shiftDuration(punch, finishedAt, next ? undefined : now);
    workMs += interval.workMs;
    breakMs += interval.breakMs;
    overtimeMs += interval.overtimeMs;
    if (next === clockOut) earlyMinutes = interval.earlyMinutes;
    if (!next) onBreak = interval.onBreak;
  }
  return {
    clockIn, clockOut,
    workMinutes: Math.floor(workMs / 60_000), breakMinutes: Math.floor(breakMs / 60_000),
    overtimeMinutes: Math.floor(overtimeMs / 60_000), earlyMinutes, onBreak,
  };
}

export function attendanceByShiftDate<T extends Shift & { punchType: string }>(punches: T[], timezone: string) {
  const byDate = new Map<string, T[]>();
  for (const [index, punch] of punches.entries()) {
    const previous = punches[index - 1];
    if (punch.punchType === 'OUT' && previous?.punchType !== 'IN') continue;
    const clockIn = punch.punchType === 'OUT' ? previous : punch;
    const day = localDateKey(clockIn.punchTimestamp, timezone);
    const entries = byDate.get(day) ?? [];
    entries.push(punch);
    byDate.set(day, entries);
  }
  return byDate;
}

function currentDayPunches<T extends Shift & { punchType: string }>(punches: T[], now: Date, timezone: string) {
  const day = localDateKey(now, timezone);
  const byDate = attendanceByShiftDate(punches, timezone);
  const today = byDate.get(day);
  if (today?.length) return today;
  const last = punches.at(-1);
  if (!last || (last.punchType === 'OUT' && localDateKey(last.punchTimestamp, timezone) !== day)) return [];
  return byDate.get(
    localDateKey((last.punchType === 'IN' ? last : punches.at(-2) ?? last).punchTimestamp, timezone),
  ) ?? (last.punchType === 'OUT' ? [last] : []);
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(actor: RequestUser) {
    const employee = await this.employeeFor(actor);
    const now = new Date();
    const timezone = employee.location.company.timezone;
    const { previousStart, end } = localDayRange(now, timezone);
    const nearbyPunches = await this.prisma.attendance.findMany({
      where: { employeeId: employee.id, locationId: employee.locationId, punchTimestamp: { gte: previousStart, lt: end } },
      select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields, originalTimestamp: true, correctionReason: true },
      orderBy: { punchTimestamp: 'asc' },
    });
    const punches = currentDayPunches(nearbyPunches, now, timezone);
    const last = punches.at(-1);
    const status = !last ? 'NOT_STARTED' : last.punchType === 'IN' ? 'WORKING' : 'COMPLETED';
    const { clockIn: _clockIn, clockOut: _clockOut, ...metrics } = attendanceDay(punches, now);
    return {
      employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
      location: { id: employee.location.id, name: employee.location.name },
      localDate: new Intl.DateTimeFormat('en-CA', { timeZone: employee.location.company.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      timezone: employee.location.company.timezone,
      targetStartTime: employee.location.attendanceStartTime,
      targetEndTime: employee.location.attendanceEndTime ?? null,
      ...metrics,
      status,
      nextAction: status === 'WORKING' ? 'OUT' : 'IN',
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
      select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields, originalTimestamp: true, correctionReason: true },
      orderBy: { punchTimestamp: 'asc' },
    });
    const byDay = attendanceByShiftDate(punches, employee.location.company.timezone);
    const latest = punches.at(-1);
    const activeDate = latest?.punchType === 'IN' && latest.punchTimestamp >= localDayRange(now, employee.location.company.timezone).previousStart
      ? localDateKey(latest.punchTimestamp, employee.location.company.timezone) : null;
    const days = Array.from({ length: 176 + weekday }, (_, index) => {
      const date = new Date(Date.UTC(startYear, startMonth - 1, startDay + index));
      const dateKey = localDateKey(date, 'UTC');
      const dayPunches = byDay.get(dateKey) ?? [];
      const { clockIn, clockOut, ...metrics } = attendanceDay(dayPunches, dateKey === activeDate ? now : undefined);
      return {
        date: dateKey,
        status: !clockIn ? 'off' : clockIn.isLate ? 'late' : 'present',
        clockInAt: clockIn?.punchTimestamp ?? null,
        clockOutAt: clockOut?.punchTimestamp ?? null,
        isLate: clockIn?.isLate ?? false,
        ...metrics,
      };
    });
    return { employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode }, location: { id: employee.location.id, name: employee.location.name }, timezone: employee.location.company.timezone, days };
  }

  async punch(actor: RequestUser, action?: 'IN' | 'OUT') {
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
      const timezone = employee.location.company.timezone;
      const { previousStart, end } = localDayRange(now, timezone);
      const nearbyPunches = await tx.attendance.findMany({
        where: { employeeId: employee.id, locationId: employee.locationId, punchTimestamp: { gte: previousStart, lt: end } },
        select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields, originalTimestamp: true, correctionReason: true },
        orderBy: { punchTimestamp: 'asc' },
      });
      const current = currentDayPunches(nearbyPunches, now, timezone);
      const active = current.at(-1);
      const today = localDateKey(now, timezone);
      const startedToday = current.some((punch) => punch.punchType === 'IN' && localDateKey(punch.punchTimestamp, timezone) === today);
      const orphanOut = current.length === 1 && active?.punchType === 'OUT';
      const punches = active?.punchType === 'IN' || startedToday || orphanOut ? current : [];
      const last = punches.at(-1);
      if (last?.punchType === 'OUT' && action !== 'IN') throw new ConflictException('Use Clock back in to resume today’s attendance');
      const firstIn = punches.find((row) => row.punchType === 'IN');
      if (last?.breaks?.some((pause) => !pause.endedAt)) throw new ConflictException('End your break before clocking out');
      const punchType = last?.punchType === 'IN' ? 'OUT' : 'IN';
      if (action && action !== punchType) throw new ConflictException('The shift changed. Refresh attendance before trying again');
      const endTime = employee.location.attendanceEndTime;
      const scheduledEndAt = punchType === 'IN'
        ? firstIn ? firstIn.scheduledEndAt ?? null : endTime ? localScheduledTime(now, endTime, timezone, employee.location.attendanceStartTime) : null
        : null;
      const targetStartTime = punchType === 'IN' && !firstIn ? employee.location.attendanceStartTime ?? null : null;
      const isLate = punchType === 'IN' && targetStartTime !== null && isAfterLocalTarget(now, targetStartTime, employee.location.company.timezone);
      const punch = await tx.attendance.create({
        data: { employeeId: employee.id, locationId: employee.locationId, punchType, punchTimestamp: now, isLate, targetStartTime, scheduledEndAt },
        select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields, originalTimestamp: true, correctionReason: true },
      });
      const { clockIn: _clockIn, clockOut: _clockOut, ...metrics } = attendanceDay([...punches, punch], now);
      return {
        employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
        location: { id: employee.location.id, name: employee.location.name },
        punch,
        status: punchType === 'IN' ? 'WORKING' : 'COMPLETED',
        nextAction: punchType === 'IN' ? 'OUT' : 'IN',
        ...metrics,
      };
    });
  }

  async changeBreak(actor: RequestUser, startBreak: boolean) {
    const employee = await this.employeeFor(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id} FOR UPDATE`;
      const now = new Date();
      const range = localDayRange(now, employee.location.company.timezone);
      const active = await tx.attendance.findFirst({
        where: { employeeId: employee.id, locationId: employee.locationId, punchTimestamp: { gte: range.previousStart, lt: range.end } },
        orderBy: { punchTimestamp: 'desc' },
        select: { id: true, punchType: true, breaks: { where: { endedAt: null }, select: { id: true } } },
      });
      if (active?.punchType !== 'IN') throw new ConflictException('Clock in before starting or ending a break');
      const open = active.breaks[0];
      if (startBreak) {
        if (open) throw new ConflictException('You already have a break in progress');
        await tx.attendanceBreak.create({ data: { clockInId: active.id, startedAt: now } });
      } else {
        if (!open) throw new ConflictException('There is no open break to end');
        await tx.attendanceBreak.update({ where: { id: open.id }, data: { endedAt: now } });
      }
    });
    return this.getToday(actor);
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
    const { previousStart, end } = localDayRange(now, location.company.timezone);
    const employees = await this.prisma.employee.findMany({
      where: { locationId, isActive: true, user: { isActive: true } },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        attendances: {
          where: { locationId, punchTimestamp: { gte: previousStart, lt: end } },
          select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields, originalTimestamp: true, correctionReason: true },
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
      targetEndTime: location.attendanceEndTime ?? null,
      employees: employees.map((employee) => {
        const punches = currentDayPunches(employee.attendances, now, location.company.timezone);
        const { clockIn, clockOut, ...metrics } = attendanceDay(punches, now);
        return {
          employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
          status: clockOut ? 'COMPLETED' : clockIn ? 'WORKING' : 'NOT_STARTED',
          clockInId: clockIn?.id ?? null,
          clockOutId: clockOut?.id ?? null,
          clockInAt: clockIn?.punchTimestamp ?? null,
          clockOutAt: clockOut?.punchTimestamp ?? null,
          isLate: clockIn?.isLate ?? false,
          targetStartTime: clockIn?.targetStartTime ?? location.attendanceStartTime,
          ...metrics,
          clockInCorrectionReason: clockIn?.correctionReason ?? null,
          clockOutCorrectionReason: clockOut?.correctionReason ?? null,
        };
      }),
    };
  }

  async getLocationTargetStartTime(locationId: string, actor: RequestUser) {
    this.assertManager(actor);
    this.assertLocationScope(locationId, actor);
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, attendanceStartTime: true, attendanceEndTime: true } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async setLocationTargetStartTime(locationId: string, startTime: string | null | undefined, actor: RequestUser, endTime?: string | null) {
    this.assertManager(actor, 'attendance.manage');
    this.assertLocationScope(locationId, actor);
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, attendanceStartTime: true, attendanceEndTime: true } });
      if (!location) throw new NotFoundException('Location not found');
      const start = startTime === undefined ? location.attendanceStartTime : startTime;
      const end = endTime === undefined ? location.attendanceEndTime : endTime;
      if (start && end && start === end) throw new BadRequestException('Shift start and end must be different times');
      const updated = await tx.location.update({ where: { id: locationId }, data: { attendanceStartTime: start, attendanceEndTime: end }, select: { id: true, name: true, attendanceStartTime: true, attendanceEndTime: true } });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId,
        action: 'ATTENDANCE_START_TIME_UPDATED',
        targetEntity: 'Location',
        targetId: locationId,
        beforeValue: JSON.stringify({ attendanceStartTime: location.attendanceStartTime, attendanceEndTime: location.attendanceEndTime }),
        afterValue: JSON.stringify({ attendanceStartTime: start, attendanceEndTime: end }),
      } });
      return updated;
    });
  }

  async correctPunch(attendanceId: string, timestamp: string, reason: string, actor: RequestUser) {
    this.assertManager(actor, 'attendance.manage');
    const correctedAt = new Date(timestamp);
    if (!Number.isFinite(correctedAt.getTime()) || correctedAt > new Date()) throw new BadRequestException('Corrected attendance time must be a valid time in the past');
    return this.prisma.$transaction(async (tx) => {
      const punch = await tx.attendance.findUnique({
        where: { id: attendanceId },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
      });
      if (!punch) throw new NotFoundException('Attendance punch not found');
      this.assertLocationScope(punch.locationId, actor);
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${punch.employeeId} FOR UPDATE`;
      const location = await tx.location.findUnique({ where: { id: punch.locationId }, include: { company: { select: { timezone: true } } } });
      if (!location) throw new NotFoundException('Punch location not found');
      const originalLocalDate = localDateKey(punch.punchTimestamp, location.company.timezone);
      if (localDateKey(correctedAt, location.company.timezone) !== originalLocalDate) {
        throw new BadRequestException('A punch correction must stay on its original workplace-local date');
      }
      const range = localDayRange(punch.punchTimestamp, location.company.timezone);
      const nearbyPunches = await tx.attendance.findMany({
        where: { employeeId: punch.employeeId, locationId: punch.locationId, punchTimestamp: { gte: range.previousStart, lt: range.followingEnd } },
        select: { id: true, punchType: true, punchTimestamp: true, ...shiftFields },
        orderBy: { punchTimestamp: 'asc' },
      });
      const shiftDays = attendanceByShiftDate(nearbyPunches, location.company.timezone);
      const dayPunches = [...shiftDays.values()].find((entries) => entries.some((item) => item.id === attendanceId));
      if (!dayPunches) throw new ConflictException('This punch has no matching shift');
      const originalIndex = nearbyPunches.findIndex((item) => item.id === attendanceId);
      const previous = nearbyPunches[originalIndex - 1];
      const next = nearbyPunches[originalIndex + 1];
      if ((previous && correctedAt <= previous.punchTimestamp) || (next && correctedAt >= next.punchTimestamp)) {
        throw new ConflictException('This correction would put the punch out of order');
      }
      const timeline = dayPunches.map((item) => ({ ...item, punchTimestamp: item.id === attendanceId ? correctedAt : item.punchTimestamp })).sort((a, b) => a.punchTimestamp.getTime() - b.punchTimestamp.getTime());
      if (timeline.some((item, index) => item.punchType !== (index % 2 === 0 ? 'IN' : 'OUT') ||
        (index > 0 && item.punchTimestamp <= timeline[index - 1].punchTimestamp))) {
        throw new ConflictException('This correction would make the daily IN/OUT order invalid');
      }
      for (let index = 0; index < timeline.length; index += 2) {
        const clockIn = timeline[index];
        const clockOut = timeline[index + 1];
        if (clockIn.breaks?.some((pause) => pause.startedAt < clockIn.punchTimestamp ||
          (clockOut && (!pause.endedAt || pause.endedAt > clockOut.punchTimestamp)))) {
          throw new ConflictException('The corrected shift must contain all recorded breaks');
        }
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
    const throughFollowingDay = localDayRange(range.end, timezone).end;
    const employees = await this.prisma.employee.findMany({
      where: { locationId, isActive: true, user: { isActive: true } },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        attendances: {
          where: { locationId, punchTimestamp: { gte: range.start, lt: throughFollowingDay } },
          select: { id: true, punchType: true, punchTimestamp: true, isLate: true, targetStartTime: true, ...shiftFields },
          orderBy: { punchTimestamp: 'asc' },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const employeeReports = employees.map((employee) => {
      const byDate = attendanceByShiftDate(employee.attendances, timezone);
      const entries = [...byDate.entries()].filter(([date]) => date >= range.startDate && date <= range.endDate).map(([date, punches]) => {
        const { clockIn, clockOut, ...metrics } = attendanceDay(punches);
        return { date, clockInAt: clockIn?.punchTimestamp ?? null, clockOutAt: clockOut?.punchTimestamp ?? null, isLate: clockIn?.isLate ?? false, targetStartTime: clockIn?.targetStartTime ?? null, ...metrics };
      });
      const presentDays = entries.filter((entry) => entry.clockInAt).length;
      const completedDays = entries.filter((entry) => entry.clockInAt && entry.clockOutAt).length;
      const lateDays = entries.filter((entry) => entry.isLate).length;
      const workMinutes = entries.reduce((sum, entry) => sum + entry.workMinutes, 0);
      return {
        employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode },
        presentDays, completedDays, lateDays, workMinutes,
        earlyDays: entries.filter((entry) => entry.earlyMinutes > 0).length,
        breakMinutes: entries.reduce((sum, entry) => sum + entry.breakMinutes, 0),
        overtimeMinutes: entries.reduce((sum, entry) => sum + entry.overtimeMinutes, 0), entries,
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
        earlyDays: employeeReports.reduce((sum, row) => sum + row.earlyDays, 0),
        breakMinutes: employeeReports.reduce((sum, row) => sum + row.breakMinutes, 0),
        overtimeMinutes: employeeReports.reduce((sum, row) => sum + row.overtimeMinutes, 0),
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

  private assertManager(actor: RequestUser, key: PermissionKey = 'staff.view') {
    if (!can(actor, key, MANAGERS.includes(actor.role as Role)) &&
      (key !== 'staff.view' || actor.permissionOverrides?.['attendance.manage'] !== true)) throw new ForbiddenException('Manager access is required for attendance management');
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
  return { start, end, previousStart: localMidnightUtc(year, month, day - 1, timezone), followingEnd: localMidnightUtc(year, month, day + 2, timezone) };
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

function localScheduledTime(date: Date, time: string, timezone: string, startTime: string | null) {
  const [year, month, day] = localDateKey(date, timezone).split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return localMidnightUtc(year, month, day + (startTime && time < startTime ? 1 : 0), timezone, hour, minute);
}

function localMidnightUtc(year: number, month: number, day: number, timezone: string, hour = 0, minute = 0) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(target);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(candidate);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
    const difference = target - displayedAsUtc;
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
