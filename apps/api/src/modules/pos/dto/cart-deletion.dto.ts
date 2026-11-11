import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CartDeletionDto {
  @IsString()
  @MaxLength(100)
  variantId: string;

  @IsInt()
  @Min(1)
  quantityRemoved: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
