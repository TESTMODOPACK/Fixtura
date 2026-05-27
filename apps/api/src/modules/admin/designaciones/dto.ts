import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
// @IsIn ya viene de class-validator — para los strings literales abajo

import {
  ESTADO_DESIGNACION,
  ROLES_DESIGNABLES_PARTIDO,
  type EstadoDesignacion,
  type RolDesignablePartido,
} from '@fixtura/types';

export class AsignarDesignacionDto {
  @IsUUID()
  partidoId!: string;

  @IsUUID()
  personalId!: string;

  // Solo árbitros principal/asistente y planillero. Paramédico y "otro"
  // son del recinto — no se asignan por partido.
  @IsIn(ROLES_DESIGNABLES_PARTIDO)
  rolAsignado!: RolDesignablePartido;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  montoPago?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string | null;
}

export class UpdateDesignacionEstadoDto {
  @IsIn(ESTADO_DESIGNACION)
  estado!: EstadoDesignacion;
}

export class AutoAsignarDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES_DESIGNABLES_PARTIDO, { each: true })
  roles?: RolDesignablePartido[];

  @IsOptional()
  @IsBoolean()
  sobreescribir?: boolean;
}

export class AsignarRecintoDto {
  @IsUUID()
  fechaId!: string;

  @IsUUID()
  personalId!: string;

  @IsIn(['PARAMEDICO', 'OTRO'])
  rolAsignado!: 'PARAMEDICO' | 'OTRO';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  canchaNombre?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  montoPago?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string | null;
}
