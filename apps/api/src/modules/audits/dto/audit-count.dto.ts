import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class AuditCountDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityBaseUnits!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AuditRecountRequestDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AuditApprovalDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AuditThresholdDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  recountVariancePercent!: number;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  recountVarianceUnits!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  highCountAlertQty?: number | null;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class DailyAuditScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must use 24-hour HH:mm format' })
  startTime?: string | null;
}

export class BulkAuditScheduleDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'storeStartTime must use 24-hour HH:mm format' })
  storeStartTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'warehouseStartTime must use 24-hour HH:mm format' })
  warehouseStartTime!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
