import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PERMISSION_KEY, RESTRICTED_PERMISSION_KEY, PermissionKey, permissionOverride } from '../decorators/permission.decorator';
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

    const { user } = context.switchToHttp().getRequest();
    const permissions = this.reflector.get<PermissionKey[]>(PERMISSION_KEY, context.getHandler()) ?? [];
    const restricted = this.reflector.get<PermissionKey>(RESTRICTED_PERMISSION_KEY, context.getHandler());
    if (!user && (permissions.length || requiredRoles?.length || restricted)) {
      throw new ForbiddenException('Authentication required');
    }
    if (!user || user.role === Role.SUPER_ADMIN) return true;

    const roleAllowed = !requiredRoles?.length || requiredRoles.includes(user.role as Role);
    const allowed = permissions.length
      ? permissions.some((key) => permissionOverride(user, key) === true) || (roleAllowed && permissionOverride(user, permissions[0]) !== false)
      : roleAllowed;
    if (!allowed || (restricted && permissionOverride(user, restricted) === false)) throw new ForbiddenException('This account is not authorized for this action');
    return true;
  }
}
