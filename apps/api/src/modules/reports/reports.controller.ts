import { can, Permission } from '../../common/decorators/permission.decorator';
import { BadRequestException, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReportsService } from './reports.service';

const REPORT_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(...REPORT_ROLES)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('cash-settlements')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER)
  @Permission('cash.reports')
  async cashSettlements(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.cashSettlements(query, actor) };
  }

  @Get('sales-summary')
  @Permission('sales.reports')
  async salesSummary(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.salesSummary(query, actor) };
  }

  @Get('sales-details')
  @Permission('sales.reports')
  async salesDetails(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 50 : Number(query.pageSize);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('page must be between 1 and 100000');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('pageSize must be between 1 and 100');
    return { data: await this.reports.salesDetails(query, actor, page, pageSize) };
  }

  @Get('sales-details/export')
  @Permission('sales.reports')
  async exportInvoices(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.exportInvoices(query, actor) };
  }

  @Get('product-performance')
  @Permission('sales.reports')
  async productPerformance(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.productPerformance(query, actor) };
  }

  @Get('stock')
  @Permission('stock.view')
  async stock(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.stock(query, actor) };
  }

  @Get('low-stock')
  @Permission('stock.view')
  async lowStock(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.lowStock(query, actor) };
  }

  @Get('movement-ledger')
  @Permission('stock.view')
  async movementLedger(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new BadRequestException('limit must be between 1 and 500');
    return { data: await this.reports.movementLedger({ ...query, limit }, actor) };
  }

  @Get('transfer-discrepancies')
  @Permission('stock.view')
  async transferDiscrepancies(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.transferDiscrepancies(query, actor) };
  }

  @Get('audit-variances')
  @Permission('stock.view')
  async auditVariances(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.auditVariances(query, actor) };
  }

  @Get('price-changes')
  @Permission('products.prices')
  async priceChanges(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    const rows = await this.reports.priceChanges(query, actor);
    return { data: can(actor, 'products.cost', actor.role === Role.ADMIN || actor.role === Role.INVENTORY)
      ? rows : rows.filter((row) => row.fieldChanged !== 'purchase_price') };
  }

  @Get('cancellations')
  @Permission('sales.reports')
  async cancellations(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.cancellations(query, actor) };
  }

  @Get('item-deletions')
  @Permission('sales.reports')
  async itemDeletions(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.itemDeletionAudit(query, actor) };
  }

  @Get('notifications')
  @Roles(...Object.values(Role))
  async notifications(@CurrentUser() actor: RequestUser) {
    return { data: await this.reports.notifications(actor) };
  }

  @Patch('notifications/:id/read')
  @Roles(...Object.values(Role))
  async markNotificationRead(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    await this.reports.markNotificationRead(id, actor.userId);
    return { message: 'Notification marked as read' };
  }
}

export interface ReportQuery {
  locationId?: string;
  from?: string;
  to?: string;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}
