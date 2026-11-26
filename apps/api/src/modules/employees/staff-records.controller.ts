import { Permission } from '../../common/decorators/permission.decorator';
import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, IsUUID, ValidateIf } from 'class-validator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateUserWithEmployeeDto } from '../users/dto/create-user-with-employee.dto';
import { UpdateEmployeeDto } from './dto';
import { StaffRecordsService } from './staff-records.service';

const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;

export class PayrollDto {
  @Matches(/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/)
  period: string;

  @Matches(MONEY) base: string;
  @Matches(MONEY) allowances: string;
  @Matches(MONEY) bonus: string;
  @Matches(MONEY) deductions: string;
  @IsOptional() @Matches(MONEY) advanceRecovery?: string;
  @IsOptional() @Matches(MONEY) overtimeHourlyRate?: string;
  @IsOptional() @Matches(MONEY) lateDayDeduction?: string;
  @IsOptional() @Matches(MONEY) absentDayDeduction?: string;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(31)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) scheduledDates?: string[];
}

class PayrollCorrectionDto extends PayrollDto {
  @IsString() @MaxLength(500) reason: string;
  @ValidateIf((_dto, value) => value !== null) @IsUUID() expectedRevision: string | null;
}

export class PayrollLoanDto {
  @IsIn(['LOAN', 'ADVANCE']) kind: 'LOAN' | 'ADVANCE';
  @Matches(MONEY) amount: string;
  @Matches(MONEY) monthlyInstallment: string;
  @IsString() @MaxLength(500) terms: string;
}

export class LoanCollectionDto {
  @IsUUID() id: string;
  @IsIn(['MANUAL', 'NEXT_PAYROLL']) method: 'MANUAL' | 'NEXT_PAYROLL';
  @Matches(MONEY) amount: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}

class PayrollPaymentDto {
  @IsString()
  @MaxLength(120)
  reference: string;

  @IsOptional() @IsUUID() expectedRevision?: string | null;
}

@Controller('staff-records')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StaffRecordsController {
  constructor(private readonly staff: StaffRecordsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER)
  @Permission('staff.view', 'payroll.view', 'payroll.manage', 'staff.manage')
  async directory(@CurrentUser() actor: RequestUser) {
    return { data: await this.staff.directory(actor) };
  }

  @Post('outlet-staff')
  @Roles(Role.STORE_MANAGER)
  @Permission('staff.manage')
  async createStaff(@Body() dto: CreateUserWithEmployeeDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.createOutletStaff(dto, actor) };
  }

  @Patch(':id/outlet-profile')
  @Roles(Role.STORE_MANAGER)
  @Permission('staff.manage')
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.updateOutletStaff(id, dto, actor) };
  }

  @Patch(':id/profile')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('staff.manage')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.updateStaffProfile(id, dto, actor) };
  }

  @Get('me/payroll')
  async ownPayroll(@CurrentUser() actor: RequestUser) {
    return { data: await this.staff.ownPayroll(actor) };
  }

  @Get('comparison')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER)
  @Permission('staff.view')
  async comparison(@Query('month') month: string, @CurrentUser() actor: RequestUser) {
    if (!/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a valid month');
    return { data: await this.staff.comparison(month, actor) };
  }

  @Post(':id/loans')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('payroll.manage')
  async loan(@Param('id') id: string, @Body() dto: PayrollLoanDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.recordLoan(id, dto, actor) };
  }

  @Post(':id/loans/:loanId/collections')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('payroll.manage')
  async collect(@Param('id') id: string, @Param('loanId') loanId: string, @Body() dto: LoanCollectionDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.collectLoan(id, loanId, dto, actor) };
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STORE_MANAGER)
  @Permission('staff.view', 'payroll.view', 'payroll.manage', 'staff.manage')
  async profile(@Param('id') id: string, @Query('month') month: string, @CurrentUser() actor: RequestUser) {
    if (!/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a valid month');
    return { data: await this.staff.profile(id, month, actor) };
  }

  @Post(':id/payroll')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('payroll.manage')
  async payroll(@Param('id') id: string, @Body() dto: PayrollDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.recordPayroll(id, dto, actor) };
  }

  @Patch(':id/payroll/:payrollId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('payroll.manage')
  async correctPayroll(@Param('id') id: string, @Param('payrollId') payrollId: string,
    @Body() dto: PayrollCorrectionDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.recordPayroll(id, dto, actor, {
      payrollId, reason: dto.reason, expectedRevision: dto.expectedRevision,
    }) };
  }

  @Post(':id/payroll/:payrollId/pay')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Permission('payroll.manage')
  async pay(@Param('id') id: string, @Param('payrollId') payrollId: string, @Body() dto: PayrollPaymentDto, @CurrentUser() actor: RequestUser) {
    return { data: await this.staff.markPaid(id, payrollId, dto.reference, actor, dto.expectedRevision) };
  }
}
