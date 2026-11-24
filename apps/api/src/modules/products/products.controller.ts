import { can, Permission } from '../../common/decorators/permission.decorator';
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
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ConvertQuantityDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  UpdateProductPricesDto,
} from './dto';
import { UpdateVariantDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  async create(@Body() dto: CreateProductDto, @CurrentUser() actor: RequestUser) {
    const product = await this.productsService.create(dto, actor);
    return { message: 'Product created', data: this.hidePurchasePrice(product, actor) };
  }

  @Get()
  @Permission('stock.view')
  async findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isActive') activeQuery?: string,
    @CurrentUser() actor?: RequestUser,
  ) {
    if (activeQuery !== undefined && activeQuery !== 'true' && activeQuery !== 'false') {
      throw new BadRequestException('isActive must be true or false');
    }
    const products = await this.productsService.findAll({
      search,
      categoryId,
      isActive: activeQuery === undefined ? undefined : activeQuery === 'true',
    });
    return { data: products.map((product) => this.hidePurchasePrice(product, actor)) };
  }

  @Get(':id/price-history')
  @Roles(Role.SUPER_ADMIN)
  @Permission('products.prices')
  async findPriceHistory(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const rows = await this.productsService.findPriceHistory(id);
    return { data: can(actor, 'products.cost', actor.role === Role.ADMIN || actor.role === Role.INVENTORY)
      ? rows : rows.filter((row) => row.fieldChanged !== 'purchase_price') };
  }

  @Get(':id')
  @Permission('stock.view')
  async findOne(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const product = await this.productsService.findById(id);
    return { data: this.hidePurchasePrice(product, actor) };
  }

  @Patch(':id/prices')
  @Roles(Role.SUPER_ADMIN)
  @Permission('products.prices')
  async updatePrices(
    @Param('id') id: string,
    @Body() dto: UpdateProductPricesDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const product = await this.productsService.updatePrices(id, dto, actor);
    return { message: 'Product prices updated', data: this.hidePurchasePrice(product, actor) };
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: RequestUser) {
    const product = await this.productsService.update(id, dto);
    return { message: 'Product updated', data: this.hidePurchasePrice(product, actor) };
  }

  @Post(':id/variants')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async createVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return { message: 'Variant created', data: await this.productsService.createVariant(id, dto) };
  }

  @Patch(':id/variants/:variantId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return { message: 'Variant updated', data: await this.productsService.updateVariant(id, variantId, dto) };
  }

  @Post(':id/convert-quantity')
  @Permission('stock.view')
  async convertQuantity(@Param('id') id: string, @Body() dto: ConvertQuantityDto) {
    return { data: await this.productsService.convertQuantity(id, dto) };
  }

  private hidePurchasePrice<T extends { purchasePrice: unknown }>(product: T, actor?: RequestUser): Omit<T, 'purchasePrice'> | T {
    if (actor && can(actor, 'products.cost', actor.role === Role.ADMIN || actor.role === Role.INVENTORY)) return product;
    const { purchasePrice: _purchasePrice, ...visible } = product;
    return visible;
  }
}
