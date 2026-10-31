import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by email (used during login).
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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

  /**
   * Create a new user with hashed password and optional location scopes.
   */
  async createUser(data: {
    email: string;
    password: string;
    role: Role;
    locationIds?: string[];
  }) {
    const passwordHash = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        locationScopes: data.locationIds
          ? {
              create: data.locationIds.map((locationId) => ({ locationId })),
            }
          : undefined,
      },
      include: { locationScopes: true },
    });
  }

  /**
   * List all users with optional role filter.
   */
  async findAll(filters?: { role?: Role; isActive?: boolean }) {
    return this.prisma.user.findMany({
      where: {
        role: filters?.role,
        isActive: filters?.isActive,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        locationScopes: {
          select: { locationId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deactivate a user (soft deactivation — never hard delete).
   */
  async deactivateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }
}
