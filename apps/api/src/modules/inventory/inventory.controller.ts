import { BadRequestException, Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators';
import { LocationScopeGuard, RolesGuard } from '../../common/guards';
import { InventoryBalanceQueryDto, OpeningStockImportDto } from './dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'), RolesGuard, LocationScopeGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('balances')
  async getBalances(@Query() query: InventoryBalanceQueryDto) {
    const variantIds = query.variantIds
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (variantIds && (variantIds.length === 0 || variantIds.length > 100)) {
      throw new BadRequestException('variantIds must contain between 1 and 100 IDs');
    }
    if (query.variantId && variantIds) {
      throw new BadRequestException('Use variantId or variantIds, not both');
    }
    return { data: await this.inventoryService.getBalances({ ...query, variantIds }) };
  }

  @Post('opening-stock/import')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER)
  async importOpeningStock(
    @Body() dto: OpeningStockImportDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    const data = await this.inventoryService.importOpeningStock(dto, actor, idempotencyKey);
    return { message: data.replayed ? 'Opening stock import already applied' : 'Opening stock imported', data };
  }
}
