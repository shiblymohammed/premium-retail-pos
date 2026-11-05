import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsUUID()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(32)
  employeeCode: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9][0-9\s().-]{6,19}$/)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsUUID()
  reportingToId?: string;

  @IsDateString()
  hireDate: string;
}
