import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditSessionStatus, LocationType, Role } from '@prisma/client';
import { AuditsService } from './audits.service';

describe('AuditsService location audit windows', () => {
  const actor = { userId: 'manager-id', email: 'manager@example.test', role: Role.SUPER_ADMIN, locationIds: [] };

  afterEach(() => jest.useRealTimers());

  function serviceFor(location: { type: LocationType; isAuditLocked?: boolean; dailyAuditTime?: string; timezone?: string }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'location-id',
        type: location.type,
        timezone: location.timezone ?? 'Asia/Kolkata',
        dailyAuditTime: location.dailyAuditTime ?? '19:00',
        isActive: true,
        isAuditLocked: location.isAuditLocked ?? true,
      }]),
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) };
    return { service: new AuditsService(prisma as any, {} as any), prisma, tx };
  }

  it('rejects a store count before 7 PM local time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T13:29:00.000Z'));
    const { service } = serviceFor({ type: LocationType.RETAIL_STORE });

    await expect(service.start('location-id', actor)).rejects.toThrow('only after 7:00 PM local time');
  });

  it('allows a store start window from 7 PM onward', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T13:30:00.000Z'));
    const { service } = serviceFor({ type: LocationType.RETAIL_STORE });

    await expect(service.start('location-id', actor)).rejects.toThrow('already has an active stock audit');
  });

  it('respects a later configured start time for manual store audits', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T13:45:00.000Z'));
    const { service } = serviceFor({ type: LocationType.RETAIL_STORE, dailyAuditTime: '20:00' });

    await expect(service.start('location-id', actor)).rejects.toThrow('at or after 20:00 local time');
  });

  it('rejects a warehouse audit on a weekday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T14:00:00.000Z'));
    const { service } = serviceFor({ type: LocationType.MAIN_WAREHOUSE });

    await expect(service.start('location-id', actor)).rejects.toThrow('only after 7:00 PM on Sundays');
  });

  it('rejects a Sunday warehouse audit before 7 PM local time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T13:29:00.000Z'));
    const { service } = serviceFor({ type: LocationType.SUB_WAREHOUSE });

    await expect(service.start('location-id', actor)).rejects.toThrow('only after 7:00 PM on Sundays');
  });

  it('allows a Sunday warehouse start window from 7 PM onward', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T13:30:00.000Z'));
    const { service } = serviceFor({ type: LocationType.SUB_WAREHOUSE });

    await expect(service.start('location-id', actor)).rejects.toThrow('already has an active stock audit');
  });

  it.each([
    ['2026-07-13T01:59:00Z', false],
    ['2026-07-13T02:00:00Z', true],
    ['2026-11-30T02:59:00Z', false],
    ['2026-11-30T03:00:00Z', true],
  ])('uses Sunday evening in Los Angeles across daylight saving time at %s', async (time, inWindow) => {
    jest.useFakeTimers().setSystemTime(new Date(time));
    const { service } = serviceFor({ type: LocationType.MAIN_WAREHOUSE, timezone: 'America/Los_Angeles' });
    await expect(service.start('location-id', actor)).rejects.toThrow(
      inWindow ? 'already has an active stock audit' : 'only after 7:00 PM on Sundays',
    );
  });

  it('prompts the warehouse manager at the threshold and accepts the original counter’s recount', async () => {
    const manager = { ...actor, role: Role.CENTRAL_MANAGER, locationIds: ['location-id'] };
    const session = { id: 'audit', locationId: 'location-id', status: AuditSessionStatus.ACTIVE,
      location: { type: LocationType.MAIN_WAREHOUSE }, countItems: [] };
    let item = {
      id: 'item', expectedQtyBase: 40, countedQtyBase: null as number | null, recountQtyBase: null as number | null,
      countedByUserId: null as string | null, requiresRecount: false, recountRequestReason: null,
      recountThresholdUnits: 5, recountThresholdPercent: 2, recountMeasure: 'either', highCountAlertQty: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([session]),
      auditCountItem: { findFirst: jest.fn(async () => item), update: jest.fn(async ({ data }) => { item = { ...item, ...data }; return item; }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ isActive: true, canCountStockAudits: false }) },
      auditSession: { findUnique: jest.fn(async () => ({ ...session, countItems: [item] })) },
      $transaction: jest.fn((work: (db: typeof tx) => unknown) => work(tx)),
    };
    const service = new AuditsService(prisma as any, {} as any);
    await expect(service.recordCount(session.id, item.id, { quantityBaseUnits: 30 }, manager))
      .resolves.toMatchObject({ requiresRecount: true, recountComparison: { expected: 40, counted: 30 } });
    const reopened = await service.get(session.id, manager);
    expect(reopened.countItems[0]).toMatchObject({ recountComparison: { expected: 40, counted: 30 } });
    const observer = await service.get(session.id, { ...manager, userId: 'another-manager' });
    expect(observer.countItems[0]).not.toHaveProperty('recountComparison');
    await expect(service.recordCount(session.id, item.id, { quantityBaseUnits: 39 }, { ...manager, userId: 'another-manager' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await service.recordCount(session.id, item.id, { quantityBaseUnits: 39 }, manager);
    expect(item).toMatchObject({ countedQtyBase: 30, recountQtyBase: 39, countedByUserId: manager.userId });
  });

  it('refuses to disable the confirmed audit cadence', async () => {
    const prisma = { location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', type: LocationType.RETAIL_STORE }), update: jest.fn() } };
    const service = new AuditsService(prisma as any, {} as any);

    await expect(service.saveSchedule('location-id', { enabled: false, startTime: '19:00' }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it('does not save an audit time before 7 PM', async () => {
    const prisma = { location: { findUnique: jest.fn().mockResolvedValue({ id: 'location-id', type: LocationType.RETAIL_STORE }) } };
    const service = new AuditsService(prisma as any, {} as any);

    await expect(service.saveSchedule('location-id', { enabled: true, startTime: '18:59' }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
