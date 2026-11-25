import { PERMISSIONS, can } from '../../common/decorators/permission.decorator';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { attendanceDay } from '../attendance/attendance.service';
import type { CreateUserWithEmployeeDto } from '../users/dto/create-user-with-employee.dto';
import { UsersService, roleDefaults } from '../users/users.service';
import type { UpdateEmployeeDto } from './dto';
import type { PayrollDto, PayrollLoanDto } from './staff-records.controller';

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
  repayments: { select: { amount: true, status: true } },
} satisfies Prisma.LoanSelect;

function localDay(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  return ['year', 'month', 'day'].map((part) => parts.find((field) => field.type === part)?.value).join('-');
}

const OUTLET_STAFF_ROLES: Role[] = [Role.STAFF, Role.CASHIER, Role.INVENTORY];

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
    const canManagePayroll = can(actor, 'payroll.manage', actor.role === Role.ADMIN);
    const canSeePayroll = can(actor, 'payroll.view', actor.role === Role.ADMIN || canManagePayroll);
    const from = Prisma.sql`((${month + '-01'}::date)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const to = Prisma.sql`((${month + '-01'}::date + INTERVAL '1 month') AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const previousFrom = Prisma.sql`((${month + '-01'}::date - INTERVAL '1 month') AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC'`;
    const [attendance, sales, drawers, payroll, baseSalary, loans] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; at: Date; action: string; late: boolean; scheduledEndAt: Date | null }>>(Prisma.sql`
        SELECT id, punch_timestamp AS at, punch_type AS action, is_late AS late, scheduled_end_at AS "scheduledEndAt" FROM attendances
        WHERE employee_id = ${id} AND location_id = ${staff.locationId} AND punch_timestamp >= ${from} AND punch_timestamp < ${to}
        ORDER BY punch_timestamp
      `),
      this.prisma.$queryRaw<Array<{ bills: number; sales: string; previousSales: string; discounts: string; returns: number }>>(Prisma.sql`
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
      `),
      this.prisma.$queryRaw<Array<{ closedAt: Date; expectedCash: string; countedCash: string; difference: string }>>(Prisma.sql`
        SELECT closed_at AS "closedAt", expected_cash::text AS "expectedCash", counted_cash::text AS "countedCash",
          (counted_cash - expected_cash)::text AS difference
        FROM cash_drawer_sessions WHERE operator_id = ${staff.userId} AND location_id = ${staff.locationId}
          AND closed_at >= ${from} AND closed_at < ${to} ORDER BY closed_at DESC
      `),
      canSeePayroll ? this.prisma.payrollRecord.findMany({ where: { employeeId: id }, select: payrollFields, orderBy: { period: 'desc' } }) : undefined,
      canSeePayroll ? this.prisma.employee.findUnique({ where: { id }, select: { monthlyBaseSalary: true } }) : undefined,
      canSeePayroll ? this.prisma.loan.findMany({ where: { employeeId: id }, select: loanFields, orderBy: { issueDate: 'desc' } }) : undefined,
    ]);
    const breaks = await this.prisma.attendanceBreak.findMany({
      where: { clockInId: { in: attendance.filter((punch) => punch.action === 'IN').map((punch) => punch.id) } },
      select: { clockInId: true, startedAt: true, endedAt: true },
    });
    const breaksByShift = new Map<string, typeof breaks>();
    for (const pause of breaks) {
      const shiftBreaks = breaksByShift.get(pause.clockInId) ?? [];
      shiftBreaks.push(pause);
      breaksByShift.set(pause.clockInId, shiftBreaks);
    }
    const totals = { workMinutes: 0, breakMinutes: 0, overtimeMinutes: 0, earlyCheckouts: 0 };
    const shiftsByDay = new Map<string, Array<{
      punchType: string; punchTimestamp: Date; scheduledEndAt: Date | null; breaks?: typeof breaks;
    }>>();
    for (const punch of attendance) {
      const day = localDay(punch.at, timezone);
      const shifts = shiftsByDay.get(day) ?? [];
      shifts.push({ punchType: punch.action, punchTimestamp: punch.at, scheduledEndAt: punch.scheduledEndAt, breaks: breaksByShift.get(punch.id) });
      shiftsByDay.set(day, shifts);
    }
    for (const shifts of shiftsByDay.values()) {
      const metrics = attendanceDay(shifts);
      totals.workMinutes += metrics.workMinutes;
      totals.breakMinutes += metrics.breakMinutes;
      totals.overtimeMinutes += metrics.overtimeMinutes;
      if (metrics.earlyMinutes > 0) totals.earlyCheckouts += 1;
    }
    return { staff, permissionDefinitions: PERMISSIONS, permissionDefaults: roleDefaults(staff.user.role), attendance, canManagePayroll: canSeePayroll && canManagePayroll, ...totals, sales: actor.permissionOverrides?.['sales.reports'] === false ? undefined : sales[0],
      drawers: actor.permissionOverrides?.['cash.reports'] === false ? undefined : drawers, payroll,
      baseSalary: baseSalary?.monthlyBaseSalary,
      loans: loans?.map(({ repayments, ...loan }) => ({
        ...loan, outstanding: loan.amount.sub(repayments.filter((item) => item.status === 'CONFIRMED')
          .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))),
      })) };

  }

  async comparison(month: string, actor: RequestUser) {
    const includeSales = can(actor, 'sales.reports', (actor.role === Role.ADMIN || actor.role === Role.STORE_MANAGER));
    const includeCash = can(actor, 'cash.reports', (actor.role === Role.ADMIN || actor.role === Role.STORE_MANAGER));
    const scope = actor.role === Role.SUPER_ADMIN ? Prisma.empty : actor.locationIds.length
      ? Prisma.sql`AND e."location_id" IN (${Prisma.join(actor.locationIds)})` : Prisma.sql`AND FALSE`;
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; firstName: string; lastName: string; location: string; currency: string;
      late: number; sales: string | null; shortages: string | null;
    }>>(Prisma.sql`
      SELECT e.id, e."first_name" AS "firstName", e."last_name" AS "lastName", l.name AS location, c.currency,
        (SELECT COUNT(*)::int FROM attendances a WHERE a.employee_id = e.id AND a.location_id = l.id
          AND a.punch_type = 'IN' AND a.is_late AND a.punch_timestamp >= bounds.start_at AND a.punch_timestamp < bounds.end_at) AS late,
        ${includeSales ? Prisma.sql`(SELECT COALESCE(SUM(i.net_total), 0)::text FROM invoices i
          WHERE i.cashier_user_id = e.user_id AND i.location_id = l.id AND i.status = 'FINALIZED'
            AND i.created_at >= bounds.start_at AND i.created_at < bounds.end_at)` : Prisma.sql`NULL::text`} AS sales,
        ${includeCash ? Prisma.sql`(SELECT COALESCE(SUM(GREATEST(d.expected_cash - d.counted_cash, 0)), 0)::text FROM cash_drawer_sessions d
          WHERE d.operator_id = e.user_id AND d.location_id = l.id AND d.closed_at >= bounds.start_at AND d.closed_at < bounds.end_at)` : Prisma.sql`NULL::text`} AS shortages
      FROM employees e JOIN locations l ON l.id = e.location_id JOIN companies c ON c.id = l.company_id
      CROSS JOIN LATERAL (
        SELECT ((${month + '-01'}::date)::timestamp AT TIME ZONE c.timezone) AT TIME ZONE 'UTC' AS start_at,
          ((${month + '-01'}::date + INTERVAL '1 month') AT TIME ZONE c.timezone) AT TIME ZONE 'UTC' AS end_at
      ) bounds
      WHERE TRUE ${scope}
      ORDER BY e.first_name, e.last_name
    `);
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
    if (dto.locationId !== undefined || dto.reportingToId !== undefined) {
      throw new ForbiddenException('Store managers cannot change location or reporting assignments');
    }
    if (!Object.values(dto).some((value) => value !== undefined)) throw new BadRequestException('Enter a profile change');
    const scope: Prisma.EmployeeWhereInput = {
      id, locationId: { in: actor.locationIds }, location: { type: 'RETAIL_STORE' },
      userId: { not: actor.userId },
      user: { role: { in: OUTLET_STAFF_ROLES }, locationScopes: { every: { locationId: { in: actor.locationIds } } } },
    };
    try {
      const result = await this.prisma.employee.updateMany({
        where: scope, data: {
          ...dto, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        },
      });
      if (!result.count) throw new NotFoundException('Editable outlet staff profile not found');
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
    if (!amount.gt(0) || !monthlyInstallment.gt(0) || monthlyInstallment.gt(amount) || !dto.terms.trim()) {
      throw new BadRequestException('Enter an issued amount, monthly recovery up to the issued amount, and a reference or terms');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
      const loan = await tx.loan.create({
        data: { employeeId: id, amount, monthlyInstallment, kind: dto.kind, terms: dto.terms.trim(),
          issueDate: new Date(), approvedByUserId: actor.userId },
      });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId, action: 'STAFF_RECOVERY_SCHEDULED', targetEntity: 'Loan', targetId: loan.id,
        afterValue: JSON.stringify({ kind: loan.kind, amount, monthlyInstallment }),
      } });
      return loan;
    });
  }

  async recordPayroll(id: string, dto: PayrollDto, actor: RequestUser) {
    this.checkPayrollAccess(actor);
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
        await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
        const loans = await tx.loan.findMany({
          where: { employeeId: id, status: 'ACTIVE', monthlyInstallment: { not: null } },
          select: loanFields, orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
        });
        const manualRecovery = new Prisma.Decimal(dto.advanceRecovery);
        let remainingPay = new Prisma.Decimal(base).add(allowances).add(bonus).add(overtimePay)
          .sub(deductions).sub(attendanceDeduction).sub(manualRecovery);
        if (remainingPay.isNegative()) throw new BadRequestException('Deductions cannot exceed gross pay');
        const allocations: Array<{ loanId: string; amount: Prisma.Decimal }> = [];
        for (const loan of loans) {
          if (localDay(loan.issueDate, timezone).slice(0, 7) > period) continue;
          const allocated = loan.repayments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
          const amount = Prisma.Decimal.min(loan.monthlyInstallment!, loan.amount.sub(allocated), remainingPay);
          if (amount.gt(0)) {
            allocations.push({ loanId: loan.id, amount });
            remainingPay = remainingPay.sub(amount);
          }
        }
        const advanceRecovery = allocations.reduce((sum, item) => sum.add(item.amount), manualRecovery);
        if (advanceRecovery.gt(max)) throw new BadRequestException('Payroll recovery exceeds the supported amount');
        return tx.payrollRecord.create({
          data: { period, base, allowances, bonus, deductions, advanceRecovery, overtimePay, attendanceDeduction,
            attendanceBasis: { overtimeMinutes: profile.overtimeMinutes, lateDays, scheduledDates, absences,
              overtimeHourlyRate: dto.overtimeHourlyRate ?? '0', lateDayDeduction: dto.lateDayDeduction ?? '0',
              absentDayDeduction: dto.absentDayDeduction ?? '0', manualRecovery: manualRecovery.toFixed(2) },
            net: remainingPay, employeeId: id, currency: staff.location.company.currency, createdById: actor.userId,
            repayments: { create: allocations.map((allocation) => ({
              ...allocation, isPayrollDeduction: true, paymentDate: new Date(),
            })) },
          },
          select: payrollFields,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A payroll record already exists for this employee and month');
      }
      throw error;
    }
  }

  async markPaid(id: string, payrollId: string, reference: string, actor: RequestUser) {
    this.checkPayrollAccess(actor);
    await this.employee(id, actor);
    const paymentReference = reference.trim();
    if (!paymentReference) throw new BadRequestException('Enter the payment reference');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employees WHERE id = ${id} FOR UPDATE`;
      const now = new Date();
      const changed = await tx.payrollRecord.updateMany({
        where: { id: payrollId, employeeId: id, paidAt: null },
        data: { paidAt: now, paidById: actor.userId, paymentReference },
      });
      const saved = await tx.payrollRecord.findFirst({ where: { id: payrollId, employeeId: id }, select: payrollFields });
      if (!saved) throw new NotFoundException('Payroll record not found');
      if (!changed.count) {
        if (saved.paymentReference !== paymentReference) throw new ConflictException('This payroll record is already marked paid');
        return saved;
      }
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
