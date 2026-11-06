import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators';
import { LocationScopeGuard, RolesGuard } from '../../common/guards';
import { SupplierReceiptDto } from './dto';
import { InventoryService } from './inventory.service';

@Controller('receiving')
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
export class SupplierReceivingController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receipts')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.CENTRAL_MANAGER,
    Role.SUB_WAREHOUSE_MANAGER,
    Role.STORE_MANAGER,
  )
  async receive(
    @Body() dto: SupplierReceiptDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    const data = await this.inventoryService.receiveSupplierStock(dto, actor, idempotencyKey);
    return { message: data.replayed ? 'Supplier receipt already confirmed' : 'Supplier receipt confirmed', data };
  }
}
