import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { MovementType, Prisma, StockState } from '@prisma/client';
import { convertToBaseUnits, formatMixedUnitQuantity } from '../products/unit-conversion';
import { PrismaService } from '../../prisma/prisma.service';
import { OpeningStockImportDto, SupplierReceiptDto } from './dto';

type InventoryBalanceRow = {
  variantId: string;
  sku: string;
  variantName: string;
  productId: string;
  productName: string;
  baseUnit: string;
  unitsPerCarton: number | null;
  locationId: string;
  locationName: string;
  stockState: StockState;
  quantityBaseUnits: bigint;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async importOpeningStock(
    dto: OpeningStockImportDto,
    actor: { userId: string },
    rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const lines = dto.lines.map((line) => ({
      variantId: line.variantId.trim(),
      quantityBaseUnits: line.quantityBaseUnits,
    })).sort((a, b) => a.variantId.localeCompare(b.variantId));
    this.assertUniqueVariants(lines.map((line) => line.variantId));
    const payloadHash = this.hashPayload({
      actorId: actor.userId,
      locationId: dto.locationId,
      notes: dto.notes?.trim() || null,
      lines,
    });
    const replay = await this.findOpeningImportReplay(idempotencyKey, payloadHash);
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockOperationalLocation(tx, dto.locationId);
        const variants = await this.loadActiveVariants(tx, lines.map((line) => line.variantId));
        const batch = await tx.openingStockImport.create({
          data: {
            locationId: dto.locationId,
            importedByUserId: actor.userId,
            idempotencyKey,
            payloadHash,
            notes: dto.notes?.trim() || null,
          },
        });
        const movements = [];
        for (const line of lines) {
          movements.push(await this.recordMovement(tx, {
            locationId: dto.locationId,
            variantId: line.variantId,
            actorId: actor.userId,
            type: MovementType.OPENING_STOCK,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: line.quantityBaseUnits,
            referenceType: 'opening_stock_import',
            referenceId: batch.id,
            notes: dto.notes?.trim() || undefined,
          }));
        }
        return { ...batch, movements, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const collided = await this.findOpeningImportReplay(idempotencyKey, payloadHash);
        if (collided) return collided;
        throw new ConflictException('An opening stock import with this idempotency key or data already exists');
      }
      throw error;
    }
  }

  async receiveSupplierStock(
    dto: SupplierReceiptDto,
    actor: { userId: string },
    rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const receiptNumber = dto.receiptNumber.trim();
    const supplierName = dto.supplierName.trim();
    if (!receiptNumber || !supplierName) throw new BadRequestException('Supplier and receipt number are required');
    const inputLines = dto.lines.map((line) => ({
      variantId: line.variantId.trim(),
      cartons: line.cartons ?? 0,
      looseBaseUnits: line.looseBaseUnits ?? 0,
    })).sort((a, b) => a.variantId.localeCompare(b.variantId));
    this.assertUniqueVariants(inputLines.map((line) => line.variantId));
    const payloadHash = this.hashPayload({
      actorId: actor.userId,
      locationId: dto.locationId,
      receiptNumber,
      supplierName,
      notes: dto.notes?.trim() || null,
      lines: inputLines,
    });
    const replay = await this.findSupplierReceiptReplay(idempotencyKey, payloadHash);
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockOperationalLocation(tx, dto.locationId);
        const variants = await this.loadActiveVariants(tx, inputLines.map((line) => line.variantId));
        const normalizedLines = inputLines.map((line) => {
          const variant = variants.get(line.variantId)!;
          let quantityBaseUnits: number;
          try {
            quantityBaseUnits = convertToBaseUnits({
              cartons: line.cartons,
              baseUnits: line.looseBaseUnits,
              unitsPerCarton: variant.product.unitsPerCarton,
            });
          } catch (error) {
            if (error instanceof RangeError) throw new BadRequestException(error.message);
            throw error;
          }
          if (quantityBaseUnits < 1 || quantityBaseUnits > 2147483647) {
            throw new BadRequestException('Each supplier receipt line must total between 1 and 2,147,483,647 base units');
          }
          return {
            ...line,
            quantityBaseUnits,
            unitsPerCarton: variant.product.unitsPerCarton,
          };
        });
        const receipt = await tx.supplierReceipt.create({
          data: {
            receiptNumber,
            supplierName,
            locationId: dto.locationId,
            receivedByUserId: actor.userId,
            idempotencyKey,
            payloadHash,
            notes: dto.notes?.trim() || null,
            lines: { create: normalizedLines },
          },
          include: { lines: true },
        });
        const movements = [];
        for (const line of normalizedLines) {
          movements.push(await this.recordMovement(tx, {
            locationId: dto.locationId,
            variantId: line.variantId,
            actorId: actor.userId,
            type: MovementType.SUPPLIER_RECEIPT,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: line.quantityBaseUnits,
            referenceType: 'supplier_receipt',
            referenceId: receipt.id,
            notes: dto.notes?.trim() || undefined,
          }));
        }
        return { ...receipt, movements, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const collided = await this.findSupplierReceiptReplay(idempotencyKey, payloadHash);
        if (collided) return collided;
        throw new ConflictException('Receipt number or idempotency key is already in use');
      }
      throw error;
    }
  }

  /** Insert one signed ledger movement inside the caller's database transaction. */
  async recordMovement(
    tx: Prisma.TransactionClient,
    input: {
      locationId: string;
      variantId: string;
      actorId: string;
      type: MovementType;
      stockState: StockState;
      quantityBaseUnits: number;
      referenceType?: string;
      referenceId?: string;
      notes?: string;
    },
  ) {
    if (!Number.isInteger(input.quantityBaseUnits) || input.quantityBaseUnits === 0 || Math.abs(input.quantityBaseUnits) > 2147483647) {
      throw new BadRequestException('Movement quantity must be a non-zero 32-bit integer in base units');
    }
    await this.lockOperationalLocation(tx, input.locationId);
    const lockedVariants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT v."id"
      FROM "variants" v
      JOIN "products" p ON p."id" = v."product_id"
      WHERE v."id" = ${input.variantId} AND v."is_active" = true AND p."is_active" = true
      FOR SHARE OF v, p
    `);
    if (lockedVariants.length === 0) throw new NotFoundException('One or more active product variants were not found');
    const variant = await tx.variant.findFirst({
      where: { id: input.variantId, isActive: true, product: { isActive: true } },
      include: { product: { select: { baseUnit: true, unitsPerCarton: true } } },
    });
    if (!variant) throw new NotFoundException('One or more active product variants were not found');
    const balanceRows = await tx.$queryRaw<Array<{ quantityBaseUnits: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM("quantity_base_units"), 0)::bigint AS "quantityBaseUnits"
      FROM "inventory_movements"
      WHERE "variant_id" = ${input.variantId}
        AND "location_id" = ${input.locationId}
        AND "stock_state" = ${input.stockState}::"StockState"
    `);
    const resultingBalanceBigInt = (balanceRows[0]?.quantityBaseUnits ?? 0n) + BigInt(input.quantityBaseUnits);
    if (
      resultingBalanceBigInt > BigInt(Number.MAX_SAFE_INTEGER)
      || resultingBalanceBigInt < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new BadRequestException('Movement would exceed the supported inventory balance range');
    }
    const resultingBalance = Number(resultingBalanceBigInt);
    await tx.inventoryMovement.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        actorId: input.actorId,
        type: input.type,
        stockState: input.stockState,
        quantityBaseUnits: input.quantityBaseUnits,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes,
      },
    });
    const negativeAvailable = input.stockState === StockState.AVAILABLE && resultingBalance < 0;
    return {
      variantId: input.variantId,
      locationId: input.locationId,
      stockState: input.stockState,
      type: input.type,
      quantityBaseUnits: input.quantityBaseUnits,
      actorId: input.actorId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      balanceBaseUnits: resultingBalance,
      formattedBalance: formatMixedUnitQuantity(
        resultingBalance,
        variant.product.baseUnit,
        variant.product.unitsPerCarton,
      ),
      negativeAvailable,
      warning: negativeAvailable
        ? 'WARNING: Available stock is below zero. Confirm the physical stock before proceeding.'
        : undefined,
    };
  }

  private async lockOperationalLocation(tx: Prisma.TransactionClient, locationId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; isActive: boolean; isAuditLocked: boolean }>>(Prisma.sql`
      SELECT "id", "is_active" AS "isActive", "is_audit_locked" AS "isAuditLocked"
      FROM "locations" WHERE "id" = ${locationId} FOR UPDATE
    `);
    const location = rows[0];
    if (!location) throw new NotFoundException('Location not found');
    if (!location.isActive) throw new ConflictException('Cannot post stock to an inactive location');
    if (location.isAuditLocked) throw new ConflictException('Location is locked for a stock audit');
  }

  private async loadActiveVariants(tx: Prisma.TransactionClient, ids: string[]) {
    await tx.$queryRaw(Prisma.sql`
      SELECT v."id"
      FROM "variants" v
      JOIN "products" p ON p."id" = v."product_id"
      WHERE v."id" IN (${Prisma.join(ids)}) AND v."is_active" = true AND p."is_active" = true
      FOR SHARE OF v, p
    `);
    const found = await tx.variant.findMany({
      where: { id: { in: ids }, isActive: true, product: { isActive: true } },
      include: { product: { select: { baseUnit: true, unitsPerCarton: true } } },
    });
    if (found.length !== ids.length) throw new NotFoundException('One or more active product variants were not found');
    return new Map(found.map((variant) => [variant.id, variant]));
  }

  private async findOpeningImportReplay(idempotencyKey: string, payloadHash: string) {
    const batch = await this.prisma.openingStockImport.findUnique({ where: { idempotencyKey } });
    if (!batch) return null;
    if (batch.payloadHash !== payloadHash) throw new ConflictException('Idempotency key was already used for a different opening stock import');
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { referenceType: 'opening_stock_import', referenceId: batch.id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...batch, movements, replayed: true };
  }

  private async findSupplierReceiptReplay(idempotencyKey: string, payloadHash: string) {
    const receipt = await this.prisma.supplierReceipt.findUnique({
      where: { idempotencyKey }, include: { lines: true },
    });
    if (!receipt) return null;
    if (receipt.payloadHash !== payloadHash) throw new ConflictException('Idempotency key was already used for a different supplier receipt');
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { referenceType: 'supplier_receipt', referenceId: receipt.id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...receipt, movements, replayed: true };
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key header must contain 8 to 200 characters');
    }
    return key;
  }

  private assertUniqueVariants(ids: string[]) {
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('Each variant may appear only once in an inventory batch');
    }
  }

  private hashPayload(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  async getBalances(query: { locationId: string; variantId?: string; variantIds?: string[]; stockState?: StockState }) {
    const variantFilter = query.variantIds?.length
      ? Prisma.sql`AND v."id" IN (${Prisma.join(query.variantIds)})`
      : query.variantId
        ? Prisma.sql`AND v."id" = ${query.variantId}`
        : Prisma.empty;
    const stateFilter = query.stockState
      ? Prisma.sql`AND states."stock_state" = ${query.stockState}::"StockState"`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<InventoryBalanceRow[]>(Prisma.sql`
      SELECT
        v."id" AS "variantId",
        v."sku" AS "sku",
        v."name" AS "variantName",
        p."id" AS "productId",
        p."name" AS "productName",
        p."base_unit" AS "baseUnit",
        p."units_per_carton" AS "unitsPerCarton",
        l."id" AS "locationId",
        l."name" AS "locationName",
        states."stock_state" AS "stockState",
        COALESCE(SUM(m."quantity_base_units"), 0)::bigint AS "quantityBaseUnits"
      FROM "locations" l
      CROSS JOIN "variants" v
      JOIN "products" p ON p."id" = v."product_id"
      CROSS JOIN unnest(enum_range(NULL::"StockState")) AS states("stock_state")
      LEFT JOIN "inventory_movements" m
        ON m."variant_id" = v."id"
        AND m."location_id" = l."id"
        AND m."stock_state" = states."stock_state"
      WHERE l."id" = ${query.locationId}
        AND l."is_active" = true
        ${variantFilter}
        ${stateFilter}
      GROUP BY v."id", v."sku", v."name", p."id", p."name", p."base_unit",
        p."units_per_carton", l."id", l."name", states."stock_state"
      ORDER BY v."sku" ASC, states."stock_state" ASC
    `);

    return rows.map((row) => {
      const quantityBaseUnits = Number(row.quantityBaseUnits);
      if (!Number.isSafeInteger(quantityBaseUnits)) {
        throw new InternalServerErrorException('Inventory balance exceeds the supported integer range');
      }
      const negativeAvailable = row.stockState === StockState.AVAILABLE && quantityBaseUnits < 0;
      return {
        ...row,
        quantityBaseUnits,
        formattedQuantity: formatMixedUnitQuantity(
          quantityBaseUnits,
          row.baseUnit,
          row.unitsPerCarton,
        ),
        ...(negativeAvailable ? {
          negativeAvailable: true,
          warning: 'WARNING: Available stock is below zero. Confirm the physical stock before proceeding.',
        } : {}),
      };
    });
  }
}
