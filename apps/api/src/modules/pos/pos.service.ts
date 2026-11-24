import { can, PermissionKey } from '../../common/decorators/permission.decorator';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashDrawerSession, InvoiceStatus, LocationType, Prisma, Role } from '@prisma/client';
import { CloseCashDrawerDto, OpenCashDrawerDto } from './dto/cash-drawer.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { CHECKOUT_ROLES, checkoutLocationId } from './checkout-access';
import { PrismaService } from '../../prisma/prisma.service';

type Operator = Pick<RequestUser, 'userId' | 'role' | 'locationIds' | 'permissionOverrides'>;

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  async getTerminalContext(actor: Operator, requestedLocationId?: string) {
    const roleDefault = CHECKOUT_ROLES.includes(actor.role as Role);
    const access = {
      checkout: can(actor, 'sales.checkout', roleDefault),
      drawer: can(actor, 'cash.drawer', roleDefault),
      receipts: can(actor, 'sales.receipts', roleDefault),
    };
    const permission = access.checkout ? 'sales.checkout' : access.drawer ? 'cash.drawer' : 'sales.receipts';
    const location = await this.getCheckoutLocation(actor, requestedLocationId, permission);

    return { access,
      cashierUserId: actor.userId,
      location: {
        id: location.id,
        name: location.name,
        type: location.type,
        currency: location.company.currency,
        requireCheckoutDrawer: location.company.requireCheckoutDrawer,
      },
    };
  }

  async getOfflineCatalog(actor: Operator, requestedLocationId?: string) {
    await this.getCheckoutLocation(actor, requestedLocationId);
    return this.prisma.product.findMany({
      // The current catalogue schema is global (Product has no companyId); only safe sale fields are exposed here.
      where: { isActive: true, variants: { some: { isActive: true } } },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        unitsPerCarton: true,
        sellByCarton: true,
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
    actor: Operator,
    input: { variantId: string; quantityRemoved: number; reason?: string },
    requestedLocationId?: string,
  ) {
    const location = await this.getCheckoutLocation(actor, requestedLocationId);
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

  async recentReceipts(actor: Operator, requestedLocationId?: string, invoiceNumber?: string) {
    const location = await this.getCheckoutLocation(actor, requestedLocationId, 'sales.receipts');
    const search = invoiceNumber?.trim().slice(0, 100);
    return this.prisma.invoice.findMany({
      where: {
        locationId: location.id,
        status: InvoiceStatus.FINALIZED,
        ...(actor.role === Role.CASHIER ? { cashierUserId: actor.userId } : {}),
        ...(search ? { invoiceNumber: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true, invoiceNumber: true, createdAt: true, grossTotal: true, discountTotal: true, netTotal: true,
        payment: { select: { method: true, amount: true, cashTenderedAmount: true, changeGivenAmount: true } },
        lines: { select: {
          id: true, quantityBaseUnits: true, unitPriceAtSale: true, lineTotal: true,
          variant: { select: { sku: true, name: true, product: { select: { name: true, baseUnit: true } } } },
        } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
    });
  }

  async cashDrawers(actor: Operator, requestedLocationId?: string) {
    const { id: locationId } = await this.getCheckoutLocation(actor, requestedLocationId, 'cash.drawer');
    const where = { operatorId: actor.userId, locationId };
    const [drawer, history] = await Promise.all([
      this.prisma.cashDrawerSession.findFirst({ where: { ...where, closedAt: null } }),
      this.prisma.cashDrawerSession.findMany({
        where: { ...where, closedAt: { not: null } }, orderBy: { closedAt: 'desc' }, take: 20,
      }),
    ]);
    return { drawer: drawer ? { ...drawer, ...await this.drawerTotals(this.prisma, drawer) } : null, history };
  }

  async openCashDrawer(actor: Operator, dto: OpenCashDrawerDto, requestedLocationId?: string) {
    const { id: locationId } = await this.getCheckoutLocation(actor, requestedLocationId, 'cash.drawer');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const existing = await tx.cashDrawerSession.findFirst({ where: { operatorId: actor.userId, locationId, closedAt: null } });
      if (existing && !existing.openingCash.equals(dto.openingCash)) throw new ConflictException('A cash drawer is already open');
      return existing ?? tx.cashDrawerSession.create({ data: { operatorId: actor.userId, locationId, openingCash: dto.openingCash } });
    });
  }

  async closeCashDrawer(actor: Operator, dto: CloseCashDrawerDto, requestedLocationId?: string) {
    const { id: locationId } = await this.getCheckoutLocation(actor, requestedLocationId, 'cash.drawer');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const drawer = await tx.cashDrawerSession.findFirst({ where: { id: dto.id, operatorId: actor.userId, locationId } });
      if (!drawer) throw new NotFoundException('Cash drawer not found');
      if (drawer.closedAt) {
        if (drawer.countedCash?.equals(dto.countedCash) && drawer.countedCard?.equals(dto.countedCard)) return drawer;
        throw new ConflictException('This drawer has already been closed');
      }
      const totals = await this.drawerTotals(tx, drawer);
      return tx.cashDrawerSession.update({
        where: { id: drawer.id },
        data: { ...totals, closedAt: new Date(), countedCash: dto.countedCash, countedCard: dto.countedCard },
      });
    });
  }

  private async drawerTotals(db: Prisma.TransactionClient, drawer: CashDrawerSession) {
    const [payments, refunds] = await Promise.all([
      db.invoicePayment.groupBy({ by: ['method'], where: { cashDrawerId: drawer.id }, _sum: { amount: true } }),
      db.invoiceRefund.groupBy({ by: ['method'], where: { cashDrawerId: drawer.id }, _sum: { amount: true } }),
    ]);
    const net = (method: 'CARD' | 'CASH') => new Prisma.Decimal(payments.find((row) => row.method === method)?._sum.amount ?? 0)
      .sub(refunds.find((row) => row.method === method)?._sum.amount ?? 0);
    return { expectedCash: drawer.openingCash.add(net('CASH')), expectedCard: net('CARD') };
  }

  private async getCheckoutLocation(actor: Operator, requestedLocationId?: string, permission?: PermissionKey) {
    const locationId = checkoutLocationId(actor, requestedLocationId, permission);
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, type: true, isActive: true, company: { select: { currency: true, requireCheckoutDrawer: true } } },
    });
    if (!location) throw new NotFoundException('Retail store not found');
    if (!location.isActive || location.type !== LocationType.RETAIL_STORE) {
      throw new ForbiddenException('Choose an active retail store for checkout');
    }

    return location;
  }
}
