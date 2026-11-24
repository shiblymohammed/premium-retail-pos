import { IsIn, IsOptional } from 'class-validator';

export class AttendanceActionDto {
  @IsOptional()
  @IsIn(['IN', 'OUT'])
  action?: 'IN' | 'OUT';
}
