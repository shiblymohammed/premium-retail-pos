import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferQuantityDto {
  @IsUUID()
  variantId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  cartons?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  looseBaseUnits?: number;
}

export class CreateTransferDto {
  @IsUUID()
  sourceLocationId: string;

  @IsUUID()
  destLocationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferQuantityDto)
  lines: TransferQuantityDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ApprovedTransferLineDto {
  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  approvedQtyBase: number;
}

export class ApproveTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApprovedTransferLineDto)
  lines: ApprovedTransferLineDto[];
}

export class TransferReceiptLineDto {
  @IsUUID()
  variantId: string;

  /** Total physically received, including damaged and excess units, in base units. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  receivedQtyBase: number;

  /** Damaged units are included in receivedQtyBase and placed into QUARANTINED stock. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  damagedQtyBase?: number;

  /** Only set when closing a line with units confirmed short. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  shortQtyBase?: number;

  /** Mark this line's dispatched quantity fully reconciled, including declared shortages. */
  @IsOptional()
  @IsBoolean()
  finalizeLine?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  discrepancyNotes?: string;
}

export class ReceiveTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferReceiptLineDto)
  lines: TransferReceiptLineDto[];
}

export class DispatchTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferQuantityDto)
  lines: TransferQuantityDto[];
}

export class CancelTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class RejectTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class GenerateReplenishmentDto {
  @IsUUID()
  destLocationId: string;
}

export class ApproveReplenishmentLineDto {
  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  approvedQtyBase: number;
}

export class ApproveReplenishmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveReplenishmentLineDto)
  lines: ApproveReplenishmentLineDto[];
}
