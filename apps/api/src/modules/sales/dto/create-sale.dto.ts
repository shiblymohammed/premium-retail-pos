import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export enum SaleUnit {
  BASE_UNIT = 'BASE_UNIT',
  CARTON = 'CARTON',
}

export class CreateSaleLineDto {
  @IsString()
  @MaxLength(100)
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(SaleUnit)
  enteredUnit: SaleUnit;

  // Extra cartons on a mixed line whose primary quantity is in base units.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cartonQuantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cashDrawerId?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  lines: CreateSaleLineDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  billDiscountPercent?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  paymentAmount: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashTenderedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  transactionReference?: string;
}
