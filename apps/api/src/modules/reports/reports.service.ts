import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportQuery } from './reports.controller';

type DateScope = { locationIds: string[]; from: Date; to: Date };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async salesSummary(query: ReportQuery, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    const where = { locationId: { in: scope.locationIds }, createdAt: { gte: scope.from, lt: scope.to } };
    const [invoiceCount, invoiceRows, dailyRows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        select: { id: true, invoiceNumber: true, locationId: true, status: true, netTotal: true, createdAt: true, cancelledAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 500,
      }),
      this.prisma.$queryRaw<Array<{ locationId: string; date: string; invoices: number; cancelled: number; netSales: string }>>(Prisma.sql`
        WITH refunded AS (
          SELECT r."invoice_id" AS "invoiceId", SUM(r."amount") AS "amount"
          FROM "invoice_refunds" r
          GROUP BY r."invoice_id"
        )
        SELECT i."location_id" AS "locationId",
          (i."created_at" AT TIME ZONE c."timezone")::date::text AS "date",
          COUNT(*) FILTER (WHERE i."status" = 'FINALIZED')::integer AS "invoices",
          COUNT(*) FILTER (WHERE i."status" = 'CANCELLED')::integer AS "cancelled",
          COALESCE(SUM(i."net_total" - COALESCE(refunded."amount", 0)), 0)::text AS "netSales"
        FROM "invoices" i
        JOIN "locations" l ON l."id" = i."location_id"
        JOIN "companies" c ON c."id" = l."company_id"
        LEFT JOIN refunded ON refunded."invoiceId" = i."id"
        WHERE i."location_id" IN (${Prisma.join(scope.locationIds)})
          AND i."created_at" >= ${scope.from}
          AND i."created_at" < ${scope.to}
        GROUP BY i."location_id", (i."created_at" AT TIME ZONE c."timezone")::date
        ORDER BY (i."created_at" AT TIME ZONE c."timezone")::date ASC
      `),
    ]);
    const locations = await this.prisma.location.findMany({ where: { id: { in: scope.locationIds } }, select: { id: true, name: true, company: { select: { timezone: true } } } });
    const nameById = new Map(locations.map((location) => [location.id, location.name]));
    const byLocation = new Map<string, { invoices: number; netSales: Prisma.Decimal; cancelled: number }>();
    const days = new Map<string, { date: string; invoices: number; netSales: Prisma.Decimal; cancelled: number }>();
    for (const row of dailyRows) {
      const day = days.get(row.date) ?? { date: row.date, invoices: 0, netSales: new Prisma.Decimal(0), cancelled: 0 };
      day.invoices += row.invoices;
      day.cancelled += row.cancelled;
      day.netSales = day.netSales.add(row.netSales);
      days.set(row.date, day);

      const location = byLocation.get(row.locationId) ?? { invoices: 0, netSales: new Prisma.Decimal(0), cancelled: 0 };
      location.invoices += row.invoices;
      location.cancelled += row.cancelled;
      location.netSales = location.netSales.add(row.netSales);
      byLocation.set(row.locationId, location);
    }
    const total = [...byLocation.values()].reduce((sum, item) => sum.add(item.netSales), new Prisma.Decimal(0));
    const completedInvoices = [...byLocation.values()].reduce((sum, item) => sum + item.invoices, 0);
    const cancelledInvoices = [...byLocation.values()].reduce((sum, item) => sum + item.cancelled, 0);
    return {
      period: { from: scope.from.toISOString(), to: scope.to.toISOString() },
      totals: { netSales: total.toFixed(2), completedInvoices, cancelledInvoices },
      locations: [...byLocation.entries()].map(([locationId, value]) => ({ locationId, locationName: nameById.get(locationId) ?? 'Location', invoices: value.invoices, cancelled: value.cancelled, netSales: value.netSales.toFixed(2) })).sort((a, b) => Number(b.netSales) - Number(a.netSales)),
      daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({ ...item, netSales: item.netSales.toFixed(2) })),
      invoices: invoiceRows.map((invoice) => ({ ...invoice, locationName: nameById.get(invoice.locationId) ?? 'Location', netTotal: invoice.netTotal.toFixed(2) })),
      truncated: invoiceCount > invoiceRows.length,
    };
  }

  async salesDetails(query: ReportQuery, actor: RequestUser, page: number, pageSize: number) {
    const scope = await this.resolveScope(query, actor);
    const where: Prisma.InvoiceWhereInput = { locationId: { in: scope.locationIds }, createdAt: { gte: scope.from, lt: scope.to } };
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: {
          location: { select: { id: true, name: true } },
          lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
          payment: true,
        },
      }),
    ]);
    return { page, pageSize, total, totalPages: Math.ceil(total / pageSize), rows };
  }

  async stock(query: ReportQuery, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    const balances = (await Promise.all(scope.locationIds.map((locationId) => this.inventory.getBalances({ locationId })))).flat();
    const products = await this.prisma.product.findMany({ where: { isActive: true }, select: { id: true, reorderLevel: true } });
    const reorderByProduct = new Map(products.map((p) => [p.id, p.reorderLevel]));
    const rows = new Map<string, { variantId: string; productId: string; productName: string; variantName: string; sku: string; locationId: string; locationName: string; baseUnit: string; unitsPerCarton: number | null; available: number; inTransit: number; reserved: number; quarantined: number }>();
    for (const balance of balances) {
      let row = rows.get(`${balance.locationId}:${balance.variantId}`);
      if (!row) {
        row = { variantId: balance.variantId, productId: balance.productId, productName: balance.productName, variantName: balance.variantName, sku: balance.sku, locationId: balance.locationId, locationName: balance.locationName, baseUnit: balance.baseUnit, unitsPerCarton: balance.unitsPerCarton, available: 0, inTransit: 0, reserved: 0, quarantined: 0 };
        rows.set(`${balance.locationId}:${balance.variantId}`, row);
      }
      const field = balance.stockState === 'AVAILABLE' ? 'available' : balance.stockState === 'IN_TRANSIT' ? 'inTransit' : balance.stockState === 'RESERVED' ? 'reserved' : 'quarantined';
      row[field] = balance.quantityBaseUnits;
    }
    const data = [...rows.values()].map((row) => {
      const reorderLevelBase = reorderByProduct.get(row.productId) ?? null;
      const unitsPerCarton = row.unitsPerCarton;
      return { ...row, reorderLevelBase, cartons: unitsPerCarton ? Math.trunc(row.available / unitsPerCarton) : null, looseBaseUnits: unitsPerCarton ? row.available % unitsPerCarton : row.available, lowStock: reorderLevelBase !== null && row.available <= reorderLevelBase, negativeStock: row.available < 0 };
    });
    return { locations: scope.locationIds, totals: data.reduce((sum, row) => ({ variants: sum.variants + 1, availableBaseUnits: sum.availableBaseUnits + row.available, lowStockVariants: sum.lowStockVariants + Number(row.lowStock), negativeStockVariants: sum.negativeStockVariants + Number(row.negativeStock) }), { variants: 0, availableBaseUnits: 0, lowStockVariants: 0, negativeStockVariants: 0 }), rows: data.sort((a, b) => a.locationName.localeCompare(b.locationName) || a.sku.localeCompare(b.sku)) };
  }

  async movementLedger(query: ReportQuery & { limit: number }, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { locationId: { in: scope.locationIds }, createdAt: { gte: scope.from, lt: scope.to } },
      include: {
        variant: { select: { sku: true, name: true, product: { select: { name: true, baseUnit: true, unitsPerCarton: true } } } },
        location: { select: { name: true } },
        actor: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' }, take: query.limit,
    });
    const transferIds = [...new Set(movements.filter((movement) => movement.referenceType?.startsWith('transfer') && movement.referenceId).map((movement) => movement.referenceId!))];
    const transfers = transferIds.length ? await this.prisma.transfer.findMany({ where: { id: { in: transferIds }, OR: [{ sourceLocationId: { in: scope.locationIds } }, { destLocationId: { in: scope.locationIds } }] }, select: { id: true, transferNumber: true, sourceLocation: { select: { name: true } }, destLocation: { select: { name: true } } } }) : [];
    const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]));
    return movements.map((movement) => ({ ...movement, transferRoute: movement.referenceId ? transferById.get(movement.referenceId) ?? null : null }));
  }

  async lowStock(query: ReportQuery, actor: RequestUser) {
    const [stock, replenishments] = await Promise.all([
      this.stock(query, actor),
      this.prisma.replenishmentRequest.findMany({
        where: { status: { in: ['DRAFT', 'TRANSFER_CREATED'] }, OR: [{ sourceLocationId: { in: actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds } }, { destLocationId: { in: actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds } }] },
        include: { sourceLocation: { select: { id: true, name: true } }, destLocation: { select: { id: true, name: true } }, lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true, baseUnit: true } } } } } } },
        orderBy: { createdAt: 'desc' }, take: 1000,
      }),
    ]);
    const selectedLocationId = query.locationId;
    const scopedRequests = selectedLocationId
      ? replenishments.filter((item) => item.sourceLocationId === selectedLocationId || item.destLocationId === selectedLocationId)
      : actor.role === Role.SUPER_ADMIN ? replenishments : replenishments.filter((item) => actor.locationIds.includes(item.sourceLocationId) || actor.locationIds.includes(item.destLocationId));
    return { lowStock: stock.rows.filter((row) => row.lowStock || row.negativeStock), replenishments: scopedRequests };
  }

  async transferDiscrepancies(query: ReportQuery, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    return this.prisma.transfer.findMany({
      where: { OR: [{ sourceLocationId: { in: scope.locationIds } }, { destLocationId: { in: scope.locationIds } }], updatedAt: { gte: scope.from, lt: scope.to }, lines: { some: { OR: [{ shortQtyBase: { gt: 0 } }, { damagedQtyBase: { gt: 0 } }, { excessQtyBase: { gt: 0 } }] } } },
      include: { sourceLocation: { select: { id: true, name: true } }, destLocation: { select: { id: true, name: true } }, lines: { where: { OR: [{ shortQtyBase: { gt: 0 } }, { damagedQtyBase: { gt: 0 } }, { excessQtyBase: { gt: 0 } }] }, include: { variant: { select: { sku: true, name: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: 1000,
    });
  }

  async auditVariances(query: ReportQuery, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    return this.prisma.auditCountItem.findMany({
      where: { auditSession: { locationId: { in: scope.locationIds }, startedAt: { gte: scope.from, lt: scope.to } }, OR: [{ varianceBase: { not: 0 } }, { requiresRecount: true }] },
      include: {
        variant: { select: { sku: true, name: true, product: { select: { name: true, baseUnit: true } } } },
        auditSession: { select: { id: true, status: true, locationId: true, startedAt: true, location: { select: { name: true } } } },
      },
      orderBy: { auditSession: { startedAt: 'desc' } }, take: 5000,
    });
  }

  async priceChanges(query: ReportQuery, actor: RequestUser) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Price history reports are limited to Super Admin accounts');
    const scope = await this.resolveScope(query, actor);
    return this.prisma.priceChangeLog.findMany({ where: { createdAt: { gte: scope.from, lt: scope.to } }, include: { product: { select: { name: true } }, changedBy: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
  }

  async cancellations(query: ReportQuery, actor: RequestUser) {
    const scope = await this.resolveScope(query, actor);
    return this.prisma.invoice.findMany({ where: { locationId: { in: scope.locationIds }, status: 'CANCELLED', cancelledAt: { gte: scope.from, lt: scope.to } }, include: { location: { select: { name: true } }, lines: { include: { variant: { select: { sku: true, name: true } } } }, refunds: true }, orderBy: { cancelledAt: 'desc' }, take: 5000 });
  }

  async itemDeletionAudit(query: ReportQuery, actor: RequestUser) {
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) throw new ForbiddenException('Catalog deletion history is limited to administrators');
    const scope = await this.resolveScope(query, actor);
    const events = await this.prisma.auditEvent.findMany({
      where: { createdAt: { gte: scope.from, lt: scope.to }, targetEntity: { contains: 'ProductsController' }, action: { contains: 'PATCH' }, afterValue: { contains: '"isActive":false' } },
      include: { actor: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, take: 5000,
    });
    const products = await this.prisma.product.findMany({ where: { id: { in: events.map((event) => event.targetId) } }, select: { id: true, name: true } });
    const names = new Map(products.map((product) => [product.id, product.name]));
    return events.map((event) => ({ ...event, productName: names.get(event.targetId) ?? 'Inactive product' }));
  }

  async notifications(actor: RequestUser) {
    const locations = actor.role === Role.SUPER_ADMIN
      ? (await this.prisma.location.findMany({ where: { isActive: true }, select: { id: true } })).map((location) => location.id)
      : actor.locationIds;
    if (locations.length === 0) return { generatedAt: new Date().toISOString(), total: 0, items: [] };
    const [replenishments, recounts, highCounts, transfers] = await Promise.all([
      this.prisma.replenishmentRequest.findMany({
        where: { status: 'DRAFT', sourceLocationId: { in: locations } },
        select: { id: true, requestNumber: true, sourceLocation: { select: { name: true } }, destLocation: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: 'desc' }, take: 100,
      }),
      this.prisma.auditCountItem.findMany({
        where: { requiresRecount: true, recountQtyBase: null, auditSession: { locationId: { in: locations }, status: { in: ['ACTIVE', 'SUBMITTED'] } } },
        select: { id: true, variant: { select: { sku: true, name: true, product: { select: { name: true } } } }, auditSession: { select: { id: true, location: { select: { id: true, name: true } } } } },
        take: 200,
      }),
      this.prisma.auditCountItem.findMany({
        where: { highCountAlert: true, auditSession: { locationId: { in: locations }, status: { in: ['ACTIVE', 'SUBMITTED'] } } },
        select: { id: true, variant: { select: { sku: true, name: true, product: { select: { name: true } } } }, auditSession: { select: { id: true, location: { select: { id: true, name: true } } } } },
        take: 200,
      }),
      this.prisma.transfer.findMany({
        where: { OR: [{ sourceLocationId: { in: locations } }, { destLocationId: { in: locations } }], lines: { some: { OR: [{ shortQtyBase: { gt: 0 } }, { damagedQtyBase: { gt: 0 } }, { excessQtyBase: { gt: 0 } }] } } },
        select: { id: true, transferNumber: true, updatedAt: true, sourceLocation: { select: { name: true } }, destLocation: { select: { name: true } }, lines: { where: { OR: [{ shortQtyBase: { gt: 0 } }, { damagedQtyBase: { gt: 0 } }, { excessQtyBase: { gt: 0 } }] }, select: { shortQtyBase: true, damagedQtyBase: true, excessQtyBase: true } } },
        orderBy: { updatedAt: 'desc' }, take: 100,
      }),
    ]);
    const items = [
      ...replenishments.map((row) => ({ id: `replenishment:${row.id}`, type: 'REPLENISHMENT_APPROVAL', severity: 'info', title: `Approval needed · ${row.requestNumber}`, message: `${row.sourceLocation.name} → ${row.destLocation.name}`, createdAt: row.createdAt, href: '/operations' })),
      ...recounts.map((row) => ({ id: `recount:${row.id}`, type: 'AUDIT_RECOUNT', severity: 'warning', title: `Recount required · ${row.variant.product.name}`, message: `${row.variant.name} (${row.variant.sku}) · ${row.auditSession.location.name}`, createdAt: null, href: `/audits?locationId=${encodeURIComponent(row.auditSession.location.id)}&sessionId=${encodeURIComponent(row.auditSession.id)}` })),
      ...highCounts.map((row) => ({ id: `audit-high-count:${row.id}`, type: 'AUDIT_HIGH_COUNT', severity: 'warning', title: `High count alert · ${row.variant.product.name}`, message: `${row.variant.name} (${row.variant.sku}) · ${row.auditSession.location.name}`, createdAt: null, href: `/audits?locationId=${encodeURIComponent(row.auditSession.location.id)}&sessionId=${encodeURIComponent(row.auditSession.id)}` })),
      ...transfers.map((row) => {
        const short = row.lines.reduce((sum, line) => sum + line.shortQtyBase, 0);
        const damaged = row.lines.reduce((sum, line) => sum + line.damagedQtyBase, 0);
        const excess = row.lines.reduce((sum, line) => sum + line.excessQtyBase, 0);
        return { id: `transfer:${row.id}`, type: 'TRANSFER_DISCREPANCY', severity: 'warning', title: `Receipt discrepancy · ${row.transferNumber}`, message: `${row.sourceLocation.name} → ${row.destLocation.name} · short ${short}, damaged ${damaged}, excess ${excess}`, createdAt: row.updatedAt, href: '/operations' };
      }),
    ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    const notifications = await Promise.all(items.map((item) => this.prisma.inAppNotification.upsert({
      where: { userId_dedupeKey: { userId: actor.userId, dedupeKey: item.id } },
      create: { userId: actor.userId, dedupeKey: item.id, type: item.type, title: item.title, message: item.message, href: item.href },
      update: { title: item.title, message: item.message, href: item.href },
    })));
    const auditDue = await this.prisma.inAppNotification.findMany({
      where: { userId: actor.userId, type: 'AUDIT_DUE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const combined = [...notifications, ...auditDue].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { generatedAt: new Date().toISOString(), unread: combined.filter((item) => !item.readAt).length, total: combined.length, items: combined };
  }

  async markNotificationRead(id: string, userId: string) {
    const result = await this.prisma.inAppNotification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (!result.count) throw new NotFoundException('Notification not found');
  }

  private async resolveScope(query: ReportQuery, actor: RequestUser): Promise<DateScope> {
    const now = new Date();
    const to = this.parseDate(query.to, now, 'to');
    const from = this.parseDate(query.from, new Date(to.getTime() - 30 * 86400000), 'from');
    if (from >= to) throw new BadRequestException('from must be earlier than to');
    if (to.getTime() - from.getTime() > 366 * 86400000) throw new BadRequestException('Report date range cannot exceed 366 days');
    let locationIds = actor.role === Role.SUPER_ADMIN
      ? (query.locationId ? [query.locationId] : (await this.prisma.location.findMany({ where: { isActive: true }, select: { id: true } })).map((l) => l.id))
      : actor.locationIds;
    if (query.locationId) {
      if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(query.locationId)) throw new ForbiddenException('You are not authorized to access this location');
      locationIds = [query.locationId];
    }
    if (locationIds.length === 0) throw new ForbiddenException('No authorized location is available for reporting');
    if (!query.locationId && locationIds.length > 1 && actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Consolidated reports are limited to Admin and Super Admin accounts; choose one location instead');
    }
    return { locationIds, from, to };
  }

  private parseDate(value: string | undefined, fallback: Date, label: string) {
    if (value === undefined) return fallback;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(`${label} must be a valid ISO date`);
    return parsed;
  }

  private money(value: number) { return new Prisma.Decimal(value.toFixed(2)).toFixed(2); }
}
