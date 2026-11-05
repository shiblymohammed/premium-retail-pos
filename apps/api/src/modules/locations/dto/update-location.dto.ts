import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { LocationType } from '@prisma/client';

export class UpdateLocationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @IsOptional() @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitude?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(10) @Max(500)
  geofenceRadius?: number;

  @IsOptional() @IsUUID()
  parentId?: string;

  @IsOptional() @IsUUID()
  managerId?: string;
}
