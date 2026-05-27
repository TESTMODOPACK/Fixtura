import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { SUPERFICIE_CANCHA, type SuperficieCancha } from '@fixtura/types';

export class CreateCanchaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  capacidad?: number | null;

  @IsOptional()
  @IsIn(SUPERFICIE_CANCHA)
  superficie?: SuperficieCancha;

  @IsOptional()
  @IsBoolean()
  iluminacion?: boolean;

  @IsOptional()
  @IsBoolean()
  tieneCamarines?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

export class UpdateCanchaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  capacidad?: number | null;

  @IsOptional()
  @IsIn(SUPERFICIE_CANCHA)
  superficie?: SuperficieCancha;

  @IsOptional()
  @IsBoolean()
  iluminacion?: boolean;

  @IsOptional()
  @IsBoolean()
  tieneCamarines?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
