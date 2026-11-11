import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { QuoteSaleDto } from './dto/quote-sale.dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('quote')
  @Roles(Role.CASHIER)
  async quote(@Body() dto: QuoteSaleDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.sales.quoteSale(dto, actor) };
  }

  @Get('invoice/:invoiceNumber')
  async findInvoiceForSaleControl(@Param('invoiceNumber') invoiceNumber: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.sales.findInvoiceForSaleControl(invoiceNumber, actor) };
  }

  @Post()
  @Roles(Role.CASHIER)
  async create(
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Sale finalized', data: await this.sales.createSale(dto, actor, idempotencyKey) };
  }

  @Patch(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Sale cancelled and manual refund recorded', data: await this.sales.cancelSale(id, dto, actor, idempotencyKey) };
  }

  @Post(':id/returns')
  async processReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Sale return recorded', data: await this.sales.createSaleReturn(id, dto, actor, idempotencyKey) };
  }
}
