import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators';
import { LocationScopeGuard, RolesGuard } from '../../common/guards';
import { AuditApprovalDto, AuditCountDto, AuditRecountRequestDto, AuditThresholdDto, BulkAuditScheduleDto, DailyAuditScheduleDto } from './dto/audit-count.dto';
import { AuditsService } from './audits.service';

const MANAGERS = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

@Controller('audits')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Post('locations/:locationId/sessions')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async start(@Param('locationId') locationId: string, @CurrentUser() actor: RequestUser) {
      return { message: 'Stock audit started; location movements are frozen until approval or abort', data: await this.audits.start(locationId, actor) };
  }

  @Get('locations/:locationId/sessions')
  @UseGuards(LocationScopeGuard)
  async list(@Param('locationId') locationId: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.audits.list(locationId, actor) };
  }

  @Get('capabilities')
  async capabilities(@CurrentUser() actor: RequestUser) {
    return { data: await this.audits.capabilities(actor) };
  }

  @Get('locations/:locationId/schedule')
  @UseGuards(LocationScopeGuard)
  async getSchedule(@Param('locationId') locationId: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.audits.getSchedule(locationId, actor) };
  }

  @Patch('locations/:locationId/schedule')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async saveSchedule(@Param('locationId') locationId: string, @Body() dto: DailyAuditScheduleDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Daily audit schedule saved', data: await this.audits.saveSchedule(locationId, dto, actor) };
  }

  @Patch('schedule/all')
  @Roles(Role.SUPER_ADMIN)
  async saveAllSchedules(@Body() dto: BulkAuditScheduleDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Audit start times saved for all active locations', data: await this.audits.saveAllSchedules(dto, actor) };
  }

  @Get('thresholds')
  @Roles(...MANAGERS)
  async thresholds() {
    return { data: await this.audits.listThresholds() };
  }

  @Post('thresholds')
  @Roles(Role.SUPER_ADMIN)
  async updateThresholds(@Body() dto: AuditThresholdDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Audit thresholds saved', data: await this.audits.saveThresholds(dto, actor) };
  }

  @Get('sessions/:sessionId')
  async get(@Param('sessionId') sessionId: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.audits.get(sessionId, actor) };
  }

  @Post('sessions/:sessionId/items/:itemId/count')
  async count(@Param('sessionId') sessionId: string, @Param('itemId') itemId: string, @Body() dto: AuditCountDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Count recorded', data: await this.audits.recordCount(sessionId, itemId, dto, actor) };
  }

  @Post('sessions/:sessionId/items/:itemId/recount-required')
  @Roles(...MANAGERS)
  async requestRecount(@Param('sessionId') sessionId: string, @Param('itemId') itemId: string, @Body() dto: AuditRecountRequestDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Recount required', data: await this.audits.requestRecount(sessionId, itemId, dto.reason, actor) };
  }

  @Post('sessions/:sessionId/submit')
  async submit(@Param('sessionId') sessionId: string, @CurrentUser() actor: RequestUser) {
    return { message: 'Audit submitted for manager review', data: await this.audits.submit(sessionId, actor) };
  }

  @Post('sessions/:sessionId/approve')
  @Roles(...MANAGERS)
  async approve(@Param('sessionId') sessionId: string, @Body() dto: AuditApprovalDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Audit approved and stock adjustments posted', data: await this.audits.approve(sessionId, dto.reason, actor) };
  }

  @Post('sessions/:sessionId/abort')
  @Roles(...MANAGERS)
  async abort(@Param('sessionId') sessionId: string, @Body() dto: AuditApprovalDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Audit aborted without stock adjustments', data: await this.audits.abort(sessionId, dto.reason, actor) };
  }
}
