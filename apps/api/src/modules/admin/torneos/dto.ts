import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIPO_FORMATO = ['ROUND_ROBIN', 'PLAYOFFS', 'GROUPS', 'MIXTO'] as const;
type TipoFormato = (typeof TIPO_FORMATO)[number];

const ESTADO_TORNEO = ['DRAFT', 'ACTIVO', 'CERRADO'] as const;
type EstadoTorneo = (typeof ESTADO_TORNEO)[number];

// Sprint 12: keys válidas para tiebreakers. Sincronizado con
// PublicService.compararTiebreaker — agregar aquí si se suma criterio.
const TIEBREAKER_KEYS = ['pts', 'dg', 'gf', 'gc', 'pg', 'ed', 'nombre'] as const;

export class CreateTorneoDto {
  @IsUUID()
  temporadaId!: string;

  @IsString()
  @Length(2, 200)
  nombre!: string;

  @IsString()
  @Length(3, 100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug solo admite minúsculas, números y guiones' })
  slug!: string;

  @IsOptional()
  @IsEnum(TIPO_FORMATO)
  tipoFormato?: TipoFormato = 'ROUND_ROBIN';

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  ruedas?: 1 | 2 = 1;

  // Fase Grupos (GROUPS/MIXTO). Reglas cross-field (obligatoriedad según
  // formato) las valida el service; aquí solo cotas.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(32)
  cantidadGrupos?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16)
  clasificanPorGrupo?: number | null;

  @IsOptional()
  @IsBoolean()
  gruposAPlayoffs?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosVictoria?: number = 3;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosEmpate?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosDerrota?: number = 0;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string | null;

  @IsOptional()
  @IsDateString()
  fechaFin?: string | null;

  @IsOptional()
  @IsUrl()
  reglamentoUrl?: string | null;

  // Sprint 12: orden de tiebreakers en la tabla. Solo keys conocidas.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsIn(TIEBREAKER_KEYS, { each: true })
  tablaTiebreakers?: string[];

  // Sprint 25 paso 3 — categoría legacy.
  @IsOptional()
  @IsUUID()
  categoriaId?: string | null;

  // Sprint 26D — multi-categoría/serie con cupo. Validación profunda
  // la hace el service (validarCategoriasSeries); aquí solo array bound.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  categoriasSeries?: Array<{
    categoriaId: string;
    serieSlug: string | null;
    cupoEquipos: number;
  }>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  topeJugadoresPorEquipo?: number;

  @IsOptional()
  @IsBoolean()
  refuerzosHabilitados?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  fechaLimiteRefuerzosNumero?: number | null;

  // Sprint 29A — duración del partido por torneo.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  duracionPeriodoMinutos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  duracionEntretiempoMinutos?: number;

  // F46.3 — mínimo de jugadores en planilla por equipo para iniciar.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  minJugadoresParaIniciar?: number;

  // Amarillas acumuladas en el torneo que generan una fecha de suspensión.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(20)
  amarillasParaSuspension?: number;

  // Cobertura del recinto que el auto-asignar designa por jornada.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  paramedicosPorJornada?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  otrosPorJornada?: number;
}

export class MoverInscripcionGrupoDto {
  @IsUUID()
  inscripcionId!: string;

  @IsUUID()
  grupoId!: string;
}

export class UpdateTorneoDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsEnum(TIPO_FORMATO)
  tipoFormato?: TipoFormato;

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  ruedas?: 1 | 2;

  // Fase Grupos (GROUPS/MIXTO).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(32)
  cantidadGrupos?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16)
  clasificanPorGrupo?: number | null;

  @IsOptional()
  @IsBoolean()
  gruposAPlayoffs?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosVictoria?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosEmpate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  puntosDerrota?: number;

  @IsOptional()
  @IsEnum(ESTADO_TORNEO)
  estado?: EstadoTorneo;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string | null;

  @IsOptional()
  @IsDateString()
  fechaFin?: string | null;

  @IsOptional()
  @IsUrl()
  reglamentoUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsIn(TIEBREAKER_KEYS, { each: true })
  tablaTiebreakers?: string[];

  @IsOptional()
  @IsUUID()
  categoriaId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  categoriasSeries?: Array<{
    categoriaId: string;
    serieSlug: string | null;
    cupoEquipos: number;
  }>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  topeJugadoresPorEquipo?: number;

  @IsOptional()
  @IsBoolean()
  refuerzosHabilitados?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  fechaLimiteRefuerzosNumero?: number | null;

  // Sprint 29A
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  duracionPeriodoMinutos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  duracionEntretiempoMinutos?: number;

  // F46.3 — mínimo de jugadores en planilla por equipo para iniciar.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  minJugadoresParaIniciar?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(20)
  amarillasParaSuspension?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  paramedicosPorJornada?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  otrosPorJornada?: number;
}
