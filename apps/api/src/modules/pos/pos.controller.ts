import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
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
  async getTerminalContext(@CurrentUser() actor: RequestUser) {
    return { data: await this.posService.getTerminalContext(actor) };
  }

  @Get('catalog')
  @Roles(Role.CASHIER)
  async getOfflineCatalog(@CurrentUser() actor: RequestUser) {
    return { data: await this.posService.getOfflineCatalog(actor) };
  }

  @Post('cart-deletions')
  @Roles(Role.CASHIER)
  async logCartDeletion(@CurrentUser() actor: RequestUser, @Body() dto: CartDeletionDto) {
    return {
      message: 'Cart item removal recorded',
      data: await this.posService.logCartDeletion(actor, dto),
    };
  }
}
