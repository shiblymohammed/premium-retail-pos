import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReplenishmentStatus, Role, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { convertToBaseUnits, formatMixedUnitQuantity } from './unit-conversion';
import { ConvertQuantityDto } from './dto/convert-quantity.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto, UpdateProductPricesDto, UpdateVariantDto } from './dto/update-product.dto';

const productInclude = {
  category: true,
  variants: { orderBy: { sku: 'asc' as const } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, actor: { userId: string; role: string }) {
    this.assertSuperAdmin(actor.role);
    if (dto.hasVariants === true && dto.sku !== undefined) {
      throw new BadRequestException('Provide variant SKUs when hasVariants is true; do not provide a product-level SKU');
    }
    if (dto.hasVariants !== true && dto.variants !== undefined) {
      throw new BadRequestException('Products without variants accept one default SKU, not a variants array');
    }
    if (dto.unitsPerCarton === 0) {
      throw new BadRequestException('unitsPerCarton must be a positive integer or omitted for base-unit-only tracking');
    }
    await this.ensureCategoryExists(dto.categoryId);

    const name = this.requireTrimmed(dto.name, 'Product name', 2);
    const variants = dto.hasVariants === true
      ? dto.variants!.map((variant) => this.variantCreateData(variant))
      : [{ ...this.variantCreateData({ name: 'Default', sku: dto.sku!, barcode: dto.barcode }), isDefault: true }];
    const reason = this.requireTrimmed(dto.priceChangeReason, 'Price change reason', 3);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name,
            description: dto.description?.trim() || null,
            baseUnit: this.normalizeBaseUnit(dto.baseUnit),
            unitsPerCarton: dto.unitsPerCarton ?? null,
            reorderLevel: dto.reorderLevel ?? null,
            hasVariants: dto.hasVariants === true,
            categoryId: dto.categoryId,
            sellingPrice: new Prisma.Decimal(dto.sellingPrice),
            purchasePrice: new Prisma.Decimal(dto.purchasePrice),
            variants: { create: variants },
          },
          include: productInclude,
        });

        await tx.priceChangeLog.createMany({
          data: [
            {
              productId: product.id,
              changedByUserId: actor.userId,
              fieldChanged: 'selling_price',
              oldValue: new Prisma.Decimal(0),
              newValue: new Prisma.Decimal(dto.sellingPrice),
              reason,
            },
            {
              productId: product.id,
              changedByUserId: actor.userId,
              fieldChanged: 'purchase_price',
              oldValue: new Prisma.Decimal(0),
              newValue: new Prisma.Decimal(dto.purchasePrice),
              reason,
            },
          ],
        });
        return product;
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async findAll(filters: { search?: string; categoryId?: string; isActive?: boolean }) {
    const search = filters.search?.trim();
    return this.prisma.product.findMany({
      where: {
        categoryId: filters.categoryId,
        isActive: filters.isActive,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
                { variants: { some: { barcode: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one product field to update');
    }
    await this.ensureCategoryExists(dto.categoryId);

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = this.requireTrimmed(dto.name, 'Product name', 2);
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.baseUnit !== undefined) data.baseUnit = this.normalizeBaseUnit(dto.baseUnit);
    if (dto.unitsPerCarton !== undefined) data.unitsPerCarton = dto.unitsPerCarton;
    if (dto.reorderLevel !== undefined) data.reorderLevel = dto.reorderLevel;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId === null
        ? { disconnect: true }
        : { connect: { id: dto.categoryId } };
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.baseUnit !== undefined || dto.isActive === false || dto.reorderLevel !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        // Serialize catalog changes with inventory and transfer writers, which take a shared product-row lock.
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "products" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.product.findUnique({ where: { id }, select: { id: true, baseUnit: true, isActive: true } });
        if (!current) throw new NotFoundException('Product not found');
        const nextBaseUnit = data.baseUnit as string | undefined;
        if (nextBaseUnit !== undefined && nextBaseUnit !== current.baseUnit) {
          const historicalMovements = await tx.inventoryMovement.count({
            where: { variant: { is: { productId: id } } },
          });
          if (historicalMovements > 0) {
            throw new BadRequestException('Cannot change a product base unit after inventory movements have been recorded');
          }
          const transferHistory = await tx.transferLine.count({ where: { variant: { productId: id } } });
          const replenishmentHistory = await tx.replenishmentRequestLine.count({ where: { variant: { productId: id } } });
          if (transferHistory > 0 || replenishmentHistory > 0) {
            throw new BadRequestException('Cannot change a product base unit after transfer or replenishment history has been recorded');
          }
        }
        if (current.isActive && dto.isActive === false) {
          const nonZeroBalances = await tx.$queryRaw<Array<{ variantId: string }>>(Prisma.sql`
            SELECT im."variant_id" AS "variantId"
            FROM "inventory_movements" im
            JOIN "variants" v ON v."id" = im."variant_id"
            WHERE v."product_id" = ${id}
            GROUP BY im."variant_id", im."stock_state"
            HAVING SUM(im."quantity_base_units") <> 0
            LIMIT 1
          `);
          if (nonZeroBalances.length > 0) {
            throw new BadRequestException('Cannot deactivate a product while it has non-zero inventory balances');
          }
          const activeTransfers = await tx.transferLine.count({
            where: {
              variant: { is: { productId: id } },
              transfer: { is: { status: { notIn: [TransferStatus.RECEIVED, TransferStatus.REJECTED, TransferStatus.CANCELLED] } } },
            },
          });
          const activeReplenishments = await tx.replenishmentRequestLine.count({
            where: {
              variant: { is: { productId: id } },
              request: { is: { status: ReplenishmentStatus.DRAFT } },
            },
          });
          if (activeTransfers > 0 || activeReplenishments > 0) {
            throw new BadRequestException('Resolve active transfers and replenishment drafts before deactivating this product');
          }
        }
        return tx.product.update({ where: { id }, data, include: productInclude });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    }

    return this.prisma.product.update({ where: { id }, data, include: productInclude });
  }

  async updatePrices(id: string, dto: UpdateProductPricesDto, actor: { userId: string; role: string }) {
    this.assertSuperAdmin(actor.role);
    const hasSellingPrice = dto.sellingPrice !== undefined;
    const hasPurchasePrice = dto.purchasePrice !== undefined;
    if (!hasSellingPrice && !hasPurchasePrice) {
      throw new BadRequestException('Provide sellingPrice and/or purchasePrice');
    }
    const reason = this.requireTrimmed(dto.reason, 'Price change reason', 3);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent edits so each audit row records the actual
        // immediately preceding price.
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "products" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.product.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Product not found');

        const data: Prisma.ProductUpdateInput = {};
        const changes: Prisma.PriceChangeLogCreateManyInput[] = [];
        if (hasSellingPrice) {
          const next = new Prisma.Decimal(dto.sellingPrice!);
          if (!current.sellingPrice.equals(next)) {
            data.sellingPrice = next;
            changes.push({
              productId: id,
              changedByUserId: actor.userId,
              fieldChanged: 'selling_price',
              oldValue: current.sellingPrice,
              newValue: next,
              reason,
            });
          }
        }
        if (hasPurchasePrice) {
          const next = new Prisma.Decimal(dto.purchasePrice!);
          if (!current.purchasePrice.equals(next)) {
            data.purchasePrice = next;
            changes.push({
              productId: id,
              changedByUserId: actor.userId,
              fieldChanged: 'purchase_price',
              oldValue: current.purchasePrice,
              newValue: next,
              reason,
            });
          }
        }
        if (changes.length === 0) throw new BadRequestException('The supplied prices match the current prices');
        const product = await tx.product.update({ where: { id }, data, include: productInclude });
        await tx.priceChangeLog.createMany({ data: changes });
        return product;
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async findPriceHistory(id: string) {
    await this.findById(id);
    return this.prisma.priceChangeLog.findMany({
      where: { productId: id },
      include: { changedBy: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { hasVariants: true } });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.hasVariants) throw new BadRequestException('Products without variants use their default stock identity');
    try {
      return await this.prisma.variant.create({
        data: { productId, ...this.variantCreateData(dto) },
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const existing = await this.prisma.variant.findFirst({ where: { id: variantId, productId } });
    if (!existing) throw new NotFoundException('Variant not found for this product');
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one variant field to update');
    }
    const data: Prisma.VariantUpdateInput = {};
    if (dto.name !== undefined) data.name = this.requireTrimmed(dto.name, 'Variant name', 1);
    if (dto.sku !== undefined) data.sku = this.requireTrimmed(dto.sku, 'SKU', 1).toUpperCase();
    for (const field of ['barcode', 'size', 'colour', 'style'] as const) {
      const value = dto[field];
      if (value !== undefined) {
        (data as Record<string, unknown>)[field] = typeof value === 'string' ? value.trim() || null : value;
      }
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      if (existing.isActive && dto.isActive === false) {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT p."id" FROM "products" p
            JOIN "variants" v ON v."product_id" = p."id"
            WHERE p."id" = ${productId} AND v."id" = ${variantId}
            FOR UPDATE OF p, v
          `);
          const nonZeroBalances = await tx.$queryRaw<Array<{ variantId: string }>>(Prisma.sql`
            SELECT "variant_id" AS "variantId"
            FROM "inventory_movements"
            WHERE "variant_id" = ${variantId}
            GROUP BY "stock_state"
            HAVING SUM("quantity_base_units") <> 0
            LIMIT 1
          `);
          if (nonZeroBalances.length > 0) {
            throw new BadRequestException('Cannot deactivate a variant while it has non-zero inventory balances');
          }
          const activeTransfers = await tx.transferLine.count({
            where: {
              variantId,
              transfer: { is: { status: { notIn: [TransferStatus.RECEIVED, TransferStatus.REJECTED, TransferStatus.CANCELLED] } } },
            },
          });
          const activeReplenishments = await tx.replenishmentRequestLine.count({
            where: { variantId, request: { is: { status: ReplenishmentStatus.DRAFT } } },
          });
          if (activeTransfers > 0 || activeReplenishments > 0) {
            throw new BadRequestException('Resolve active transfers and replenishment drafts before deactivating this variant');
          }
          return tx.variant.update({ where: { id: variantId }, data });
        });
      }
      return await this.prisma.variant.update({ where: { id: variantId }, data });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async convertQuantity(id: string, dto: ConvertQuantityDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { baseUnit: true, unitsPerCarton: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    try {
      const quantityBaseUnits = convertToBaseUnits({
        cartons: dto.cartons,
        baseUnits: dto.baseUnits,
        unitsPerCarton: product.unitsPerCarton,
      });
      return {
        quantityBaseUnits,
        baseUnit: product.baseUnit,
        formatted: formatMixedUnitQuantity(quantityBaseUnits, product.baseUnit, product.unitsPerCarton),
      };
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async ensureCategoryExists(categoryId?: string | null): Promise<void> {
    if (categoryId == null) return;
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw new BadRequestException('Category not found');
  }

  private normalizeBaseUnit(value: string): string {
    const unit = value.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,29}$/.test(unit)) {
      throw new BadRequestException('baseUnit must be a lowercase unit label such as packet, piece, or bottle');
    }
    return unit;
  }

  private requireTrimmed(value: string, label: string, minimumLength: number): string {
    const normalized = value.trim();
    if (normalized.length < minimumLength) {
      throw new BadRequestException(`${label} must be at least ${minimumLength} non-space characters`);
    }
    return normalized;
  }

  private variantCreateData(dto: CreateVariantDto) {
    const sku = dto.sku.trim().toUpperCase();
    if (!sku) throw new BadRequestException('SKU cannot be blank');
    const barcode = dto.barcode?.trim().toUpperCase();
    return {
      name: this.requireTrimmed(dto.name, 'Variant name', 1),
      sku,
      barcode: barcode || null,
      size: dto.size?.trim() || null,
      colour: dto.colour?.trim() || null,
      style: dto.style?.trim() || null,
    };
  }

  private rethrowUniqueConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('SKU or barcode is already in use');
    }
  }

  private assertSuperAdmin(role: string): void {
    if (role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can create or change product prices');
    }
  }
}
