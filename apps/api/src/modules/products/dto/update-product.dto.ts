import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  baseUnit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  unitsPerCarton?: number | null;

  /** Set or clear the replenishment threshold in canonical base units. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  reorderLevel?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductPricesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  purchasePrice?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  size?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  colour?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  style?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
