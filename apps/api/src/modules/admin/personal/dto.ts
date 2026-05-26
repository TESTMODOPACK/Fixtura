import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ROL_PERSONAL, type RolPersonal } from '@fixtura/types';

export class CreatePersonalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellido!: string;

  @IsIn(ROL_PERSONAL)
  rol!: RolPersonal;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaBase?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carnetAnfaNumero?: string | null;

  @IsOptional()
  @IsDateString()
  carnetAnfaVence?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;
}

export class UpdatePersonalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellido?: string;

  @IsOptional()
  @IsIn(ROL_PERSONAL)
  rol?: RolPersonal;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaBase?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carnetAnfaNumero?: string | null;

  @IsOptional()
  @IsDateString()
  carnetAnfaVence?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;
}
