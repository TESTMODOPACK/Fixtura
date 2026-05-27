import { Type } from 'class-transformer';
import {
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

import { ROLES_ADMIN_INVITABLES, type RolAdminInvitable } from '@fixtura/types';

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
