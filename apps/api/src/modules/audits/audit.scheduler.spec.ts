import { LocationType } from '@prisma/client';
import { AuditScheduler } from './audit.scheduler';

describe('AuditScheduler reminders', () => {
  afterEach(() => jest.useRealTimers());

  async function runAt(instant: string, locations: Array<{ id: string; name: string; type: LocationType; dailyAuditTime: string; company: { timezone: string } }>) {
    jest.useFakeTimers().setSystemTime(new Date(instant));
    const prisma = {
      location: { findMany: jest.fn().mockResolvedValue(locations) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-id' }]) },
      auditSession: { findFirst: jest.fn().mockResolvedValue(null) },
      userLocationScope: { findMany: jest.fn().mockResolvedValue([{ userId: 'manager-id' }, { userId: 'counter-id' }]) },
      inAppNotification: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const scheduler = new AuditScheduler(prisma as any);
    await (scheduler as any).tick();
    return prisma;
  }

  const store = { id: 'store-id', name: 'Store', type: LocationType.RETAIL_STORE, dailyAuditTime: '19:00', company: { timezone: 'Asia/Kolkata' } };
  const warehouse = { id: 'warehouse-id', name: 'Warehouse', type: LocationType.MAIN_WAREHOUSE, dailyAuditTime: '19:00', company: { timezone: 'Asia/Kolkata' } };

  it('notifies the store team daily after 7 PM without auto-locking the store', async () => {
    const prisma = await runAt('2026-11-13T14:00:00.000Z', [store, warehouse]);

    expect(prisma.inAppNotification.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.inAppNotification.upsert.mock.calls.map(([input]) => input.create.dedupeKey)).toEqual([
      'audit-due:store-id:2026-11-13',
      'audit-due:store-id:2026-11-13',
      'audit-due:store-id:2026-11-13',
    ]);
    expect(prisma.auditSession.findFirst).toHaveBeenCalledTimes(1);
  });

  it('notifies warehouse and store teams on Sunday after 7 PM', async () => {
    const prisma = await runAt('2026-11-15T14:00:00.000Z', [store, warehouse]);
    const keys = prisma.inAppNotification.upsert.mock.calls.map(([input]) => input.create.dedupeKey);

    expect(keys).toContain('audit-due:store-id:2026-11-15');
    expect(keys).toContain('audit-due:warehouse-id:2026-11-15');
  });

  it('does not notify before 7 PM, on warehouse weekdays, or before later configured times', async () => {
    const beforeSeven = await runAt('2026-11-15T13:29:00.000Z', [store, warehouse]);
    expect(beforeSeven.inAppNotification.upsert).not.toHaveBeenCalled();

    const weekday = await runAt('2026-11-13T14:00:00.000Z', [warehouse]);
    expect(weekday.inAppNotification.upsert).not.toHaveBeenCalled();

    const laterStore = { ...store, dailyAuditTime: '20:00' };
    const beforeCustomTime = await runAt('2026-11-13T14:00:00.000Z', [laterStore]);
    expect(beforeCustomTime.inAppNotification.upsert).not.toHaveBeenCalled();
  });

  it('does not create another due notification while an audit is already open', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T14:00:00.000Z'));
    const prisma = {
      location: { findMany: jest.fn().mockResolvedValue([store]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      auditSession: { findFirst: jest.fn().mockResolvedValue({ id: 'active-audit' }) },
      userLocationScope: { findMany: jest.fn() },
      inAppNotification: { upsert: jest.fn() },
    };
    const scheduler = new AuditScheduler(prisma as any);
    await (scheduler as any).tick();

    expect(prisma.inAppNotification.upsert).not.toHaveBeenCalled();
  });
});
