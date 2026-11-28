import { Permission } from '../../common/decorators/permission.decorator';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrderDto, PaymentDto, CreditAccountDto, CreditEntryDto } from './trade.dto';
import { PURCHASE_ORDER_ROLES, SUPPLIER_PAYMENT_ROLES, TradeService } from './trade.service';

const CREDIT = [Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER];

@Controller('trade')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TradeController {
  constructor(private readonly trade: TradeService) {}

  @Get('orders')
  async orders(@CurrentUser() actor: RequestUser, @Query('locationId') locationId: string) {
    return { data: await this.trade.orders(locationId, actor) };
  }

  @Get('receipts')
  async receipts(@CurrentUser() actor: RequestUser, @Query('locationId') locationId: string, @Query('search') search?: string) {
    return { data: await this.trade.receipts(locationId, actor, search) };
  }

  @Get('catalog')
  @Roles(...PURCHASE_ORDER_ROLES)
  @Permission('purchasing.orders')
  async orderCatalog() {
    return { data: await this.trade.orderCatalog() };
  }

  @Post('orders')
  @Roles(...PURCHASE_ORDER_ROLES)
  @Permission('purchasing.orders')
  async createOrder(@CurrentUser() actor: RequestUser, @Body() dto: OrderDto) {
    return { data: await this.trade.createOrder(dto, actor) };
  }

  @Post('orders/:id/payments')
  @Roles(...SUPPLIER_PAYMENT_ROLES)
  @Permission('purchasing.payments')
  async pay(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: PaymentDto) {
    return { data: await this.trade.payOrder(id, dto, actor) };
  }

  @Get('customers')
  @Roles(...CREDIT)
  @Permission('customers.credit')
  async customers(@CurrentUser() actor: RequestUser, @Query('locationId') locationId: string) {
    return { data: await this.trade.customers(locationId, actor) };
  }

  @Post('customers')
  @Roles(...CREDIT)
  @Permission('customers.credit')
  async createAccount(@CurrentUser() actor: RequestUser, @Body() dto: CreditAccountDto) {
    return { data: await this.trade.createAccount(dto, actor) };
  }

  @Get('customers/:id/entries')
  @Roles(...CREDIT)
  @Permission('customers.credit')
  async entries(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return { data: await this.trade.entries(id, actor) };
  }

  @Post('customers/:id/entries')
  @Roles(...CREDIT)
  @Permission('customers.credit')
  async postEntry(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: CreditEntryDto) {
    return { data: await this.trade.postEntry(id, dto, actor) };
  }
}
