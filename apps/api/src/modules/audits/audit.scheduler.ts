import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const AUDIT_MANAGERS: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.STORE_MANAGER,
  Role.CENTRAL_MANAGER,
  Role.SUB_WAREHOUSE_MANAGER,
];

@Injectable()
export class AuditScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const locations = await this.prisma.location.findMany({
        where: { isActive: true, dailyAuditEnabled: true },
        select: { id: true, name: true, type: true, dailyAuditTime: true, company: { select: { timezone: true } } },
      });
      const globalAdmins = await this.prisma.user.findMany({
        where: { role: Role.SUPER_ADMIN, isActive: true },
        select: { id: true },
      });

      for (const location of locations) {
        const local = this.localClock(new Date(), location.company.timezone);
        if (local.time < location.dailyAuditTime || local.time < '19:00') continue;
        if (location.type !== LocationType.RETAIL_STORE && local.weekday !== 'Sun') continue;

        const activeSession = await this.prisma.auditSession.findFirst({
          where: { locationId: location.id, status: { in: ['ACTIVE', 'SUBMITTED'] } },
          select: { id: true },
        });
        if (activeSession) continue;

        const scopedUsers = await this.prisma.userLocationScope.findMany({
          where: { locationId: location.id, user: { isActive: true, OR: [{ role: { in: AUDIT_MANAGERS } }, { canCountStockAudits: true }] } },
          select: { userId: true },
        });
        const recipientIds = new Set([...globalAdmins.map((user) => user.id), ...scopedUsers.map((scope) => scope.userId)]);
        const dedupeKey = `audit-due:${location.id}:${local.date}`;
        await Promise.all([...recipientIds].map((userId) => this.prisma.inAppNotification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey } },
          create: {
            userId,
            dedupeKey,
            type: 'AUDIT_DUE',
            title: `Stock audit due · ${location.name}`,
            message: 'The scheduled physical count window is open. Start the audit when the location is ready to stop stock movements.',
            href: `/audits?locationId=${encodeURIComponent(location.id)}`,
          },
          update: {
            title: `Stock audit due · ${location.name}`,
            message: 'The scheduled physical count window is open. Start the audit when the location is ready to stop stock movements.',
            href: `/audits?locationId=${encodeURIComponent(location.id)}`,
          },
        })));
      }
    } catch (error) {
      this.logger.error(`Audit reminder scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private localClock(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}`, weekday: value('weekday') };
  }
}
