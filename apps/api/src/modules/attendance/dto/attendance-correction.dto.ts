import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class AttendanceCorrectionDto {
  @IsDateString()
  punchTimestamp!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
