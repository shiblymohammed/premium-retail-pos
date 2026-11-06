import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ApproveReplenishmentDto,
  ApproveTransferDto,
  CancelTransferDto,
  CreateTransferDto,
  DispatchTransferDto,
  GenerateReplenishmentDto,
  ReceiveTransferDto,
  RejectTransferDto,
} from './dto';
import { TransfersService } from './transfers.service';

const MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.CENTRAL_MANAGER,
  Role.SUB_WAREHOUSE_MANAGER,
  Role.STORE_MANAGER,
];

@Controller('transfers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(...MANAGER_ROLES)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('replenishment/generate')
  async generateReplenishment(
    @Body() dto: GenerateReplenishmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.transfers.generateReplenishment(dto.destLocationId, actor, idempotencyKey);
  }

  @Get('replenishment')
  async listReplenishments(@CurrentUser() actor: RequestUser) {
    return { data: await this.transfers.findReplenishments(actor) };
  }

  @Post('replenishment/:id/approve')
  async approveReplenishment(
    @Param('id') id: string,
    @Body() dto: ApproveReplenishmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Replenishment approved and transfer draft created', data: await this.transfers.approveReplenishment(id, dto, actor, idempotencyKey) };
  }

  @Post('replenishment/:id/reject')
  async rejectReplenishment(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Replenishment request rejected', data: await this.transfers.rejectReplenishment(id, dto.reason, actor, idempotencyKey) };
  }

  @Post()
  async create(
    @Body() dto: CreateTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer draft created', data: await this.transfers.createTransfer(dto, actor, idempotencyKey) };
  }

  @Get()
  async findAll(@CurrentUser() actor: RequestUser) {
    return { data: await this.transfers.findTransfers(actor) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.transfers.findTransfer(id, actor) };
  }

  @Post(':id/submit')
  async submit(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer submitted for approval', data: await this.transfers.submitTransfer(id, actor, idempotencyKey) };
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer approved', data: await this.transfers.approveTransfer(id, dto, actor, idempotencyKey) };
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer rejected', data: await this.transfers.rejectTransfer(id, dto.reason, actor, idempotencyKey) };
  }

  @Post(':id/dispatch')
  async dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer dispatch recorded', data: await this.transfers.dispatchTransfer(id, dto, actor, idempotencyKey) };
  }

  @Post(':id/receive')
  async receive(
    @Param('id') id: string,
    @Body() dto: ReceiveTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer receipt recorded', data: await this.transfers.receiveTransfer(id, dto, actor, idempotencyKey) };
  }

  @Patch(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    return { message: 'Transfer cancelled with ledger reversal where required', data: await this.transfers.cancelTransfer(id, dto.reason, actor, idempotencyKey) };
  }
}
