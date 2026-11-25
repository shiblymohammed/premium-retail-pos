import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
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

describe('ReportsService financial summaries', () => {
  it('exports the original charge, refunds and remaining net with the return status', async () => {
    const total = new Prisma.Decimal('57.20');
    const base = { netTotal: total, lines: [{ quantityBaseUnits: 23 }] };
    const prisma = { invoice: { findMany: jest.fn().mockResolvedValue([
      { ...base, status: 'FINALIZED', refunds: [{ amount: new Prisma.Decimal('2.40') }], returns: [{ lines: [{ quantityBaseUnits: 1 }] }] },
      { ...base, status: 'FINALIZED', refunds: [{ amount: total }], returns: [{ lines: [{ quantityBaseUnits: 22 }] }] },
      { ...base, status: 'FINALIZED', refunds: [{ amount: total }], returns: [{ lines: [{ quantityBaseUnits: 23 }] }] },
      { ...base, status: 'CANCELLED', refunds: [{ amount: total }], returns: [] },
    ]) } };
    const service = new ReportsService(prisma as any, {} as any);
    const rows = await service.exportInvoices({ locationId: 'store-a' }, {
      userId: 'admin-1', email: 'admin@example.test', role: Role.SUPER_ADMIN, locationIds: [],
    });
    expect(rows[0]).toMatchObject({ reportStatus: 'PARTLY_RETURNED', originalTotal: '57.20', refundedTotal: '2.40', netAfterRefunds: '54.80' });
    expect(rows.slice(1).map(({ reportStatus, netAfterRefunds }) => [reportStatus, netAfterRefunds])).toEqual([
      ['PARTLY_RETURNED', '0.00'], ['RETURNED', '0.00'], ['CANCELLED', '0.00'],
    ]);
  });

  it('uses complete decimal aggregates rather than the capped invoice preview', async () => {
    const prisma = {
      invoice: {
        count: jest.fn().mockResolvedValue(12001),
        findMany: jest.fn().mockResolvedValue(Array.from({ length: 500 }, (_, index) => ({
          id: `invoice-${index}`, invoiceNumber: `INV-${index}`, locationId: 'store-a', status: 'FINALIZED',
          netTotal: { toFixed: () => '1.00' }, createdAt: new Date('2026-01-01T10:00:00.000Z'), cancelledAt: null,
        }))),
      },
      location: { findMany: jest.fn().mockResolvedValue([{ id: 'store-a', name: 'Store A', company: { timezone: 'Asia/Kolkata' } }]) },
      $queryRaw: jest.fn().mockResolvedValue([
        { locationId: 'store-a', date: '2026-01-01', invoices: 12000, cancelled: 0, netSales: '11999.99' },
        { locationId: 'store-a', date: '2026-01-02', invoices: 1, cancelled: 0, netSales: '1.00' },
      ]),
    };
    const service = new ReportsService(prisma as any, {} as any);

    const summary = await service.salesSummary({
      locationId: 'store-a', from: '2026-01-01T00:00:00.000Z', to: '2026-01-03T00:00:00.000Z',
    }, { userId: 'admin-1', email: 'admin@example.test', role: Role.SUPER_ADMIN, locationIds: [] });

    expect(summary.totals).toEqual({ netSales: '12000.99', completedInvoices: 12001, cancelledInvoices: 0 });
    expect(summary.daily).toHaveLength(2);
    expect(summary.invoices).toHaveLength(500);
    expect(summary.truncated).toBe(true);
  });
});
