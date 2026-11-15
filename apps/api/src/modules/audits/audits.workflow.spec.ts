import { AuditSessionStatus, MovementType, Role, StockState } from '@prisma/client';
import { AuditsService } from './audits.service';

describe('AuditsService count, recount, and approval workflow', () => {
  const actor = { userId: 'manager-id', email: 'manager@example.test', role: Role.SUPER_ADMIN, locationIds: [] };

  it('flags a recount when the percent threshold is exceeded and does not move stock', async () => {
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const item = {
      id: 'count-item', auditSessionId: 'audit-id', variantId: 'variant-id', expectedQtyBase: 100,
      countedQtyBase: null, recountQtyBase: null, requiresRecount: false, recountThresholdPercent: 2,
      recountThresholdUnits: 5, highCountAlertQty: null, notes: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'audit-id', status: AuditSessionStatus.ACTIVE }]),
      auditCountItem: { findFirst: jest.fn().mockResolvedValue(item), update },
    };
    const prisma = {
      auditSession: { findUnique: jest.fn().mockResolvedValue({ status: AuditSessionStatus.ACTIVE, locationId: 'location-id', countItems: [item] }) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const inventory = { recordMovement: jest.fn() };
    const service = new AuditsService(prisma as any, inventory as any);

    await service.recordCount('audit-id', 'count-item', { quantityBaseUnits: 97 }, actor);

    expect(update).toHaveBeenCalledWith({ where: { id: 'count-item' }, data: expect.objectContaining({ countedQtyBase: 97, requiresRecount: true }) });
    expect(inventory.recordMovement).not.toHaveBeenCalled();
  });

  it('posts only the manager-approved recount variance to the append-only ledger', async () => {
    const item = {
      id: 'count-item', auditSessionId: 'audit-id', variantId: 'variant-id', expectedQtyBase: 100,
      countedQtyBase: 97, recountQtyBase: 96, approvedQtyBase: null, varianceBase: null,
      requiresRecount: true, adjustmentApproved: false,
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'location-id', isAuditLocked: true }])
        .mockResolvedValueOnce([{ id: 'audit-id', status: AuditSessionStatus.SUBMITTED }]),
      auditSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'audit-id', locationId: 'location-id', status: AuditSessionStatus.SUBMITTED, countItems: [item] }),
        update: jest.fn().mockResolvedValue({ id: 'audit-id', status: AuditSessionStatus.APPROVED }),
      },
      auditCountItem: { update: jest.fn().mockResolvedValue({}) },
      location: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      auditSession: { findUnique: jest.fn().mockResolvedValue({ status: AuditSessionStatus.SUBMITTED, locationId: 'location-id', countItems: [item] }) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const inventory = { recordMovement: jest.fn().mockResolvedValue({ id: 'movement-id' }) };
    const service = new AuditsService(prisma as any, inventory as any);

    await service.approve('audit-id', 'Physical recount reviewed and approved', actor);

    expect(inventory.recordMovement).toHaveBeenCalledWith(tx, expect.objectContaining({
      locationId: 'location-id', variantId: 'variant-id', actorId: actor.userId,
      type: MovementType.STOCK_ADJUSTMENT, stockState: StockState.AVAILABLE,
      quantityBaseUnits: -4, referenceType: 'audit', referenceId: 'audit-id', allowAuditLocked: true,
    }));
    expect(tx.auditCountItem.update).toHaveBeenCalledWith({
      where: { id: 'count-item' }, data: { approvedQtyBase: 96, varianceBase: -4, adjustmentApproved: true },
    });
    expect(tx.auditSession.update).toHaveBeenCalledWith({
      where: { id: 'audit-id' },
      data: expect.objectContaining({ status: AuditSessionStatus.APPROVED, approvedByUserId: actor.userId, resolutionReason: 'Physical recount reviewed and approved' }),
    });
    expect(tx.location.update).toHaveBeenCalledWith({ where: { id: 'location-id' }, data: { isAuditLocked: false } });
  });

  it('does not change a stock balance when first count equals expected stock', async () => {
    const item = {
      id: 'count-item', auditSessionId: 'audit-id', variantId: 'variant-id', expectedQtyBase: 42,
      countedQtyBase: 42, recountQtyBase: null, requiresRecount: false,
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'location-id', isAuditLocked: true }])
        .mockResolvedValueOnce([{ id: 'audit-id', status: AuditSessionStatus.SUBMITTED }]),
      auditSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'audit-id', locationId: 'location-id', status: AuditSessionStatus.SUBMITTED, countItems: [item] }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditCountItem: { update: jest.fn().mockResolvedValue({}) },
      location: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      auditSession: { findUnique: jest.fn().mockResolvedValue({ status: AuditSessionStatus.SUBMITTED, locationId: 'location-id', countItems: [item] }) },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const inventory = { recordMovement: jest.fn() };
    const service = new AuditsService(prisma as any, inventory as any);

    await service.approve('audit-id', 'Count matches expected stock', actor);

    expect(inventory.recordMovement).not.toHaveBeenCalled();
    expect(tx.auditCountItem.update).toHaveBeenCalledWith({
      where: { id: 'count-item' }, data: { approvedQtyBase: 42, varianceBase: 0, adjustmentApproved: true },
    });
  });
});
