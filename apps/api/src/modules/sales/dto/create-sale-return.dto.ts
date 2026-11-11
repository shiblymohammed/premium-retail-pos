import { RefundMethod, ReturnDisposition } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreateSaleReturnLineDto {
  @IsString()
  @MaxLength(100)
  saleLineId: string;

  @IsInt()
  @Min(1)
  quantityBaseUnits: number;

  @IsEnum(ReturnDisposition)
  disposition: ReturnDisposition;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  inspectionNotes: string;
}

export class CreateSaleReturnDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsEnum(RefundMethod)
  refundMethod?: RefundMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  refundReference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnLineDto)
  lines: CreateSaleReturnLineDto[];
}
