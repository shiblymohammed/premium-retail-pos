import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SaleUnit } from './create-sale.dto';

export class QuoteSaleLineDto {
  @IsString()
  @MaxLength(100)
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(SaleUnit)
  enteredUnit: SaleUnit;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class QuoteSaleDto {
  @ValidateNested({ each: true })
  @Type(() => QuoteSaleLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: QuoteSaleLineDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  billDiscountPercent?: number;
}
