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
  async create(@Body() createCompanyDto: CreateCompanyDto) {
    const company = await this.companyService.create(createCompanyDto);
    return { message: 'Company created', data: company };
  }

  /**
   * Get all companies (Super Admin only)
   */
  @Get()
  @Roles(Role.SUPER_ADMIN)
  async findAll() {
    const companies = await this.companyService.findAll();
    return { data: companies };
  }

  /** Get a company and only the locations within the caller's authorized scope. */
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const company = await this.companyService.findOne(
      id,
      actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds,
    );
    return { data: company };
  }

  /**
   * Get company statistics (Admin and above)
   */
  @Get(':id/statistics')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CENTRAL_MANAGER)
  async getStatistics(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const statistics = await this.companyService.getStatistics(
      id,
      actor.role === Role.SUPER_ADMIN ? undefined : actor.locationIds,
    );
    return { data: statistics };
  }

  /**
   * Update company details (Super Admin only)
   */
  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    const company = await this.companyService.update(id, updateCompanyDto);
    return { message: 'Company settings updated', data: company };
  }

  /**
   * Update invoice prefix (Super Admin only)
   */
  @Patch(':id/invoice-prefix')
  @Roles(Role.SUPER_ADMIN)
  async updateInvoicePrefix(
    @Param('id') id: string,
    @Body('prefix') prefix: string,
  ) {
    const company = await this.companyService.updateInvoicePrefix(id, prefix);
    return { message: 'Invoice prefix updated', data: company };
  }
}
