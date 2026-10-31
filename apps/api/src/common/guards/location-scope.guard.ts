import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * LocationScopeGuard — ADR-004 Location Axis
 *
 * Enforces that the authenticated user is authorized to operate
 * on the location specified in the request.
 *
 * Location ID is extracted from:
 *   1. req.params.locationId
 *   2. req.body.locationId
 *   3. req.query.locationId
 *
 * SUPER_ADMIN has implicit global access and bypasses this check.
 *
 * Invariant 11: Backend-enforced location scoping.
 * UI-only hiding is never sufficient.
 */
@Injectable()
export class LocationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
      request.body?.locationId ||
      request.query?.locationId;

    // If no location context in the request, allow (module-level checks apply)
    if (!targetLocationId) {
      return true;
    }

    // Verify the user's JWT contains the target location
    const userLocationIds: string[] = user.locationIds || [];
    if (!userLocationIds.includes(targetLocationId)) {
      throw new ForbiddenException(
        'You are not authorized to access this location',
      );
    }

    return true;
  }
}
