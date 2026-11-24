import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeeProfileDto } from './employee-profile.dto';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeProfileDto)
  employeeProfile?: EmployeeProfileDto;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];
}
