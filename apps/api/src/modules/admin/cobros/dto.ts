import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  CATEGORIA_COBRO,
  METODO_PAGO,
  type CategoriaCobro,
  type MetodoPago,
} from '@fixtura/types';

export class CreateCobroDto {
  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  concepto!: string;

  @IsIn(CATEGORIA_COBRO)
  categoria!: CategoriaCobro;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  monto!: number;

  @IsOptional()
  @IsDateString()
  vencimiento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string | null;
}

export class UpdateCobroDto {
  @IsOptional()
  @IsUUID()
  equipoId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  concepto?: string;

  @IsOptional()
  @IsIn(CATEGORIA_COBRO)
  categoria?: CategoriaCobro;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  monto?: number;

  @IsOptional()
  @IsDateString()
  vencimiento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string | null;

  @IsOptional()
  @IsBoolean()
  cancelado?: boolean;
}

export class MarcarPagadoDto {
  @IsIn(METODO_PAGO)
  metodo!: MetodoPago;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  referencia?: string | null;

  @IsOptional()
  @IsDateString()
  pagadoAt?: string;
}
