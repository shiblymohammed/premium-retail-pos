import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService email normalization', () => {
  it('normalizes email lookups', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new UsersService(prisma as any);

    await service.findByEmail('  ADMIN@EXAMPLE.COM  ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@example.com' } });
  });

  it('does not list users with any location scope outside the Admin scope', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new UsersService(prisma as any);

    await service.findAll(undefined, {
      userId: 'admin-id',
      role: Role.ADMIN,
      locationIds: ['store-a'],
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        locationScopes: {
          some: { locationId: { in: ['store-a'] } },
          every: { locationId: { in: ['store-a'] } },
        },
      }),
    }));
  });

  it('checks normalized email duplicates before creating an account', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'existing-id' }) } };
    const service = new UsersService(prisma as any);

    await expect(service.createUser({
      email: '  ADMIN@EXAMPLE.COM  ',
      password: 'A-long-password-123',
      role: Role.SUPER_ADMIN,
      locationIds: [],
    }, { userId: 'super-admin-id', role: Role.SUPER_ADMIN, locationIds: [] }))
      .rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      select: { id: true },
    });
  });
});
