import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LocationScopeGuard } from './location-scope.guard';

describe('LocationScopeGuard', () => {
  it('denies a cashier requesting inventory for an external location', async () => {
    const prisma = { location: { findUnique: jest.fn() } };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => ({
        user: { role: Role.CASHIER, locationIds: ['store-a'] },
        query: { locationId: 'store-b' },
      }) }),
    };
    await expect(new LocationScopeGuard(prisma as any).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
  });

  it('requires an explicit location context for scoped requests', async () => {
    const prisma = { location: { findUnique: jest.fn() } };
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ user: { role: Role.CASHIER, locationIds: ['store-a'] }, query: {} }) }) };
    await expect(new LocationScopeGuard(prisma as any).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
