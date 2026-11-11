import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class AssignSalesPermissionsDto {
  @IsBoolean()
  canCancelSales: boolean;

  @IsBoolean()
  canProcessReturns: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
