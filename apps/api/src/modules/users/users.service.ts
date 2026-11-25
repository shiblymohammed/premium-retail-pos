import { PERMISSIONS, PermissionOverrides, can } from '../../common/decorators/permission.decorator';
import { InitialPermissionsDto } from './dto/initial-permissions.dto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationType, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { EmployeeProfileDto } from './dto/employee-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserWithEmployeeDto } from './dto/create-user-with-employee.dto';

type UserActor = { userId: string; role: string; locationIds: string[]; permissionOverrides?: PermissionOverrides };

const employeeProfileSelect = {
  id: true, employeeCode: true, firstName: true, lastName: true, locationId: true, isActive: true,
  phone: true, address: true, designation: true, hireDate: true, monthlyBaseSalary: true,
} satisfies Prisma.EmployeeSelect;

function employeeProfileFields(profile: EmployeeProfileDto) {
  return {
    employeeCode: profile.employeeCode.trim(),
    firstName: profile.firstName.trim(),
    lastName: profile.lastName.trim(),
    hireDate: new Date(profile.hireDate),
    phone: profile.phone,
    address: profile.address?.trim() ?? profile.address,
    designation: profile.designation?.trim() ?? profile.designation,
    monthlyBaseSalary: profile.monthlyBaseSalary,
  };
}

export function roleDefaults(role: Role) {
  return {
    discountLimitPercent: role === Role.ADMIN ? 100 : role === Role.STORE_MANAGER ? 10 : role === Role.CASHIER ? 5 : 0,
    canProcessReturns: role === Role.ADMIN || role === Role.STORE_MANAGER,
    canCancelSales: role === Role.ADMIN,
    canCountStockAudits: role === Role.INVENTORY,
  };
}

function validatePermissionOverrides(overrides: PermissionOverrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
    Object.entries(overrides).some(([key, value]) => !Object.prototype.hasOwnProperty.call(PERMISSIONS, key) || typeof value !== 'boolean')) {
    throw new BadRequestException('Provide supported permission names and boolean values');
  }
}

