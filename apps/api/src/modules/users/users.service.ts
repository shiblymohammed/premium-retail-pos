import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
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
      const validLocations = await this.prisma.location.count({
        where: { id: { in: locationIds }, isActive: true },
      });
      if (validLocations !== locationIds.length) {
        throw new BadRequestException('Every assigned location must exist and be active');
      }
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
              locationScopes: { some: { locationId: { in: actor.locationIds } } },
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
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
    const current = await this.prisma.user.findUnique({
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

    const activeLocationCount = locationIds.length
      ? await this.prisma.location.count({ where: { id: { in: locationIds }, isActive: true } })
      : 0;
    if (activeLocationCount !== locationIds.length) {
      throw new BadRequestException('Every assigned location must exist and be active');
    }

    return this.prisma.$transaction(async (tx) => {
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

    const user = await this.prisma.user.findUnique({
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

    return this.prisma.$transaction(async (tx) => {
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
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
