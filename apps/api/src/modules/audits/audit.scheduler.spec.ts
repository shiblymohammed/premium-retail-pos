import { LocationType } from '@prisma/client';
import { AuditScheduler } from './audit.scheduler';
import { AuditsService } from './audits.service';

describe('AuditScheduler cadence', () => {
  afterEach(() => jest.useRealTimers());

  async function runAt(instant: string, locations: Array<{ id: string; name: string; type: LocationType; dailyAuditTime: string; company: { timezone: string } }>) {
    jest.useFakeTimers().setSystemTime(new Date(instant));
    const prisma = {
      location: { findMany: jest.fn().mockResolvedValue(locations) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'system-actor' }) },
    };
    const audits = { startScheduled: jest.fn().mockResolvedValue({ started: true }) };
    const scheduler = new AuditScheduler(prisma as any, audits as unknown as AuditsService);
    await (scheduler as any).tick();
    return audits.startScheduled.mock.calls;
  }

  const store = { id: 'store-id', name: 'Store', type: LocationType.RETAIL_STORE, dailyAuditTime: '19:00', company: { timezone: 'Asia/Kolkata' } };
  const warehouse = { id: 'warehouse-id', name: 'Warehouse', type: LocationType.MAIN_WAREHOUSE, dailyAuditTime: '19:00', company: { timezone: 'Asia/Kolkata' } };

  it('starts daily stores after 7 PM and excludes warehouses on weekdays', async () => {
    const calls = await runAt('2026-11-13T14:00:00.000Z', [store, warehouse]);

    expect(calls).toEqual([['store-id', '2026-11-13', '19:30', 'Fri', 'system-actor']]);
  });

  it('starts stores and warehouses after 7 PM on Sundays', async () => {
    const calls = await runAt('2026-11-15T14:00:00.000Z', [store, warehouse]);

    expect(calls).toEqual([
      ['store-id', '2026-11-15', '19:30', 'Sun', 'system-actor'],
      ['warehouse-id', '2026-11-15', '19:30', 'Sun', 'system-actor'],
    ]);
  });

  it('waits until at least 7 PM local time', async () => {
    const calls = await runAt('2026-11-15T13:29:00.000Z', [store, warehouse]);

    expect(calls).toHaveLength(0);
  });

  it('respects a configured later local start time', async () => {
    const laterStore = { ...store, dailyAuditTime: '20:00' };
    const calls = await runAt('2026-11-13T14:00:00.000Z', [laterStore]);

    expect(calls).toHaveLength(0);
  });
});
