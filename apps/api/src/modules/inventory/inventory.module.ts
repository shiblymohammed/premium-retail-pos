import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { SupplierReceivingController } from './supplier-receiving.controller';

@Module({
  controllers: [InventoryController, SupplierReceivingController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
