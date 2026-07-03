import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CANAL_INVITACION_JUGADOR } from '@fixtura/types';

export class InvitarJugadorDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string | null;

  @IsOptional()
  @IsEnum(CANAL_INVITACION_JUGADOR)
  canal?: (typeof CANAL_INVITACION_JUGADOR)[number];
}

export class ActivarJugadorDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

/** Verificación de carnet: por QR escaneado o por RUT manual. */
export class VerificarCarnetDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string;

  @IsOptional()
  @IsUUID()
  torneoId?: string;
}
