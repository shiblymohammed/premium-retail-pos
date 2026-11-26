import { Role } from '@prisma/client';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { StaffRecordsService } from './staff-records.service';

describe('Staff report visibility', () => {
  const staff = {
    id: 'employee', userId: 'employee-user', locationId: 'store',
    location: { company: { timezone: 'UTC' } },
    user: { role: Role.STAFF },
  };

  it('returns payroll within the assigned location without loading punches when attendance access is denied', async () => {
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(staff), findUnique: jest.fn() },
      payrollRecord: { findMany: jest.fn().mockResolvedValue([{ period: '2026-01' }]) },
      loan: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceBreak: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new StaffRecordsService(prisma as any, {} as any);
    const profile = await service.profile(staff.id, '2026-01', {
      role: Role.STORE_MANAGER, userId: 'viewer', email: 'viewer@example.test', locationIds: ['store'],
      permissionOverrides: { 'staff.view': false, 'payroll.view': true },
    });

    expect(profile.payroll).toEqual([{ period: '2026-01' }]);
    expect(profile).not.toHaveProperty('attendance');
    expect(profile).not.toHaveProperty('overtimeMinutes');
    expect(prisma.$queryRaw.mock.calls.some(([query]) => query.sql.includes('FROM attendances'))).toBe(false);
    expect(prisma.attendanceBreak.findMany).not.toHaveBeenCalled();
  });

  it.each<{
    role: Role; overrides: RequestUser['permissionOverrides']; sales: boolean; cash: boolean;
  }>([
    { role: Role.INVENTORY, overrides: { 'staff.view': true }, sales: false, cash: false },
    { role: Role.INVENTORY, overrides: { 'staff.view': true, 'sales.reports': true }, sales: true, cash: false },
    { role: Role.STORE_MANAGER, overrides: { 'sales.reports': false }, sales: false, cash: true },
    { role: Role.SUPER_ADMIN, overrides: { 'sales.reports': false, 'cash.reports': false }, sales: true, cash: true },
  ])('uses the same financial access for profile and comparison as $role with $overrides', async ({ role, overrides, sales, cash }) => {
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(staff), findUnique: jest.fn() },
      payrollRecord: { findMany: jest.fn() },
      loan: { findMany: jest.fn() },
      attendanceBreak: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(({ sql }: { sql: string }) => sql.includes('FROM invoices invoice') ? [{ bills: 1 }] : []),
    };
    const service = new StaffRecordsService(prisma as any, {} as any);
    const actor = { role, userId: 'viewer', email: 'viewer@example.test', locationIds: ['store'], permissionOverrides: overrides };
    const profile = await service.profile(staff.id, '2026-01', actor);
    expect(profile.sales !== undefined).toBe(sales);
    expect(profile.drawers !== undefined).toBe(cash);
    expect(prisma.$queryRaw.mock.calls.some(([query]) => query.sql.includes('FROM invoices invoice'))).toBe(sales);
    expect(prisma.$queryRaw.mock.calls.some(([query]) => query.sql.includes('FROM cash_drawer_sessions'))).toBe(cash);
    if (role !== Role.SUPER_ADMIN) {
      expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: staff.id, locationId: { in: ['store'] } },
      }));
    }
    const comparison = await service.comparison('2026-01', actor);
    expect(comparison).toMatchObject({ includeSales: sales, includeCash: cash });
  });
});
