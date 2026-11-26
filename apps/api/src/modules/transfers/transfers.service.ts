import { can, PermissionKey } from '../../common/decorators/permission.decorator';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { LocationType, MovementType, Prisma, ReplenishmentStatus, Role, StockState, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { receiptDiscrepancies } from './receipt-discrepancies';
import { convertToBaseUnits } from '../products/unit-conversion';
import {
  ApproveReplenishmentDto,
  ApproveTransferDto,
  CreateTransferDto,
  ReceiveTransferDto,
  TransferQuantityDto,
} from './dto';

type TransferActor = { userId: string; role: string; locationIds: string[]; permissionOverrides?: Partial<Record<PermissionKey, boolean>> };
type Tx = Prisma.TransactionClient;
type LockedLocation = { id: string; companyId: string; type: LocationType; parentId: string | null; isActive: boolean; isAuditLocked: boolean };

const MANAGER_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.CENTRAL_MANAGER,
  Role.SUB_WAREHOUSE_MANAGER,
  Role.STORE_MANAGER,
];
const STORE_RECEIPT_ROLES: Role[] = [Role.STAFF, Role.CASHIER];
const STORE_DELIVERY_STATUSES: TransferStatus[] = [TransferStatus.DISPATCHED, TransferStatus.PARTIALLY_DISPATCHED, TransferStatus.PARTIALLY_RECEIVED, TransferStatus.RECEIVED];
const PACKING_STATUSES: TransferStatus[] = [TransferStatus.APPROVED, TransferStatus.PARTIALLY_DISPATCHED, TransferStatus.PARTIALLY_RECEIVED];
const TERMINAL_TRANSFER_STATUSES: TransferStatus[] = [
  TransferStatus.RECEIVED,
  TransferStatus.CANCELLED,
  TransferStatus.REJECTED,
];

@Injectable()
export class TransfersService {
  private idempotencyCleanupCounter = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private assertRestockRequestAccess(actor: TransferActor) {
    if (!can(actor, 'transfers.request', actor.role === Role.INVENTORY || MANAGER_ROLES.includes(actor.role as Role))) {
      throw new ForbiddenException('This account cannot request restock');
    }
  }

