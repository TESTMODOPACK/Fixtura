import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MOTIVO_SUSPENSION = [
  'LLUVIA',
  'CANCHA_NO_DISPONIBLE',
  'FUERZA_MAYOR',
  'DECISION_LIGA',
  'OTRO',
] as const;

const ESTRATEGIA_SUSPENSION_FECHA = ['DOMINO', 'TRASNOCHE', 'MANUAL'] as const;

const ESTADO_PARTIDO = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
  'WALKOVER',
] as const;

const TIPO_INCIDENCIA = [
  'GOL',
  'AUTOGOL',
  'AMARILLA',
  'ROJA',
  'AMARILLA_ROJA',
  'CAMBIO',
  'MVP',
  'ASISTENCIA',
  'LESION',
] as const;

export class UpdatePartidoDto {
  @IsOptional()
  @IsUUID()
  fechaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  canchaNombre?: string | null;

  @IsOptional()
  @IsDateString()
  fechaHora?: string | null;

  @IsOptional()
  @IsEnum(ESTADO_PARTIDO)
  estado?: (typeof ESTADO_PARTIDO)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string | null;
}

export class CreateIncidenciaDto {
  @IsUUID()
  equipoId!: string;

  @IsOptional()
  @IsUUID()
  jugadorInscritoId?: string | null = null;

  @IsEnum(TIPO_INCIDENCIA)
  tipo!: (typeof TIPO_INCIDENCIA)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(150)
  minuto?: number | null;
}

export class CerrarActaDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  golesLocal!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  golesVisita!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string | null;
}

// ── Sprint 8 DTOs ────────────────────────────────────────────────────

export class SuspenderPartidoDto {
  @IsEnum(MOTIVO_SUSPENSION)
  motivo!: (typeof MOTIVO_SUSPENSION)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

export class ReprogramarPartidoDto {
  @IsDateString()
  fechaHora!: string;

  @IsOptional()
  @IsUUID()
  canchaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  canchaNombre?: string | null;

  @IsOptional()
  @IsBoolean()
  mantieneDesignaciones?: boolean;
}

export class SuspenderFechaDto {
  @IsEnum(MOTIVO_SUSPENSION)
  motivo!: (typeof MOTIVO_SUSPENSION)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsEnum(ESTRATEGIA_SUSPENSION_FECHA)
  estrategia!: (typeof ESTRATEGIA_SUSPENSION_FECHA)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  diasCorrimiento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fechaBisDespuesDeNumero?: number;
}
