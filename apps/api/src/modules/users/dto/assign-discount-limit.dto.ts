import { IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AssignDiscountLimitDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountLimitPercent: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
