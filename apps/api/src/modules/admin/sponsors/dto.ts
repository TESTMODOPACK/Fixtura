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
  ValidateIf,
} from 'class-validator';

import { POSICION_SPONSOR, type PosicionSponsor } from '@fixtura/types';

export class CreateSponsorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  imagenUrl!: string;

  @IsOptional()
  @ValidateIf((o: CreateSponsorDto) => o.linkUrl !== '' && o.linkUrl != null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  imagenUrl?: string;

  @IsOptional()
  @ValidateIf((o: UpdateSponsorDto) => o.linkUrl !== '' && o.linkUrl != null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
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
