import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * LocationScopeGuard — ADR-004 Location Axis
 *
 * Enforces that the authenticated user is authorized to operate
 * on the location specified in the request.
 *
 * Location ID is extracted from:
 *   1. req.params.locationId
 *   2. req.params.id
 *   3. req.body.locationId
 *   4. req.query.locationId
 *
 * SUPER_ADMIN has implicit global access and bypasses this check.
 *
 * Invariant 11: Backend-enforced location scoping.
 * UI-only hiding is never sufficient.
 */
@Injectable()
export class LocationScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // SUPER_ADMIN has implicit access to all locations
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    // Extract the target location from the request
    const targetLocationId =
      request.params?.locationId ||
      request.params?.id ||
      request.body?.locationId ||
      request.query?.locationId;

    if (!targetLocationId) {
      throw new ForbiddenException('Location context is required for this endpoint');
    }

    // Verify the user's JWT contains the target location
    const userLocationIds: string[] = user.locationIds || [];
    if (!userLocationIds.includes(targetLocationId)) {
      throw new ForbiddenException(
        'You are not authorized to access this location',
      );
    }

    // Archived locations remain in scope records for history, but cannot be used operationally.
    const location = await this.prisma.location.findUnique({
      where: { id: targetLocationId },
      select: { isActive: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    if (!location.isActive) throw new ForbiddenException('This location is inactive');
    return true;
  }
}
