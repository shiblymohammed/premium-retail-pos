import { IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserWithEmployeeDto {
  @IsEmail() @IsNotEmpty() @MaxLength(254)
  email: string;

  @IsString() @IsNotEmpty() @MinLength(12) @MaxLength(72)
  password: string;

  @IsEnum(Role)
  role: Role;

  @IsArray() @IsString({ each: true }) @IsOptional()
  locationIds?: string[];

  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(32)
  employeeCode: string;

  @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(80)
  firstName: string;

  @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(80)
  lastName: string;

  @IsUUID()
  locationId: string;

  @IsDateString()
  hireDate: string;

  @IsOptional() @IsUUID()
  reportingToId?: string;
}
