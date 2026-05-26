import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { ESTADO_DESIGNACION, ROL_PERSONAL, type EstadoDesignacion, type RolPersonal } from '@fixtura/types';

export class AsignarDesignacionDto {
  @IsUUID()
  partidoId!: string;

  @IsUUID()
  personalId!: string;

  @IsIn(ROL_PERSONAL)
  rolAsignado!: RolPersonal;

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
