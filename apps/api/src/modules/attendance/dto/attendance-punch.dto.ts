import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AttendancePunchDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  qrToken?: string;
}
