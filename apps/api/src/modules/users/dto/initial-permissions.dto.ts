import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class InitialPermissionsDto {
  @IsOptional()
  @IsBoolean()
  canCancelSales?: boolean;

  @IsOptional()
  @IsBoolean()
  canProcessReturns?: boolean;

  @IsOptional()
  @IsBoolean()
  canCountStockAudits?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountLimitPercent?: number;
}
