import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { can } from '../../common/decorators/permission.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreditAccountDto, CreditEntryDto, OrderDto, PaymentDto } from './trade.dto';

export const PURCHASE_ORDER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.INVENTORY];
export const SUPPLIER_PAYMENT_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

const orderInclude = {
  lines: { include: { variant: { select: { sku: true, product: { select: { name: true, baseUnit: true, unitsPerCarton: true } } } } } },
  receipts: { select: { id: true, receiptNumber: true, confirmedAt: true, lines: { select: { variantId: true, quantityBaseUnits: true } } } },
  payments: { select: { id: true, amount: true, reference: true, createdAt: true, actor: { select: { email: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class TradeService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(locationId: string, actor: RequestUser) {
    if (!locationId) throw new BadRequestException('Select a location');
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) {
      throw new ForbiddenException('This location is outside your assigned scope');
    }
  }

  private async location(id: string, actor: RequestUser) {
    this.scope(id, actor);
    const location = await this.prisma.location.findFirst({ where: { id, isActive: true },
      select: { type: true, company: { select: { currency: true } } } });
    if (!location) throw new NotFoundException('Location is unavailable');
    return location;
  }

  private text(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`Enter ${field}`);
    return normalized;
  }

  private requirePurchasingAccess(locationId: string, actor: RequestUser) {
    if (!can(actor, 'purchasing.orders', PURCHASE_ORDER_ROLES.includes(actor.role as Role)) &&
      !can(actor, 'purchasing.payments', SUPPLIER_PAYMENT_ROLES.includes(actor.role as Role))) {
      throw new ForbiddenException('Purchase order or supplier payment access is required');
    }
    this.scope(locationId, actor);
  }

  async orders(locationId: string, actor: RequestUser) {
    this.requirePurchasingAccess(locationId, actor);
    return this.prisma.purchaseOrder.findMany({
      where: { locationId }, include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async receipts(locationId: string, actor: RequestUser, search?: string) {
    this.requirePurchasingAccess(locationId, actor);
    const number = typeof search === 'string' ? search.trim().slice(0, 100) : '';
    return this.prisma.supplierReceipt.findMany({
      where: { locationId, ...(number && { receiptNumber: { contains: number, mode: 'insensitive' } }) },
      select: {
        id: true, receiptNumber: true, supplierName: true, confirmedAt: true, notes: true,
        purchaseOrder: { select: { id: true, number: true } },
        lines: { select: { id: true, quantityBaseUnits: true, cartons: true, looseBaseUnits: true, unitsPerCarton: true,
          variant: { select: { sku: true, product: { select: { name: true, baseUnit: true } } } },
        } },
      },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
  }

  async orderCatalog() {
    const variants = await this.prisma.variant.findMany({
      where: { isActive: true, product: { isActive: true } },
      select: { id: true, sku: true, name: true, product: { select: { name: true, baseUnit: true, unitsPerCarton: true } } },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
    });
    return variants.map(({ id, sku, name, product }) => ({
      variantId: id, sku, variant: name, name: product.name, baseUnit: product.baseUnit, unitsPerCarton: product.unitsPerCarton ?? 1,
    }));
  }

  async createOrder(dto: OrderDto, actor: RequestUser) {
    const location = await this.location(dto.locationId, actor);
    const ids = [...new Set(dto.lines.map((line) => line.variantId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException('Add each SKU once');
    const active = await this.prisma.variant.count({ where: { id: { in: ids }, isActive: true, product: { isActive: true } } });
    if (active !== ids.length) throw new BadRequestException('One or more products are unavailable');
    const number = this.text(dto.number, 'the purchase order number').toUpperCase();
    const supplierName = this.text(dto.supplierName, 'the supplier name');
    try {
      return await this.prisma.purchaseOrder.create({
        data: { number, supplierName, locationId: dto.locationId, currency: location.company.currency,
          actorId: actor.userId, lines: { create: dto.lines } },
        include: orderInclude,
      });
    } catch (error) {
      if (this.duplicate(error)) throw new ConflictException('A purchase order with this number already exists at this location');
      throw error;
    }
  }

  async payOrder(id: string, dto: PaymentDto, actor: RequestUser) {
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.gt(0)) throw new BadRequestException('Enter a positive payment amount');
    const reference = this.text(dto.reference, 'the payment reference');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
      if (!order) throw new NotFoundException('Purchase order not found');
      this.scope(order.locationId, actor);
      const previous = order.payments.find((payment) => payment.reference === reference);
      if (previous) {
        if (previous.amount.equals(amount)) return previous;
        throw new ConflictException('This reference was used for a different amount');
      }
      const unitCosts = new Map(order.lines.map((line) => [line.variantId, line.unitCost]));
      const receivedValue = order.receipts.flatMap((receipt) => receipt.lines).reduce(
        (sum, line) => sum.add(unitCosts.get(line.variantId)!.mul(line.quantityBaseUnits)), new Prisma.Decimal(0),
      );
      const paid = order.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (paid.add(amount).gt(receivedValue)) throw new BadRequestException('Payment exceeds the outstanding value of received goods');
      return tx.supplierPayment.create({ data: { orderId: id, amount, reference, actorId: actor.userId } });
    });
  }

  async customers(locationId: string, actor: RequestUser) {
    this.scope(locationId, actor);
    return this.prisma.customerCreditAccount.findMany({ where: { locationId }, orderBy: { name: 'asc' } });
  }

  async createAccount(dto: CreditAccountDto, actor: RequestUser) {
    const location = await this.location(dto.locationId, actor);
    if (location.type !== 'RETAIL_STORE') throw new BadRequestException('Customer credit is recorded at a retail store');
    try {
      return await this.prisma.customerCreditAccount.create({ data: { locationId: dto.locationId, currency: location.company.currency,
        code: this.text(dto.code, 'the customer code').toUpperCase(), name: this.text(dto.name, 'the customer name') } });
    } catch (error) {
      if (this.duplicate(error)) throw new ConflictException('This customer code already exists at the selected store');
      throw error;
    }
  }

  async entries(id: string, actor: RequestUser) {
    const account = await this.prisma.customerCreditAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Customer account not found');
    this.scope(account.locationId, actor);
    const entries = await this.prisma.customerCreditEntry.findMany({
      where: { accountId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { email: true } } },
    });
    return { balance: entries.reduce((sum, entry) => entry.kind === 'CHARGE' ? sum.add(entry.amount) : sum.sub(entry.amount), new Prisma.Decimal(0)), entries };
  }

  async postEntry(id: string, dto: CreditEntryDto, actor: RequestUser) {
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.gt(0)) throw new BadRequestException('Enter a positive amount');
    const reference = this.text(dto.reference, 'the source document reference');
    const note = this.text(dto.note, 'the reason for this entry');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_credit_accounts WHERE id = ${id} FOR UPDATE`;
      const account = await tx.customerCreditAccount.findUnique({ where: { id } });
      if (!account) throw new NotFoundException('Customer account not found');
      this.scope(account.locationId, actor);
      const previous = await tx.customerCreditEntry.findUnique({ where: { accountId_reference: { accountId: id, reference } } });
      if (previous) {
        if (previous.kind === dto.kind && previous.amount.equals(amount) && previous.note === note) return previous;
        throw new ConflictException('This reference was used for a different entry');
      }
      if (dto.kind !== 'CHARGE') {
        const totals = await tx.customerCreditEntry.groupBy({ by: ['kind'], where: { accountId: id }, _sum: { amount: true } });
        const balance = totals.reduce((sum, line) => line.kind === 'CHARGE' ? sum.add(line._sum.amount ?? 0) : sum.sub(line._sum.amount ?? 0), new Prisma.Decimal(0));
        if (amount.gt(balance)) throw new BadRequestException('Amount exceeds the customer’s outstanding balance');
      }
      return tx.customerCreditEntry.create({ data: { accountId: id, kind: dto.kind, amount, reference, note, actorId: actor.userId } });
    });
  }

  private duplicate(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