@Injectable()
export class UsersService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by email (used during login).
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  /**
   * Find a user by ID.
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async permissionProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, role: true, isActive: true, permissionOverrides: true },
    });
    if (!user) throw new NotFoundException('Staff account not found');
    return user;
  }

  async setPermissionProfile(id: string, overrides: PermissionOverrides, actor: UserActor) {
    if (actor.role !== Role.SUPER_ADMIN || actor.userId === id) throw new ForbiddenException('Only a Super Admin can change staff permissions');
    validatePermissionOverrides(overrides);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id }, select: { role: true, isActive: true, permissionOverrides: true } });
      if (!target?.isActive) throw new NotFoundException('Active staff account not found');
      if (target.role === Role.SUPER_ADMIN) throw new ForbiddenException('Super Admin permissions are inherent');
      const updated = await tx.user.update({
        where: { id }, data: { permissionOverrides: overrides }, select: { id: true, role: true, isActive: true, permissionOverrides: true },
      });
      await tx.auditEvent.create({ data: {
        actorId: actor.userId, targetEntity: 'User', targetId: id, action: 'STAFF_PERMISSION_OVERRIDES_UPDATED',
        beforeValue: JSON.stringify(target.permissionOverrides), afterValue: JSON.stringify(overrides),
      } });
      return updated;
    });
  }

  async getDiscountAuthority(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, discountLimitPercent: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      role: user.role,
      unlimited: user.role === Role.SUPER_ADMIN,
      discountLimitPercent: user.role === Role.SUPER_ADMIN ? null : user.discountLimitPercent,
    };
  }

  async getSalesPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, canCancelSales: true, canProcessReturns: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      role: user.role,
      canCancelSales: user.role === Role.SUPER_ADMIN || user.canCancelSales,
      canProcessReturns: user.role === Role.SUPER_ADMIN || user.canProcessReturns,
      permissionsInherited: user.role === Role.SUPER_ADMIN,
    };
  }

  /**
   * Get all location IDs authorized for a user (ADR-004 location axis).
   * SUPER_ADMIN gets an empty array — interpreted as "all locations" by guards.
   */
  async getUserLocationIds(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    // SUPER_ADMIN has implicit global access
    if (user?.role === Role.SUPER_ADMIN) {
      return [];
    }

    const scopes = await this.prisma.userLocationScope.findMany({
      where: { userId },
      select: { locationId: true },
    });

    return scopes.map((s) => s.locationId);
  }

  /**
   * Update last login timestamp.
   */
  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async setRefreshTokenHash(userId: string, refreshTokenHash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  async revokeSessions(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 }, refreshTokenHash: null },
    });
  }

  async rotateRefreshTokenHash(userId: string, oldHash: string, newHash: string) {
    return this.prisma.user.updateMany({
      where: { id: userId, refreshTokenHash: oldHash, isActive: true },
      data: { refreshTokenHash: newHash },
    });
  }

  /**
   * Create a new user with a hashed password and validated location scopes.
   */
  getRolePresets() {
    return Object.fromEntries(Object.values(Role).filter((role) => role !== Role.SUPER_ADMIN)
      .map((role) => [role, roleDefaults(role)]));
  }

  private initialPermissions(role: Role, actor: UserActor, overrides?: InitialPermissionsDto) {
    if (overrides && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can set permission overrides');
    }
    if (overrides && role === Role.SUPER_ADMIN) {
      throw new BadRequestException('Super Admin permissions are built in');
    }
    if (overrides?.permissionOverrides !== undefined) validatePermissionOverrides(overrides.permissionOverrides);
    const defaults = roleDefaults(role);
    return {
      discountLimitPercent: overrides?.discountLimitPercent ?? defaults.discountLimitPercent,
      canCancelSales: overrides?.canCancelSales ?? defaults.canCancelSales,
      canProcessReturns: overrides?.canProcessReturns ?? defaults.canProcessReturns,
      canCountStockAudits: overrides?.canCountStockAudits ?? defaults.canCountStockAudits,
      ...(overrides?.permissionOverrides && { permissionOverrides: overrides.permissionOverrides }),
    };
  }

  async createUser(data: {
    email: string;
    password: string;
    role: Role;
    locationIds?: string[];
    initialPermissions?: InitialPermissionsDto;
  }, actor: UserActor) {
    const permissions = this.initialPermissions(data.role, actor, data.initialPermissions);
    const email = normalizeEmail(data.email);
    if (Buffer.byteLength(data.password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds the supported maximum length');
    }
    if (
      actor.role !== Role.SUPER_ADMIN &&
      (data.role === Role.SUPER_ADMIN || data.role === Role.ADMIN)
    ) {
      throw new ForbiddenException('Only a Super Admin can assign administrative roles');
    }

    const locationIds = [...new Set(data.locationIds ?? [])];
    if (data.role === Role.SUPER_ADMIN && locationIds.length > 0) {
      throw new BadRequestException('Super Admin accounts have global access and must not have location scopes');
    }
    if (data.role !== Role.SUPER_ADMIN && locationIds.length === 0) {
      throw new BadRequestException('At least one allowed location is required for this role');
    }
    if (actor.role !== Role.SUPER_ADMIN && locationIds.some((id) => !actor.locationIds.includes(id))) {
      throw new ForbiddenException('You can only assign locations within your own authorized scope');
    }

    if (locationIds.length > 0) {
      const validLocations = await this.prisma.location.findMany({
        where: { id: { in: locationIds }, isActive: true },
        select: { id: true, type: true },
      });
      if (validLocations.length !== locationIds.length) {
        throw new BadRequestException('Every assigned location must exist and be active');
      }
      this.validateCashierLocations(data.role, locationIds, validLocations);
    }

    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role: data.role,
          ...permissions,
          locationScopes: locationIds.length
            ? { create: locationIds.map((locationId) => ({ locationId })) }
            : undefined,
        },
        select: {
          id: true,
          email: true,
          role: true,
          discountLimitPercent: true,
          canCancelSales: true,
          canProcessReturns: true,
          canCountStockAudits: true,
          isActive: true,
          createdAt: true,
          locationScopes: { select: { locationId: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async createUserWithEmployee(data: CreateUserWithEmployeeDto, actor: UserActor) {
    if (data.monthlyBaseSalary !== undefined && (!can(actor, 'payroll.manage', actor.role === Role.ADMIN) || !can(actor, 'payroll.view', actor.role === Role.ADMIN))) throw new ForbiddenException('Payroll management is required to set base salary');
    const permissions = this.initialPermissions(data.role, actor, data.initialPermissions);
    const email = normalizeEmail(data.email);
    if (Buffer.byteLength(data.password, 'utf8') > 72) {
      throw new BadRequestException('Password exceeds the supported maximum length');
    }
    if (data.role === Role.SUPER_ADMIN) throw new BadRequestException('Super Admin accounts use the global account setup');
    if (data.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can assign administrative roles');
    }
    const locationIds = [...new Set(data.locationIds ?? [])];
    if (!locationIds.includes(data.locationId)) {
      throw new BadRequestException('The employee workplace must be included in the account location assignments');
    }
    if (locationIds.length === 0) throw new BadRequestException('At least one allowed location is required for this role');
    if (actor.role !== Role.SUPER_ADMIN && locationIds.some((id) => !actor.locationIds.includes(id))) {
      throw new ForbiddenException('You can only assign locations within your own authorized scope');
    }
    const validLocations = await this.prisma.location.findMany({
      where: { id: { in: locationIds }, isActive: true },
      select: { id: true, type: true },
    });
    if (validLocations.length !== locationIds.length) {
      throw new BadRequestException('Every assigned location must exist and be active');
    }
    this.validateCashierLocations(data.role, locationIds, validLocations);
    const location = validLocations.find((item) => item.id === data.locationId);
    if (!location) throw new BadRequestException('Employee workplace must be an active assigned location');
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            role: data.role,
            ...permissions,
            locationScopes: { create: locationIds.map((locationId) => ({ locationId })) },
            employee: {
              create: {
                ...employeeProfileFields(data),
                locationId: data.locationId,
                ...(data.reportingToId ? { reportingToId: data.reportingToId } : {}),
              },
            },
          },
          select: {
            id: true, email: true, role: true, discountLimitPercent: true,
            canCancelSales: true, canProcessReturns: true, canCountStockAudits: true,
            isActive: true, createdAt: true,
            locationScopes: { select: { locationId: true } },
            employee: { select: employeeProfileSelect },
          },
        });
        if (data.reportingToId) {
          const manager = await tx.employee.findUnique({ where: { id: data.reportingToId }, select: { id: true, locationId: true, isActive: true } });
          if (!manager?.isActive) throw new NotFoundException('Active reporting manager not found');
          if (manager.locationId !== data.locationId) throw new BadRequestException('Reporting manager must be assigned to the same workplace');
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user email or employee code is already in use');
      }
      throw error;
    }
  }

  /**
   * List all users with optional role filter.
   */
  async findAll(filters?: { role?: Role; isActive?: boolean }, actor?: UserActor) {
    return this.prisma.user.findMany({
      where: {
        role: filters?.role,
        isActive: filters?.isActive,
        ...(actor?.role === Role.ADMIN
          ? {
              role: filters?.role && filters.role !== Role.SUPER_ADMIN && filters.role !== Role.ADMIN
                ? filters.role
                : { notIn: [Role.SUPER_ADMIN, Role.ADMIN] },
              locationScopes: {
                some: { locationId: { in: actor.locationIds } },
                every: { locationId: { in: actor.locationIds } },
              },
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        discountLimitPercent: true,
        canCancelSales: true,
        canProcessReturns: true,
        canCountStockAudits: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        locationScopes: {
          ...(actor?.role === Role.ADMIN
            ? { where: { locationId: { in: actor.locationIds } } }
            : {}),
          select: { locationId: true },
        },
        employee: {
          select: { ...employeeProfileSelect, monthlyBaseSalary: !actor || can(actor, 'payroll.view', actor.role === Role.ADMIN) },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUser(userId: string, data: UpdateUserDto, actor: UserActor) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize authorization against concurrent role/scope changes.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: userId },
        include: { locationScopes: { select: { locationId: true } } },
      });
      if (!current) throw new NotFoundException('User not found');

    const nextRole = data.role ?? current.role;
    const existingLocationIds = current.locationScopes.map((scope) => scope.locationId);
    const locationIds = [...new Set(data.locationIds ?? existingLocationIds)];

    if (actor.role !== Role.SUPER_ADMIN) {
      if (
        current.role === Role.SUPER_ADMIN || current.role === Role.ADMIN ||
        nextRole === Role.SUPER_ADMIN || nextRole === Role.ADMIN
      ) {
        throw new ForbiddenException('Only a Super Admin can change administrative accounts or roles');
      }
      if (
        existingLocationIds.length === 0 ||
        existingLocationIds.some((id) => !actor.locationIds.includes(id)) ||
        locationIds.some((id) => !actor.locationIds.includes(id))
      ) {
        throw new ForbiddenException('You can only manage users within your authorized location scope');
      }
    }

    if (nextRole === Role.SUPER_ADMIN) {
      if (data.locationIds?.length) {
        throw new BadRequestException('Super Admin accounts have global access and must not have location scopes');
      }
      locationIds.length = 0;
    } else if (locationIds.length === 0) {
      throw new BadRequestException('At least one allowed location is required for this role');
    }

    const activeLocations = locationIds.length
      ? await tx.location.findMany({
          where: { id: { in: locationIds }, isActive: true },
          select: { id: true, type: true },
        })
      : [];
    if (activeLocations.length !== locationIds.length) {
      throw new BadRequestException('Every assigned location must exist and be active');
    }
    this.validateCashierLocations(nextRole, locationIds, activeLocations);

      if (data.locationIds !== undefined || nextRole === Role.SUPER_ADMIN) {
        await tx.userLocationScope.deleteMany({ where: { userId } });
        if (locationIds.length) {
          await tx.userLocationScope.createMany({
            data: locationIds.map((locationId) => ({ userId, locationId })),
          });
        }
      }

      if (data.employeeProfile) {
        if (data.employeeProfile.monthlyBaseSalary !== undefined && (!can(actor, 'payroll.manage', actor.role === Role.ADMIN) || !can(actor, 'payroll.view', actor.role === Role.ADMIN))) throw new ForbiddenException('Payroll management is required to change base salary');
        const workplace = locationIds[0];
        if (!workplace || nextRole === Role.SUPER_ADMIN) throw new BadRequestException('An employee profile requires an assigned workplace');
        const profile = employeeProfileFields(data.employeeProfile);
        const existing = await tx.employee.findUnique({ where: { userId }, select: { locationId: true, reportingToId: true } });
        if (existing?.reportingToId && existing.locationId !== workplace) {
          throw new BadRequestException('Clear the reporting manager before moving this employee to a different workplace');
        }
        await tx.employee.upsert({
          where: { userId },
          create: { ...profile, userId, locationId: workplace, isActive: current.isActive },
          update: { ...profile, locationId: workplace },
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          role: nextRole,
          ...(data.role !== undefined || data.locationIds !== undefined
            ? { refreshTokenHash: null }
            : {}),
        },
        select: {
          id: true,
          email: true,
          role: true,
          discountLimitPercent: true,
          canCancelSales: true,
          canProcessReturns: true,
          canCountStockAudits: true,
          employee: { select: { ...employeeProfileSelect,
            monthlyBaseSalary: can(actor, 'payroll.view', actor.role === Role.ADMIN),
          } },
          isActive: true,
          createdAt: true,
          locationScopes: { select: { locationId: true } },
        },
      });
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Employee code is already in use');
      }
      throw error;
    });
  }

  /**
   * Deactivate a user (soft deactivation — never hard delete).
   */
  async deactivateUser(userId: string, actor: UserActor) {
    if (userId === actor.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    return this.prisma.$transaction(async (tx) => {
      // Match updateUser's lock order so role/scope authorization cannot go stale.
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          locationScopes: { select: { locationId: true } },
          employee: { select: { id: true } },
        },
      });
      if (!user) throw new NotFoundException('User not found');
      if (
        actor.role !== Role.SUPER_ADMIN &&
        ((user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) ||
          user.locationScopes.length === 0 ||
          user.locationScopes.some((scope) => !actor.locationIds.includes(scope.locationId)))
      ) {
        throw new ForbiddenException('You are not authorized to deactivate this user');
      }
      const inactive = await tx.user.update({
        where: { id: userId },
        data: { isActive: false, refreshTokenHash: null },
      });
      if (user.employee) {
        await tx.employee.update({
          where: { id: user.employee.id },
          data: { isActive: false },
        });
      }
      return inactive;
    });
  }

  async reactivateUser(userId: string, actor: UserActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { locationScopes: { select: { locationId: true } }, employee: { select: { id: true } } },
      });
      if (!user) throw new NotFoundException('User not found');
      if (actor.role !== Role.SUPER_ADMIN && (
        user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN || user.locationScopes.length === 0 ||
        user.locationScopes.some((scope) => !actor.locationIds.includes(scope.locationId))
      )) {
        throw new ForbiddenException('You are not authorized to reactivate this user');
      }
      if (user.role !== Role.SUPER_ADMIN) {
        const activeLocations = await tx.location.count({ where: { id: { in: user.locationScopes.map((scope) => scope.locationId) }, isActive: true } });
        if (activeLocations === 0) throw new BadRequestException('Assign this user to an active location before reactivating the account.');
      }
      const active = await tx.user.update({ where: { id: userId }, data: { isActive: true } });
      if (user.employee) await tx.employee.update({ where: { id: user.employee.id }, data: { isActive: true } });
      return active;
    });
  }

  async assignDiscountLimit(
    userId: string,
    input: { discountLimitPercent: number; reason: string },
    actor: UserActor,
  ) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change discount limits');
    const requestedLimit = new Prisma.Decimal(input.discountLimitPercent);
    const reason = input.reason.trim();
    if (reason.length < 3) throw new BadRequestException('A reason of at least 3 characters is required');

    return this.prisma.$transaction(async (tx) => {
      if (actor.userId === userId) {
        throw new ForbiddenException('You cannot assign your own discount limit');
      }
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actor.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const [target, assigningUser] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          include: { locationScopes: { select: { locationId: true } } },
        }),
        tx.user.findUnique({
          where: { id: actor.userId },
          select: { id: true, role: true, discountLimitPercent: true, isActive: true },
        }),
      ]);
      if (!target) throw new NotFoundException('User not found');
      if (!assigningUser?.isActive) throw new ForbiddenException('The assigning account is inactive');
      if (target.role === Role.SUPER_ADMIN) {
        throw new BadRequestException('Super Admin accounts are uncapped and cannot be assigned a discount limit');
      }

      if (assigningUser.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change discount limits');


      if (target.discountLimitPercent.equals(requestedLimit)) {
        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, email: true, role: true, discountLimitPercent: true, isActive: true },
        });
      }

      const previousLimit = target.discountLimitPercent;
      const updated = await tx.user.update({
        where: { id: userId },
        data: { discountLimitPercent: requestedLimit },
        select: { id: true, email: true, role: true, discountLimitPercent: true, isActive: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: assigningUser.id,
          action: 'DISCOUNT_LIMIT_ASSIGNED',
          targetEntity: 'User',
          targetId: target.id,
          beforeValue: JSON.stringify({ discountLimitPercent: previousLimit.toString() }),
          afterValue: JSON.stringify({ discountLimitPercent: requestedLimit.toString() }),
          reason,
        },
      });
      return updated;
    });
  }

  async assignSalesPermissions(
    userId: string,
    input: { canCancelSales: boolean; canProcessReturns: boolean; reason: string },
    actor: UserActor,
  ) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change sales permissions');
    const reason = input.reason.trim();
    if (reason.length < 3) throw new BadRequestException('A reason of at least 3 characters is required');

    return this.prisma.$transaction(async (tx) => {
      if (actor.userId === userId) throw new ForbiddenException('You cannot assign your own sales permissions');
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actor.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const [target, assigningUser] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          include: { locationScopes: { select: { locationId: true } } },
        }),
        tx.user.findUnique({
          where: { id: actor.userId },
          select: { id: true, role: true, isActive: true },
        }),
      ]);
      if (!target) throw new NotFoundException('User not found');
      if (!assigningUser?.isActive) throw new ForbiddenException('The assigning account is inactive');
      if (!target.isActive) throw new BadRequestException('Sales permissions can only be assigned to active users');
      if (target.role === Role.SUPER_ADMIN) {
        throw new BadRequestException('Super Admin permissions are inherent and cannot be reassigned');
      }

      if (assigningUser.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change sales permissions');


      const before = { canCancelSales: target.canCancelSales, canProcessReturns: target.canProcessReturns };
      const after = { canCancelSales: input.canCancelSales, canProcessReturns: input.canProcessReturns };
      if (before.canCancelSales === after.canCancelSales && before.canProcessReturns === after.canProcessReturns) {
        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true, email: true, role: true, canCancelSales: true,
            canProcessReturns: true, isActive: true,
          },
        });
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: after,
        select: {
          id: true, email: true, role: true, canCancelSales: true,
          canProcessReturns: true, isActive: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: assigningUser.id,
          action: 'SALES_PERMISSIONS_ASSIGNED',
          targetEntity: 'User',
          targetId: target.id,
          beforeValue: JSON.stringify(before),
          afterValue: JSON.stringify(after),
          reason,
        },
      });
      return updated;
    });
  }

  async assignStockAuditPermission(userId: string, input: { canCountStockAudits: boolean; reason: string }, actor: UserActor) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change stock count permissions');
    const reason = input.reason.trim();
    if (reason.length < 3) throw new BadRequestException('A reason of at least 3 characters is required');
    return this.prisma.$transaction(async (tx) => {
      if (actor.userId === userId) throw new ForbiddenException('You cannot assign your own stock audit count permission');
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actor.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const [target, assigningUser] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, include: { locationScopes: { select: { locationId: true } } } }),
        tx.user.findUnique({ where: { id: actor.userId }, select: { id: true, role: true, isActive: true } }),
      ]);
      if (!target) throw new NotFoundException('User not found');
      if (!assigningUser?.isActive) throw new ForbiddenException('The assigning account is inactive');
      if (!target.isActive) throw new BadRequestException('Permission can only be assigned to active users');
      if (target.role === Role.SUPER_ADMIN) throw new BadRequestException('Super Admin permission is inherent');
      if (assigningUser.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change stock count permissions');

      const before = { canCountStockAudits: target.canCountStockAudits };
      const after = { canCountStockAudits: input.canCountStockAudits };
      if (before.canCountStockAudits === after.canCountStockAudits) return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, role: true, canCountStockAudits: true, isActive: true } });
      const updated = await tx.user.update({ where: { id: userId }, data: after, select: { id: true, email: true, role: true, canCountStockAudits: true, isActive: true } });
      await tx.auditEvent.create({ data: { actorId: assigningUser.id, action: 'STOCK_AUDIT_PERMISSION_ASSIGNED', targetEntity: 'User', targetId: target.id, beforeValue: JSON.stringify(before), afterValue: JSON.stringify(after), reason } });
      return updated;
    });
  }

  private validateCashierLocations(
    role: Role,
    locationIds: string[],
    locations: { id: string; type: LocationType }[],
  ) {
    if (role !== Role.CASHIER) return;
    if (locationIds.length !== 1 || locations[0]?.type !== LocationType.RETAIL_STORE) {
      throw new BadRequestException('A cashier must be assigned to exactly one active retail store');
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
