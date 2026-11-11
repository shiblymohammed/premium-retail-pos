import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, LocationType, MovementType, PaymentMethod, Prisma, RefundMethod, RefundType, ReturnDisposition, Role, StockState } from '@prisma/client';
import { createHash } from 'crypto';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateSaleDto, SaleUnit } from './dto/create-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { QuoteSaleDto } from './dto/quote-sale.dto';

type Tx = Prisma.TransactionClient;
type SaleActor = Pick<RequestUser, 'userId' | 'role' | 'locationIds'>;
const saleInclude = {
  lines: { include: { variant: { select: { id: true, sku: true, barcode: true, name: true, product: { select: { id: true, name: true, baseUnit: true } } } } } },
  payment: true,
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async createSale(dto: CreateSaleDto, actor: SaleActor, rawIdempotencyKey?: string) {
    const key = this.requireIdempotencyKey(rawIdempotencyKey);
    const method = 'POST';
    const endpoint = '/api/v1/sales';
    const payloadHash = this.hash({ actorId: actor.userId, payload: dto });
    const replay = await this.findReplay(key, method, endpoint, payloadHash);
    if (replay.found) return replay.value;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          WITH advisory_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
          ) SELECT 1 AS locked FROM advisory_lock
        `);
        const now = new Date();
        await tx.idempotencyRecord.deleteMany({ where: { idempotencyKey: key, expiresAt: { lte: now } } });
        const existing = await tx.idempotencyRecord.findUnique({ where: { idempotencyKey: key } });
        if (existing) return this.readReplay(existing, method, endpoint, payloadHash);
        const priorInvoice = await tx.invoice.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
        if (priorInvoice) throw new ConflictException('This sale was already finalized with this Idempotency-Key; use a new key for a new sale');

        const cashierRows = await tx.$queryRaw<Array<{ id: string; role: Role; isActive: boolean; discountLimitPercent: Prisma.Decimal }>>(Prisma.sql`
          SELECT "id", "role", "is_active" AS "isActive", "discount_limit_percent" AS "discountLimitPercent"
          FROM "users" WHERE "id" = ${actor.userId} FOR SHARE
        `);
        const cashier = cashierRows[0];
        if (!cashier?.isActive || cashier.role !== Role.CASHIER) throw new ForbiddenException('An active cashier account is required');
        const scopes = await tx.userLocationScope.findMany({ where: { userId: actor.userId }, select: { locationId: true } });
        if (scopes.length !== 1 || actor.locationIds.length !== 1 || scopes[0].locationId !== actor.locationIds[0]) {
          throw new ForbiddenException('Cashier must be bound to exactly one retail store');
        }
        const location = await tx.location.findUnique({
          where: { id: scopes[0].locationId },
          select: { id: true, name: true, type: true, companyId: true, isActive: true, isAuditLocked: true },
        });
        if (!location?.isActive || location.type !== LocationType.RETAIL_STORE) throw new ForbiddenException('Cashier is not bound to an active retail store');
        if (location.isAuditLocked) throw new ConflictException('Location is locked for a stock audit');

        const lineVariantIds = dto.lines.map((line) => line.variantId);
        if (new Set(lineVariantIds).size !== lineVariantIds.length) throw new BadRequestException('A variant can appear only once per sale');
        if (dto.billDiscountPercent && dto.lines.some((line) => (line.discountPercent ?? 0) > 0)) {
          throw new BadRequestException('Line discounts and bill discounts cannot be combined');
        }

        await tx.$queryRaw(Prisma.sql`
          SELECT v."id" FROM "variants" v JOIN "products" p ON p."id" = v."product_id"
          WHERE v."id" IN (${Prisma.join(lineVariantIds)}) AND v."is_active" = true AND p."is_active" = true
          ORDER BY v."id" FOR SHARE OF v, p
        `);
        const variants = await tx.variant.findMany({
          where: { id: { in: lineVariantIds }, isActive: true, product: { isActive: true } },
          include: { product: { select: { id: true, name: true, baseUnit: true, unitsPerCarton: true, sellingPrice: true } } },
        });
        if (variants.length !== lineVariantIds.length) throw new NotFoundException('One or more active product variants were not found');
        const variantById = new Map(variants.map((variant) => [variant.id, variant]));
        const lines = dto.lines.map((input) => {
          const variant = variantById.get(input.variantId)!;
          const ratio = variant.product.unitsPerCarton;
          if (input.enteredUnit === SaleUnit.CARTON && (!ratio || ratio < 1)) throw new BadRequestException(`${variant.product.name} is not sold by carton`);
          const quantityBaseUnits = input.quantity * (input.enteredUnit === SaleUnit.CARTON ? ratio! : 1);
          if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits < 1 || quantityBaseUnits > 2147483647) {
            throw new BadRequestException('Sale quantity exceeds the supported range');
          }
          const gross = variant.product.sellingPrice.mul(quantityBaseUnits).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          const discountPercent = new Prisma.Decimal(input.discountPercent ?? 0);
          const discount = gross.mul(discountPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          return { input, variant, quantityBaseUnits, gross, discount, billDiscount: new Prisma.Decimal(0), lineNet: gross.sub(discount) };
        });

        const grossTotal = lines.reduce((sum, line) => sum.add(line.gross), new Prisma.Decimal(0)).toDecimalPlaces(2);
        const maxMoney = new Prisma.Decimal('9999999999.99');
        if (grossTotal.gt(maxMoney)) throw new BadRequestException('Sale total exceeds the supported invoice amount');
        const lineDiscountTotal = lines.reduce((sum, line) => sum.add(line.discount), new Prisma.Decimal(0)).toDecimalPlaces(2);
        const billDiscountPercent = new Prisma.Decimal(dto.billDiscountPercent ?? 0);
        const billDiscountTotal = grossTotal.sub(lineDiscountTotal).mul(billDiscountPercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const billDiscountAllocations = this.allocateBillDiscount(lines.map((line) => ({
          variantId: line.variant.id,
          netBeforeBillDiscount: line.gross.sub(line.discount),
        })), billDiscountTotal);
        lines.forEach((line, index) => {
          line.billDiscount = new Prisma.Decimal(billDiscountAllocations[index].toString()).div(100);
          line.lineNet = line.gross.sub(line.discount).sub(line.billDiscount).toDecimalPlaces(2);
        });
        const discountTotal = lineDiscountTotal.add(billDiscountTotal).toDecimalPlaces(2);
        // This route is cashier-only; Super Admin sales use the cashier account assigned to the terminal.
        const maxDiscountPercent = new Prisma.Decimal(cashier.discountLimitPercent);
        if (grossTotal.isZero()) throw new BadRequestException('Sale total must be greater than zero');
        if (discountTotal.mul(100).gt(grossTotal.mul(maxDiscountPercent))) {
          throw new ForbiddenException(`Discount exceeds the cashier's ${maxDiscountPercent.toFixed(2)}% limit`);
        }
        const netTotal = grossTotal.sub(discountTotal).toDecimalPlaces(2);
        if (netTotal.lte(0)) throw new BadRequestException('Sale total after discount must be greater than zero');
        const submittedPaymentAmount = new Prisma.Decimal(dto.paymentAmount).toDecimalPlaces(2);
        if (!submittedPaymentAmount.equals(netTotal)) {
          throw new ConflictException(`Current server total is ${netTotal.toFixed(2)}; refresh prices and confirm payment again`);
        }
        const paymentMethod = dto.paymentMethod as PaymentMethod;
        let cashTendered: Prisma.Decimal | null = null;
        let changeGiven: Prisma.Decimal | null = null;
        let transactionReference: string | null = dto.transactionReference?.trim() || null;
        if (paymentMethod === PaymentMethod.CASH) {
          if (dto.cashTenderedAmount === undefined) throw new BadRequestException('cashTenderedAmount is required for cash payments');
          cashTendered = new Prisma.Decimal(dto.cashTenderedAmount).toDecimalPlaces(2);
          if (cashTendered.lt(netTotal)) throw new BadRequestException('Cash tendered must be at least the sale total');
          changeGiven = cashTendered.sub(netTotal).toDecimalPlaces(2);
          if (cashTendered.gt(maxMoney)) throw new BadRequestException('Cash tendered exceeds the supported amount');
          if (transactionReference) throw new BadRequestException('Cash payments cannot include a transaction reference');
        } else {
          if (dto.cashTenderedAmount !== undefined) throw new BadRequestException('Cash tendered is valid only for cash payments');
          const referenceDigits = transactionReference?.replace(/\D/g, '') ?? '';
          if (referenceDigits.length >= 12 && referenceDigits.length <= 19) {
            throw new BadRequestException('Do not store payment card numbers in transaction references');
          }
          if (transactionReference?.length === 0) transactionReference = null;
        }

        const sequenceRows = await tx.$queryRaw<Array<{ invoicePrefix: string; invoiceSequence: number }>>(Prisma.sql`
          UPDATE "companies" SET "invoice_sequence" = "invoice_sequence" + 1
          WHERE "id" = ${location.companyId}
          RETURNING "invoice_prefix" AS "invoicePrefix", "invoice_sequence" AS "invoiceSequence"
        `);
        if (!sequenceRows.length) throw new NotFoundException('Company configuration not found');
        const sequence = sequenceRows[0];
        const invoiceNumber = `${sequence.invoicePrefix}-${String(sequence.invoiceSequence).padStart(8, '0')}`;
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            locationId: location.id,
            cashierUserId: actor.userId,
            status: InvoiceStatus.FINALIZED,
            grossTotal,
            discountTotal,
            billDiscountTotal,
            netTotal,
            idempotencyKey: key,
            lines: { create: lines.map((line) => ({
              variantId: line.variant.id,
              quantityBaseUnits: line.quantityBaseUnits,
              enteredUnit: line.input.enteredUnit === SaleUnit.CARTON ? 'carton' : line.variant.product.baseUnit,
              conversionRatioUsed: line.input.enteredUnit === SaleUnit.CARTON ? line.variant.product.unitsPerCarton : null,
              unitPriceAtSale: line.variant.product.sellingPrice,
              discountAmount: line.discount,
              billDiscountAmount: line.billDiscount,
              lineTotal: line.lineNet,
            })) },
          },
          select: { id: true, invoiceNumber: true },
        });
        await tx.invoicePayment.create({ data: {
          invoiceId: invoice.id,
          method: paymentMethod,
          amount: netTotal,
          cashTenderedAmount: cashTendered,
          changeGivenAmount: changeGiven,
          transactionReference,
          recordedByUserId: actor.userId,
        } });
        for (const line of lines) {
          await this.inventory.recordMovement(tx, {
            locationId: location.id,
            variantId: line.variant.id,
            actorId: actor.userId,
            type: MovementType.SALE,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: -line.quantityBaseUnits,
            referenceType: 'sale_invoice',
            referenceId: invoice.id,
            notes: `Sale ${invoice.invoiceNumber}`,
          });
        }

        const result = await tx.invoice.findUnique({ where: { id: invoice.id }, include: saleInclude });
        await tx.auditEvent.create({ data: {
          actorId: actor.userId,
          action: 'SALE_FINALIZED',
          targetEntity: 'Invoice',
          targetId: invoice.id,
          afterValue: JSON.stringify({ invoiceNumber, locationId: location.id, grossTotal: grossTotal.toFixed(2), discountTotal: discountTotal.toFixed(2), netTotal: netTotal.toFixed(2), paymentMethod }),
        } });
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey: key,
            payloadHash,
            httpMethod: method,
            endpoint,
            statusCode: 201,
            responseBody: JSON.stringify(result),
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const replay = await this.findReplay(key, method, endpoint, payloadHash);
        if (replay.found) return replay.value;
      }
      throw error;
    }
  }

  async cancelSale(invoiceId: string, dto: CancelSaleDto, actor: SaleActor, rawIdempotencyKey?: string) {
    const reason = dto.reason.trim();
    const reference = this.cleanRefundReference(dto.refundReference);
    const endpoint = `/api/v1/sales/${invoiceId}/cancel`;
    return this.runIdempotentMutation(rawIdempotencyKey, 'PATCH', endpoint, actor, { invoiceId, reason, refundMethod: dto.refundMethod, reference }, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { lines: true, payment: true, returns: { select: { id: true } } } });
      if (!invoice) throw new NotFoundException('Sale invoice not found');
      await this.requireSalePermission(tx, actor, invoice.locationId, 'canCancelSales');
      if (invoice.status !== InvoiceStatus.FINALIZED) throw new ConflictException('Only a finalized sale can be cancelled');
      if (invoice.returns.length) throw new ConflictException('A sale with a recorded return cannot be cancelled; return the remaining items separately');
      if (!invoice.payment) throw new ConflictException('Sale payment record is missing; cancellation is blocked for reconciliation');
      if (!dto.goodsReturnedToStore) throw new BadRequestException('Confirm all sale goods are physically back at this store before cancellation');

      const cancelledAt = new Date();
      const cancelled = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED, cancelledAt, cancelledByUserId: actor.userId, cancellationReason: reason },
        select: { id: true, invoiceNumber: true, status: true, cancelledAt: true, cancelledByUserId: true, cancellationReason: true },
      });
      const refund = await tx.invoiceRefund.create({ data: {
        invoiceId: invoice.id,
        type: RefundType.SALE_CANCELLATION,
        method: dto.refundMethod,
        amount: invoice.netTotal,
        transactionReference: reference,
        reason,
        recordedByUserId: actor.userId,
      } });
      for (const line of invoice.lines) {
        await this.inventory.recordMovement(tx, {
          locationId: invoice.locationId,
          variantId: line.variantId,
          actorId: actor.userId,
          type: MovementType.SALE_CANCELLATION,
          stockState: StockState.AVAILABLE,
          quantityBaseUnits: line.quantityBaseUnits,
          referenceType: 'sale_cancellation',
          referenceId: invoice.id,
          notes: `Cancelled ${invoice.invoiceNumber}: ${reason}`,
        });
      }
      await tx.auditEvent.create({ data: {
        actorId: actor.userId,
        action: 'SALE_CANCELLED',
        targetEntity: 'Invoice',
        targetId: invoice.id,
        beforeValue: JSON.stringify({ status: invoice.status, netTotal: invoice.netTotal.toFixed(2) }),
        afterValue: JSON.stringify({ status: InvoiceStatus.CANCELLED, goodsReturnedToStore: true, refundId: refund.id, refundAmount: refund.amount.toFixed(2), refundMethod: refund.method }),
        reason,
      } });
      return { invoice: cancelled, refund, inventoryReversed: invoice.lines.length };
    });
  }

  async quoteSale(dto: QuoteSaleDto, actor: SaleActor) {
    if (dto.lines.some((line) => line.enteredUnit !== SaleUnit.BASE_UNIT && line.enteredUnit !== SaleUnit.CARTON)) {
      throw new BadRequestException('enteredUnit must be BASE_UNIT or CARTON');
    }
    const variantIds = dto.lines.map((line) => line.variantId);
    if (new Set(variantIds).size !== variantIds.length) throw new BadRequestException('A variant can appear only once per sale');
    if (dto.billDiscountPercent && dto.lines.some((line) => (line.discountPercent ?? 0) > 0)) {
      throw new BadRequestException('Line discounts and bill discounts cannot be combined');
    }
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ role: Role; isActive: boolean; discountLimitPercent: Prisma.Decimal }>>(Prisma.sql`
        SELECT "role", "is_active" AS "isActive", "discount_limit_percent" AS "discountLimitPercent"
        FROM "users" WHERE "id" = ${actor.userId} FOR SHARE
      `);
      const user = users[0];
      if (!user?.isActive || user.role !== Role.CASHIER) throw new ForbiddenException('An active cashier account is required');
      const scopes = await tx.userLocationScope.findMany({ where: { userId: actor.userId }, select: { locationId: true } });
      if (scopes.length !== 1 || actor.locationIds.length !== 1 || scopes[0].locationId !== actor.locationIds[0]) {
        throw new ForbiddenException('Cashier must be bound to exactly one retail store');
      }
      const location = await tx.location.findUnique({ where: { id: scopes[0].locationId }, select: { id: true, type: true, isActive: true, isAuditLocked: true } });
      if (!location?.isActive || location.type !== LocationType.RETAIL_STORE) throw new ForbiddenException('Cashier is not bound to an active retail store');
      if (location.isAuditLocked) throw new ConflictException('Location is locked for a stock audit');
      await tx.$queryRaw(Prisma.sql`
        SELECT v."id" FROM "variants" v JOIN "products" p ON p."id" = v."product_id"
        WHERE v."id" IN (${Prisma.join(variantIds)}) AND v."is_active" = true AND p."is_active" = true
        ORDER BY v."id" FOR SHARE OF v, p
      `);
      const variants = await tx.variant.findMany({
        where: { id: { in: variantIds }, isActive: true, product: { isActive: true } },
        include: { product: { select: { name: true, baseUnit: true, unitsPerCarton: true, sellingPrice: true } } },
      });
      if (variants.length !== variantIds.length) throw new NotFoundException('One or more active product variants were not found');
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      const lines = dto.lines.map((input) => {
        const variant = byId.get(input.variantId)!;
        if (input.enteredUnit === SaleUnit.CARTON && !variant.product.unitsPerCarton) throw new BadRequestException(`${variant.product.name} is not sold by carton`);
        const quantityBaseUnits = input.quantity * (input.enteredUnit === SaleUnit.CARTON ? variant.product.unitsPerCarton! : 1);
        if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits > 2147483647) throw new BadRequestException('Sale quantity exceeds the supported range');
        const gross = variant.product.sellingPrice.mul(quantityBaseUnits).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const discount = gross.mul(input.discountPercent ?? 0).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        return { variantId: variant.id, sku: variant.sku, name: variant.name, productName: variant.product.name, baseUnit: variant.product.baseUnit, quantityBaseUnits, unitPrice: variant.product.sellingPrice, gross, discount };
      });
      const grossTotal = lines.reduce((sum, line) => sum.add(line.gross), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const lineDiscountTotal = lines.reduce((sum, line) => sum.add(line.discount), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const billDiscountTotal = grossTotal.sub(lineDiscountTotal).mul(dto.billDiscountPercent ?? 0).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const discountTotal = lineDiscountTotal.add(billDiscountTotal).toDecimalPlaces(2);
      if (discountTotal.mul(100).gt(grossTotal.mul(user.discountLimitPercent))) {
        throw new ForbiddenException(`Discount exceeds the cashier's ${user.discountLimitPercent.toFixed(2)}% limit`);
      }
      const netTotal = grossTotal.sub(discountTotal).toDecimalPlaces(2);
      if (netTotal.lte(0)) throw new BadRequestException('Sale total after discount must be greater than zero');
      const billDiscountShares = this.allocateBillDiscount(lines.map((line) => ({ variantId: line.variantId, netBeforeBillDiscount: line.gross.sub(line.discount) })), billDiscountTotal);
      return {
        grossTotal,
        lineDiscountTotal,
        billDiscountTotal,
        discountTotal,
        netTotal,
        lines: lines.map((line, index) => ({
          variantId: line.variantId,
          sku: line.sku,
          name: line.name,
          productName: line.productName,
          quantityBaseUnits: line.quantityBaseUnits,
          unitPrice: line.unitPrice,
          gross: line.gross,
          discount: line.discount,
          billDiscount: new Prisma.Decimal(billDiscountShares[index].toString()).div(100),
          lineTotal: line.gross.sub(line.discount).sub(new Prisma.Decimal(billDiscountShares[index].toString()).div(100)).toDecimalPlaces(2),
        })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async findInvoiceForSaleControl(invoiceNumber: string, actor: SaleActor) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNumber: invoiceNumber.trim() },
      include: {
        location: { select: { id: true, name: true, company: { select: { currency: true } } } },
        payment: { select: { method: true, amount: true, recordedAt: true } },
        lines: { include: { variant: { select: { id: true, sku: true, name: true, product: { select: { name: true, baseUnit: true } } } } } },
        returns: { include: { lines: true, refund: true } },
        refunds: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { role: true, isActive: true, canCancelSales: true, canProcessReturns: true },
    });
    if (!user?.isActive) throw new ForbiddenException('An active account is required for sale controls');
    if (user.role !== Role.SUPER_ADMIN && !user.canCancelSales && !user.canProcessReturns) {
      throw new ForbiddenException('This account is not assigned sale cancellation or return permission');
    }
    if (user.role !== Role.SUPER_ADMIN) {
      const scopes = await this.prisma.userLocationScope.findMany({ where: { userId: actor.userId }, select: { locationId: true } });
      if (!scopes.some((scope) => scope.locationId === invoice.locationId)) throw new ForbiddenException('You are not authorized for this invoice location');
    }
    const returnedQuantities = new Map<string, number>();
    for (const saleReturn of invoice.returns) {
      for (const line of saleReturn.lines) {
        returnedQuantities.set(line.saleLineId, (returnedQuantities.get(line.saleLineId) || 0) + line.quantityBaseUnits);
      }
    }
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      location: invoice.location,
      createdAt: invoice.createdAt,
      cancelledAt: invoice.cancelledAt,
      cancelledByUserId: invoice.cancelledByUserId,
      cancellationReason: invoice.cancellationReason,
      grossTotal: invoice.grossTotal,
      discountTotal: invoice.discountTotal,
      netTotal: invoice.netTotal,
      payment: invoice.payment,
      lines: invoice.lines.map((line) => ({ ...line, returnedQuantityBaseUnits: returnedQuantities.get(line.id) || 0 })),
      returns: invoice.returns,
      refunds: invoice.refunds,
      permissions: {
        canCancelSales: user.role === Role.SUPER_ADMIN || user.canCancelSales,
        canProcessReturns: user.role === Role.SUPER_ADMIN || user.canProcessReturns,
      },
    };
  }

  async createSaleReturn(invoiceId: string, dto: CreateSaleReturnDto, actor: SaleActor, rawIdempotencyKey?: string) {
    const reason = dto.reason.trim();
    const reference = this.cleanRefundReference(dto.refundReference);
    const lines = dto.lines.map((line) => ({ ...line, inspectionNotes: line.inspectionNotes.trim() }));
    if (new Set(lines.map((line) => line.saleLineId)).size !== lines.length) throw new BadRequestException('A sale line can appear only once in a return');
    const endpoint = `/api/v1/sales/${invoiceId}/returns`;
    return this.runIdempotentMutation(rawIdempotencyKey, 'POST', endpoint, actor, { invoiceId, reason, refundMethod: dto.refundMethod, reference, lines }, async (tx, key) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`);
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { include: { variant: { select: { id: true } } } } } });
      if (!invoice) throw new NotFoundException('Sale invoice not found');
      await this.requireSalePermission(tx, actor, invoice.locationId, 'canProcessReturns');
      if (invoice.status !== InvoiceStatus.FINALIZED) throw new ConflictException('Only a finalized, non-cancelled sale can be returned');
      const priorReturn = await tx.saleReturn.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
      if (priorReturn) throw new ConflictException('This idempotency key was already used for a return');

      const saleLines = new Map(invoice.lines.map((line) => [line.id, line]));
      const returnValues: Array<{
        saleLineId: string;
        variantId: string;
        quantityBaseUnits: number;
        grossAmount: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        refundAmount: Prisma.Decimal;
        disposition: ReturnDisposition;
        inspectionNotes: string;
      }> = [];
      for (const input of lines) {
        const saleLine = saleLines.get(input.saleLineId);
        if (!saleLine) throw new BadRequestException('Every returned sale line must belong to the original invoice');
        if (input.disposition === ReturnDisposition.QUARANTINED && input.inspectionNotes.length < 5) {
          throw new BadRequestException('Inspection notes are required for quarantined returned items');
        }
        const previous = await tx.saleReturnLine.aggregate({
          where: { saleLineId: saleLine.id, saleReturn: { invoiceId: invoice.id } },
          _sum: { quantityBaseUnits: true, refundAmount: true },
        });
        const quantityAlreadyReturned = previous._sum.quantityBaseUnits ?? 0;
        const refundAlreadyRecorded = previous._sum.refundAmount ?? new Prisma.Decimal(0);
        if (quantityAlreadyReturned + input.quantityBaseUnits > saleLine.quantityBaseUnits) {
          throw new ConflictException(`Return quantity exceeds the quantity sold for line ${saleLine.id}`);
        }
        const grossAmount = saleLine.unitPriceAtSale.mul(input.quantityBaseUnits).toDecimalPlaces(2);
        const remainingLineRefund = saleLine.lineTotal.sub(refundAlreadyRecorded).toDecimalPlaces(2);
        const isFinalQuantity = quantityAlreadyReturned + input.quantityBaseUnits === saleLine.quantityBaseUnits;
        const refundAmount = isFinalQuantity
          ? remainingLineRefund
          : saleLine.lineTotal.mul(input.quantityBaseUnits).div(saleLine.quantityBaseUnits).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        if (refundAmount.lt(0) || refundAmount.gt(remainingLineRefund)) throw new ConflictException('Calculated refund exceeds the remaining refundable value');
        returnValues.push({
          saleLineId: saleLine.id,
          variantId: saleLine.variantId,
          quantityBaseUnits: input.quantityBaseUnits,
          grossAmount,
          discountAmount: grossAmount.sub(refundAmount).toDecimalPlaces(2),
          refundAmount,
          disposition: input.disposition,
          inspectionNotes: input.inspectionNotes,
        });
      }
      const refundAmount = returnValues.reduce((sum, line) => sum.add(line.refundAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
      if (refundAmount.gt(0) && !dto.refundMethod) throw new BadRequestException('Select the manual refund method used for this return');
      const returnCount = await tx.saleReturn.count({ where: { invoiceId: invoice.id } });
      const returnNumber = `RTN-${invoice.invoiceNumber}-${String(returnCount + 1).padStart(2, '0')}`;
      const saleReturn = await tx.saleReturn.create({ data: {
        returnNumber,
        invoiceId: invoice.id,
        reason,
        processedByUserId: actor.userId,
        idempotencyKey: key,
        lines: { create: returnValues.map((line) => ({
          saleLineId: line.saleLineId,
          quantityBaseUnits: line.quantityBaseUnits,
          grossAmount: line.grossAmount,
          discountAmount: line.discountAmount,
          refundAmount: line.refundAmount,
          disposition: line.disposition,
          inspectionNotes: line.inspectionNotes,
        })) },
      }, include: { lines: true } });
      let refund = null;
      if (refundAmount.gt(0)) {
        refund = await tx.invoiceRefund.create({ data: {
          invoiceId: invoice.id,
          saleReturnId: saleReturn.id,
          type: RefundType.SALE_RETURN,
          method: dto.refundMethod!,
          amount: refundAmount,
          transactionReference: reference,
          reason,
          recordedByUserId: actor.userId,
        } });
      }
      for (const line of returnValues) {
        await this.inventory.recordMovement(tx, {
          locationId: invoice.locationId,
          variantId: line.variantId,
          actorId: actor.userId,
          type: MovementType.RETURN_INWARD,
          stockState: line.disposition === ReturnDisposition.RESTOCKED ? StockState.AVAILABLE : StockState.QUARANTINED,
          quantityBaseUnits: line.quantityBaseUnits,
          referenceType: 'sale_return',
          referenceId: saleReturn.id,
          notes: `${saleReturn.returnNumber}: ${line.inspectionNotes}`,
        });
      }
      await tx.auditEvent.create({ data: {
        actorId: actor.userId,
        action: 'SALE_RETURN_RECORDED',
        targetEntity: 'Invoice',
        targetId: invoice.id,
        afterValue: JSON.stringify({ returnId: saleReturn.id, returnNumber, refundAmount: refundAmount.toFixed(2), refundMethod: refund?.method ?? null, lines: returnValues.map((line) => ({ saleLineId: line.saleLineId, quantityBaseUnits: line.quantityBaseUnits, disposition: line.disposition })) }),
        reason,
      } });
      return { ...saleReturn, refund };
    });
  }

  private requireIdempotencyKey(value?: string) {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) throw new BadRequestException('Idempotency-Key header is required and must be 8–200 characters');
    return key;
  }

  private async runIdempotentMutation<T>(
    rawKey: string | undefined,
    method: string,
    endpoint: string,
    actor: SaleActor,
    payload: unknown,
    action: (tx: Tx, key: string) => Promise<T>,
  ): Promise<T> {
    const key = this.requireIdempotencyKey(rawKey);
    const payloadHash = this.hash({ actorId: actor.userId, payload });
    const replay = await this.findReplay(key, method, endpoint, payloadHash);
    if (replay.found) return replay.value as T;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          WITH advisory_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)))
          SELECT 1 AS locked FROM advisory_lock
        `);
        const now = new Date();
        await tx.idempotencyRecord.deleteMany({ where: { idempotencyKey: key, expiresAt: { lte: now } } });
        const existing = await tx.idempotencyRecord.findUnique({ where: { idempotencyKey: key } });
        if (existing) return this.readReplay(existing, method, endpoint, payloadHash) as T;
        const result = await action(tx, key);
        await tx.idempotencyRecord.create({ data: {
          idempotencyKey: key,
          payloadHash,
          httpMethod: method,
          endpoint,
          statusCode: method === 'POST' ? 201 : 200,
          responseBody: JSON.stringify(result),
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const collided = await this.findReplay(key, method, endpoint, payloadHash);
        if (collided.found) return collided.value as T;
      }
      throw error;
    }
  }

  private async requireSalePermission(
    tx: Tx,
    actor: SaleActor,
    locationId: string,
    permission: 'canCancelSales' | 'canProcessReturns',
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string; role: Role; isActive: boolean; allowed: boolean }>>(Prisma.sql`
      SELECT "id", "role", "is_active" AS "isActive",
        CASE WHEN ${permission === 'canCancelSales'} THEN "can_cancel_sales" ELSE "can_process_returns" END AS "allowed"
      FROM "users" WHERE "id" = ${actor.userId} FOR SHARE
    `);
    const user = rows[0];
    if (!user?.isActive) throw new ForbiddenException('An active account is required for sale controls');
    if (user.role === Role.SUPER_ADMIN) return;
    if (!user.allowed) throw new ForbiddenException(`This account is not assigned permission to ${permission === 'canCancelSales' ? 'cancel sales' : 'process returns'}`);
    const scopes = await tx.userLocationScope.findMany({ where: { userId: user.id }, select: { locationId: true } });
    if (!scopes.some((scope) => scope.locationId === locationId)) throw new ForbiddenException('You are not authorized for this invoice location');
  }

  private cleanRefundReference(value?: string) {
    const reference = value?.trim() || null;
    const digits = reference?.replace(/\D/g, '') ?? '';
    if (digits.length >= 12 && digits.length <= 19) throw new BadRequestException('Do not store payment card numbers in refund references');
    return reference;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async findReplay(key: string, method: string, endpoint: string, payloadHash: string) {
    const record = await this.prisma.idempotencyRecord.findUnique({ where: { idempotencyKey: key } });
    if (!record || record.expiresAt <= new Date()) return { found: false as const };
    return { found: true as const, value: this.readReplay(record, method, endpoint, payloadHash) };
  }

  private readReplay(record: { httpMethod: string; endpoint: string; payloadHash: string; responseBody: string | null }, method: string, endpoint: string, payloadHash: string) {
    if (record.httpMethod !== method || record.endpoint !== endpoint || record.payloadHash !== payloadHash) {
      throw new ConflictException('Idempotency-Key was already used for a different actor, endpoint, or request');
    }
    if (!record.responseBody) throw new ConflictException('Stored sale response is unavailable');
    try { return JSON.parse(record.responseBody); } catch { throw new ConflictException('Stored sale response is invalid'); }
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private allocateBillDiscount(lines: Array<{ variantId: string; netBeforeBillDiscount: Prisma.Decimal }>, billDiscount: Prisma.Decimal) {
    const toCents = (amount: Prisma.Decimal) => BigInt(amount.mul(100).toFixed(0));
    const totalCents = lines.reduce((sum, line) => sum + toCents(line.netBeforeBillDiscount), 0n);
    const discountCents = toCents(billDiscount);
    if (discountCents === 0n) return lines.map(() => 0n);
    if (totalCents <= 0n || discountCents > totalCents) throw new BadRequestException('Bill discount cannot exceed the eligible sale amount');
    const shares = lines.map((line, index) => {
      const numerator = toCents(line.netBeforeBillDiscount) * discountCents;
      return { index, variantId: line.variantId, cents: numerator / totalCents, remainder: numerator % totalCents };
    });
    let unallocated = discountCents - shares.reduce((sum, share) => sum + share.cents, 0n);
    const priority = [...shares].sort((a, b) => a.remainder === b.remainder ? a.variantId.localeCompare(b.variantId) : (a.remainder > b.remainder ? -1 : 1));
    for (let index = 0; unallocated > 0n; index += 1, unallocated -= 1n) priority[index % priority.length].cents += 1n;
    const result = lines.map(() => 0n);
    for (const share of shares) result[share.index] = share.cents;
    return result;
  }
}
