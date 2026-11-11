import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationType, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

type UserActor = { userId: string; role: string; locationIds: string[] };

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

  async rotateRefreshTokenHash(userId: string, oldHash: string, newHash: string) {
    return this.prisma.user.updateMany({
      where: { id: userId, refreshTokenHash: oldHash, isActive: true },
      data: { refreshTokenHash: newHash },
    });
  }

  /**
   * Create a new user with a hashed password and validated location scopes.
   */
  async createUser(data: {
    email: string;
    password: string;
    role: Role;
    locationIds?: string[];
  }, actor: UserActor) {
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
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        locationScopes: {
          ...(actor?.role === Role.ADMIN
            ? { where: { locationId: { in: actor.locationIds } } }
            : {}),
          select: { locationId: true },
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
          isActive: true,
          createdAt: true,
          locationScopes: { select: { locationId: true } },
        },
      });
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

  async assignDiscountLimit(
    userId: string,
    input: { discountLimitPercent: number; reason: string },
    actor: UserActor,
  ) {
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

      if (assigningUser.role === Role.ADMIN) {
        if (target.role === Role.ADMIN || target.locationScopes.length === 0 ||
            target.locationScopes.some((scope) => !actor.locationIds.includes(scope.locationId))) {
          throw new ForbiddenException('You can assign discount limits only to users within your authorized scope');
        }
        if (requestedLimit.greaterThan(assigningUser.discountLimitPercent)) {
          throw new ForbiddenException('You cannot assign a discount limit higher than your own');
        }
      } else if (assigningUser.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('Only an Admin or Super Admin can assign discount limits');
      }

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

      if (assigningUser.role === Role.ADMIN) {
        if (target.role === Role.ADMIN || target.locationScopes.length === 0 ||
            target.locationScopes.some((scope) => !actor.locationIds.includes(scope.locationId))) {
          throw new ForbiddenException('You can assign sales permissions only to users within your authorized scope');
        }
      } else if (assigningUser.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('Only an Admin or Super Admin can assign sales permissions');
      }

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
