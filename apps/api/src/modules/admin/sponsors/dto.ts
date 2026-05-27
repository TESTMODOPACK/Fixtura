import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { POSICION_SPONSOR, type PosicionSponsor } from '@fixtura/types';

export class CreateSponsorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsUrl()
  @MaxLength(500)
  imagenUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string | null;

  @IsIn(POSICION_SPONSOR)
  posicion!: PosicionSponsor;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  prioridad?: number;

  @IsOptional()
  @IsDateString()
  vigenteDesde?: string | null;

  @IsOptional()
  @IsDateString()
  vigenteHasta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string | null;
}

export class UpdateSponsorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imagenUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string | null;

  @IsOptional()
  @IsIn(POSICION_SPONSOR)
  posicion?: PosicionSponsor;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  prioridad?: number;

  @IsOptional()
  @IsDateString()
  vigenteDesde?: string | null;

  @IsOptional()
  @IsDateString()
  vigenteHasta?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string | null;
}
