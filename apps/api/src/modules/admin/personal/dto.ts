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

import {
  ROL_PERSONAL,
  TIPO_CUENTA_BANCARIA,
  type RolPersonal,
  type TipoCuentaBancaria,
} from '@fixtura/types';

import { IsRutChileno } from '../../../common/validators/is-rut-chileno.validator';

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
  @IsRutChileno()
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaArbitroPrincipal?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaArbitroAsistente?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carnetAnfaNumero?: string | null;

  @IsOptional()
  @IsDateString()
  carnetAnfaVence?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  banco?: string | null;

  @IsOptional()
  @IsIn(TIPO_CUENTA_BANCARIA)
  tipoCuenta?: TipoCuentaBancaria | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroCuenta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  titularNombre?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  titularRut?: string | null;

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
  @IsRutChileno()
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaArbitroPrincipal?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tarifaArbitroAsistente?: number | null;

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
  @MaxLength(60)
  banco?: string | null;

  @IsOptional()
  @IsIn(TIPO_CUENTA_BANCARIA)
  tipoCuenta?: TipoCuentaBancaria | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroCuenta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  titularNombre?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  titularRut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;
}

// ─── Sprint 17: invitar con canal ──────────────────────────────────
import { IsEnum } from 'class-validator';

const CANALES = ['EMAIL', 'WHATSAPP', 'AMBOS'] as const;

export class InvitarPersonalDto {
  @IsOptional()
  @IsEnum(CANALES)
  canal?: 'EMAIL' | 'WHATSAPP' | 'AMBOS';
}

// ─── F48: ausencias del personal por rango de fechas ───────────────
export class CrearAusenciaDto {
  @IsDateString()
  desde!: string; // YYYY-MM-DD

  @IsDateString()
  hasta!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string | null;
}
