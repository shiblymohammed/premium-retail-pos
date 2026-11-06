import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class OpeningStockImportLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantityBaseUnits: number;
}

export class OpeningStockImportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OpeningStockImportLineDto)
  lines: OpeningStockImportLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
