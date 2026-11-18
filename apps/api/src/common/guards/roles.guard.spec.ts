import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  it('denies a cashier access to an admin-only endpoint', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN, Role.SUPER_ADMIN]);
    const context: any = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: Role.CASHIER } }) }),
    };
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a Super Admin through a declared role restriction', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
    const context: any = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: Role.SUPER_ADMIN } }) }),
    };
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });
});
