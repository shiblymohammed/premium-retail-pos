import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  baseUnit: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  unitsPerCarton?: number;

  /** Replenishment threshold in canonical base units. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  reorderLevel?: number;

  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  @ValidateIf((product) => product.hasVariants !== true)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku?: string;

  @ValidateIf((product) => product.hasVariants !== true)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @ValidateIf((product) => product.hasVariants === true)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  sellingPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  purchasePrice: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  priceChangeReason: string;
}
