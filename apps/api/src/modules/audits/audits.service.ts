import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditSessionStatus, LocationType, MovementType, Role, StockState, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';
import { AuditThresholdDto, BulkAuditScheduleDto, DailyAuditScheduleDto } from './dto/audit-count.dto';

const TERMINAL: AuditSessionStatus[] = [AuditSessionStatus.APPROVED, AuditSessionStatus.CLOSED, AuditSessionStatus.ABORTED];
const MANAGERS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

@Injectable()
export class AuditsService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async start(locationId: string, actor: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; type: LocationType; timezone: string; dailyAuditTime: string; isActive: boolean; isAuditLocked: boolean }>>(Prisma.sql`
        SELECT l."id", l."type", c."timezone", l."daily_audit_time" AS "dailyAuditTime",
          l."is_active" AS "isActive", l."is_audit_locked" AS "isAuditLocked"
        FROM "locations" l JOIN "companies" c ON c."id" = l."company_id"
        WHERE l."id" = ${locationId} FOR UPDATE OF l
      `);
      const location = rows[0];
      if (!location) throw new NotFoundException('Location not found');
      if (!location.isActive) throw new ConflictException('Cannot audit an inactive location');
      this.assertAuditWindow(location.type, this.localAuditClock(new Date(), location.timezone), location.dailyAuditTime);
      if (location.isAuditLocked) throw new ConflictException('Location already has an active stock audit');
      return this.createSessionInTransaction(tx, locationId, actor.userId);
    });
  }

  private async createSessionInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    actorId: string,
  ) {
      const session = await tx.auditSession.create({ data: { locationId, initiatedByUserId: actorId, isScheduled: false } });
      await tx.auditThreshold.upsert({ where: { scopeKey: 'default' }, create: { scopeKey: 'default' }, update: {} });
      const snapshots = await tx.$queryRaw<Array<{ variantId: string; categoryId: string | null; expectedQtyBase: bigint }>>(Prisma.sql`
        SELECT v."id" AS "variantId", p."category_id" AS "categoryId", COALESCE(SUM(m."quantity_base_units"), 0)::bigint AS "expectedQtyBase"
        FROM "variants" v
        JOIN "products" p ON p."id" = v."product_id" AND p."is_active" = true
        LEFT JOIN "inventory_movements" m
          ON m."variant_id" = v."id" AND m."location_id" = ${locationId}
          AND m."stock_state" = 'AVAILABLE'::"StockState"
        WHERE v."is_active" = true
        GROUP BY v."id", p."category_id"
        ORDER BY v."id"
      `);
      if (snapshots.length === 0) throw new ConflictException('No active product variants are available for a stock audit at this location');
      const policies = await tx.auditThreshold.findMany();
      const defaultPolicy = policies.find((policy) => policy.scopeKey === 'default');
      const categoryPolicies = new Map(policies.filter((policy) => policy.categoryId).map((policy) => [policy.categoryId!, policy]));
      const countItems = snapshots.map((snapshot) => {
        const expectedQtyBase = Number(snapshot.expectedQtyBase);
        if (!Number.isInteger(expectedQtyBase) || expectedQtyBase < -2147483648 || expectedQtyBase > 2147483647) {
          throw new BadRequestException('Expected inventory exceeds the supported count range');
        }
        const policy = snapshot.categoryId
          ? categoryPolicies.get(snapshot.categoryId) ?? defaultPolicy
          : defaultPolicy;
        return {
          auditSessionId: session.id,
          variantId: snapshot.variantId,
          expectedQtyBase,
          recountThresholdPercent: policy?.recountVariancePercent ?? 2,
          recountThresholdUnits: policy?.recountVarianceUnits ?? 5,
          highCountAlertQty: policy?.highCountAlertQty ?? null,
        };
      });
      if (countItems.length) await tx.auditCountItem.createMany({ data: countItems });
      await tx.location.update({
        where: { id: locationId },
        data: { isAuditLocked: true },
      });
      const created = await tx.auditSession.findUnique({
        where: { id: session.id },
        include: {
          countItems: {
            include: {
              variant: {
                include: { product: { select: { id: true, name: true, baseUnit: true, unitsPerCarton: true } } },
              },
            },
          },
        },
      });
      return this.hideExpectedForBlindCount(created);
  }

  async getSchedule(locationId: string, actor: RequestUser) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { company: { select: { timezone: true } } },
    });
    if (!location) throw new NotFoundException('Location not found');
    this.assertLocationScope(locationId, actor);
    return {
      locationId,
      enabled: location.dailyAuditEnabled,
      startTime: location.dailyAuditTime,
      timezone: location.company.timezone,
      lastRunDate: location.dailyAuditLastRunDate,
      locationType: location.type,
      allowedDays: location.type === LocationType.RETAIL_STORE ? 'Every day after 7:00 PM' : 'Sundays after 7:00 PM',
      earliestStartTime: location.type === LocationType.RETAIL_STORE ? '19:00' : null,
      canStartNow: this.isWithinAuditWindow(location.type, this.localAuditClock(new Date(), location.company.timezone), location.dailyAuditTime),
    };
  }

  async saveSchedule(locationId: string, dto: DailyAuditScheduleDto, actor: RequestUser) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true, type: true } });
    if (!location) throw new NotFoundException('Location not found');
    this.assertLocationScope(locationId, actor);
    if (!dto.enabled) throw new BadRequestException('The confirmed daily/weekly audit cadence cannot be disabled');
    if (!dto.startTime) throw new BadRequestException('Set an audit window start time');
    if (dto.startTime < '19:00') {
      throw new BadRequestException('Audit schedules cannot start before 7:00 PM local time');
    }
    const updated = await this.prisma.location.update({
      where: { id: locationId },
      data: {
        dailyAuditEnabled: true,
        dailyAuditTime: dto.startTime,
        dailyAuditLastRunDate: null,
      },
      include: { company: { select: { timezone: true } } },
    });
    return {
      locationId,
      enabled: updated.dailyAuditEnabled,
      startTime: updated.dailyAuditTime,
      timezone: updated.company.timezone,
      lastRunDate: updated.dailyAuditLastRunDate,
    };
  }

  async saveAllSchedules(dto: BulkAuditScheduleDto, actor: RequestUser) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only a Super Admin can change audit schedules for all locations');
    if (dto.storeStartTime < '19:00' || dto.warehouseStartTime < '19:00') {
      throw new BadRequestException('Store and warehouse audit schedules cannot start before 7:00 PM local time');
    }
    if (!dto.reason.trim()) throw new BadRequestException('A reason is required for a global audit schedule change');

    return this.prisma.$transaction(async (tx) => {
      const locations = await tx.location.findMany({
        where: { isActive: true },
        select: { id: true, type: true, dailyAuditTime: true },
      });
      const stores = locations.filter((location) => location.type === LocationType.RETAIL_STORE);
      const warehouses = locations.filter((location) => location.type !== LocationType.RETAIL_STORE);
      const updates = await Promise.all([
        tx.location.updateMany({
          where: { id: { in: stores.map((location) => location.id) } },
          data: { dailyAuditEnabled: true, dailyAuditTime: dto.storeStartTime, dailyAuditLastRunDate: null },
        }),
        tx.location.updateMany({
          where: { id: { in: warehouses.map((location) => location.id) } },
          data: { dailyAuditEnabled: true, dailyAuditTime: dto.warehouseStartTime, dailyAuditLastRunDate: null },
        }),
      ]);

      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: 'AUDIT_SCHEDULE_BULK_UPDATED',
          targetEntity: 'LocationAuditSchedule',
          targetId: 'all-active-locations',
          beforeValue: JSON.stringify({ locations: locations.map(({ id, type, dailyAuditTime }) => ({ id, type, startTime: dailyAuditTime })) }),
          afterValue: JSON.stringify({ storeStartTime: dto.storeStartTime, warehouseStartTime: dto.warehouseStartTime, storesUpdated: updates[0].count, warehousesUpdated: updates[1].count }),
          reason: dto.reason.trim(),
        },
      });

      return {
        storeStartTime: dto.storeStartTime,
        warehouseStartTime: dto.warehouseStartTime,
        storesUpdated: updates[0].count,
        warehousesUpdated: updates[1].count,
      };
    });
  }

  async list(locationId: string, actor: RequestUser) {
    this.assertLocationScope(locationId, actor);
    if (!(await this.canManageOrCount(actor))) {
      throw new ForbiddenException('Stock audit access requires manager access or count permission');
    }
    return this.prisma.auditSession.findMany({
      where: { locationId }, orderBy: { startedAt: 'desc' },
      include: { _count: { select: { countItems: true } } },
    });
  }

  async capabilities(actor: RequestUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { isActive: true, canCountStockAudits: true },
    });
    const active = Boolean(user?.isActive);
    return {
      canCount: active && (actor.role === Role.SUPER_ADMIN || Boolean(user?.canCountStockAudits)),
      canManage: active && MANAGERS.includes(actor.role as Role),
      canChangeThresholds: active && actor.role === Role.SUPER_ADMIN,
    };
  }

  async listThresholds() {
    await this.prisma.auditThreshold.upsert({ where: { scopeKey: 'default' }, create: { scopeKey: 'default' }, update: {} });
    return this.prisma.auditThreshold.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ categoryId: 'asc' }],
    });
  }

  async saveThresholds(dto: AuditThresholdDto, actor: RequestUser) {
    if (!dto.reason.trim()) throw new BadRequestException('Threshold change reason is required');
    const categoryId = dto.categoryId || null;
    if (categoryId && !(await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
      throw new NotFoundException('Category not found');
    }
    const scopeKey = categoryId ? `category:${categoryId}` : 'default';
    return this.prisma.auditThreshold.upsert({
      where: { scopeKey },
      create: {
        scopeKey, categoryId,
        recountVariancePercent: dto.recountVariancePercent,
        recountVarianceUnits: dto.recountVarianceUnits,
        highCountAlertQty: dto.highCountAlertQty ?? null,
        updatedByUserId: actor.userId,
        changeReason: dto.reason,
      },
      update: {
        recountVariancePercent: dto.recountVariancePercent,
        recountVarianceUnits: dto.recountVarianceUnits,
        highCountAlertQty: dto.highCountAlertQty ?? null,
        updatedByUserId: actor.userId,
        changeReason: dto.reason,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async get(sessionId: string, actor: RequestUser) {
    const session = await this.prisma.auditSession.findUnique({
      where: { id: sessionId },
      include: {
        location: { select: { id: true } },
        approvedBy: { select: { id: true, email: true } },
        countItems: {
          include: {
            variant: {
              include: { product: { select: { id: true, name: true, baseUnit: true, unitsPerCarton: true } } },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Audit session not found');
    this.assertLocationScope(session.locationId, actor);
    const manager = MANAGERS.includes(actor.role as Role);
    const canCount = await this.canManageOrCount(actor);
    if (session.status !== AuditSessionStatus.ACTIVE) {
      if (manager) return session;
      const blind = this.hideExpectedForBlindCount(session);
      return canCount ? blind : this.hideCountValues(blind);
    }
    // Active counts remain blind for every viewer. Counter timestamps and the
    // recount-required flag provide workflow state without exposing quantities.
    return {
      ...session,
      countItems: session.countItems.map((item) => {
        const { expectedQtyBase: _expected, countedQtyBase: _counted, recountQtyBase: _recounted,
          varianceBase: _variance, variancePercent: _variancePercent, highCountAlert: _alert, ...blind } = item;
        return blind;
      }),
    };
  }

  async recordCount(sessionId: string, itemId: string, dto: { quantityBaseUnits: number; notes?: string }, actor: RequestUser) {
    await this.get(sessionId, actor);
    if (actor.role !== Role.SUPER_ADMIN) {
      const counter = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { role: true, canCountStockAudits: true, isActive: true } });
      if (!counter?.isActive || !counter.canCountStockAudits) {
        throw new ForbiddenException('A Super Admin must grant you stock audit count permission before you can enter counts');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSession(tx, sessionId);
      if (locked.status !== AuditSessionStatus.ACTIVE) throw new ConflictException('Counts can only be entered in an active audit');
      const item = await tx.auditCountItem.findFirst({ where: { id: itemId, auditSessionId: sessionId } });
      if (!item) throw new NotFoundException('Audit count item not found');
      if (!item.requiresRecount && item.countedQtyBase !== null) {
        throw new ConflictException('This product already has a saved count. Ask a manager to request a recount to change it.');
      }
      if (item.requiresRecount && item.recountQtyBase !== null) {
        throw new ConflictException('A recount is already saved. Ask a manager to request another recount.');
      }
      const variance = dto.quantityBaseUnits - item.expectedQtyBase;
      const variancePercent = item.expectedQtyBase === 0
        ? null
        : Math.abs(variance) / Math.abs(item.expectedQtyBase) * 100;
      const thresholdExceeded = Math.abs(variance) > item.recountThresholdUnits
        || (variancePercent !== null && variancePercent > Number(item.recountThresholdPercent));
      const highCountAlert = item.highCountAlertQty !== null && dto.quantityBaseUnits >= item.highCountAlertQty;
      const data = item.requiresRecount
        ? { recountQtyBase: dto.quantityBaseUnits, recountedByUserId: actor.userId, recountedAt: new Date(), varianceBase: variance, highCountAlert, variancePercent, notes: dto.notes ?? item.notes }
        : {
            countedQtyBase: dto.quantityBaseUnits,
            countedByUserId: actor.userId,
            countedAt: new Date(),
            varianceBase: variance,
            requiresRecount: thresholdExceeded,
            highCountAlert,
            variancePercent,
            notes: dto.notes ?? item.notes,
          };
      const updated = await tx.auditCountItem.update({ where: { id: item.id }, data });
      return this.hideBlindCountItem(updated);
    });
  }

  async requestRecount(sessionId: string, itemId: string, reason: string, actor: RequestUser) {
    if (!reason.trim()) throw new BadRequestException('Recount reason is required');
    await this.get(sessionId, actor);
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSession(tx, sessionId);
      if (locked.status !== AuditSessionStatus.ACTIVE && locked.status !== AuditSessionStatus.SUBMITTED) {
        throw new ConflictException('Recounts can only be requested before the audit is approved or aborted');
      }
      const item = await tx.auditCountItem.findFirst({ where: { id: itemId, auditSessionId: sessionId } });
      if (!item) throw new NotFoundException('Audit count item not found');
      if (item.countedQtyBase === null) throw new ConflictException('Enter the first count before requesting a recount');
      const updated = await tx.auditCountItem.update({ where: { id: item.id }, data: { requiresRecount: true, recountQtyBase: null, recountedByUserId: null, recountedAt: null, recountRequestReason: reason } });
      if (locked.status === AuditSessionStatus.SUBMITTED) {
        await tx.auditSession.update({ where: { id: sessionId }, data: { status: AuditSessionStatus.ACTIVE, completedAt: null } });
      }
      return this.hideBlindCountItem(updated);
    });
  }

  async submit(sessionId: string, actor: RequestUser) {
    await this.get(sessionId, actor);
    if (!(await this.canManageOrCount(actor))) throw new ForbiddenException('Only an authorized counter or manager can submit an audit');
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSession(tx, sessionId);
      if (locked.status !== AuditSessionStatus.ACTIVE) throw new ConflictException('Only an active audit can be submitted');
      const items = await tx.auditCountItem.findMany({ where: { auditSessionId: sessionId }, select: { countedQtyBase: true, recountQtyBase: true, requiresRecount: true } });
      const incomplete = items.filter((item) => item.countedQtyBase === null || (item.requiresRecount && item.recountQtyBase === null));
      if (incomplete.length) throw new ConflictException(`${incomplete.length} product variant count(s) are incomplete`);
      return tx.auditSession.update({ where: { id: sessionId }, data: { status: AuditSessionStatus.SUBMITTED, completedAt: new Date() } });
    });
  }

  async approve(sessionId: string, reason: string, actor: RequestUser) {
    const current = await this.get(sessionId, actor);
    if (current.status !== AuditSessionStatus.SUBMITTED) throw new ConflictException('Only a submitted audit can be approved');
    if (!reason.trim()) throw new BadRequestException('Approval reason is required');
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionLocation(tx, current.locationId);
      const session = await tx.auditSession.findUnique({ where: { id: sessionId }, include: { countItems: true } });
      if (!session || session.status !== AuditSessionStatus.SUBMITTED) throw new ConflictException('Audit status changed; refresh and try again');
      for (const item of session.countItems) {
        const approvedQtyBase = item.requiresRecount ? item.recountQtyBase : item.countedQtyBase;
        if (approvedQtyBase === null || approvedQtyBase === undefined) throw new ConflictException('All required counts must be completed before approval');
        const varianceBase = approvedQtyBase - item.expectedQtyBase;
        if (varianceBase !== 0) {
          await this.inventory.recordMovement(tx, {
            locationId: session.locationId,
            variantId: item.variantId,
            actorId: actor.userId,
            type: MovementType.STOCK_ADJUSTMENT,
            stockState: StockState.AVAILABLE,
            quantityBaseUnits: varianceBase,
            referenceType: 'audit',
            referenceId: session.id,
            notes: `Approved stock audit adjustment: ${reason}`,
            allowAuditLocked: true,
          });
        }
        await tx.auditCountItem.update({
          where: { id: item.id },
          data: { approvedQtyBase, varianceBase, adjustmentApproved: true },
        });
      }
      const approved = await tx.auditSession.update({
        where: { id: session.id },
        data: { status: AuditSessionStatus.APPROVED, approvedByUserId: actor.userId, completedAt: new Date(), resolutionReason: reason },
      });
      await tx.location.update({ where: { id: session.locationId }, data: { isAuditLocked: false } });
      return approved;
    });
  }

  async abort(sessionId: string, reason: string, actor: RequestUser) {
    const session = await this.get(sessionId, actor);
    if (!reason.trim()) throw new BadRequestException('Abort reason is required');
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessionLocation(tx, session.locationId);
      const locked = await this.lockSession(tx, session.id);
      if (TERMINAL.includes(locked.status)) throw new ConflictException('This audit is already closed');
      const aborted = await tx.auditSession.update({ where: { id: session.id }, data: { status: AuditSessionStatus.ABORTED, completedAt: new Date(), resolutionReason: reason } });
      await tx.location.update({ where: { id: session.locationId }, data: { isAuditLocked: false } });
      return aborted;
    });
  }

  private async lockSessionLocation(tx: Prisma.TransactionClient, locationId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; isAuditLocked: boolean }>>(Prisma.sql`
      SELECT "id", "is_audit_locked" AS "isAuditLocked" FROM "locations" WHERE "id" = ${locationId} FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Location not found');
    if (!rows[0].isAuditLocked) throw new ConflictException('Audit lock is no longer active');
  }

  private async lockSession(tx: Prisma.TransactionClient, sessionId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: AuditSessionStatus }>>(Prisma.sql`
      SELECT "id", "status" FROM "audit_sessions" WHERE "id" = ${sessionId} FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Audit session not found');
    return rows[0];
  }

  private assertLocationScope(locationId: string, actor: RequestUser) {
    if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) {
      throw new ForbiddenException('You are not authorized to access this location audit');
    }
  }

  private async canManageOrCount(actor: RequestUser) {
    if (MANAGERS.includes(actor.role as Role)) return true;
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { isActive: true, canCountStockAudits: true } });
    return Boolean(user?.isActive && user.canCountStockAudits);
  }

  private localAuditClock(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      time: `${value('hour')}:${value('minute')}`,
      weekday: value('weekday'),
    };
  }

  private isWithinAuditWindow(type: LocationType, local: { time: string; weekday: string }, configuredStartTime = '19:00') {
    if (local.time < '19:00' || local.time < configuredStartTime) return false;
    return type === LocationType.RETAIL_STORE
      ? true
      : local.weekday === 'Sun';
  }

  private assertAuditWindow(type: LocationType, local: { date: string; time: string; weekday: string }, configuredStartTime = '19:00') {
    if (this.isWithinAuditWindow(type, local, configuredStartTime)) return;
    if (type === LocationType.RETAIL_STORE) {
      if (local.time >= '19:00' && local.time < configuredStartTime) {
        throw new ConflictException(`Store stock audits are scheduled to start at or after ${configuredStartTime} local time`);
      }
      throw new ConflictException('Store stock audits are available only after 7:00 PM local time');
    }
    if (local.weekday === 'Sun' && local.time >= '19:00' && local.time < configuredStartTime) {
      throw new ConflictException(`Warehouse stock audits are scheduled to start at or after ${configuredStartTime} local time on Sundays`);
    }
    throw new ConflictException('Warehouse stock audits are available only after 7:00 PM on Sundays');
  }

  private hideExpectedForBlindCount<T extends { countItems?: Array<{ expectedQtyBase: number }> } | null>(session: T): T {
    if (!session?.countItems) return session;
    return {
      ...session,
      countItems: session.countItems.map((item) => this.hideBlindCountItem(item)),
    } as T;
  }

  private hideBlindCountItem<T extends { expectedQtyBase: number; varianceBase?: number | null; variancePercent?: unknown }>(item: T): T {
    const {
      expectedQtyBase: _expectedQtyBase,
      varianceBase: _varianceBase,
      variancePercent: _variancePercent,
      ...blindCountItem
    } = item;
    return blindCountItem as T;
  }

  private hideCountValues<T extends { countItems?: Array<Record<string, unknown>> }>(session: T): T {
    if (!session.countItems) return session;
    return {
      ...session,
      countItems: session.countItems.map((item) => {
        const { countedQtyBase: _counted, recountQtyBase: _recounted, varianceBase: _variance,
          variancePercent: _variancePercent, highCountAlert: _alert, ...redacted } = item;
        return redacted;
      }),
    };
  }
}
