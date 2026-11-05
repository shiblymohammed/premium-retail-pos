import { IsIn, IsOptional, IsString, IsTimeZone, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @IsIn(['INR', 'USD', 'EUR', 'GBP'])
  currency?: string;

  @IsOptional() @IsString() @IsTimeZone()
  timezone?: string;

  @IsOptional() @IsString() @MaxLength(10) @Matches(/^[A-Z0-9]+$/)
  invoicePrefix?: string;

  @IsOptional() @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
  gstNumber?: string;
}
