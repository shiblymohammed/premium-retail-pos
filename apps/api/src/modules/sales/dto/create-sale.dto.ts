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

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class CreateSaleDto {
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
