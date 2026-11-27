import { IsString, Length } from 'class-validator';

export class SetPasswordDto {
  @IsString()
  @Length(12, 72)
  newPassword: string;
}

export class ChangePasswordDto extends SetPasswordDto {
  @IsString()
  @Length(1, 72)
  currentPassword: string;
}
