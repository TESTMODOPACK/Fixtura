import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSancionTribunalDto {
  @IsUUID()
  jugadorInscritoId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  fechasSuspension!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  descripcion!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  desdeFechaNumero?: number;

  // Sprint 26H — Marca al jugador como vetado de por vida en la liga.
  @IsOptional()
  @IsBoolean()
  vetoPermanente?: boolean;
}

export class SancionarEquipoDto {
  @IsUUID()
  inscripcionId!: string;

  @IsOptional()
  @IsBoolean()
  suspenderDelTorneo?: boolean;

  @IsOptional()
  @IsBoolean()
  vetarClubPermanente?: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}

export class AjustarSancionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  fechasPendientes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  desdeFechaNumero?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivoAjuste!: string;
}
