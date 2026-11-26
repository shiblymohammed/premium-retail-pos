import { PERMISSIONS, can } from '../../common/decorators/permission.decorator';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { attendanceByShiftDate, attendanceDay } from '../attendance/attendance.service';
import type { CreateUserWithEmployeeDto } from '../users/dto/create-user-with-employee.dto';
import { UsersService, roleDefaults } from '../users/users.service';
import type { UpdateEmployeeDto } from './dto';
import type { LoanCollectionDto, PayrollDto, PayrollLoanDto } from './staff-records.controller';

const employeeFields = {
  id: true, userId: true, locationId: true, firstName: true, lastName: true, employeeCode: true,
  designation: true, hireDate: true, phone: true, address: true, isActive: true,
  location: { select: { name: true, company: { select: { currency: true, timezone: true } } } },
  user: { select: { email: true, role: true, canCancelSales: true, canProcessReturns: true,
    canCountStockAudits: true, discountLimitPercent: true, permissionOverrides: true } },
} satisfies Prisma.EmployeeSelect;

const payrollFields = {
  id: true, period: true, currency: true, base: true, allowances: true, bonus: true, deductions: true,
  advanceRecovery: true, overtimePay: true, attendanceDeduction: true, attendanceBasis: true, net: true, paidAt: true, paymentReference: true,
} satisfies Prisma.PayrollRecordSelect;

const loanFields = {
  id: true, amount: true, status: true, monthlyInstallment: true, kind: true, issueDate: true, terms: true,
  repayments: { orderBy: { paymentDate: 'desc' }, select: {
    id: true, amount: true, status: true, payrollId: true, isPayrollDeduction: true, paymentDate: true,
    payroll: { select: { period: true } },
  } },
} satisfies Prisma.LoanSelect;

function localDay(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  return ['year', 'month', 'day'].map((part) => parts.find((field) => field.type === part)?.value).join('-');
}

const OUTLET_STAFF_ROLES: Role[] = [Role.STAFF, Role.CASHIER, Role.INVENTORY];

function staffReportAccess(actor: RequestUser) {
  const defaultAccess = actor.role === Role.ADMIN || actor.role === Role.STORE_MANAGER;
  return {
    includeSales: can(actor, 'sales.reports', defaultAccess),
    includeCash: can(actor, 'cash.reports', defaultAccess),
  };
}

function checkPayrollRevision(basis: Prisma.JsonValue, expected: string | null | undefined) {
  const revision = basis && typeof basis === 'object' && !Array.isArray(basis) ? basis.revision ?? null : null;
  if ((expected ?? null) !== revision) {
    throw new ConflictException('This payroll draft changed. Reload staff records and review the latest amounts.');
  }
}

