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
import { Role, LocationType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { CreateLocationDto } from './dto/create-location.dto';

@Controller('locations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateLocationDto) {
    const location = await this.locationsService.create(dto);
    return { message: 'Location created', data: location };
  }

  @Get()
  async findAll(
    @Query('type') type?: LocationType,
    @Query('isActive') isActive?: boolean,
  ) {
    const locations = await this.locationsService.findAll({ type, isActive });
    return { data: locations };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const location = await this.locationsService.findById(id);
    return { data: location };
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async deactivate(@Param('id') id: string) {
    const location = await this.locationsService.deactivate(id);
    return { message: 'Location deactivated', data: { id: location.id } };
  }
}
