import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationType } from '@prisma/client';

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
  }) {
    // Validate hierarchy constraints
    if (data.parentId) {
      const parent = await this.prisma.location.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) throw new NotFoundException('Parent location not found');

      // Enforce hierarchy: Sub-Warehouse parent must be Main Warehouse
      // Retail Store parent must be Sub-Warehouse or Main Warehouse
      if (data.type === LocationType.SUB_WAREHOUSE && parent.type !== LocationType.MAIN_WAREHOUSE) {
        throw new BadRequestException('Sub-Warehouse must be under a Main Warehouse');
      }
      if (data.type === LocationType.RETAIL_STORE &&
          parent.type !== LocationType.SUB_WAREHOUSE &&
          parent.type !== LocationType.MAIN_WAREHOUSE) {
        throw new BadRequestException('Retail Store must be under a Warehouse');
      }
    }

    return this.prisma.location.create({ data });
  }

  /**
   * List all locations, optionally filtered by type or active status.
   */
  async findAll(filters?: { type?: LocationType; isActive?: boolean; companyId?: string }) {
    return this.prisma.location.findMany({
      where: {
        type: filters?.type,
        isActive: filters?.isActive,
        companyId: filters?.companyId,
      },
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: { select: { id: true, name: true, type: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find a single location by ID with full hierarchy.
   */
  async findById(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: { select: { id: true, name: true, type: true, isActive: true } },
      },
    });
    if (!location) throw new NotFoundException('Location not found');
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
