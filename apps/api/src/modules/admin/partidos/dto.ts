import { Type } from 'class-transformer';
import {
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
