import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — ADR-004 Role Axis
 *
 * Enforces that the authenticated user's role is included
 * in the set of roles declared by the @Roles() decorator.
 *
 * If no @Roles() decorator is present, the endpoint is accessible
 * to any authenticated user (JWT guard still required).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → allow all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // SUPER_ADMIN always has access to everything
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException(
        `Role '${user.role}' is not authorized for this action`,
      );
    }

    return true;
  }
}
