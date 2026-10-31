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
import { CompanyService } from './company.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  /**
   * Get company by ID (All authenticated users can view)
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyService.findOne(id);
  }

  /**
   * Get company statistics (Admin and above)
   */
  @Get(':id/statistics')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER)
  getStatistics(@Param('id') id: string) {
    return this.companyService.getStatistics(id);
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
