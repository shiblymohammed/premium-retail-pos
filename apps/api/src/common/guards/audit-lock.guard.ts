import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AuditLockGuard — ADR-010: Location Freeze During Stock Audits
 *
 * Checks whether the target location has an active audit session.
 * If so, stock-mutating operations (sales, transfers, receiving) are blocked.
 *
 * Apply this guard to endpoints that create inventory movements.
 *
 * OD-04 Confirmed: Audits occur after store closing; system locks the location.
 */
@Injectable()
export class AuditLockGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const targetLocationId =
      request.params?.locationId ||
      request.body?.locationId ||
      request.query?.locationId;

    if (!targetLocationId) {
      return true;
    }

    const location = await this.prisma.location.findUnique({
      where: { id: targetLocationId },
      select: { isAuditLocked: true, name: true },
    });

    if (location?.isAuditLocked) {
      throw new ForbiddenException(
        `Location "${location.name}" is currently locked for a stock audit. ` +
        `Sales and transfers are blocked until the audit is completed.`,
      );
    }

    return true;
  }
}
