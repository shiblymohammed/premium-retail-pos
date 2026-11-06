import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class SupplierReceiptLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  variantId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  cartons?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  looseBaseUnits?: number;
}

export class SupplierReceiptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  receiptNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  supplierName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SupplierReceiptLineDto)
  lines: SupplierReceiptLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
