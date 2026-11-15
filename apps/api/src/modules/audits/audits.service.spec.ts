import { BadRequestException, ConflictException } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { AuditsService } from './audits.service';

describe('AuditsService location audit windows', () => {
  const actor = { userId: 'manager-id', email: 'manager@example.test', role: Role.SUPER_ADMIN, locationIds: [] };

  afterEach(() => jest.useRealTimers());

  function serviceFor(location: { type: LocationType; isAuditLocked?: boolean }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 'location-id',
        type: location.type,
        timezone: 'Asia/Kolkata',
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