  async restockSources(destinationId: string, actor: TransferActor) {
    this.assertRestockRequestAccess(actor);
    this.assertLocationAccess(actor, destinationId);
    const destination = await this.requireLocation(this.prisma, destinationId);
    if (!destination.isActive || destination.type !== LocationType.RETAIL_STORE) {
      throw new BadRequestException('Select an active retail store to request restock');
    }
    return this.prisma.location.findMany({
      where: {
        companyId: destination.companyId, isActive: true,
        type: { in: [LocationType.MAIN_WAREHOUSE, LocationType.SUB_WAREHOUSE] },
      },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  async generateReplenishment(
    destLocationId: string,
    actor: TransferActor,
    rawIdempotencyKey: string | undefined,
    manual?: CreateTransferDto,
  ) {
    if (manual) this.assertRestockRequestAccess(actor);
    else this.assertManager(actor, 'transfers.request');
    this.assertLocationAccess(actor, destLocationId);
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const payloadHash = this.hash({ actorId: actor.userId, destLocationId, ...(manual && { sourceLocationId: manual.sourceLocationId, lines: manual.lines }) });
    const prior = await this.findReplenishmentReplay(idempotencyKey, payloadHash);
    if (prior) return prior;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const location = await this.requireLocation(tx, destLocationId);
        if (!location.isActive) throw new ConflictException('Cannot generate replenishment for an inactive location');
        const sourceId = manual?.sourceLocationId ?? location.parentId;
        if (!sourceId) throw new BadRequestException('Select a supplying warehouse');
        const locations = await this.lockLocations(tx, [sourceId, destLocationId]);
        const source = locations.get(sourceId)!;
        const destination = locations.get(destLocationId)!;
        if (!source || !destination) throw new NotFoundException('Restock location not found');
        this.assertTransferRoute(source, destination);
        if (manual && (destination.type !== LocationType.RETAIL_STORE ||
          ![LocationType.MAIN_WAREHOUSE, LocationType.SUB_WAREHOUSE].some((type) => type === source.type))) {
          throw new BadRequestException('A store restock request must come from a main warehouse or sub-warehouse');
        }
        if (!manual && destination.type === LocationType.RETAIL_STORE) {
          throw new BadRequestException('Choose a warehouse, products and quantities to request store restock');
        }
        if (!source.isActive || !destination.isActive) throw new ConflictException('Both transfer locations must be active');

        const activeRequest = manual ? null : await tx.replenishmentRequest.findFirst({
          where: {
            sourceLocationId: source.id,
            destLocationId: destination.id,
            status: { in: [ReplenishmentStatus.DRAFT, ReplenishmentStatus.TRANSFER_CREATED] },
          },
          include: { lines: true, transfer: { select: { status: true } } },
          orderBy: { createdAt: 'desc' },
        });
        if (
          activeRequest &&
          (activeRequest.status === ReplenishmentStatus.DRAFT ||
            (activeRequest.transfer && !TERMINAL_TRANSFER_STATUSES.includes(activeRequest.transfer.status)))
        ) {
          throw new ConflictException('An active replenishment request already exists for this location pair');
        }

        const requested = manual && this.uniqueByVariant(manual.lines, 'restock line');
        if (!requested) await tx.$queryRaw(Prisma.sql`
          SELECT p."id" FROM "products" p
          JOIN "variants" v ON v."product_id" = p."id"
          WHERE p."is_active" = true AND v."is_active" = true AND p."reorder_level" IS NOT NULL
          FOR SHARE OF p, v
        `);
        const variants = requested
          ? [...(await this.loadTransferVariants(tx, [...requested.keys()])).values()]
          : await tx.variant.findMany({
          where: { isActive: true, product: { isActive: true, reorderLevel: { not: null } } },
          select: {
            id: true,
            product: { select: { reorderLevel: true, unitsPerCarton: true, baseUnit: true } },
          },
          orderBy: { sku: 'asc' },
        });
        const balances = await tx.$queryRaw<Array<{ variantId: string; quantity: bigint }>>(Prisma.sql`
          SELECT "variant_id" AS "variantId", COALESCE(SUM("quantity_base_units"), 0)::bigint AS "quantity"
          FROM "inventory_movements"
          WHERE "location_id" = ${destLocationId} AND "stock_state" = 'AVAILABLE'::"StockState"
            ${requested ? Prisma.sql`AND "variant_id" IN (${Prisma.join([...requested.keys()])})` : Prisma.empty}
          GROUP BY "variant_id"
        `);
        const balanceByVariant = new Map(balances.map((row) => [row.variantId, Number(row.quantity)]));
        const lines = variants.flatMap((variant) => {
          const reorderLevelBase = variant.product.reorderLevel ?? 0;
          const availableQtyBase = balanceByVariant.get(variant.id) ?? 0;
          const cartonSize = variant.product.unitsPerCarton ?? 0;
          const shipsInCartons = cartonSize > 1;
          const needed = reorderLevelBase - availableQtyBase;
          const selected = requested?.get(variant.id);
          const systemSuggestedQtyBase = selected
            ? this.convertLine(selected, variant.product.unitsPerCarton, shipsInCartons)
            : shipsInCartons ? Math.ceil(needed / cartonSize) * cartonSize : needed;
          if (systemSuggestedQtyBase <= 0) return [];
          if (!Number.isSafeInteger(systemSuggestedQtyBase) || systemSuggestedQtyBase > 2147483647) {
            throw new BadRequestException(`Suggested replenishment for variant ${variant.id} exceeds the supported quantity range`);
          }
          return [{
            variantId: variant.id,
            availableQtyBase,
            reorderLevelBase,
            systemSuggestedQtyBase,
            unitsPerCarton: variant.product.unitsPerCarton,
            baseUnitSnapshot: variant.product.baseUnit,
          }];
        });
        if (lines.length === 0) return { message: 'No replenishment is needed', data: null, replayed: false };

        const request = await tx.replenishmentRequest.create({
          data: {
            requestNumber: this.makeNumber('RR'),
            sourceLocationId: source.id,
            destLocationId: destination.id,
            generatedByUserId: actor.userId,
            idempotencyKey,
            payloadHash,
            lines: { create: lines.map((line) => ({
              variant: { connect: { id: line.variantId } },
              availableQtyBase: line.availableQtyBase,
              reorderLevelBase: line.reorderLevelBase,
              systemSuggestedQtyBase: line.systemSuggestedQtyBase,
              unitsPerCarton: line.unitsPerCarton,
              baseUnitSnapshot: line.baseUnitSnapshot,
            })) },
          },
          include: { lines: true, sourceLocation: true, destLocation: true },
        });
        return { message: 'Restock request created', data: request, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const collided = await this.findReplenishmentReplay(idempotencyKey, payloadHash);
        if (collided) return collided;
        throw new ConflictException('The idempotency key is already in use');
      }
      throw error;
    }
  }

  async approveReplenishment(
    id: string, dto: ApproveReplenishmentDto, actor: TransferActor, idempotencyKey: string | undefined,
    depotSignOff = false,
  ) {
    this.assertManager(actor, 'transfers.approve');
    const action = depotSignOff ? 'depot-sign-off' : 'approve';
    return this.runIdempotentMutation(idempotencyKey, 'POST', `/transfers/replenishment/${id}/${action}`, actor, dto, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "replenishment_requests" WHERE "id" = ${id} FOR UPDATE`);
      const request = await tx.replenishmentRequest.findUnique({ where: { id }, include: { lines: true } });
      if (!request) throw new NotFoundException('Replenishment request not found');
      if (request.status !== ReplenishmentStatus.DRAFT) throw new ConflictException('Only a draft replenishment request can be reviewed');
      const source = await this.requireLocation(tx, request.sourceLocationId);
      const destination = await this.requireLocation(tx, request.destLocationId);
      this.assertOperationalLocations(source, destination);
      this.assertTransferRoute(source, destination);
      const requiresDepotSignOff = source.type === LocationType.MAIN_WAREHOUSE && destination.type === LocationType.SUB_WAREHOUSE;
      if (depotSignOff) {
        this.assertLocationAccess(actor, destination.id);
        if (actor.role !== Role.SUB_WAREHOUSE_MANAGER && actor.role !== Role.SUPER_ADMIN) {
          throw new ForbiddenException('Only the depot manager or Super Admin can authorize the depot request');
        }
        if (!requiresDepotSignOff || request.depotAuthorizedAt) {
          throw new ConflictException('This request is not awaiting depot authorization');
        }
      } else {
        this.assertLocationAccess(actor, source.id);
        if (requiresDepotSignOff && !request.depotAuthorizedAt) {
          throw new ConflictException('The depot manager must authorize this request first');
        }
        if (request.generatedByUserId === actor.userId || request.depotAuthorizedByUserId === actor.userId) {
          throw new ForbiddenException('A different manager at the supplying location must approve the request');
        }
      }

      const approvedByVariant = this.uniqueByVariant(dto.lines, 'approved quantity');
      if (request.lines.some((line) => !approvedByVariant.has(line.variantId))) {
        throw new BadRequestException('Approval must include a quantity for every suggested variant');
      }
      if (requiresDepotSignOff && !depotSignOff &&
          (approvedByVariant.size !== request.lines.length || request.lines.some((line) =>
            approvedByVariant.get(line.variantId)?.approvedQtyBase !== line.managerApprovedQtyBase))) {
        throw new BadRequestException('Release must match the quantities authorized by the depot');
      }
      const positive = dto.lines.filter((line) => line.approvedQtyBase > 0);
      if (!positive.length) throw new BadRequestException('At least one replenishment quantity must be approved');
      const variants = await this.loadTransferVariants(tx, positive.map((line) => line.variantId));
      const suggestions = new Map(request.lines.map((line) => [line.variantId, line]));
      const transferLines = positive.map((line) => {
        const existing = suggestions.get(line.variantId);
        const product = variants.get(line.variantId)!.product;
        const unitsPerCarton = existing ? existing.unitsPerCarton : product.unitsPerCarton;
        const cartonRequired = (unitsPerCarton ?? 0) > 1;
        this.assertShippingQuantity(line.approvedQtyBase, unitsPerCarton, cartonRequired);
        return {
          variantId: line.variantId,
          managerApprovedQtyBase: line.approvedQtyBase,
          cartonRequired,
          systemSuggestedQtyBase: existing?.systemSuggestedQtyBase ?? 0,
          unitsPerCarton,
          baseUnitSnapshot: existing?.baseUnitSnapshot ?? product.baseUnit,
        };
      });
      const addedLines = transferLines.filter((line) => !suggestions.has(line.variantId));
      const destinationBalances = addedLines.length ? await tx.inventoryMovement.groupBy({
        by: ['variantId'],
        where: { locationId: destination.id, variantId: { in: addedLines.map((line) => line.variantId) }, stockState: StockState.AVAILABLE },
        _sum: { quantityBaseUnits: true },
      }) : [];
      const availableByVariant = new Map(destinationBalances.map((line) => [line.variantId, line._sum.quantityBaseUnits ?? 0]));

      const lineUpdates = {
        update: request.lines.map((line) => ({
          where: { id: line.id },
          data: { managerApprovedQtyBase: approvedByVariant.get(line.variantId)!.approvedQtyBase },
        })),
        create: addedLines.map(({ cartonRequired: _cartonRequired, ...line }) => ({
          ...line,
          availableQtyBase: availableByVariant.get(line.variantId) ?? 0,
          reorderLevelBase: variants.get(line.variantId)!.product.reorderLevel ?? 0,
        })),
      };
      if (depotSignOff) return tx.replenishmentRequest.update({
        where: { id },
        data: { depotAuthorizedAt: new Date(), depotAuthorizedByUserId: actor.userId, lines: lineUpdates },
        include: { lines: true, sourceLocation: true, destLocation: true },
      });

      const transfer = await tx.transfer.create({
        data: {
          transferNumber: this.makeNumber('TR'),
          sourceLocationId: request.sourceLocationId,
          destLocationId: request.destLocationId,
          requestedByUserId: request.generatedByUserId,
          ...(requiresDepotSignOff ? { status: TransferStatus.APPROVED, approvedAt: new Date(), approvedByUserId: actor.userId } : {}),
          notes: `Generated from replenishment ${request.requestNumber}`,
          lines: {
            create: transferLines.map((line) => ({
              variant: { connect: { id: line.variantId } },
              requestedQtyBase: line.managerApprovedQtyBase,
              ...(requiresDepotSignOff ? { approvedQtyBase: line.managerApprovedQtyBase } : {}),
              cartonRequired: line.cartonRequired,
              systemSuggestedQtyBase: line.systemSuggestedQtyBase,
              unitsPerCarton: line.unitsPerCarton,
              baseUnitSnapshot: line.baseUnitSnapshot,
            })),
          },
        },
        include: transferInclude,
      });
      const updated = await tx.replenishmentRequest.update({
        where: { id },
        data: {
          status: ReplenishmentStatus.TRANSFER_CREATED,
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          transferId: transfer.id,
          lines: lineUpdates,
        },
        include: { lines: true, transfer: { include: transferInclude } },
      });
      return updated;
    });
  }

  async rejectReplenishment(id: string, reason: string, actor: TransferActor, idempotencyKey: string | undefined) {
    this.assertManager(actor, 'transfers.approve');
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('A rejection reason is required');
    return this.runIdempotentMutation(idempotencyKey, 'POST', `/transfers/replenishment/${id}/reject`, actor, { reason: cleanReason }, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "replenishment_requests" WHERE "id" = ${id} FOR UPDATE`);
      const request = await tx.replenishmentRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Replenishment request not found');
      if (request.status !== ReplenishmentStatus.DRAFT) throw new ConflictException('Only a draft replenishment request can be rejected');
      if (request.generatedByUserId === actor.userId || request.depotAuthorizedByUserId === actor.userId) {
        throw new ForbiddenException('A different manager at the supplying location must reject the request');
      }
      const destination = await this.requireLocation(tx, request.destLocationId);
      if (destination.type === LocationType.SUB_WAREHOUSE && !request.depotAuthorizedAt) {
        throw new ConflictException('The depot manager must authorize this request first');
      }
      this.assertLocationAccess(actor, request.sourceLocationId);
      return tx.replenishmentRequest.update({
        where: { id },
        data: {
          status: ReplenishmentStatus.REJECTED,
          rejectedByUserId: actor.userId,
          rejectedAt: new Date(),
          rejectionReason: cleanReason,
        },
        include: { lines: true, sourceLocation: true, destLocation: true },
      });
    });
  }

