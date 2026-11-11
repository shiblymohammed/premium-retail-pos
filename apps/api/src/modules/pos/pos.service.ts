import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  async getTerminalContext(actor: { userId: string; role: string; locationIds: string[] }) {
    const location = await this.getCashierLocation(actor);

    return {
      cashierUserId: actor.userId,
      location: {
        id: location.id,
        name: location.name,
        type: location.type,
        currency: location.company.currency,
      },
    };
  }

  async getOfflineCatalog(actor: { userId: string; role: string; locationIds: string[] }) {
    await this.getCashierLocation(actor);
    return this.prisma.product.findMany({
      // The current catalogue schema is global (Product has no companyId); only safe sale fields are exposed here.
      where: { isActive: true, variants: { some: { isActive: true } } },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        unitsPerCarton: true,
        hasVariants: true,
        sellingPrice: true,
        variants: {
          where: { isActive: true },
          select: { id: true, sku: true, barcode: true, name: true, isActive: true },
          orderBy: { sku: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async logCartDeletion(
    actor: { userId: string; role: string; locationIds: string[] },
    input: { variantId: string; quantityRemoved: number; reason?: string },
  ) {
    const location = await this.getCashierLocation(actor);
    const variant = await this.prisma.variant.findFirst({
      // Keep the audit possible if the catalogue item was deactivated while it remained in a draft basket.
      where: { id: input.variantId },
      select: { id: true },
    });
    if (!variant) throw new BadRequestException('The removed item variant does not exist');
    if (!Number.isSafeInteger(input.quantityRemoved) || input.quantityRemoved < 1) {
      throw new BadRequestException('quantityRemoved must be a positive safe integer');
    }

    return this.prisma.cartDeletionLog.create({
      data: {
        locationId: location.id,
        cashierUserId: actor.userId,
        variantId: variant.id,
        quantityRemoved: input.quantityRemoved,
        reason: input.reason?.trim() || null,
      },
    });
  }

  private async getCashierLocation(actor: { userId: string; role: string; locationIds: string[] }) {
    if (actor.role !== Role.CASHIER) {
      throw new ForbiddenException('Only cashier accounts can open a cashier terminal');
    }
    if (actor.locationIds.length !== 1) {
      throw new ForbiddenException('Cashier must be bound to exactly one retail store');
    }

    const location = await this.prisma.location.findUnique({
      where: { id: actor.locationIds[0] },
      select: { id: true, name: true, type: true, isActive: true, company: { select: { currency: true } } },
    });
    if (!location) throw new NotFoundException('Cashier store not found');
    if (!location.isActive || location.type !== LocationType.RETAIL_STORE) {
      throw new ForbiddenException('Cashier is not bound to an active retail store');
    }

    return location;
  }
}
