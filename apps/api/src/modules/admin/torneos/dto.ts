import { Type } from 'class-transformer';
import {
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

  @IsOptional()
  tablaTiebreakers?: string[];
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
}