  async findReplenishments(actor: TransferActor) {
    if (actor.role !== Role.INVENTORY) this.assertTransferAccess(actor);
    return this.prisma.replenishmentRequest.findMany({
      where: actor.role === Role.SUPER_ADMIN
        ? {}
        : { OR: [{ sourceLocationId: { in: actor.locationIds } }, { destLocationId: { in: actor.locationIds } }] },
      include: {
        lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
        sourceLocation: true, destLocation: true, transfer: { select: { id: true, transferNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(dto: CreateTransferDto, actor: TransferActor, idempotencyKey: string | undefined) {
    if (actor.role !== Role.INVENTORY) this.assertManager(actor, 'transfers.request');
    this.assertCanViewTransfer(actor, dto.sourceLocationId, dto.destLocationId);
    const linesByVariant = this.uniqueByVariant(dto.lines, 'transfer line');
    return this.runIdempotentMutation(idempotencyKey, 'POST', '/transfers', actor, dto, async (tx) => {
      const locations = await this.lockLocations(tx, [dto.sourceLocationId, dto.destLocationId]);
      const source = locations.get(dto.sourceLocationId);
      const destination = locations.get(dto.destLocationId);
      if (!source || !destination) throw new NotFoundException('Transfer location not found');
      this.assertOperationalLocations(source, destination);
      this.assertTransferRoute(source, destination);
      const variants = await this.loadTransferVariants(tx, [...linesByVariant.values()].map((line) => line.variantId));
      const lines = [...linesByVariant.values()].map((line) => {
        const variant = variants.get(line.variantId)!;
        const cartonRequired = (variant.product.unitsPerCarton ?? 0) > 1;
        const requestedQtyBase = this.convertLine(line, variant.product.unitsPerCarton, cartonRequired);
        return {
          variantId: line.variantId,
          requestedQtyBase,
          cartonRequired,
          unitsPerCarton: variant.product.unitsPerCarton,
            baseUnitSnapshot: variant.product.baseUnit,
        };
      });
      return tx.transfer.create({
        data: {
          transferNumber: this.makeNumber('TR'),
          sourceLocationId: source.id,
          destLocationId: destination.id,
          requestedByUserId: actor.userId,
          notes: dto.notes?.trim() || null,
          lines: { create: lines.map((line) => ({
            variant: { connect: { id: line.variantId } },
            requestedQtyBase: line.requestedQtyBase,
            cartonRequired: line.cartonRequired,
            unitsPerCarton: line.unitsPerCarton,
            baseUnitSnapshot: line.baseUnitSnapshot,
          })) },
        },
        include: transferInclude,
      });
    });
  }

  async findTransfers(actor: TransferActor) {
    const storeReceiver = STORE_RECEIPT_ROLES.includes(actor.role as Role) &&
      !actor.permissionOverrides?.['transfers.request'] && !actor.permissionOverrides?.['transfers.approve'] && !actor.permissionOverrides?.['transfers.dispatch'];
    if (!storeReceiver && actor.role !== Role.INVENTORY) this.assertTransferAccess(actor);
    const where: Prisma.TransferWhereInput = storeReceiver
      ? {
        destLocationId: { in: actor.locationIds },
        destLocation: { type: LocationType.RETAIL_STORE, isActive: true },
        status: { in: STORE_DELIVERY_STATUSES },
      }
      : actor.role === Role.SUPER_ADMIN
        ? {}
        : { OR: [{ sourceLocationId: { in: actor.locationIds } }, { destLocationId: { in: actor.locationIds } }] };
    const transfers = await this.prisma.transfer.findMany({ where, include: transferInclude, orderBy: { createdAt: 'desc' } });
    return this.withReceiptHistoryAndPacking(transfers, actor);
  }

  async findTransfer(id: string, actor: TransferActor) {
    const storeReceiver = STORE_RECEIPT_ROLES.includes(actor.role as Role) &&
      !actor.permissionOverrides?.['transfers.request'] && !actor.permissionOverrides?.['transfers.approve'] && !actor.permissionOverrides?.['transfers.dispatch'];
    if (!storeReceiver && actor.role !== Role.INVENTORY) this.assertTransferAccess(actor);
    const transfer = await this.prisma.transfer.findUnique({ where: { id }, include: transferInclude });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (storeReceiver) {
      this.assertLocationAccess(actor, transfer.destLocationId);
      if (transfer.destLocation.type !== LocationType.RETAIL_STORE || !STORE_DELIVERY_STATUSES.includes(transfer.status)) {
        throw new ForbiddenException('This transfer is unavailable for store receiving');
      }
    } else this.assertCanViewTransfer(actor, transfer.sourceLocationId, transfer.destLocationId);
    const [result] = await this.withReceiptHistoryAndPacking([transfer], actor);
    return result;
  }

  private async withReceiptHistoryAndPacking(
    transfers: Prisma.TransferGetPayload<{ include: typeof transferInclude }>[],
    actor: TransferActor,
  ) {
    if (!transfers.length) return [];
    const candidates = new Map<string, Set<string>>();
    const packableTransfers = new Set<string>();
    if (can(actor, 'transfers.dispatch', MANAGER_ROLES.includes(actor.role as Role))) {
      for (const transfer of transfers) {
        if (!PACKING_STATUSES.includes(transfer.status)
          || (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(transfer.sourceLocationId))) continue;
        const pending = transfer.lines.filter((line) => (line.approvedQtyBase ?? 0) > (line.dispatchedQtyBase ?? 0));
        if (!pending.length) continue;
        packableTransfers.add(transfer.id);
        const variants = candidates.get(transfer.sourceLocationId) ?? new Set<string>();
        for (const line of pending) variants.add(line.variantId);
        candidates.set(transfer.sourceLocationId, variants);
      }
    }
    const [discrepancies, balances] = await Promise.all([
      receiptDiscrepancies(this.prisma, Prisma.sql`t.id IN (${Prisma.join(transfers.map(({ id }) => id))})`),
      Promise.all([...candidates].map(async ([locationId, variantIds]) => [locationId, new Map(
        (await this.inventory.getBalances({ locationId, variantIds: [...variantIds], stockState: StockState.AVAILABLE }))
          .map((row) => [row.variantId, row.quantityBaseUnits]),
      )] as const)),
    ]);
    const historyByTransfer = new Map<string, typeof discrepancies>();
    for (const event of discrepancies) {
      const history = historyByTransfer.get(event.transferId) ?? [];
      history.push(event);
      historyByTransfer.set(event.transferId, history);
    }
    const stockByLocation = new Map(balances);
    return transfers.map((transfer) => ({
      ...transfer,
      receiptDiscrepancies: historyByTransfer.get(transfer.id) ?? [],
      hasStockToPack: packableTransfers.has(transfer.id) ? transfer.lines.some((line) => {
        const minimum = line.cartonRequired ? (line.unitsPerCarton ?? 1) : 1;
        const remaining = (line.approvedQtyBase ?? 0) - (line.dispatchedQtyBase ?? 0);
        return remaining >= minimum && (stockByLocation.get(transfer.sourceLocationId)?.get(line.variantId) ?? 0) >= minimum;
      }) : undefined,
    }));
  }

  async submitTransfer(id: string, actor: TransferActor, idempotencyKey: string | undefined) {
    if (actor.role !== Role.INVENTORY) this.assertManager(actor, 'transfers.request');
    return this.updateTransferInTransaction(id, idempotencyKey, 'POST', `/transfers/${id}/submit`, actor, {}, async (tx, transfer) => {
      this.assertCanViewTransfer(actor, transfer.sourceLocationId, transfer.destLocationId);
      if (transfer.status !== TransferStatus.DRAFT) throw new ConflictException('Only a draft transfer can be submitted');
      if (transfer.lines.length === 0) throw new BadRequestException('A transfer must contain at least one line');
      for (const line of transfer.lines) {
        this.assertShippingQuantity(line.requestedQtyBase, line.unitsPerCarton, line.cartonRequired);
      }
      return tx.transfer.update({ where: { id }, data: { status: TransferStatus.PENDING_APPROVAL }, include: transferInclude });
    });
  }

  async approveTransfer(id: string, dto: ApproveTransferDto, actor: TransferActor, idempotencyKey: string | undefined) {
    this.assertManager(actor, 'transfers.approve');
    return this.updateTransferInTransaction(id, idempotencyKey, 'POST', `/transfers/${id}/approve`, actor, dto, async (tx, transfer) => {
      this.assertLocationAccess(actor, transfer.sourceLocationId);
      if (transfer.status !== TransferStatus.PENDING_APPROVAL) throw new ConflictException('Only a pending transfer can be approved');
      if (transfer.requestedByUserId === actor.userId) throw new ForbiddenException('The requester cannot approve their own transfer');
      const approved = this.uniqueByVariant(dto.lines, 'approved transfer line');
      if (approved.size !== transfer.lines.length || transfer.lines.some((line) => !approved.has(line.variantId))) {
        throw new BadRequestException('Approval must include exactly one quantity for every transfer line');
      }
      for (const line of transfer.lines) {
        const approvedQuantity = approved.get(line.variantId)!.approvedQtyBase;
        this.assertShippingQuantity(approvedQuantity, line.unitsPerCarton, line.cartonRequired);
        if (approvedQuantity > line.requestedQtyBase) {
          throw new BadRequestException('Approved quantity cannot exceed the requested quantity');
        }
      }
      if (![...approved.values()].some((line) => line.approvedQtyBase > 0)) throw new BadRequestException('At least one line must be approved with a positive quantity');
      await Promise.all(transfer.lines.map((line) => tx.transferLine.update({
        where: { id: line.id },
        data: { approvedQtyBase: approved.get(line.variantId)!.approvedQtyBase },
      })));
      return tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.APPROVED, approvedByUserId: actor.userId, approvedAt: new Date() },
        include: transferInclude,
      });
    });
  }

  async rejectTransfer(id: string, reason: string, actor: TransferActor, idempotencyKey: string | undefined) {
    this.assertManager(actor, 'transfers.approve');
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('A rejection reason is required');
    return this.updateTransferInTransaction(id, idempotencyKey, 'POST', `/transfers/${id}/reject`, actor, { reason: cleanReason }, async (tx, transfer) => {
      this.assertLocationAccess(actor, transfer.sourceLocationId);
      if (transfer.status !== TransferStatus.PENDING_APPROVAL) throw new ConflictException('Only a pending transfer can be rejected');
      return tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.REJECTED, notes: this.appendNotes(transfer.notes, `Rejected: ${cleanReason}`) },
        include: transferInclude,
      });
    });
  }

