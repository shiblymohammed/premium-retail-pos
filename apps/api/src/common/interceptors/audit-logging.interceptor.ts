import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AuditLoggingInterceptor — ADR-008
 *
 * Automatically logs sensitive mutating operations to the
 * immutable audit_events table. Applied to controllers/endpoints
 * that require tamper-evident audit trails.
 *
 * Captures: actor, action (HTTP method + path), target entity,
 * timestamp, and request body snapshot.
 */
@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;
    const path = request.route?.path || request.url;

    // Only audit mutating operations
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const safeBody = redactSensitiveValues(request.body);
    return next.handle().pipe(
      mergeMap(async (responseBody) => {
        try {
          if (user?.userId) {
            await this.prisma.auditEvent.create({
              data: {
                actorId: user.userId,
                action: `${method} ${path}`,
                targetEntity: context.getClass().name,
                targetId: request.params?.id || responseBody?.data?.id || responseBody?.id || 'unknown',
                afterValue: JSON.stringify(safeBody),
                ipAddress: request.ip || request.connection?.remoteAddress,
              },
            });
          }
        } catch (error) {
          // Audit logging must never break the main request
          console.error('[AuditLog] Failed to write audit event', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        }
        return responseBody;
      }),
    );
  }
}

function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValues);
  if (!value || typeof value !== 'object') return value;
  const sensitiveField = /password|token|secret|authorization|api[_-]?key|private[_-]?key|access[_-]?key|credit[_-]?card|card[_-]?(number|cvv)|ssn|tax[_-]?id|email|phone|mobile|address/i;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) =>
      sensitiveField.test(key)
        ? [key, '[REDACTED]']
        : [key, redactSensitiveValues(entry)],
    ),
  );
}
