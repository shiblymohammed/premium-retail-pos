import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EmployeesService } from './employees.service';

const locationActor = {
  userId: 'location-admin-id',
  role: Role.ADMIN,
  locationIds: ['store-a'],
};

describe('EmployeesService administrative account protection', () => {
  it('prevents a location Admin from creating an employee profile for an Admin account', async () => {
    const prisma = {
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'store-a', isActive: true }) },
      $transaction: jest.fn((callback) => callback({
        $queryRaw: jest.fn(),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'other-admin-id',
            role: Role.ADMIN,
            isActive: true,
            employee: null,
            locationScopes: [{ locationId: 'store-a' }],
          }),
        },
        employee: { create: jest.fn() },
      })),
    };
    const service = new EmployeesService(prisma as any);

    await expect(service.create({ userId: 'other-admin-id', locationId: 'store-a' } as any, locationActor))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('prevents a location Admin from updating an employee profile linked to a Super Admin', async () => {
    const prisma = {
      $transaction: jest.fn((callback) => callback({
        $queryRaw: jest.fn(),
        employee: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'employee-id',
            userId: 'super-admin-id',
            locationId: 'store-a',
            reportingToId: null,
            user: { role: Role.SUPER_ADMIN },
          }),
          update: jest.fn(),
        },
      })),
    };
    const service = new EmployeesService(prisma as any);

    await expect(service.update('employee-id', { firstName: 'Changed' } as any, locationActor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents a location Admin from deactivating an employee profile linked to an Admin', async () => {
    const prisma = {
      $transaction: jest.fn((callback) => callback({
        $queryRaw: jest.fn(),
        employee: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'employee-id',
            userId: 'other-admin-id',
            locationId: 'store-a',
            user: { role: Role.ADMIN },
          }),
        },
      })),
    };
    const service = new EmployeesService(prisma as any);

    await expect(service.deactivate('employee-id', locationActor))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
