import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationType, Prisma, Role, TransferStatus } from '@prisma/client';
import { UpdateLocationDto } from './dto/update-location.dto';

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
    managerId?: string;
  }, actor: { userId: string; role: string; locationIds: string[] }) {
    if (actor.role !== Role.SUPER_ADMIN && data.type === LocationType.MAIN_WAREHOUSE) {
      throw new ForbiddenException('Only a Super Admin can create a Main Warehouse');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (data.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: data.managerId },
        select: { id: true, role: true, isActive: true },
      });
      if (!manager || !manager.isActive) {
        throw new BadRequestException('Choose an active user as the location manager.');
      }
      const managerRoles: Role[] = [Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];
      if (!managerRoles.includes(manager.role)) {
        throw new BadRequestException('The location manager must have a manager role.');
      }
    }

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
      if (data.managerId) {
        await tx.userLocationScope.createMany({
          data: [{ userId: data.managerId, locationId: location.id }],
          skipDuplicates: true,
        });
      }
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
        company: { select: { currency: true, invoicePrefix: true } },
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

  async update(id: string, data: UpdateLocationDto) {
    const current = await this.prisma.location.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Location not found');

    const type = data.type ?? current.type;
    const parentId = data.parentId === undefined ? current.parentId : data.parentId;
    if (type === LocationType.MAIN_WAREHOUSE && parentId) {
      throw new BadRequestException('Main Warehouse cannot have a parent location');
    }
    if (type !== LocationType.MAIN_WAREHOUSE && !parentId) {
      throw new BadRequestException('This location type must have a parent warehouse');
    }
    if (parentId) {
      if (parentId === id) throw new BadRequestException('A location cannot be its own parent');
      const parent = await this.prisma.location.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Parent location not found');
      if (!parent.isActive) throw new BadRequestException('Cannot place a location under an inactive parent');
      if (parent.companyId !== current.companyId) throw new BadRequestException('Parent location must belong to the same company');
      if (type === LocationType.SUB_WAREHOUSE && parent.type !== LocationType.MAIN_WAREHOUSE) {
        throw new BadRequestException('Sub-Warehouse must be under a Main Warehouse');
      }
      if (type === LocationType.RETAIL_STORE && parent.type !== LocationType.SUB_WAREHOUSE && parent.type !== LocationType.MAIN_WAREHOUSE) {
        throw new BadRequestException('Retail Store must be under a Warehouse');
      }
      let ancestorId: string | null = parent.parentId;
      while (ancestorId) {
        if (ancestorId === id) throw new BadRequestException('A location cannot be moved under one of its own descendants');
        const ancestor = await this.prisma.location.findUnique({ where: { id: ancestorId }, select: { parentId: true } });
        ancestorId = ancestor?.parentId ?? null;
      }
    }

    if (data.managerId) {
      const manager = await this.prisma.user.findUnique({ where: { id: data.managerId }, select: { id: true, role: true, isActive: true } });
      if (!manager || !manager.isActive) throw new BadRequestException('Choose an active user as the location manager.');
      const managerRoles: Role[] = [Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];
      if (!managerRoles.includes(manager.role)) throw new BadRequestException('The location manager must have a manager role.');
    }

    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.update({ where: { id }, data });
      if (data.managerId) {
        await tx.userLocationScope.createMany({ data: [{ userId: data.managerId, locationId: id }], skipDuplicates: true });
      }
      return location;
    });
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
    return this.prisma.$transaction(async (tx) => {
      // Serialize deactivation against stock writes and transfer creation/dispatch.
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "locations" WHERE "id" = ${id} FOR UPDATE
      `);
      if (rows.length === 0) throw new NotFoundException('Location not found');

      const location = await tx.location.findUnique({ where: { id } });
      if (!location) throw new NotFoundException('Location not found');
      if (!location.isActive) return location;

      const activeChildren = await tx.location.count({ where: { parentId: id, isActive: true } });
      if (activeChildren > 0) {
        throw new BadRequestException(
          'Cannot deactivate location with active child locations. Deactivate children first.',
        );
      }

      const activeTransfers = await tx.transfer.count({
        where: {
          status: { in: [
            TransferStatus.DRAFT,
            TransferStatus.PENDING_APPROVAL,
            TransferStatus.APPROVED,
            TransferStatus.PARTIALLY_DISPATCHED,
            TransferStatus.DISPATCHED,
            TransferStatus.PARTIALLY_RECEIVED,
          ] },
          OR: [{ sourceLocationId: id }, { destLocationId: id }],
        },
      });
      if (activeTransfers > 0) {
        throw new BadRequestException('Cannot deactivate a location while it has active transfers');
      }

      const nonZeroBalances = await tx.$queryRaw<Array<{ variantId: string }>>(Prisma.sql`
        SELECT "variant_id" AS "variantId"
        FROM "inventory_movements"
        WHERE "location_id" = ${id}
        GROUP BY "variant_id", "stock_state"
        HAVING SUM("quantity_base_units") <> 0
        LIMIT 1
      `);
      if (nonZeroBalances.length > 0) {
        throw new BadRequestException('Cannot deactivate a location while it has non-zero inventory balances');
      }

      return tx.location.update({ where: { id }, data: { isActive: false } });
    });
  }

  async reactivate(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');
    if (location.isActive) return location;
    if (location.parentId) {
      const parent = await this.prisma.location.findUnique({ where: { id: location.parentId }, select: { isActive: true } });
      if (!parent?.isActive) throw new BadRequestException('Reactivate the parent warehouse before this location.');
    }
    return this.prisma.location.update({ where: { id }, data: { isActive: true } });
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
