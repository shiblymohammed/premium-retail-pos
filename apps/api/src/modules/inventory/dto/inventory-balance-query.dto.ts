import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { StockState } from '@prisma/client';

export class InventoryBalanceQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locationId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  variantIds?: string;

  @IsOptional()
  @IsEnum(StockState)
  stockState?: StockState;
}
