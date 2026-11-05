import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  Max,
  ValidateIf,
  MinLength,
  MaxLength,
} from 'class-validator';
import { LocationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Location name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Location name cannot exceed 100 characters' })
  name: string;

  @IsEnum(LocationType, {
    message: 'Type must be one of: MAIN_WAREHOUSE, SUB_WAREHOUSE, RETAIL_STORE',
  })
  @IsNotEmpty()
  type: LocationType;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Address cannot exceed 500 characters' })
  address?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(10, { message: 'Geofence radius must be at least 10 meters' })
  @Max(500, { message: 'Geofence radius cannot exceed 500 meters' })
  @Type(() => Number)
  geofenceRadius?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ValidateIf((o) => o.type !== LocationType.MAIN_WAREHOUSE)
  parentId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
