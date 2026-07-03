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

class WhatsAppConfigDto {
  @IsOptional() @IsBoolean() activo?: boolean;
  // '' (vacío) borra el número; lo normaliza el service a null.
  @IsOptional() @IsString() @MaxLength(50) phoneNumberId?: string;
  @IsOptional() @IsString() @MaxLength(10) apiVersion?: string;
}

class SiiConfigDto {
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsIn(['CERTIFICACION', 'PRODUCCION']) ambiente?:
    | 'CERTIFICACION'
    | 'PRODUCCION';
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
  @IsBoolean()
  flyerSemanalDelegados?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PagosConfigDto)
  pagos?: PagosConfigDto;

  // Llaves de pasarela — write-only (el GET nunca las devuelve).
  @IsOptional() @IsString() @MaxLength(200) flowApiKey?: string;
  @IsOptional() @IsString() @MaxLength(400) flowSecretKey?: string;
  @IsOptional() @IsBoolean() limpiarCredencialesPasarela?: boolean;

  // WhatsApp BYO. Config no-secreta + token write-only.
  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsAppConfigDto)
  whatsapp?: WhatsAppConfigDto;

  @IsOptional() @IsString() @MaxLength(500) whatsappToken?: string;
  @IsOptional() @IsBoolean() limpiarWhatsappToken?: boolean;

  // Boletas SII BYO. Config editable (activo/ambiente) + API key write-only.
  @IsOptional()
  @ValidateNested()
  @Type(() => SiiConfigDto)
  sii?: SiiConfigDto;

  @IsOptional() @IsString() @MaxLength(200) siiApiKey?: string;
  @IsOptional() @IsBoolean() limpiarSiiApiKey?: boolean;
}

export class VerificarSiiDto {
  // Opcional: si viene, se verifica esta key (y se guarda cifrada al éxito);
  // si no, se usa la ya guardada.
  @IsOptional() @IsString() @MaxLength(200) apiKey?: string;
  @IsOptional() @IsIn(['CERTIFICACION', 'PRODUCCION']) ambiente?:
    | 'CERTIFICACION'
    | 'PRODUCCION';
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

  // Opcional: si no se envía, el miembro se invita por magic link (crea su
  // propia contraseña vía email). Se mantiene como fallback manual.
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga (máximo 128 caracteres).' })
  passwordTemporal?: string;
}
