import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() actor: RequestUser) {
    return this.employeesService.create(dto, actor);
  }

  @Get()
  findAll(
    @Query('locationId') locationId: string | undefined,
    @Query('isActive') activeQuery: string | undefined,
    @CurrentUser() actor: RequestUser,
  ) {
    if (activeQuery !== undefined && activeQuery !== 'true' && activeQuery !== 'false') {
      throw new BadRequestException('isActive must be true or false');
    }
    const isActive = activeQuery === undefined ? undefined : activeQuery === 'true';
    return this.employeesService.findAll({ locationId, isActive }, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.employeesService.findOne(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.employeesService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.employeesService.deactivate(id, actor);
  }
}