@Injectable()
export class StaffRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService) {}

  private locationScope(actor: RequestUser): Prisma.EmployeeWhereInput {
    return actor.role === Role.SUPER_ADMIN ? {} : { locationId: { in: actor.locationIds } };
  }

  async directory(actor: RequestUser) {
    return this.prisma.employee.findMany({
      where: this.locationScope(actor), orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, employeeCode: true, location: { select: { name: true } } },
    });
  }

  private async employee(id: string, actor: RequestUser) {
    const result = await this.prisma.employee.findFirst({
      where: { id, ...this.locationScope(actor) }, select: employeeFields,
    });
    if (!result) throw new NotFoundException('Employee not found in your assigned locations');
    return result;
  }

  async profile(id: string, month: string, actor: RequestUser) {
    const staff = await this.employee(id, actor);
    const { timezone } = staff.location.company;
    const { includeSales, includeCash } = staffReportAccess(actor);
    const canManagePayroll = can(actor, 'payroll.manage', actor.role === Role.ADMIN);
    const canSeePayroll = can(actor, 'payroll.view', actor.role === Role.ADMIN || canManagePayroll);
    const from = Prisma.sql`((${month + '-01'}::date)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const to = Prisma.sql`((${month + '-01'}::date + INTERVAL '1 month') AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const previousFrom = Prisma.sql`((${month + '-01'}::date - INTERVAL '1 month') AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const throughFollowingDay = Prisma.sql`((${month + '-01'}::date + INTERVAL '1 month 1 day') AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const [nearbyAttendance, sales, drawers, payroll, baseSalary, loans] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; at: Date; action: string; late: boolean; scheduledEndAt: Date | null }>>(Prisma.sql`
        SELECT id, punch_timestamp AS at, punch_type AS action, is_late AS late, scheduled_end_at AS "scheduledEndAt" FROM attendances
        WHERE employee_id = ${id} AND location_id = ${staff.locationId} AND punch_timestamp >= ${from} AND punch_timestamp < ${throughFollowingDay}
        ORDER BY punch_timestamp
      `),
      includeSales ? this.prisma.$queryRaw<Array<{ bills: number; sales: string; previousSales: string; discounts: string; returns: number }>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE invoice.status = 'FINALIZED' AND invoice.created_at >= ${from})::int AS bills,
          COALESCE(SUM(invoice.net_total) FILTER (WHERE invoice.status = 'FINALIZED' AND invoice.created_at >= ${from}), 0)::text AS sales,
          COALESCE(SUM(invoice.net_total) FILTER (WHERE invoice.status = 'FINALIZED' AND invoice.created_at < ${from}), 0)::text AS "previousSales",
          COALESCE(SUM(invoice.discount_total) FILTER (WHERE invoice.status = 'FINALIZED' AND invoice.created_at >= ${from}), 0)::text AS discounts,
          (SELECT COUNT(*)::int
           FROM sale_returns AS returned JOIN invoices AS origin ON origin.id = returned.invoice_id
           WHERE origin.location_id = ${staff.locationId} AND returned.processed_by_user_id = ${staff.userId}
             AND returned.processed_at >= ${from} AND returned.processed_at < ${to}) AS returns
        FROM invoices invoice
        WHERE invoice.cashier_user_id = ${staff.userId} AND invoice.location_id = ${staff.locationId}
          AND invoice.created_at >= ${previousFrom} AND invoice.created_at < ${to}
      `) : undefined,
      includeCash ? this.prisma.$queryRaw<Array<{ closedAt: Date; expectedCash: string; countedCash: string; difference: string }>>(Prisma.sql`
        SELECT closed_at AS "closedAt", expected_cash::text AS "expectedCash", counted_cash::text AS "countedCash",
          (counted_cash - expected_cash)::text AS difference
        FROM cash_drawer_sessions WHERE operator_id = ${staff.userId} AND location_id = ${staff.locationId}
          AND closed_at >= ${from} AND closed_at < ${to} ORDER BY closed_at DESC
      `) : undefined,
      canSeePayroll ? this.prisma.payrollRecord.findMany({ where: { employeeId: id }, select: payrollFields, orderBy: { period: 'desc' } }) : undefined,
      canSeePayroll ? this.prisma.employee.findUnique({ where: { id }, select: { monthlyBaseSalary: true } }) : undefined,
      canSeePayroll ? this.prisma.loan.findMany({ where: { employeeId: id }, select: loanFields, orderBy: { issueDate: 'desc' } }) : undefined,
    ]);
    const manualPaymentIds = loans?.flatMap((loan) => loan.repayments.filter((payment) => !payment.isPayrollDeduction).map((payment) => payment.id)) ?? [];
    const collectionEvents = manualPaymentIds.length ? await this.prisma.auditEvent.findMany({
      where: { targetEntity: 'Repayment', action: 'STAFF_REPAYMENT_COLLECTED', targetId: { in: manualPaymentIds } },
      select: { targetId: true, afterValue: true },
    }) : [];
    const collectionReferences = new Map<string, string>();
    for (const event of collectionEvents) {
      try {
        const payload = JSON.parse(event.afterValue ?? 'null') as { reference?: unknown } | null;
        if (typeof payload?.reference === 'string') collectionReferences.set(event.targetId, payload.reference);
      } catch {
        // Older audit entries may contain plain text.
      }
    }
    const breaks = await this.prisma.attendanceBreak.findMany({
      where: { clockInId: { in: nearbyAttendance.filter((punch) => punch.action === 'IN').map((punch) => punch.id) } },
      select: { clockInId: true, startedAt: true, endedAt: true },
    });
    const breaksByShift = new Map<string, typeof breaks>();
    for (const pause of breaks) {
      const shiftBreaks = breaksByShift.get(pause.clockInId) ?? [];
      shiftBreaks.push(pause);
      breaksByShift.set(pause.clockInId, shiftBreaks);
    }
    const totals = { workMinutes: 0, breakMinutes: 0, overtimeMinutes: 0, earlyCheckouts: 0 };
    const shiftsByDay = attendanceByShiftDate(nearbyAttendance.map((punch) => ({
      ...punch, punchType: punch.action, punchTimestamp: punch.at, breaks: breaksByShift.get(punch.id),
    })), timezone);
    const attendance = [];
    for (const [day, shifts] of shiftsByDay) {
      if (!day.startsWith(month)) continue;
      attendance.push(...shifts.map(({ id: punchId, at, action, late }) => ({ id: punchId, at, action, late })));
      const metrics = attendanceDay(shifts);
      totals.workMinutes += metrics.workMinutes;
      totals.breakMinutes += metrics.breakMinutes;
      totals.overtimeMinutes += metrics.overtimeMinutes;
      if (metrics.earlyMinutes > 0) totals.earlyCheckouts += 1;
    }
    return { staff, permissionDefinitions: PERMISSIONS, permissionDefaults: roleDefaults(staff.user.role), attendance,
      canManagePayroll: canSeePayroll && canManagePayroll, ...totals, sales: sales?.[0], drawers, payroll,
      baseSalary: baseSalary?.monthlyBaseSalary,
      loans: loans?.map(({ repayments, ...loan }) => ({
        ...loan, repayments: repayments.map(({ payroll: collectionPayroll, ...payment }) => ({
          ...payment, payrollPeriod: collectionPayroll?.period ?? null,
          paymentReference: collectionReferences.get(payment.id) ?? null,
        })),
        outstanding: loan.amount.sub(repayments.filter((item) => item.status === 'CONFIRMED')
          .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))),
        collectible: loan.amount.sub(repayments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))),
        scheduled: repayments.find((item) => item.status === 'PENDING' && item.isPayrollDeduction && !item.payrollId)?.amount ?? null,
      })) };

  }

  async comparison(month: string, actor: RequestUser) {
    const { includeSales, includeCash } = staffReportAccess(actor);
    const scope = actor.role === Role.SUPER_ADMIN ? Prisma.empty : actor.locationIds.length
      ? Prisma.sql`AND e."location_id" IN (${Prisma.join(actor.locationIds)})` : Prisma.sql`AND FALSE`;
    const employees = await this.prisma.$queryRaw<Array<{
      id: string; locationId: string; firstName: string; lastName: string; location: string;
      timezone: string; currency: string; role: Role; sales: string | null; shortages: string | null;
      bills: number | null; averageBill: string | null; returns: number | null; discounts: string | null;
    }>>(Prisma.sql`
      SELECT e.id, e."location_id" AS "locationId", e."first_name" AS "firstName", e."last_name" AS "lastName",
        l.name AS location, c.currency, c.timezone, u.role,
        ${includeSales ? Prisma.sql`billed.sales, billed.bills, billed."averageBill", billed.discounts,
          (SELECT COUNT(*)::int FROM sale_returns r JOIN invoices original ON original.id = r.invoice_id
            WHERE r.processed_by_user_id = e.user_id AND original.location_id = l.id
              AND r.processed_at >= bounds.start_at AND r.processed_at < bounds.end_at) AS returns`
          : Prisma.sql`NULL::text AS sales, NULL::int AS bills, NULL::text AS "averageBill", NULL::text AS discounts, NULL::int AS returns`},
        ${includeCash ? Prisma.sql`(SELECT COALESCE(SUM(GREATEST(d.expected_cash - d.counted_cash, 0)), 0)::text FROM cash_drawer_sessions d
          WHERE d.operator_id = e.user_id AND d.location_id = l.id AND d.closed_at >= bounds.start_at AND d.closed_at < bounds.end_at)`
          : Prisma.sql`NULL::text`} AS shortages
      FROM employees e JOIN locations l ON l.id = e.location_id JOIN companies c ON c.id = l.company_id
      JOIN users u ON u.id = e.user_id
      CROSS JOIN LATERAL (
        SELECT ((${month + '-01'}::date)::timestamp AT TIME ZONE c.timezone) AT TIME ZONE 'UTC' AS start_at,
          ((${month + '-01'}::date + INTERVAL '1 month') AT TIME ZONE c.timezone) AT TIME ZONE 'UTC' AS end_at
      ) bounds
      ${includeSales ? Prisma.sql`CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(i.net_total), 0)::text AS sales, COUNT(*)::int AS bills,
          COALESCE(ROUND(AVG(i.net_total), 2), 0)::text AS "averageBill",
          COALESCE(SUM(i.discount_total), 0)::text AS discounts
        FROM invoices i WHERE i.cashier_user_id = e.user_id AND i.location_id = l.id AND i.status = 'FINALIZED'
          AND i.created_at >= bounds.start_at AND i.created_at < bounds.end_at
      ) billed` : Prisma.empty}
      WHERE TRUE ${scope}
      ORDER BY e.first_name, e.last_name
    `);
    if (!employees.length) return { rows: [], includeSales, includeCash };

    const [year, monthNumber] = month.split('-').map(Number);
    const punches = await this.prisma.attendance.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        punchTimestamp: { gte: new Date(Date.UTC(year, monthNumber - 1, 0)), lt: new Date(Date.UTC(year, monthNumber, 3)) },
      },
      select: {
        employeeId: true, locationId: true, punchType: true, punchTimestamp: true, scheduledEndAt: true, isLate: true,
        breaks: { select: { startedAt: true, endedAt: true } },
      },
      orderBy: { punchTimestamp: 'asc' },
    });
    const workplaces = new Map(employees.map((employee) => [employee.id, employee.locationId]));
    const byEmployee = new Map<string, typeof punches>();
    for (const punch of punches) {
      if (workplaces.get(punch.employeeId) !== punch.locationId) continue;
      const employeePunches = byEmployee.get(punch.employeeId) ?? [];
      employeePunches.push(punch);
      byEmployee.set(punch.employeeId, employeePunches);
    }
    const rows = employees.map(({ timezone, locationId, ...employee }) => {
      const days = [...attendanceByShiftDate(byEmployee.get(employee.id) ?? [], timezone)]
        .filter(([day]) => day.startsWith(month));
      return {
        ...employee, daysPresent: days.length,
        late: days.filter(([, shifts]) => shifts.some((punch) => punch.punchType === 'IN' && punch.isLate)).length,
        overtimeMinutes: days.reduce((sum, [, shifts]) => sum + attendanceDay(shifts).overtimeMinutes, 0),
      };
    });
    return { rows, includeSales, includeCash };
  }

  async createOutletStaff(dto: CreateUserWithEmployeeDto, actor: RequestUser) {
    if (!OUTLET_STAFF_ROLES.includes(dto.role) || !actor.locationIds.includes(dto.locationId) ||
      dto.monthlyBaseSalary !== undefined || dto.initialPermissions !== undefined || dto.reportingToId !== undefined ||
      dto.locationIds?.some((id) => id !== dto.locationId)) {
      throw new ForbiddenException('Store managers can add outlet staff at one assigned store using the default permissions');
    }
    const store = await this.prisma.location.findFirst({
      where: { id: dto.locationId, type: 'RETAIL_STORE', isActive: true }, select: { id: true },
    });
    if (!store) throw new NotFoundException('Active assigned store not found');
    const created = await this.users.createUserWithEmployee({ ...dto, locationIds: [store.id] }, actor);
    return { id: created.employee?.id };
  }

  async updateOutletStaff(id: string, dto: UpdateEmployeeDto, actor: RequestUser) {
    return this.updateStaffProfile(id, dto, actor);
  }

  async updateStaffProfile(id: string, dto: UpdateEmployeeDto, actor: RequestUser) {
    if (dto.locationId !== undefined || dto.reportingToId !== undefined) {
      throw new ForbiddenException('Change location or reporting assignments in the user directory');
    }
    if (!Object.values(dto).some((value) => value !== undefined)) throw new BadRequestException('Enter a profile change');
    const scope: Prisma.EmployeeWhereInput = { id, userId: { not: actor.userId }, ...this.locationScope(actor) };
    if (actor.role !== Role.SUPER_ADMIN) {
      scope.user = {
        role: { in: actor.role === Role.STORE_MANAGER ? OUTLET_STAFF_ROLES : [
          Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER, ...OUTLET_STAFF_ROLES,
        ] },
        locationScopes: { some: {}, every: { locationId: { in: actor.locationIds } } },
      };
    } else {
      scope.user = { role: { not: Role.SUPER_ADMIN } };
    }
    if (actor.role === Role.STORE_MANAGER) scope.location = { type: 'RETAIL_STORE' };
    try {
      const result = await this.prisma.employee.updateMany({
        where: scope, data: {
          ...dto, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        },
      });
      if (!result.count) throw new NotFoundException('Editable staff profile not found in your assigned locations');
      return { id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This employee code is already in use');
      }
      throw error;
    }
  }

  async ownPayroll(actor: RequestUser) {
    const staff = await this.prisma.employee.findUnique({
      where: { userId: actor.userId },
      select: { firstName: true, lastName: true, employeeCode: true, location: { select: { name: true } },
        payroll: { orderBy: { period: 'desc' }, where: { paidAt: { not: null } }, select: payrollFields } },
    });
    return staff;
  }

  private checkPayrollAccess(actor: RequestUser) {
    if (!can(actor, 'payroll.manage', actor.role === Role.ADMIN) ||
        !can(actor, 'payroll.view', actor.role === Role.ADMIN || actor.permissionOverrides?.['payroll.manage'] === true)) {
      throw new ForbiddenException('Payroll management and visibility are required');
    }
  }

  async recordLoan(id: string, dto: PayrollLoanDto, actor: RequestUser) {
    this.checkPayrollAccess(actor);
    await this.employee(id, actor);
    const amount = new Prisma.Decimal(dto.amount);
    const monthlyInstallment = new Prisma.Decimal(dto.monthlyInstallment);
    if (!amount.gt(0) || monthlyInstallment.gt(amount) || !dto.terms.trim()) {
      throw new BadRequestException('Enter an issued amount, a monthly recovery up to that amount, and a reference or terms');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
      const loan = await tx.loan.create({
        data: { employeeId: id, amount, monthlyInstallment: monthlyInstallment.isZero() ? null : monthlyInstallment, kind: dto.kind, terms: dto.terms.trim(),
          issueDate: new Date(), approvedByUserId: actor.userId },
      });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId, action: 'STAFF_RECOVERY_SCHEDULED', targetEntity: 'Loan', targetId: loan.id,
        afterValue: JSON.stringify({ kind: loan.kind, amount, monthlyInstallment }),
      } });
      return loan;
    });
  }

  async collectLoan(id: string, loanId: string, dto: LoanCollectionDto, actor: RequestUser) {
    this.checkPayrollAccess(actor);
    await this.employee(id, actor);
    const amount = new Prisma.Decimal(dto.amount);
    const manual = dto.method === 'MANUAL';
    const reference = dto.reference?.trim();
    if (!amount.gt(0) || (manual && !reference)) {
      throw new BadRequestException('Enter a positive amount and a payment reference for manual collection');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
      const loan = await tx.loan.findFirst({ where: { id: loanId, employeeId: id }, select: loanFields });
      if (!loan) throw new NotFoundException('Loan or advance not found');
      const replay = loan.repayments.find((payment) => payment.id === dto.id);
      if (replay) {
        if (!replay.amount.eq(amount) || replay.isPayrollDeduction === manual) {
          throw new ConflictException('This collection reference is already in use');
        }
        return replay;
      }
      if (loan.status !== 'ACTIVE') throw new ConflictException('This loan or advance is closed');
      if (!manual && loan.repayments.some((payment) => payment.status === 'PENDING' && payment.isPayrollDeduction && !payment.payrollId)) {
        throw new ConflictException('A collection is already queued for payroll');
      }
      const allocated = loan.repayments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (amount.gt(loan.amount.sub(allocated))) {
        throw new BadRequestException('Amount exceeds the balance available to collect after payroll reservations');
      }
      const repayment = await tx.repayment.create({ data: {
        id: dto.id, loanId, amount, paymentDate: new Date(), isPayrollDeduction: !manual,
        status: manual ? 'CONFIRMED' : 'PENDING', confirmedByUserId: manual ? actor.userId : null,
      } });
      if (manual) {
        const confirmed = loan.repayments.filter((payment) => payment.status === 'CONFIRMED')
          .reduce((sum, payment) => sum.add(payment.amount), amount);
        if (confirmed.eq(loan.amount)) await tx.loan.update({ where: { id: loanId }, data: { status: 'FULLY_REPAID' } });
      }
      await tx.auditEvent.create({ data: {
        actorId: actor.userId, targetEntity: 'Repayment', targetId: repayment.id,
        action: manual ? 'STAFF_REPAYMENT_COLLECTED' : 'STAFF_PAYROLL_COLLECTION_QUEUED',
        afterValue: JSON.stringify({ loanId, amount, reference }),
      } });
      return repayment;
    });
  }

  async recordPayroll(id: string, dto: PayrollDto, actor: RequestUser,
    correction?: { payrollId: string; reason: string; expectedRevision: string | null | undefined }) {
    this.checkPayrollAccess(actor);
    if (correction && !correction.reason.trim()) throw new BadRequestException('Enter a reason for correcting this draft');
    if (!new Prisma.Decimal(dto.advanceRecovery ?? 0).isZero()) {
      throw new BadRequestException('To deduct a loan or advance from payroll, queue a collection for that loan in Staff records');
    }
    const profile = await this.profile(id, dto.period, actor);
    const { staff } = profile;
    const timezone = staff.location.company.timezone;
    const today = localDay(new Date(), timezone);
    const scheduledDates = [...new Set(dto.scheduledDates ?? [])].sort();
    if (scheduledDates.some((date) => {
      if (date.slice(0, 7) !== dto.period || date >= today || date < staff.hireDate.toISOString().slice(0, 10)) return true;
      const parsed = new Date(date + 'T00:00:00Z');
      return !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date;
    })) throw new BadRequestException('Choose completed work dates in the payroll month on or after the joining date');
    const present = new Set(profile.attendance.filter((punch) => punch.action === 'IN').map((punch) => localDay(punch.at, timezone)));
    const lateDays = new Set(profile.attendance.filter((punch) => punch.action === 'IN' && punch.late).map((punch) => localDay(punch.at, timezone))).size;
    const absences = scheduledDates.filter((date) => !present.has(date));
    const overtimePay = new Prisma.Decimal(dto.overtimeHourlyRate ?? 0).mul(profile.overtimeMinutes).div(60).toDecimalPlaces(2);
    const attendanceDeduction = new Prisma.Decimal(dto.lateDayDeduction ?? 0).mul(lateDays)
      .add(new Prisma.Decimal(dto.absentDayDeduction ?? 0).mul(absences.length));
    const { period, base, allowances, bonus, deductions } = dto;
    const max = new Prisma.Decimal('9999999999.99');
    if (overtimePay.gt(max) || attendanceDeduction.gt(max)) throw new BadRequestException('Payroll adjustment exceeds the supported amount');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const workplace = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM employees WHERE id = ${id} AND location_id = ${staff.locationId} FOR UPDATE
        `;
        if (!workplace.length) throw new ConflictException('The employee workplace changed. Reload staff records.');
        const draft = correction ? await this.releaseDraftRecoveries(tx, id, period, correction.payrollId, correction.expectedRevision) : null;
        const loans = await tx.loan.findMany({
          where: { employeeId: id, status: 'ACTIVE', OR: [
            { monthlyInstallment: { gt: 0 } },
            { repayments: { some: { status: 'PENDING', isPayrollDeduction: true, payrollId: null } } },
          ] },
          select: loanFields, orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
        });
        let remainingPay = new Prisma.Decimal(base).add(allowances).add(bonus).add(overtimePay)
          .sub(deductions).sub(attendanceDeduction);
        if (remainingPay.isNegative()) throw new BadRequestException('Deductions cannot exceed gross pay');
        const allocations: Array<{ loanId: string; amount: Prisma.Decimal }> = [];
        const scheduled: Array<{ id: string; amount: Prisma.Decimal }> = [];
        for (const loan of loans) {
          if (localDay(loan.issueDate, timezone).slice(0, 7) > period) continue;
          // Repayments are loaded newest first. Honor the oldest queued collection when editing releases a previous reservation.
          const queued = [...loan.repayments].reverse()
            .find((payment) => payment.status === 'PENDING' && payment.isPayrollDeduction && !payment.payrollId);
          if (queued) {
            if (period >= localDay(queued.paymentDate, timezone).slice(0, 7) && remainingPay.gte(queued.amount)) {
              scheduled.push(queued);
              remainingPay = remainingPay.sub(queued.amount);
            }
            // A one-time collection replaces this loan's regular installment for this payroll.
            continue;
          }
          const allocated = loan.repayments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
          const amount = Prisma.Decimal.min(loan.monthlyInstallment ?? 0, loan.amount.sub(allocated), remainingPay);
          if (amount.gt(0)) {
            allocations.push({ loanId: loan.id, amount });
            remainingPay = remainingPay.sub(amount);
          }
        }
        const advanceRecovery = [...allocations, ...scheduled].reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        if (advanceRecovery.gt(max)) throw new BadRequestException('Payroll recovery exceeds the supported amount');
        const data = {
          base, allowances, bonus, deductions, advanceRecovery, overtimePay, attendanceDeduction,
          attendanceBasis: { overtimeMinutes: profile.overtimeMinutes, lateDays, scheduledDates, absences,
            overtimeHourlyRate: dto.overtimeHourlyRate ?? '0', lateDayDeduction: dto.lateDayDeduction ?? '0',
            absentDayDeduction: dto.absentDayDeduction ?? '0', ...(draft && { revision: randomUUID() }) },
          net: remainingPay,
          repayments: { create: allocations.map((allocation) => ({
            ...allocation, isPayrollDeduction: true, paymentDate: new Date(),
          })) },
        };
        const record = draft
          ? await tx.payrollRecord.update({ where: { id: draft.id }, data, select: payrollFields })
          : await tx.payrollRecord.create({
            data: { ...data, period, employeeId: id, currency: staff.location.company.currency, createdById: actor.userId },
            select: payrollFields,
          });
        if (scheduled.length) await tx.repayment.updateMany({
          where: { id: { in: scheduled.map((item) => item.id) } }, data: { payrollId: record.id },
        });
        if (draft && correction) await tx.auditEvent.create({ data: {
          actorId: actor.userId, action: 'PAYROLL_DRAFT_CORRECTED', targetEntity: 'PayrollRecord',
          targetId: record.id, reason: correction.reason.trim(),
          beforeValue: JSON.stringify(draft),
          afterValue: JSON.stringify({ ...record, repayments: await tx.repayment.findMany({
            where: { payrollId: record.id }, select: { id: true, loanId: true, amount: true, status: true },
          }) }),
        } });
        return record;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A payroll record already exists for this employee and month');
      }
      throw error;
    }
  }

  private async releaseDraftRecoveries(tx: Prisma.TransactionClient, employeeId: string, period: string, payrollId: string,
    expectedRevision: string | null | undefined) {
    const draft = await tx.payrollRecord.findFirst({
      where: { id: payrollId, employeeId, period },
      select: { ...payrollFields, repayments: { select: { id: true, loanId: true, amount: true, status: true } } },
    });
    if (!draft) throw new NotFoundException('Payroll record not found for this employee and month');
    if (draft.paidAt || draft.repayments.some((payment) => payment.status === 'CONFIRMED')) {
      throw new ConflictException('Paid payroll and confirmed recoveries are locked');
    }
    checkPayrollRevision(draft.attendanceBasis, expectedRevision);
    const queued = draft.repayments.length ? await tx.auditEvent.findMany({
      where: { action: 'STAFF_PAYROLL_COLLECTION_QUEUED', targetEntity: 'Repayment', targetId: { in: draft.repayments.map((payment) => payment.id) } },
      select: { targetId: true },
    }) : [];
    const queuedIds = [...new Set(queued.map((event) => event.targetId))];
    if (queuedIds.length) await tx.repayment.updateMany({
      where: { payrollId, status: 'PENDING', id: { in: queuedIds } }, data: { payrollId: null },
    });
    if (draft.repayments.length > queuedIds.length) await tx.repayment.deleteMany({
      where: { payrollId, status: 'PENDING' },
    });
    return draft;
  }

  async markPaid(id: string, payrollId: string, reference: string, actor: RequestUser, expectedRevision?: string | null) {
    this.checkPayrollAccess(actor);
    const staff = await this.employee(id, actor);
    const paymentReference = reference.trim();
    if (!paymentReference) throw new BadRequestException('Enter the payment reference');
    return this.prisma.$transaction(async (tx) => {
      const workplace = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM employees WHERE id = ${id} AND location_id = ${staff.locationId} FOR UPDATE
      `;
      if (!workplace.length) throw new ConflictException('The employee workplace changed. Reload staff records.');
      const current = await tx.payrollRecord.findFirst({ where: { id: payrollId, employeeId: id }, select: payrollFields });
      if (!current) throw new NotFoundException('Payroll record not found');
      checkPayrollRevision(current.attendanceBasis, expectedRevision);
      if (current.paidAt) {
        if (current.paymentReference !== paymentReference) throw new ConflictException('This payroll record is already marked paid');
        return current;
      }
      const now = new Date();
      const saved = await tx.payrollRecord.update({
        where: { id: payrollId }, data: { paidAt: now, paidById: actor.userId, paymentReference }, select: payrollFields,
      });
      const repayments = await tx.repayment.findMany({ where: { payrollId, status: 'PENDING' }, select: { loanId: true } });
      await tx.repayment.updateMany({ where: { payrollId, status: 'PENDING' }, data: {
        status: 'CONFIRMED', confirmedByUserId: actor.userId, paymentDate: now,
      } });
      for (const { loanId } of repayments) {
        const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId }, select: loanFields });
        const paid = loan.repayments.filter((payment) => payment.status === 'CONFIRMED')
          .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
        if (paid.gte(loan.amount)) await tx.loan.update({ where: { id: loanId }, data: { status: 'FULLY_REPAID' } });
      }
      return saved;
    });
  }
}
