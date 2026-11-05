import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role, LocationType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LocationScopeGuard, RolesGuard } from '../../common/guards';
import { CreateLocationDto } from './dto/create-location.dto';
import { RequestUser } from '../../common/decorators/current-user.decorator';

@Controller('locations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateLocationDto, @CurrentUser() actor: RequestUser) {
    const location = await this.locationsService.create(dto, actor);
    return { message: 'Location created', data: location };
  }

  @Get()
  async findAll(
    @Query('type') typeQuery?: string,
    @Query('isActive') activeQuery?: string,
    @CurrentUser() user?: { role: Role; locationIds: string[] },
  ) {
    if (typeQuery !== undefined && !Object.values(LocationType).includes(typeQuery as LocationType)) {
      throw new BadRequestException('type must be a valid location type');
    }
    if (activeQuery !== undefined && activeQuery !== 'true' && activeQuery !== 'false') {
      throw new BadRequestException('isActive must be true or false');
    }
    const type = typeQuery as LocationType | undefined;
    const isActive = activeQuery === undefined ? undefined : activeQuery === 'true';
    const locations = await this.locationsService.findAll({
      type,
      isActive,
      allowedLocationIds: user?.role === Role.SUPER_ADMIN ? undefined : user?.locationIds ?? [],
    });
    return { data: locations };
  }

  @Get(':id')
  @UseGuards(LocationScopeGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { role: Role; locationIds: string[] },
  ) {
    const location = await this.locationsService.findById(
      id,
      user.role === Role.SUPER_ADMIN ? undefined : user.locationIds,
    );
    return { data: location };
  }

  @Patch(':id/deactivate')
  @UseGuards(LocationScopeGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async deactivate(@Param('id') id: string) {
    const location = await this.locationsService.deactivate(id);
    return { message: 'Location deactivated', data: { id: location.id } };
  }
}
