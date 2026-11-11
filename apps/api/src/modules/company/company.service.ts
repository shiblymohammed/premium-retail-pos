import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new company
   * @param createCompanyDto Company creation data
   * @returns Created company
   */
  async create(createCompanyDto: CreateCompanyDto) {
    const invoicePrefix = createCompanyDto.invoicePrefix ?? 'INV';
    await this.assertInvoicePrefixAvailable(invoicePrefix);
    // Check if company with same name already exists
    const existingCompany = await this.prisma.company.findFirst({
      where: { name: createCompanyDto.name },
    });

    if (existingCompany) {
      throw new ConflictException(`Company with name "${createCompanyDto.name}" already exists`);
    }

    try {
      const company = await this.prisma.company.create({
        data: { ...createCompanyDto, invoicePrefix },
        include: {
          locations: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      });
      return this.withoutReservedTaxConfig(company);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('Company name or invoice prefix is already in use');
      throw error;
    }
  }

  /**
   * Get all companies
   * @returns List of all companies
   */
  async findAll() {
    const companies = await this.prisma.company.findMany({
      include: {
        locations: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            locations: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return companies.map((company) => this.withoutReservedTaxConfig(company));
  }

  /**
   * Get a single company by ID
   * @param id Company ID
   * @returns Company details
   */
  async findOne(id: string, allowedLocationIds?: string[]) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        ...(allowedLocationIds !== undefined
          ? { locations: { some: { id: { in: allowedLocationIds } } } }
          : {}),
      },
      include: {
        locations: {
          ...(allowedLocationIds !== undefined
            ? { where: { id: { in: allowedLocationIds } } }
            : {}),
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            isActive: true,
            _count: {
              select: {
                employees: true,
              },
            },
          },
          orderBy: {
            type: 'asc',
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }

    return this.withoutReservedTaxConfig(company);
  }

  /**
   * Update company details
   * @param id Company ID
   * @param updateCompanyDto Update data
   * @returns Updated company
   */
  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    // Verify company exists
    await this.findOne(id);

    if (updateCompanyDto.invoicePrefix !== undefined) {
      await this.assertInvoicePrefixAvailable(updateCompanyDto.invoicePrefix, id);
    }

    try {
      const company = await this.prisma.company.update({
        where: { id },
        data: updateCompanyDto,
        include: {
          locations: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      });
      return this.withoutReservedTaxConfig(company);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('Company name or invoice prefix is already in use');
      throw error;
    }
  }

  /**
   * Update company invoice prefix (Super Admin only)
   * @param id Company ID
   * @param prefix New invoice prefix
   * @returns Updated company
   */
  async updateInvoicePrefix(id: string, prefix: string) {
    // Verify company exists
    await this.findOne(id);

    // Validate prefix format
    if (!/^[A-Z0-9]+$/.test(prefix)) {
      throw new ConflictException('Invoice prefix must contain only uppercase letters and numbers');
    }

    if (prefix.length > 10) {
      throw new ConflictException('Invoice prefix cannot exceed 10 characters');
    }

    await this.assertInvoicePrefixAvailable(prefix, id);

    try {
      const company = await this.prisma.company.update({
        where: { id },
        data: { invoicePrefix: prefix },
      });
      return this.withoutReservedTaxConfig(company);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('Invoice prefix is already assigned to another company');
      throw error;
    }
  }

  /**
   * Get company statistics
   * @param id Company ID
   * @returns Company statistics
   */
  async getStatistics(id: string, allowedLocationIds?: string[]) {
    await this.findOne(id, allowedLocationIds);
    const locationWhere = {
      companyId: id,
      ...(allowedLocationIds !== undefined ? { id: { in: allowedLocationIds } } : {}),
    };

    const [
      totalLocations,
      activeLocations,
      mainWarehouses,
      subWarehouses,
      retailStores,
    ] = await Promise.all([
      this.prisma.location.count({ where: locationWhere }),
      this.prisma.location.count({ where: { ...locationWhere, isActive: true } }),
      this.prisma.location.count({ where: { ...locationWhere, type: 'MAIN_WAREHOUSE' } }),
      this.prisma.location.count({ where: { ...locationWhere, type: 'SUB_WAREHOUSE' } }),
      this.prisma.location.count({ where: { ...locationWhere, type: 'RETAIL_STORE' } }),
    ]);

    return {
      totalLocations,
      activeLocations,
      inactiveLocations: totalLocations - activeLocations,
      locationsByType: {
        mainWarehouses,
        subWarehouses,
        retailStores,
      },
    };
  }

  /** Keep dormant future tax storage out of the current company setup and API responses. */
  private withoutReservedTaxConfig<T extends { gstNumber?: unknown }>(company: T) {
    const { gstNumber: _reservedForFutureTax, ...currentReleaseCompany } = company;
    return currentReleaseCompany;
  }

  private async assertInvoicePrefixAvailable(prefix: string, excludingCompanyId?: string) {
    const existing = await this.prisma.company.findFirst({
      where: { invoicePrefix: prefix, ...(excludingCompanyId ? { id: { not: excludingCompanyId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Invoice prefix is already assigned to another company; choose a unique prefix');
  }

  private isUniqueConflict(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
