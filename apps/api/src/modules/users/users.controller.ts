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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
      locationIds: dto.locationIds,
    }, actor);
    return { message: 'User created', data: user };
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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
  async deactivate(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const user = await this.usersService.deactivateUser(id, actor);
    return { message: 'User deactivated', data: { id: user.id } };
  }
}
