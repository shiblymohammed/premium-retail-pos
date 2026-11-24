import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;
class OrderItemDto {
  @IsString() @MinLength(1) @MaxLength(100) variantId: string;
  @IsInt() @Min(1) @Max(2147483647) quantity: number;
  @Matches(MONEY) unitCost: string;
}

export class OrderDto {
  @IsString() @MinLength(1) @MaxLength(100) locationId: string;
  @IsString() @MinLength(1) @MaxLength(100) number: string;
  @IsString() @MinLength(1) @MaxLength(200) supplierName: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  lines: OrderItemDto[];
}

export class PaymentDto {
  @Matches(MONEY) amount: string;
  @IsString() @MinLength(1) @MaxLength(120) reference: string;
}

export class CreditAccountDto {
  @IsString() @MinLength(1) @MaxLength(100) locationId: string;
  @IsString() @MinLength(1) @MaxLength(120) code: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
}

export class CreditEntryDto extends PaymentDto {
  @IsIn(['CHARGE', 'PAYMENT', 'CREDIT']) kind: 'CHARGE' | 'PAYMENT' | 'CREDIT';
  @IsString() @MinLength(1) @MaxLength(500) note: string;
}
