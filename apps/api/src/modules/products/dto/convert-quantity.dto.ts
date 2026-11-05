import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConvertQuantityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cartons?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseUnits?: number;
}
