import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  MinLength,
} from 'class-validator';

const MOTIVO_SUSPENSION = [
  'LLUVIA',
  'CANCHA_NO_DISPONIBLE',
  'FUERZA_MAYOR',
  'DECISION_LIGA',
  'OTRO',
] as const;

const ESTRATEGIA_SUSPENSION_FECHA = [
  'AL_FINAL',
  'TRASNOCHE_DOMINO',
  'REUSAR_EXISTENTE',
  'MANUAL',
] as const;

const ESTADO_PARTIDO = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'SUSPENDIDO_FUERZA_MAYOR',
  'REPROGRAMADO',
  'WALKOVER',
  'NO_JUGADO',
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

  // MOV-1 — clave de idempotencia del cliente (uuid v4). Si se reintenta la
  // misma acción con la misma clave, el backend devuelve la incidencia ya
  // creada en vez de duplicarla.
  @IsOptional()
  @IsUUID()
  clientKey?: string | null;
}

export class AtribuirIncidenciaDto {
  @IsUUID()
  jugadorInscritoId!: string;
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

// ── F46.4 — Certificación de jugadores presentes ─────────────────────
export class CertificarPresentesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  jugadorIds!: string[];
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

export class DeclararWalkoverDto {
  @IsUUID()
  equipoPerdedorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

export class MarcarNoJugadoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

// ── INF — Informe del partido (observaciones disciplinarias) ─────────
const LADO_OBSERVACION = ['LOCAL', 'VISITA', 'GENERAL'] as const;

export class CrearObservacionPartidoDto {
  @IsEnum(LADO_OBSERVACION)
  lado!: (typeof LADO_OBSERVACION)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  texto!: string;
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
  @IsString()
  fechaDestinoId?: string;

  // Acepta string vacío (frontend) o omitido. El service lo trata.
  @IsOptional()
  @IsString()
  fechaInicioReprogramada?: string;
}

// El service hace el trim. El DTO acepta empty string para no rechazar
// requests donde el campo está pero vacío (lo manda el form HTML).
