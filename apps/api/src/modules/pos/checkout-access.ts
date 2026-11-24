import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { RequestUser } from '../../common/decorators/current-user.decorator';

export const CHECKOUT_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER, Role.CASHIER];

export function checkoutLocationId(actor: Pick<RequestUser, 'role' | 'locationIds'>, requestedLocationId?: string) {
  if (!CHECKOUT_ROLES.includes(actor.role as Role)) throw new ForbiddenException('This account cannot open checkout');
  if (actor.role === Role.CASHIER) {
    if (actor.locationIds.length !== 1) throw new ForbiddenException('Cashier must be bound to exactly one retail store');
    if (requestedLocationId && requestedLocationId !== actor.locationIds[0]) throw new ForbiddenException('Choose your assigned store');
    return actor.locationIds[0];
  }

  const locationId = requestedLocationId ?? (actor.locationIds.length === 1 ? actor.locationIds[0] : undefined);
  if (!locationId) throw new BadRequestException('Choose a retail store to open checkout');
  if (actor.role !== Role.SUPER_ADMIN && !actor.locationIds.includes(locationId)) {
    throw new ForbiddenException('You are not authorized to open checkout for this store');
  }
  return locationId;
}
