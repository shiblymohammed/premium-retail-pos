import { IsNumber, IsString, Max, Min } from 'class-validator';

export class OpenCashDrawerDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  openingCash: number;
}

export class CloseCashDrawerDto {
  @IsString()
  id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  countedCash: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-9999999999.99)
  @Max(9999999999.99)
  countedCard: number;
}
