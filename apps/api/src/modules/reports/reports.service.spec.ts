import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService authorization', () => {
  it('rejects a location outside the caller scope before reading report data', async () => {
    const prisma = { invoice: { findMany: jest.fn() } };
    const service = new ReportsService(prisma as any, {} as any);

    await expect(service.salesSummary({ locationId: 'other-store' }, {
      userId: 'manager-1', email: 'manager@example.test', role: Role.STORE_MANAGER, locationIds: ['assigned-store'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('requires location-by-location selection for a manager with multiple assigned stores', async () => {
    const service = new ReportsService({} as any, {} as any);

    await expect(service.salesSummary({}, {
      userId: 'manager-1', email: 'manager@example.test', role: Role.CENTRAL_MANAGER, locationIds: ['store-a', 'store-b'],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow a user to mark another user’s notification as read', async () => {
    const prisma = { inAppNotification: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const service = new ReportsService(prisma as any, {} as any);

    await expect(service.markNotificationRead('notification-id', 'caller-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inAppNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'notification-id', userId: 'caller-id' } }));
  });
});