  async dispatchTransfer(id: string, dto: { lines: TransferQuantityDto[] }, actor: TransferActor, idempotencyKey: string | undefined) {
    this.assertManager(actor, 'transfers.dispatch');
    const dispatchLines = this.uniqueByVariant(dto.lines, 'dispatch line');
    return this.updateTransferInTransaction(id, idempotencyKey, 'POST', `/transfers/${id}/dispatch`, actor, dto, async (tx, transfer) => {
      this.assertLocationAccess(actor, transfer.sourceLocationId);
      if (![TransferStatus.APPROVED, TransferStatus.PARTIALLY_DISPATCHED, TransferStatus.PARTIALLY_RECEIVED].includes(transfer.status)) {
        throw new ConflictException('This transfer is not ready for dispatch');
      }
      const locations = await this.lockLocations(tx, [transfer.sourceLocationId, transfer.destLocationId]);
      this.assertOperationalLocations(locations.get(transfer.sourceLocationId)!, locations.get(transfer.destLocationId)!);
      const transferLines = new Map<string, (typeof transfer.lines)[number]>(transfer.lines.map((line) => [line.variantId, line]));
      if ([...dispatchLines.keys()].some((variantId) => !transferLines.has(variantId))) {
        throw new BadRequestException('Dispatch contains a variant that is not on this transfer');
      }
      for (const [variantId, request] of dispatchLines) {
        const line = transferLines.get(variantId)!;
        const approved = line.approvedQtyBase ?? 0;
        const alreadyDispatched = line.dispatchedQtyBase ?? 0;
        const quantity = this.convertLine(request, line.unitsPerCarton, line.cartonRequired);
        if (quantity > approved - alreadyDispatched) {
          throw new BadRequestException(`Dispatch exceeds the approved remaining quantity for variant ${variantId}`);
        }
        const availableRows = await tx.$queryRaw<Array<{ quantity: bigint }>>(Prisma.sql`
          SELECT COALESCE(SUM("quantity_base_units"), 0)::bigint AS "quantity"
          FROM "inventory_movements"
          WHERE "location_id" = ${transfer.sourceLocationId}
            AND "variant_id" = ${variantId}
            AND "stock_state" = 'AVAILABLE'::"StockState"
        `);
        const availableQty = availableRows[0]?.quantity ?? 0n;
        if (availableQty < BigInt(quantity)) {
          throw new ConflictException(
            `Insufficient available stock for variant ${variantId}: ${availableQty} base units available, ${quantity} requested`,
          );
        }
        await this.inventory.recordMovement(tx, {
          locationId: transfer.sourceLocationId,
          variantId,
          actorId: actor.userId,
          type: MovementType.TRANSFER_DISPATCH,
          stockState: StockState.AVAILABLE,
          quantityBaseUnits: -quantity,
          referenceType: 'transfer',
          referenceId: id,
        });
        await this.inventory.recordMovement(tx, {
          locationId: transfer.sourceLocationId,
          variantId,
          actorId: actor.userId,
          type: MovementType.TRANSFER_DISPATCH,
          stockState: StockState.IN_TRANSIT,
          quantityBaseUnits: quantity,
          referenceType: 'transfer',
          referenceId: id,
        });
        await tx.transferLine.update({ where: { id: line.id }, data: { dispatchedQtyBase: alreadyDispatched + quantity } });
      }
      const updatedLines = await tx.transferLine.findMany({ where: { transferId: id } });
      const status = this.calculateStatus(transfer.status, updatedLines);
      return tx.transfer.update({
        where: { id },
        data: { status, dispatchedByUserId: actor.userId, dispatchedAt: new Date() },
        include: transferInclude,
      });
    });
  }

