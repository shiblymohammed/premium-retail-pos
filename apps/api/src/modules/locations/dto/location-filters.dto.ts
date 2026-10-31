import { IsOptional, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { LocationType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class LocationFiltersDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
