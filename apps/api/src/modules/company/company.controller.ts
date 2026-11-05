import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyService } from './company.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/decorators/current-user.decorator';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /**
   * Create a new company (Super Admin only)
   */
  @Post()
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companyService.create(createCompanyDto);
  }

  /**
   * Get all companies (Super Admin only)
   */
  @Get()
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.companyService.findAll();
  }

  /** Get a company and only the locations within the caller's authorized scope. */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.companyService.findOne(id, actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds);
  }

  /**
   * Get company statistics (Admin and above)
   */
  @Get(':id/statistics')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER)
  getStatistics(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.companyService.getStatistics(
      id,
      actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds,
    );
  }

  /**
   * Update company details (Super Admin only)
   */
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companyService.update(id, updateCompanyDto);
  }

  /**
   * Update invoice prefix (Super Admin only)
   */
  @Patch(':id/invoice-prefix')
  @Roles(Role.SUPER_ADMIN)
  updateInvoicePrefix(
    @Param('id') id: string,
    @Body('prefix') prefix: string,
  ) {
    return this.companyService.updateInvoicePrefix(id, prefix);
  }
}
