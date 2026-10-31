import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, Matches, IsIn } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Company name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Company name cannot exceed 100 characters' })
  name: string;

  @IsString()
  @IsOptional()
  @IsIn(['INR', 'USD', 'EUR', 'GBP'], { message: 'Currency must be one of: INR, USD, EUR, GBP' })
  currency?: string = 'INR';

  @IsString()
  @IsOptional()
  timezone?: string = 'Asia/Kolkata';

  @IsString()
  @IsOptional()
  @MaxLength(10, { message: 'Invoice prefix cannot exceed 10 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Invoice prefix must contain only uppercase letters and numbers' })
  invoicePrefix?: string = 'INV';

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid GST number format. Expected format: 22AAAAA0000A1Z5',
  })
  gstNumber?: string;
}
