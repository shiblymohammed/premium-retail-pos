import { Permission } from '../../common/decorators/permission.decorator';
import { CloseCashDrawerDto, OpenCashDrawerDto } from './dto/cash-drawer.dto';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CHECKOUT_ROLES } from './checkout-access';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CartDeletionDto } from './dto/cart-deletion.dto';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('terminal/context')
  async getTerminalContext(@CurrentUser() actor: RequestUser, @Query('locationId') locationId?: string) {
    return { data: await this.posService.getTerminalContext(actor, locationId) };
  }

  @Get('catalog')
  @Roles(...CHECKOUT_ROLES)
  @Permission('sales.checkout')
  async getOfflineCatalog(@CurrentUser() actor: RequestUser, @Query('locationId') locationId?: string) {
    return { data: await this.posService.getOfflineCatalog(actor, locationId) };
  }

  @Get('receipts')
  @Roles(...CHECKOUT_ROLES)
  @Permission('sales.receipts')
  async recentReceipts(@CurrentUser() actor: RequestUser, @Query('locationId') locationId?: string, @Query('invoiceNumber') invoiceNumber?: string) {
    return { data: await this.posService.recentReceipts(actor, locationId, invoiceNumber) };
  }

  @Get('cash-drawer')
  @Roles(...CHECKOUT_ROLES)
  @Permission('cash.drawer')
  async cashDrawers(@CurrentUser() actor: RequestUser, @Query('locationId') locationId?: string) {
    return { data: await this.posService.cashDrawers(actor, locationId) };
  }

  @Post('cash-drawer/open')
  @Roles(...CHECKOUT_ROLES)
  @Permission('cash.drawer')
  async openCashDrawer(@CurrentUser() actor: RequestUser, @Body() dto: OpenCashDrawerDto, @Query('locationId') locationId?: string) {
    return { data: await this.posService.openCashDrawer(actor, dto, locationId) };
  }

  @Post('cash-drawer/close')
  @Roles(...CHECKOUT_ROLES)
  @Permission('cash.drawer')
  async closeCashDrawer(@CurrentUser() actor: RequestUser, @Body() dto: CloseCashDrawerDto, @Query('locationId') locationId?: string) {
    return { data: await this.posService.closeCashDrawer(actor, dto, locationId) };
  }

  @Post('cart-deletions')
  @Roles(...CHECKOUT_ROLES)
  @Permission('sales.checkout')
  async logCartDeletion(@CurrentUser() actor: RequestUser, @Body() dto: CartDeletionDto, @Query('locationId') locationId?: string) {
    return {
      message: 'Cart item removal recorded',
      data: await this.posService.logCartDeletion(actor, dto, locationId),
    };
  }
}
