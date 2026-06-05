import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { MOTIVO_SUSPENSION_EQUIPO, type MotivoSuspensionEquipo } from '@fixtura/types';

export class CreateEquipoDto {
  @IsString()
  @Length(2, 150)
  nombre!: string;

  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug solo admite minúsculas, números y guiones' })
  slug!: string;

  @IsOptional()
  @IsString()
  escudoUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorPrimario?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorSecundario?: string | null;

  @IsOptional()
  @IsUUID()
  delegadoUserId?: string | null;

  // Sprint 25 paso 3 — serie del equipo dentro de la categoría del torneo.
  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug solo admite minúsculas, números y guiones' })
  serieSlug?: string | null;
}

/**
 * Sprint 44 — Suspender un equipo del torneo. Dispara walkover automático
 * en los partidos pendientes y deja al equipo fuera de competencia.
 */
export class SuspenderEquipoDto {
  @IsIn(MOTIVO_SUSPENSION_EQUIPO)
  motivo!: MotivoSuspensionEquipo;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;

  /**
   * Sprint 44 — Si está en true y el torneo tiene tarifa MULTA_WALKOVER
   * configurada, se aplica un cobro de multa por cada partido que pasa a
   * walkover. Default false: la UI lo deja apagado porque suspender ya
   * es castigo suficiente y para motivos económicos genera doble cobro.
   */
  @IsOptional()
  @IsBoolean()
  aplicarMultaWalkover?: boolean;
}
