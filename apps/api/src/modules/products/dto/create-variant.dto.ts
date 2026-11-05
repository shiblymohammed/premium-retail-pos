import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  colour?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  style?: string;
}
