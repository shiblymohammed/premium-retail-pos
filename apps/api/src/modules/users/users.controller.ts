import { PERMISSIONS, PermissionOverrides, RestrictedPermission } from '../../common/decorators/permission.decorator';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserWithEmployeeDto } from './dto/create-user-with-employee.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignDiscountLimitDto } from './dto/assign-discount-limit.dto';
import { AssignSalesPermissionsDto } from './dto/assign-sales-permissions.dto';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { SetPasswordDto } from '../auth/dto/change-password.dto';

class AssignStockAuditPermissionDto {
  @IsBoolean() canCountStockAudits: boolean;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('role-presets')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  rolePresets() {
    return { data: this.usersService.getRolePresets() };
  }

  @Get('permission-definitions')
  @Roles(Role.SUPER_ADMIN)
  permissionDefinitions() {
    return { data: PERMISSIONS };
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.manage')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
      locationIds: dto.locationIds,
      initialPermissions: dto.initialPermissions,
    }, actor);
    return { message: 'User created', data: user };
  }

  @Post('with-employee')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.manage')
  async createWithEmployee(@Body() dto: CreateUserWithEmployeeDto, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.createUserWithEmployee(dto, actor);
    return { message: 'User and employee profile created', data: user };
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.view')
  async findAll(
    @Query('role') roleQuery?: string,
    @Query('isActive') activeQuery?: string,
    @CurrentUser() actor?: RequestUser,
  ) {
    if (roleQuery !== undefined && !Object.values(Role).includes(roleQuery as Role)) {
      throw new BadRequestException('role must be a valid user role');
    }
    if (activeQuery !== undefined && activeQuery !== 'true' && activeQuery !== 'false') {
      throw new BadRequestException('isActive must be true or false');
    }
    const isActive = activeQuery === undefined ? undefined : activeQuery === 'true';
    const users = await this.usersService.findAll({ role: roleQuery as Role | undefined, isActive }, actor);
    return { data: users };
  }

  @Get('me/permissions')
  myPermissions(@CurrentUser() actor: RequestUser) {
    return { data: actor.permissionOverrides ?? {} };
  }

  @Get(':id/permissions')
  @Roles(Role.SUPER_ADMIN)
  async permissionProfile(@Param('id') id: string) {
    return { data: { ...(await this.usersService.permissionProfile(id)), definitions: PERMISSIONS } };
  }

  @Patch(':id/permissions')
  @Roles(Role.SUPER_ADMIN)
  async setPermissionProfile(@Param('id') id: string, @Body() overrides: PermissionOverrides, @CurrentUser() actor: RequestUser) {
    return { data: await this.usersService.setPermissionProfile(id, overrides, actor) };
  }

  @Get('me/discount-limit')
  async getMyDiscountAuthority(@CurrentUser() actor: RequestUser) {
    return { data: await this.usersService.getDiscountAuthority(actor.userId) };
  }

  @Get('me/sales-permissions')
  async getMySalesPermissions(@CurrentUser() actor: RequestUser) {
    return { data: await this.usersService.getSalesPermissions(actor.userId) };
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const user = await this.usersService.updateUser(id, dto, actor);
    return { message: 'User updated', data: user };
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.manage')
  async deactivate(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.deactivateUser(id, actor);
    return { message: 'User deactivated', data: { id: user.id } };
  }

  @Post(':id/reset-password')
  @Roles(Role.SUPER_ADMIN)
  async resetPassword(@Param('id') id: string, @Body() dto: SetPasswordDto, @CurrentUser() actor: RequestUser) {
    await this.usersService.setLoginPassword(id, dto.newPassword, actor);
    return { message: 'Staff password reset and existing sessions revoked' };
  }

  @Patch(':id/reactivate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RestrictedPermission('staff.manage')
  async reactivate(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.reactivateUser(id, actor);
    return { message: 'User reactivated', data: { id: user.id } };
  }

  @Patch(':id/discount-limit')
  @Roles(Role.SUPER_ADMIN)
  async assignDiscountLimit(
    @Param('id') id: string,
    @Body() dto: AssignDiscountLimitDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const user = await this.usersService.assignDiscountLimit(id, dto, actor);
    return { message: 'Discount limit assigned', data: user };
  }

  @Patch(':id/sales-permissions')
  @Roles(Role.SUPER_ADMIN)
  async assignSalesPermissions(
    @Param('id') id: string,
    @Body() dto: AssignSalesPermissionsDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const user = await this.usersService.assignSalesPermissions(id, dto, actor);
    return { message: 'Sales permissions assigned', data: user };
  }

  @Patch(':id/stock-audit-permission')
  @Roles(Role.SUPER_ADMIN)
  async assignStockAuditPermission(@Param('id') id: string, @Body() dto: AssignStockAuditPermissionDto, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.assignStockAuditPermission(id, dto, actor);
    return { message: 'Stock audit count permission assigned', data: user };
  }
}
