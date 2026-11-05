import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(72)
  password: string;

  @IsEnum(Role)
  role: Role;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locationIds?: string[];
}
