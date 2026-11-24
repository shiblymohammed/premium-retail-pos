import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class EmployeeProfileDto {
  @IsString() @MinLength(2) @MaxLength(32)
  employeeCode: string;

  @IsString() @MinLength(1) @MaxLength(80)
  firstName: string;

  @IsString() @MinLength(1) @MaxLength(80)
  lastName: string;

  @IsDateString()
  hireDate: string;

  @IsOptional() @IsString() @Matches(/^\+?[0-9][0-9\s().-]{6,19}$/)
  phone?: string | null;

  @IsOptional() @IsString() @MaxLength(400)
  address?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  designation?: string | null;

  @IsOptional() @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  monthlyBaseSalary?: string | null;
}
