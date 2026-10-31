import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Decorator: Specify which roles are permitted to access an endpoint.
 * Used by RolesGuard (ADR-004: Role axis).
 *
 * Usage: @Roles(Role.SUPER_ADMIN, Role.ADMIN)
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
