import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  PROVEEDOR_PASARELA,
  ROLES_ADMIN_INVITABLES,
  type RolAdminInvitable,
} from '@fixtura/types';

export class BrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lemaCorto?: string;

  @IsOptional()
  @IsHexColor()
  colorPrimario?: string;

  @IsOptional()
  @IsHexColor()
  colorSecundario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  // URL puede venir vacía para "borrar" el escudo
  escudoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  emailContacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefonoContacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerTexto?: string;
}

class PagosTransferenciaDto {
  @IsOptional() @IsBoolean() habilitada?: boolean;
  @IsOptional() @IsString() @MaxLength(80) banco?: string;
  @IsOptional() @IsString() @MaxLength(40) tipoCuenta?: string;
  @IsOptional() @IsString() @MaxLength(40) numeroCuenta?: string;
  @IsOptional() @IsString() @MaxLength(120) titular?: string;
  @IsOptional() @IsString() @MaxLength(20) rut?: string;
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(500) instrucciones?: string;
}

class PagosPasarelaDto {
  @IsOptional() @IsBoolean() habilitada?: boolean;
  // '' (vacío) = sin proveedor; lo normaliza el service a null.
  @IsOptional() @IsIn([...PROVEEDOR_PASARELA, '']) proveedor?: string;
}

class PagosConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PagosTransferenciaDto)
  transferencia?: PagosTransferenciaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PagosPasarelaDto)
  pasarela?: PagosPasarelaDto;
}

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customDomain?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @IsOptional()
  @IsBoolean()
  requiereCarnetAnfa?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PagosConfigDto)
  pagos?: PagosConfigDto;

  // Llaves de pasarela — write-only (el GET nunca las devuelve).
  @IsOptional() @IsString() @MaxLength(200) flowApiKey?: string;
  @IsOptional() @IsString() @MaxLength(400) flowSecretKey?: string;
  @IsOptional() @IsBoolean() limpiarCredencialesPasarela?: boolean;
}

export class InvitarMiembroDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellido!: string;

  @IsIn(ROLES_ADMIN_INVITABLES as readonly string[])
  rol!: RolAdminInvitable;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  passwordTemporal!: string;
}
