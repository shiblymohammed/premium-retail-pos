import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationType, Role } from '@prisma/client';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new location within the organizational hierarchy.
   * Main Warehouse → Sub-Warehouses → Retail Stores
   */
  async create(data: {
    companyId: string;
    name: string;
    type: LocationType;
    address?: string;
    latitude?: number;
    longitude?: number;
    geofenceRadius?: number;
    parentId?: string;
  }, actor: { userId: string; role: string; locationIds: string[] }) {
    if (actor.role !== Role.SUPER_ADMIN && data.type === LocationType.MAIN_WAREHOUSE) {
      throw new ForbiddenException('Only a Super Admin can create a Main Warehouse');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (data.type === LocationType.MAIN_WAREHOUSE && data.parentId) {
      throw new BadRequestException('Main Warehouse cannot have a parent location');
    }
    if (data.type !== LocationType.MAIN_WAREHOUSE && !data.parentId) {
      throw new BadRequestException(`${data.type === LocationType.SUB_WAREHOUSE ? 'Sub-Warehouse' : 'Retail Store'} must have a parent location`);
    }

    // Validate parent existence, company ownership, and hierarchy constraints.
    if (data.parentId) {
      const parent = await this.prisma.location.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) throw new NotFoundException('Parent location not found');
      if (!parent.isActive) throw new BadRequestException('Cannot place a location under an inactive parent');
      if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(parent.id)) {
        throw new ForbiddenException('You can only create locations under a workplace in your authorized scope');
      }
      if (parent.companyId !== data.companyId) {
        throw new BadRequestException('Parent location must belong to the same company');
      }

      if (data.type === LocationType.SUB_WAREHOUSE && parent.type !== LocationType.MAIN_WAREHOUSE) {
        throw new BadRequestException('Sub-Warehouse must be under a Main Warehouse');
      }
      if (
        data.type === LocationType.RETAIL_STORE &&
        parent.type !== LocationType.SUB_WAREHOUSE &&
        parent.type !== LocationType.MAIN_WAREHOUSE
      ) {
        throw new BadRequestException('Retail Store must be under a Warehouse');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.create({ data });
      if (actor.role === Role.ADMIN) {
        await tx.userLocationScope.create({
          data: { userId: actor.userId, locationId: location.id },
        });
      }
      return location;
    });
  }

  /**
   * List all locations, optionally filtered by type or active status.
   */
  async findAll(filters?: { type?: LocationType; isActive?: boolean; companyId?: string; allowedLocationIds?: string[] }) {
    const locations = await this.prisma.location.findMany({
      where: {
        type: filters?.type,
        isActive: filters?.isActive,
        companyId: filters?.companyId,
        ...(filters?.allowedLocationIds ? { id: { in: filters.allowedLocationIds } } : {}),
      },
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: {
          ...(filters?.allowedLocationIds !== undefined
            ? { where: { id: { in: filters.allowedLocationIds } } }
            : {}),
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    if (filters?.allowedLocationIds === undefined) return locations;
    const allowed = new Set(filters.allowedLocationIds);
    return locations.map((location) => ({
      ...location,
      parent: location.parent && allowed.has(location.parent.id) ? location.parent : null,
      children: location.children.filter((child) => allowed.has(child.id)),
    }));
  }

  /**
   * Find a single location by ID with full hierarchy.
   */
  async findById(id: string, allowedLocationIds?: string[]) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: {
          ...(allowedLocationIds !== undefined
            ? { where: { id: { in: allowedLocationIds } } }
            : {}),
          select: { id: true, name: true, type: true, isActive: true },
        },
      },
    });
    if (!location) throw new NotFoundException('Location not found');
    if (allowedLocationIds !== undefined) {
      const allowed = new Set(allowedLocationIds);
      return {
        ...location,
        parent: location.parent && allowed.has(location.parent.id) ? location.parent : null,
      };
    }
    return location;
  }

  /**
   * Soft-deactivate a location.
   * Hard deletion is prohibited if stock or transfer history exists.
   */
  async deactivate(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');

    // Check for active children
    const activeChildren = await this.prisma.location.count({
      where: { parentId: id, isActive: true },
    });
    if (activeChildren > 0) {
      throw new BadRequestException(
        'Cannot deactivate location with active child locations. Deactivate children first.',
      );
    }

    return this.prisma.location.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Set or clear the audit lock flag (ADR-010).
   * Called when an audit session starts or ends.
   */
  async setAuditLock(locationId: string, locked: boolean) {
    return this.prisma.location.update({
      where: { id: locationId },
      data: { isAuditLocked: locked },
    });
  }
}
