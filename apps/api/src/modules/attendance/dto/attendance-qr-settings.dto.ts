import { IsBoolean } from 'class-validator';

export class AttendanceQrSettingsDto {
  @IsBoolean()
  required!: boolean;
}
