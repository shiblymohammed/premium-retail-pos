import { RefundMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelSaleDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsBoolean()
  goodsReturnedToStore: boolean;

  @IsEnum(RefundMethod)
  refundMethod: RefundMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  refundReference?: string;
}