  async receiveTransfer(id: string, dto: ReceiveTransferDto, actor: TransferActor, idempotencyKey: string | undefined) {
    const storeReceiver = STORE_RECEIPT_ROLES.includes(actor.role as Role);
    if (!storeReceiver) this.assertManager(actor, 'transfers.receive');
    const receipts = this.uniqueByVariant(dto.lines, 'receipt line');
    return this.updateTransferInTransaction(id, idempotencyKey, 'POST', `/transfers/${id}/receive`, actor, dto, async (tx, transfer) => {
      this.assertLocationAccess(actor, transfer.destLocationId);
      if (storeReceiver && transfer.destLocation.type !== LocationType.RETAIL_STORE) {
        throw new ForbiddenException('Store staff can receive deliveries at their assigned retail location');
      }
      if (![TransferStatus.DISPATCHED, TransferStatus.PARTIALLY_DISPATCHED, TransferStatus.PARTIALLY_RECEIVED].includes(transfer.status)) {
        throw new ConflictException('This transfer has no dispatched stock to receive');
      }
      const locations = await this.lockLocations(tx, [transfer.sourceLocationId, transfer.destLocationId]);
      this.assertOperationalLocations(locations.get(transfer.sourceLocationId)!, locations.get(transfer.destLocationId)!);
      const transferLines = new Map<string, (typeof transfer.lines)[number]>(transfer.lines.map((line) => [line.variantId, line]));
      if ([...receipts.keys()].some((variantId) => !transferLines.has(variantId))) {
        throw new BadRequestException('Receipt contains a variant that is not on this transfer');
      }
      const recordedAt = new Date();
      const receiptMovement = { type: MovementType.TRANSFER_RECEIPT, receipt: { id: randomUUID(), recordedAt } };
      for (const [variantId, receipt] of receipts) {
        const line = transferLines.get(variantId)!;
        const dispatched = line.dispatchedQtyBase ?? 0;
        const receivedBefore = line.receivedQtyBase ?? 0;
        const shortBefore = line.shortQtyBase;
        const outstanding = dispatched - receivedBefore - shortBefore;
        if (receipt.expectedOutstandingQtyBase !== undefined && receipt.expectedOutstandingQtyBase !== outstanding) {
          throw new ConflictException('The dispatched balance changed. Reopen the delivery after refreshing the transfer list.');
        }
        if (outstanding <= 0 && receipt.receivedQtyBase === 0 && !receipt.finalizeLine) {
          throw new BadRequestException(`There is no outstanding dispatch to reconcile for variant ${variantId}`);
        }
        const excess = Math.max(0, receipt.receivedQtyBase - outstanding);
        const receivedWithinDispatch = receipt.receivedQtyBase - excess;
        const damaged = receipt.damagedQtyBase ?? 0;
        const discrepancyNote = receipt.discrepancyNotes?.trim();
        if (receipt.receivedQtyBase === 0 && !receipt.finalizeLine && (receipt.shortQtyBase ?? 0) === 0) {
          throw new BadRequestException('Receipt line must record received units or finalize a confirmed shortage');
        }
        if (damaged > receivedWithinDispatch) {
          throw new BadRequestException('Damaged quantity cannot exceed the received quantity within the dispatched amount');
        }
        if ((damaged > 0 || excess > 0 || (receipt.shortQtyBase ?? 0) > 0) && !discrepancyNote) {
          throw new BadRequestException('A discrepancy note is required for damaged, excess, or short quantities');
        }
        const short = receipt.shortQtyBase ?? 0;
        if (!receipt.finalizeLine && short > 0) throw new BadRequestException('A shortage can only be recorded when finalizing the line');
        if (receivedWithinDispatch + short > outstanding || (receipt.finalizeLine && receivedWithinDispatch + short !== outstanding)) {
          throw new BadRequestException('Received and short quantities must exactly reconcile the dispatched balance when finalizing a line');
        }

        if (receivedWithinDispatch > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.sourceLocationId,
            variantId,
            actorId: actor.userId,
            ...receiptMovement,
            stockState: StockState.IN_TRANSIT,
            quantityBaseUnits: -receivedWithinDispatch,
            referenceType: 'transfer', referenceId: id,
          });
        }
        const availableQty = receivedWithinDispatch - damaged;
        if (availableQty > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.destLocationId,
            variantId,
            actorId: actor.userId,
            ...receiptMovement,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: availableQty,
            referenceType: 'transfer', referenceId: id,
          });
        }
        if (damaged > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.destLocationId,
            variantId,
            actorId: actor.userId,
            ...receiptMovement,
            stockState: StockState.QUARANTINED,
            quantityBaseUnits: damaged,
            referenceType: 'transfer', referenceId: id,
            notes: discrepancyNote || 'Damaged units received; quarantined for review',
          });
        }
        if (short > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.sourceLocationId,
            variantId,
            actorId: actor.userId,
            ...receiptMovement,
            stockState: StockState.IN_TRANSIT,
            quantityBaseUnits: -short,
            referenceType: 'transfer_shortage', referenceId: id,
            notes: discrepancyNote || 'Dispatched units confirmed short at receipt',
          });
        }
        if (excess > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.destLocationId,
            variantId,
            actorId: actor.userId,
            ...receiptMovement,
            stockState: StockState.QUARANTINED,
            quantityBaseUnits: excess,
            referenceType: 'transfer_excess', referenceId: id,
            notes: discrepancyNote || 'Excess units received; quarantined for review',
          });
        }
        await tx.transferLine.update({
          where: { id: line.id },
          data: {
            receivedQtyBase: receivedBefore + receivedWithinDispatch,
            damagedQtyBase: line.damagedQtyBase + damaged,
            shortQtyBase: shortBefore + short,
            excessQtyBase: line.excessQtyBase + excess,
            discrepancyNotes: discrepancyNote
              ? this.appendNotes(line.discrepancyNotes, discrepancyNote)
              : line.discrepancyNotes,
          },
        });
      }
      const updatedLines = await tx.transferLine.findMany({ where: { transferId: id } });
      const status = this.calculateStatus(transfer.status, updatedLines);
      return tx.transfer.update({
        where: { id },
        data: { status, receivedByUserId: actor.userId, receivedAt: recordedAt },
        include: transferInclude,
      });
    });
  }

  async cancelTransfer(id: string, reason: string, actor: TransferActor, idempotencyKey: string | undefined) {
    this.assertManager(actor, 'transfers.approve');
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('A cancellation reason is required');
    return this.updateTransferInTransaction(id, idempotencyKey, 'PATCH', `/transfers/${id}/cancel`, actor, { reason: cleanReason }, async (tx, transfer) => {
      this.assertCanViewTransfer(actor, transfer.sourceLocationId, transfer.destLocationId);
      if ([TransferStatus.RECEIVED, TransferStatus.REJECTED, TransferStatus.CANCELLED].includes(transfer.status)) {
        throw new ConflictException('A completed, rejected, or already cancelled transfer cannot be cancelled');
      }
      const locations = await this.lockLocations(tx, [transfer.sourceLocationId, transfer.destLocationId]);
      this.assertOperationalLocations(locations.get(transfer.sourceLocationId)!, locations.get(transfer.destLocationId)!);
      for (const line of transfer.lines) {
        const dispatched = line.dispatchedQtyBase ?? 0;
        const received = line.receivedQtyBase ?? 0;
        const short = line.shortQtyBase;
        const stillInTransit = dispatched - received - short;
        if (stillInTransit > 0) {
          await this.inventory.recordMovement(tx, {
            locationId: transfer.sourceLocationId,
            variantId: line.variantId,
            actorId: actor.userId,
            type: MovementType.TRANSFER_CANCELLATION,
            stockState: StockState.IN_TRANSIT,
            quantityBaseUnits: -stillInTransit,
            referenceType: 'transfer_cancellation', referenceId: id,
            notes: cleanReason,
          });
          await this.inventory.recordMovement(tx, {
            locationId: transfer.sourceLocationId,
            variantId: line.variantId,
            actorId: actor.userId,
            type: MovementType.TRANSFER_CANCELLATION,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: stillInTransit,
            referenceType: 'transfer_cancellation', referenceId: id,
            notes: cleanReason,
          });
        }
      }
      return tx.transfer.update({
        where: { id },
        data: {
          status: TransferStatus.CANCELLED,
          cancelledByUserId: actor.userId,
          cancelledAt: new Date(),
          cancellationReason: cleanReason,
        },
        include: transferInclude,
      });
    });
  }

  private async updateTransferInTransaction<T>(
    id: string,
    idempotencyKey: string | undefined,
    method: string,
    endpoint: string,
    actor: TransferActor,
    payload: unknown,
    action: (tx: Tx, transfer: any) => Promise<T>,
  ): Promise<T> {
    return this.runIdempotentMutation(idempotencyKey, method, endpoint, actor, payload, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "transfers" WHERE "id" = ${id} FOR UPDATE`);
      const transfer = await tx.transfer.findUnique({ where: { id }, include: transferInclude });
      if (!transfer) throw new NotFoundException('Transfer not found');
      return action(tx, transfer);
    });
  }

  private async runIdempotentMutation<T>(
    rawKey: string | undefined,
    method: string,
    endpoint: string,
    actor: TransferActor,
    payload: unknown,
    action: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const key = this.requireIdempotencyKey(rawKey);
    const payloadHash = this.hash({
      actorId: actor.userId,
      role: actor.role,
      locationIds: [...actor.locationIds].sort(),
      payload,
    });

    const replay = await this.findMutationReplay(key, method, endpoint, payloadHash);
    if (replay.found) return replay.value as T;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize even the first use of a key; row locks alone cannot lock a missing record.
        await tx.$queryRaw(Prisma.sql`
          WITH advisory_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
          )
          SELECT 1 AS "locked" FROM advisory_lock
        `);
        const now = new Date();
        await tx.idempotencyRecord.deleteMany({
          where: { idempotencyKey: key, expiresAt: { lte: now } },
        });
        this.idempotencyCleanupCounter += 1;
        if (this.idempotencyCleanupCounter % 250 === 0) {
          await tx.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } });
        }
        const existing = await tx.idempotencyRecord.findUnique({ where: { idempotencyKey: key } });
        if (existing) return this.readMutationReplay(existing, method, endpoint, payloadHash) as T;

        const result = await action(tx);
        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey: key,
            payloadHash,
            httpMethod: method,
            endpoint,
            statusCode: method === 'POST' ? 201 : 200,
            responseBody: JSON.stringify(result),
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const collided = await this.findMutationReplay(key, method, endpoint, payloadHash);
        if (collided.found) return collided.value as T;
      }
      throw error;
    }
  }

  private async findMutationReplay(
    key: string,
    method: string,
    endpoint: string,
    payloadHash: string,
  ): Promise<{ found: false } | { found: true; value: unknown }> {
    const record = await this.prisma.idempotencyRecord.findUnique({ where: { idempotencyKey: key } });
    if (!record || record.expiresAt <= new Date()) return { found: false };
    return { found: true, value: this.readMutationReplay(record, method, endpoint, payloadHash) };
  }

  private readMutationReplay(
    record: { httpMethod: string; endpoint: string; payloadHash: string; responseBody: string | null },
    method: string,
    endpoint: string,
    payloadHash: string,
  ): unknown {
    if (record.httpMethod !== method || record.endpoint !== endpoint || record.payloadHash !== payloadHash) {
      throw new ConflictException('Idempotency-Key was already used for a different actor, endpoint, or request');
    }
    if (!record.responseBody) throw new ConflictException('The stored idempotent response is unavailable');
    try {
      return JSON.parse(record.responseBody);
    } catch {
      throw new ConflictException('The stored idempotent response is invalid');
    }
  }

  private async requireLocation(tx: Tx, id: string): Promise<LockedLocation> {
    const location = await tx.location.findUnique({
      where: { id },
      select: { id: true, companyId: true, type: true, parentId: true, isActive: true, isAuditLocked: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  private async lockLocations(tx: Tx, ids: string[]): Promise<Map<string, LockedLocation>> {
    const sorted = [...new Set(ids)].sort();
    const rows = await tx.$queryRaw<LockedLocation[]>(Prisma.sql`
      SELECT "id", "company_id" AS "companyId", "type", "parent_id" AS "parentId",
        "is_active" AS "isActive", "is_audit_locked" AS "isAuditLocked"
      FROM "locations" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE
    `);
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async loadTransferVariants(tx: Tx, ids: string[]) {
    await tx.$queryRaw(Prisma.sql`
      SELECT p."id" FROM "products" p
      JOIN "variants" v ON v."product_id" = p."id"
      WHERE v."id" IN (${Prisma.join(ids)})
      FOR SHARE OF p, v
    `);
    const variants = await tx.variant.findMany({
      where: { id: { in: ids }, isActive: true, product: { isActive: true } },
      select: { id: true, product: { select: { unitsPerCarton: true, baseUnit: true, reorderLevel: true } } },
    });
    if (variants.length !== ids.length) throw new NotFoundException('One or more active variants were not found');
    return new Map(variants.map((variant) => [variant.id, variant]));
  }

  private convertLine(line: TransferQuantityDto, unitsPerCarton: number | null, cartonRequired: boolean): number {
    if (cartonRequired && (line.looseBaseUnits ?? 0) > 0) throw new BadRequestException('This product ships in whole cartons');
    if ((unitsPerCarton ?? 0) <= 1 && (line.cartons ?? 0) > 0) throw new BadRequestException('This product ships as individual units');
    try {
      const quantity = convertToBaseUnits({ cartons: line.cartons ?? 0, baseUnits: line.looseBaseUnits ?? 0, unitsPerCarton });
      if (quantity < 1 || quantity > 2147483647) throw new BadRequestException('Transfer quantity must be between 1 and 2,147,483,647 base units');
      return quantity;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private assertShippingQuantity(quantity: number, unitsPerCarton: number | null, cartonRequired: boolean): void {
    if (quantity > 0 && cartonRequired && (!unitsPerCarton || quantity % unitsPerCarton !== 0)) {
      throw new BadRequestException('This product ships in whole cartons');
    }
  }

  private assertTransferRoute(source: LockedLocation, destination: LockedLocation): void {
    if (source.id === destination.id) throw new BadRequestException('Source and destination must be different locations');
    if (source.companyId !== destination.companyId) throw new BadRequestException('Transfers must remain within one company');
    const supportedTypes = [LocationType.MAIN_WAREHOUSE, LocationType.SUB_WAREHOUSE, LocationType.RETAIL_STORE];
    if (!supportedTypes.includes(source.type) || !supportedTypes.includes(destination.type)) {
      throw new BadRequestException('Transfer locations must be warehouses or retail stores');
    }
  }

  private assertOperationalLocations(source: LockedLocation, destination: LockedLocation): void {
    if (!source || !destination) throw new NotFoundException('Transfer location not found');
    if (!source.isActive || !destination.isActive) throw new ConflictException('Both transfer locations must be active');
    if (source.isAuditLocked || destination.isAuditLocked) throw new ConflictException('Transfer is blocked while either location is locked for a stock audit');
  }

  private calculateStatus(currentStatus: TransferStatus, lines: Array<{ approvedQtyBase: number | null; dispatchedQtyBase: number | null; receivedQtyBase: number | null; shortQtyBase: number }>): TransferStatus {
    const hasDispatched = lines.some((line) => (line.dispatchedQtyBase ?? 0) > 0);
    if (!hasDispatched) return TransferStatus.APPROVED;
    const allApprovedDispatched = lines.every((line) => (line.dispatchedQtyBase ?? 0) >= (line.approvedQtyBase ?? 0));
    if (!allApprovedDispatched) return TransferStatus.PARTIALLY_DISPATCHED;
    const anyReceived = lines.some((line) => (line.receivedQtyBase ?? 0) > 0 || line.shortQtyBase > 0);
    if (!anyReceived) return TransferStatus.DISPATCHED;
    const allReconciled = lines.every((line) =>
      (line.receivedQtyBase ?? 0) + line.shortQtyBase >= (line.dispatchedQtyBase ?? 0),
    );
    return allReconciled ? TransferStatus.RECEIVED : TransferStatus.PARTIALLY_RECEIVED;
  }

  private async findReplenishmentReplay(key: string, hash: string) {
    const request = await this.prisma.replenishmentRequest.findUnique({
      where: { idempotencyKey: key },
      include: { lines: true, sourceLocation: true, destLocation: true },
    });
    if (!request) return null;
    if (request.payloadHash !== hash) throw new ConflictException('Idempotency key was already used for a different replenishment request');
    return { message: 'Replenishment request already generated', data: request, replayed: true };
  }

  private assertTransferAccess(actor: TransferActor): void {
    if (!(['transfers.request', 'transfers.approve', 'transfers.dispatch', 'transfers.receive'] as const)
      .some((permission) => can(actor, permission, MANAGER_ROLES.includes(actor.role as Role)))) {
      throw new ForbiddenException('Transfer access has not been assigned');
    }
  }

  private assertManager(actor: TransferActor, permission: PermissionKey): void {
    if (!can(actor, permission, MANAGER_ROLES.includes(actor.role as Role))) throw new ForbiddenException('Only managers can manage transfers and replenishment');
  }

  private assertLocationAccess(actor: TransferActor, locationId: string): void {
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) {
      throw new ForbiddenException('You are not authorized for this transfer location');
    }
  }

  private assertCanViewTransfer(actor: TransferActor, sourceId: string, destId: string): void {
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.some((id) => id === sourceId || id === destId)) {
      throw new ForbiddenException('You are not authorized to view this transfer');
    }
  }

  private uniqueByVariant<T extends { variantId: string }>(lines: T[], label: string): Map<string, T> {
    if (lines.length === 0) throw new BadRequestException(`At least one ${label} is required`);
    const result = new Map<string, T>();
    for (const line of lines) {
      if (result.has(line.variantId)) throw new BadRequestException(`Each variant may appear only once in ${label}s`);
      result.set(line.variantId, line);
    }
    return result;
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) throw new BadRequestException('Idempotency-Key header must contain 8 to 200 characters');
    return key;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private makeNumber(prefix: string): string {
    return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private appendNotes(current: string | null, note: string): string {
    return [current, note].filter(Boolean).join('\n').slice(0, 10000);
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

const transferInclude = {
  requestedBy: { select: { email: true, employee: { select: { firstName: true, lastName: true } } } },
  sourceLocation: { select: { id: true, name: true, type: true, parentId: true, isAuditLocked: true } },
  destLocation: { select: { id: true, name: true, type: true, parentId: true, isAuditLocked: true, company: { select: { timezone: true } } } },
  lines: { include: { variant: { select: { id: true, sku: true, name: true, product: { select: { id: true, name: true, baseUnit: true } } } } } },
} satisfies Prisma.TransferInclude;
