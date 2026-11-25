import type { PermissionOverrides } from '../../../common/decorators/permission.decorator';
import { IsBoolean, IsObject, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class InitialPermissionsDto {
  @IsOptional()
  @IsObject()
  permissionOverrides?: PermissionOverrides;

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
