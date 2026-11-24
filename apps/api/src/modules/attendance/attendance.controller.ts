import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators';
import { LocationScopeGuard } from '../../common/guards';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttendanceStartTimeDto } from './dto/attendance-start-time.dto';
import { AttendanceCorrectionDto } from './dto/attendance-correction.dto';
import { AttendanceService } from './attendance.service';

const MANAGERS = [Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER, Role.SUB_WAREHOUSE_MANAGER, Role.STORE_MANAGER];

@Controller('attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('me/today')
  async today(@CurrentUser() actor: RequestUser) {
    return { data: await this.attendance.getToday(actor) };
  }

  @Get('me/history')
  async myHistory(@CurrentUser() actor: RequestUser) {
    return { data: await this.attendance.getMyHistory(actor) };
  }

  @Post('me/punch')
  async punch(@CurrentUser() actor: RequestUser) {
    return { message: 'Attendance recorded', data: await this.attendance.punch(actor) };
  }

  @Get('locations/:locationId/target-time')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async targetTime(@Param('locationId') locationId: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.attendance.getLocationTargetStartTime(locationId, actor) };
  }

  @Patch('locations/:locationId/target-time')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async updateTargetTime(@Param('locationId') locationId: string, @Body() dto: AttendanceStartTimeDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Attendance target time saved', data: await this.attendance.setLocationTargetStartTime(locationId, dto.startTime ?? null, actor) };
  }

  @Get('locations/:locationId/today')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async locationToday(@Param('locationId') locationId: string, @CurrentUser() actor: RequestUser) {
    return { data: await this.attendance.getLocationAttendanceToday(locationId, actor) };
  }

  @Patch('punches/:attendanceId/correct')
  @Roles(...MANAGERS)
  async correctPunch(@Param('attendanceId') attendanceId: string, @Body() dto: AttendanceCorrectionDto, @CurrentUser() actor: RequestUser) {
    return { message: 'Attendance punch corrected', data: await this.attendance.correctPunch(attendanceId, dto.punchTimestamp, dto.reason, actor) };
  }

  @Get('locations/:locationId/reports')
  @UseGuards(LocationScopeGuard)
  @Roles(...MANAGERS)
  async report(@Param('locationId') locationId: string, @Query('period') period: string, @Query('date') date: string | undefined, @CurrentUser() actor: RequestUser) {
    return { data: await this.attendance.getReport(locationId, period, date, actor) };
  }
}
