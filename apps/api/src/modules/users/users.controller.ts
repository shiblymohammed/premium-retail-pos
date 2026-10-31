import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
      locationIds: dto.locationIds,
    });
    return { message: 'User created', data: user };
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findAll(
    @Query('role') role?: Role,
    @Query('isActive') isActive?: boolean,
  ) {
    const users = await this.usersService.findAll({ role, isActive });
    return { data: users };
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async deactivate(@Param('id') id: string) {
    const user = await this.usersService.deactivateUser(id);
    return { message: 'User deactivated', data: { id: user.id } };
  }
}
