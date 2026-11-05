import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(32)
  employeeCode?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  firstName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  lastName?: string;

  @IsOptional() @IsString() @Matches(/^\+?[0-9][0-9\s().-]{6,19}$/)
  phone?: string;

  @IsOptional() @IsString() @MinLength(1)
  locationId?: string;

  @IsOptional() @IsUUID()
  reportingToId?: string;

  @IsOptional() @IsDateString()
  hireDate?: string;
}
