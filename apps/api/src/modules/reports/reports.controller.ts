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

  @Get('sales-summary')
  async salesSummary(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.salesSummary(query, actor) };
  }

  @Get('sales-details')
  async salesDetails(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 50 : Number(query.pageSize);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('page must be between 1 and 100000');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('pageSize must be between 1 and 100');
    return { data: await this.reports.salesDetails(query, actor, page, pageSize) };
  }

  @Get('stock')
  async stock(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.stock(query, actor) };
  }

  @Get('low-stock')
  async lowStock(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.lowStock(query, actor) };
  }

  @Get('movement-ledger')
  async movementLedger(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new BadRequestException('limit must be between 1 and 500');
    return { data: await this.reports.movementLedger({ ...query, limit }, actor) };
  }

  @Get('transfer-discrepancies')
  async transferDiscrepancies(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.transferDiscrepancies(query, actor) };
  }

  @Get('audit-variances')
  async auditVariances(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.auditVariances(query, actor) };
  }

  @Get('price-changes')
  async priceChanges(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.priceChanges(query, actor) };
  }

  @Get('cancellations')
  async cancellations(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.cancellations(query, actor) };
  }

  @Get('item-deletions')
  async itemDeletions(@Query() query: ReportQuery, @CurrentUser() actor: RequestUser) {
    return { data: await this.reports.itemDeletionAudit(query, actor) };
  }

  @Get('notifications')
  async notifications(@CurrentUser() actor: RequestUser) {
    return { data: await this.reports.notifications(actor) };
  }

  @Patch('notifications/:id/read')
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
