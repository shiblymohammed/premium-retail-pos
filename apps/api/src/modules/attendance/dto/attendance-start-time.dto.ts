import { IsOptional, IsString, Matches } from 'class-validator';

export class AttendanceStartTimeDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must use 24-hour HH:mm format' })
  startTime?: string | null;
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must use 24-hour HH:mm format' })
  endTime?: string | null;
}
