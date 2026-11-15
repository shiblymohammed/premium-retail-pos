import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditScheduler } from './audit.scheduler';

@Module({
  imports: [InventoryModule],
  controllers: [AuditsController],
  providers: [AuditsService, AuditScheduler],
})
export class AuditsModule {}
