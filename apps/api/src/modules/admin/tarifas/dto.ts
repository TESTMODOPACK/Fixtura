import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Sprint 34B — DTOs del tarifario por torneo.
 *
 * La validación cruzada (CUOTA recurrente requiere día de vencimiento,
 * tipos no-CUOTA solo admiten frecuencia UNICO) vive en el service para
 * dar mensajes de error más claros que un constraint genérico.
 */

const TIPOS = [
  'MATRICULA',
  'CUOTA',
  'MULTA_AMARILLA',
  'MULTA_ROJA',
  'MULTA_WALKOVER',
  'OTRO',
] as const;

const FRECUENCIAS = ['UNICO', 'SEMANAL', 'MENSUAL', 'ANUAL'] as const;

export class CreateTarifaDto {
  @IsIn(TIPOS as unknown as string[])
  tipo!: (typeof TIPOS)[number];

  @IsOptional()
  @IsString()
  @Length(0, 200)
  descripcion?: string | null;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monto!: number;

  @IsOptional()
  @IsIn(FRECUENCIAS as unknown as string[])
  frecuencia?: (typeof FRECUENCIAS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimiento?: number | null;

  // Sprint 45 — CUOTA: cantidad total de cuotas a generar al activar.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  cantidadCuotas?: number | null;

  // Sprint 45 — MATRICULA: días de plazo para pagar desde la activación.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazoPago?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateTarifaDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  descripcion?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monto?: number;

  @IsOptional()
  @IsIn(FRECUENCIAS as unknown as string[])
  frecuencia?: (typeof FRECUENCIAS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimiento?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  cantidadCuotas?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazoPago?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
