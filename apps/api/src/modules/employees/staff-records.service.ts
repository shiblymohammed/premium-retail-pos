import { can } from '../../common/decorators/permission.decorator';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { shiftMetrics } from '../attendance/attendance.service';
import type { CreateUserWithEmployeeDto } from '../users/dto/create-user-with-employee.dto';
import { UsersService } from '../users/users.service';
import type { UpdateEmployeeDto } from './dto';
import type { PayrollDto } from './staff-records.controller';

const employeeFields = {
  id: true, userId: true, locationId: true, firstName: true, lastName: true, employeeCode: true,
  designation: true, hireDate: true, phone: true, address: true, isActive: true,
  location: { select: { name: true, company: { select: { currency: true, timezone: true } } } },
  user: { select: { email: true, role: true, canCancelSales: true, canProcessReturns: true,
    canCountStockAudits: true, discountLimitPercent: true } },
} satisfies Prisma.EmployeeSelect;

const payrollFields = {
  id: true, period: true, currency: true, base: true, allowances: true, bonus: true, deductions: true,
  advanceRecovery: true, net: true, paidAt: true, paymentReference: true,
} satisfies Prisma.PayrollRecordSelect;

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
    const [attendance, sales, drawers, payroll, baseSalary] = await Promise.all([
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
    let started: (typeof attendance)[number] | null = null;
    for (const punch of attendance) {
      if (punch.action === 'IN') started = punch;
      if (punch.action === 'OUT' && started) {
        const metrics = shiftMetrics({
          punchTimestamp: started.at, scheduledEndAt: started.scheduledEndAt, breaks: breaksByShift.get(started.id),
        }, punch.at);
        totals.workMinutes += metrics.workMinutes;
        totals.breakMinutes += metrics.breakMinutes;
        totals.overtimeMinutes += metrics.overtimeMinutes;
        if (metrics.earlyMinutes > 0) totals.earlyCheckouts += 1;
        started = null;
      }
    }
    return { staff, attendance, canManagePayroll: canSeePayroll && canManagePayroll, ...totals, sales: actor.permissionOverrides?.['sales.reports'] === false ? undefined : sales[0],
      drawers: actor.permissionOverrides?.['cash.reports'] === false ? undefined : drawers, payroll,
      baseSalary: baseSalary?.monthlyBaseSalary };

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

  async recordPayroll(id: string, dto: PayrollDto, actor: RequestUser) {
    if (!can(actor, 'payroll.view', actor.role === Role.ADMIN || actor.permissionOverrides?.['payroll.manage'] === true)) {
      throw new ForbiddenException('Payroll visibility is required to modify payroll');
    }
    const staff = await this.employee(id, actor);
    const net = new Prisma.Decimal(dto.base).add(dto.allowances).add(dto.bonus).sub(dto.deductions).sub(dto.advanceRecovery);
    if (net.isNegative()) throw new BadRequestException('Deductions cannot exceed gross pay');
    try {
      return await this.prisma.payrollRecord.create({
        data: { ...dto, net, employeeId: id, currency: staff.location.company.currency, createdById: actor.userId },
        select: payrollFields,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A payroll record already exists for this employee and month');
      }
      throw error;
    }
  }

  async markPaid(id: string, payrollId: string, reference: string, actor: RequestUser) {
    if (!can(actor, 'payroll.view', actor.role === Role.ADMIN || actor.permissionOverrides?.['payroll.manage'] === true)) {
      throw new ForbiddenException('Payroll visibility is required to modify payroll');
    }
    await this.employee(id, actor);
    const paymentReference = reference.trim();
    if (!paymentReference) throw new BadRequestException('Enter the payment reference');
    const changed = await this.prisma.payrollRecord.updateMany({
      where: { id: payrollId, employeeId: id, paidAt: null },
      data: { paidAt: new Date(), paidById: actor.userId, paymentReference },
    });
    const saved = await this.prisma.payrollRecord.findFirst({ where: { id: payrollId, employeeId: id }, select: payrollFields });
    if (!saved) throw new NotFoundException('Payroll record not found');
    if (!changed.count && saved.paymentReference !== paymentReference) throw new ConflictException('This payroll record is already marked paid');
    return saved;
  }
}
