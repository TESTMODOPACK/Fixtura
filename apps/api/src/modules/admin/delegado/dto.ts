import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const CANALES = ['EMAIL', 'WHATSAPP', 'AMBOS'] as const;

export class InvitarDelegadoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string | null;

  @IsOptional()
  @IsEnum(CANALES)
  canal?: 'EMAIL' | 'WHATSAPP' | 'AMBOS';
}

export class ActivarDelegadoDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128, { message: 'La contraseña es demasiado larga (máximo 128 caracteres).' })
  password!: string;
}

export class ActivarInfoDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
