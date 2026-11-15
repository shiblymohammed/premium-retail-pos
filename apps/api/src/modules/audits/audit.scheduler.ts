import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditsService } from './audits.service';

@Injectable()
export class AuditScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly audits: AuditsService) {}

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
        where: { isActive: true, dailyAuditEnabled: true, dailyAuditTime: { not: null } },
        select: { id: true, name: true, type: true, dailyAuditTime: true, company: { select: { timezone: true } } },
      });
      if (!locations.length) return;

      const actor = await this.prisma.user.findFirst({
        where: { role: Role.SUPER_ADMIN, isActive: true },
        select: { id: true },
      });
      if (!actor) {
        this.logger.error('Daily audit schedules are configured, but no active super admin exists to own scheduled sessions.');
        return;
      }

      const now = new Date();
      for (const location of locations) {
        try {
          const local = this.localClock(now, location.company.timezone);
          if (local.time < location.dailyAuditTime!) continue;
          if (location.type === LocationType.RETAIL_STORE && local.time < '19:00') continue;
          if (location.type !== LocationType.RETAIL_STORE && (local.weekday !== 'Sun' || local.time < '19:00')) continue;
          const result = await this.audits.startScheduled(location.id, local.date, local.time, local.weekday, actor.id);
          if (!result.started) continue;
          if (result.started) this.logger.log(`Started scheduled stock audit for ${location.name} (${local.date} ${location.dailyAuditTime} ${location.company.timezone}).`);
        } catch (error) {
          this.logger.error(`Could not start scheduled audit for ${location.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Daily audit scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`);
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
