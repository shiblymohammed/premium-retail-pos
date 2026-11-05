import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto';

type EmployeeActor = { userId: string; role: string; locationIds: string[] };

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEmployeeDto, actor: EmployeeActor) {
    this.assertLocationScope(actor, data.locationId);
    await this.assertActiveLocation(data.locationId);
    await this.assertActiveUser(data.userId, data.locationId);
    await this.assertManager(data.reportingToId, data.locationId);

    try {
      const employee = await this.prisma.employee.create({
        data: { ...data, hireDate: new Date(data.hireDate) },
        include: employeeInclude,
      });
      return withLoansPlaceholder(employee);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Employee code or user profile is already in use');
      }
      throw error;
    }
  }

  async findAll(filters: { locationId?: string; isActive?: boolean }, actor: EmployeeActor) {
    if (filters.locationId) this.assertLocationScope(actor, filters.locationId);
    const locationFilter = actor.role === Role.SUPER_ADMIN
      ? filters.locationId
      : filters.locationId ?? { in: actor.locationIds };

    const employees = await this.prisma.employee.findMany({
      where: {
        ...(typeof locationFilter === 'string'
          ? { locationId: locationFilter }
          : locationFilter
            ? { locationId: locationFilter }
            : {}),
        isActive: filters.isActive,
      },
      include: employeeInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map(withLoansPlaceholder);
  }

  async findOne(id: string, actor: EmployeeActor) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundException('Employee profile not found');
    this.assertLocationScope(actor, employee.locationId);
    return withLoansPlaceholder(employee);
  }

  async update(id: string, data: UpdateEmployeeDto, actor: EmployeeActor) {
    const current = await this.prisma.employee.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Employee profile not found');
    this.assertLocationScope(actor, current.locationId);

    const locationId = data.locationId ?? current.locationId;
    this.assertLocationScope(actor, locationId);
    if (data.locationId) {
      await this.assertActiveLocation(data.locationId);
      await this.assertUserLocationScope(current.userId, data.locationId);
    }
    const managerId = data.reportingToId !== undefined
      ? data.reportingToId ?? undefined
      : current.reportingToId ?? undefined;
    await this.assertManager(managerId, locationId, current.id);

    try {
      const employee = await this.prisma.employee.update({
        where: { id },
        data: {
          ...data,
          ...(data.hireDate ? { hireDate: new Date(data.hireDate) } : {}),
        },
        include: employeeInclude,
      });
      return withLoansPlaceholder(employee);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Employee code is already in use');
      }
      throw error;
    }
  }

  async deactivate(id: string, actor: EmployeeActor) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee profile not found');
    if (employee.userId === actor.userId) {
      throw new BadRequestException('You cannot deactivate your own employee profile');
    }
    this.assertLocationScope(actor, employee.locationId);
    return this.prisma.$transaction(async (tx) => {
      const inactive = await tx.employee.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, employeeCode: true, isActive: true, userId: true },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false, refreshTokenHash: null },
      });
      const { userId: _userId, ...result } = inactive;
      return result;
    });
  }

  private assertLocationScope(actor: EmployeeActor, locationId: string): void {
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) {
      throw new ForbiddenException('You are not authorized for this workplace');
    }
  }

  private async assertActiveLocation(locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, isActive: true },
    });
    if (!location) throw new NotFoundException('Workplace location not found');
    if (!location.isActive) throw new BadRequestException('Employee workplace must be active');
  }

  private async assertActiveUser(userId: string, locationId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        role: true,
        employee: { select: { id: true } },
        locationScopes: { select: { locationId: true } },
      },
    });
    if (!user) throw new NotFoundException('User account not found');
    if (!user.isActive) throw new BadRequestException('Employee user account must be active');
    if (user.employee) throw new ConflictException('This user already has an employee profile');
    if (user.role !== Role.SUPER_ADMIN && !user.locationScopes.some((scope) => scope.locationId === locationId)) {
      throw new BadRequestException('Employee user account must be authorized for its workplace');
    }
  }

  private async assertUserLocationScope(userId: string, locationId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
        locationScopes: { select: { locationId: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('Employee user account must be active to change workplaces');
    }
    if (user.role !== Role.SUPER_ADMIN && !user.locationScopes.some((scope) => scope.locationId === locationId)) {
      throw new BadRequestException('Employee user account must be authorized for the new workplace');
    }
  }

  private async assertManager(managerId: string | undefined, locationId: string, employeeId?: string): Promise<void> {
    if (!managerId) return;
    if (employeeId && managerId === employeeId) {
      throw new BadRequestException('An employee cannot report to themselves');
    }

    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      select: { id: true, locationId: true, isActive: true, reportingToId: true },
    });
    if (!manager || !manager.isActive) throw new NotFoundException('Active reporting manager not found');
    if (manager.locationId !== locationId) {
      throw new BadRequestException('Reporting manager must be assigned to the same workplace');
    }

    const seen = new Set<string>(employeeId ? [employeeId] : []);
    let cursor: typeof manager | null = manager;
    while (cursor) {
      if (seen.has(cursor.id)) throw new BadRequestException('Reporting assignment would create a management cycle');
      seen.add(cursor.id);
      cursor = cursor.reportingToId
        ? await this.prisma.employee.findUnique({
            where: { id: cursor.reportingToId },
            select: { id: true, locationId: true, isActive: true, reportingToId: true },
          })
        : null;
    }
  }
}

const employeeInclude = {
  user: { select: { id: true, email: true, role: true, isActive: true } },
  location: { select: { id: true, name: true, type: true, isActive: true } },
  reportingTo: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeInclude;

function withLoansPlaceholder<T extends { [key: string]: unknown }>(employee: T) {
  return {
    ...employee,
    loansAdvancesSummary: {
      status: 'planned',
      message: 'Loans and advances tracking is planned for Phase 9.',
    },
  };
}
