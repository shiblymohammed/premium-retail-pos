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
    // Check if company with same name already exists
    const existingCompany = await this.prisma.company.findFirst({
      where: { name: createCompanyDto.name },
    });

    if (existingCompany) {
      throw new ConflictException(`Company with name "${createCompanyDto.name}" already exists`);
    }

    return this.prisma.company.create({
      data: createCompanyDto,
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
  }

  /**
   * Get all companies
   * @returns List of all companies
   */
  async findAll() {
    return this.prisma.company.findMany({
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
  }

  /**
   * Get a single company by ID
   * @param id Company ID
   * @returns Company details
   */
  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        locations: {
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
        _count: {
          select: {
            locations: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }

    return company;
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

    return this.prisma.company.update({
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

    return this.prisma.company.update({
      where: { id },
      data: { invoicePrefix: prefix },
    });
  }

  /**
   * Get company statistics
   * @param id Company ID
   * @returns Company statistics
   */
  async getStatistics(id: string) {
    await this.findOne(id);

    const [
      totalLocations,
      activeLocations,
      mainWarehouses,
      subWarehouses,
      retailStores,
    ] = await Promise.all([
      this.prisma.location.count({ where: { companyId: id } }),
      this.prisma.location.count({ where: { companyId: id, isActive: true } }),
      this.prisma.location.count({ where: { companyId: id, type: 'MAIN_WAREHOUSE' } }),
      this.prisma.location.count({ where: { companyId: id, type: 'SUB_WAREHOUSE' } }),
      this.prisma.location.count({ where: { companyId: id, type: 'RETAIL_STORE' } }),
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
}
