import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs de class-validator para los endpoints de clubes (Sprint 26B).
 * Validaciones cruzadas más complejas viven en el service.
 */

export class ContactoDirectivaDto {
  @IsString()
  @Length(2, 150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  cargo?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;
}

export class CreateClubDto {
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug solo admite minúsculas, números y guiones',
  })
  slug!: string;

  @IsString()
  @Length(2, 150)
  nombre!: string;

  @IsOptional()
  @IsString()
  escudoUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorPrimario?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorSecundario?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  paginaWeb?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  resena?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactoDirectivaDto)
  presidente?: ContactoDirectivaDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoDirectivaDto)
  delegados?: ContactoDirectivaDto[];

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  historialManual?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos una categoría' })
  @IsUUID(4, { each: true })
  categoriaIds!: string[];
}

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nombre?: string;

  @IsOptional()
  @IsString()
  escudoUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  colorPrimario?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  colorSecundario?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  paginaWeb?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  resena?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactoDirectivaDto)
  presidente?: ContactoDirectivaDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoDirectivaDto)
  delegados?: ContactoDirectivaDto[];

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  historialManual?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(4, { each: true })
  categoriaIds?: string[];

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}

export class CreateJugadorClubDto {
  @IsUUID()
  categoriaId!: string;

  @IsString()
  @Length(7, 20)
  rut!: string;

  @IsString()
  @Length(2, 100)
  nombres!: string;

  @IsString()
  @Length(2, 100)
  apellidos!: string;

  @IsOptional()
  @IsString()
  fechaNac?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  numeroCamiseta?: number | null;

  @IsOptional()
  @IsIn(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO'])
  posicion?: 'ARQUERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO' | null;

  @IsOptional()
  @IsIn(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO'])
  pieHabil?: 'IZQUIERDO' | 'DERECHO' | 'AMBIDIESTRO' | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  apodo?: string | null;

  /**
   * Contacto de emergencia (sprint 33A). Ambos opcionales — para
   * avisar a un familiar/responsable si el jugador se accidenta.
   */
  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefonoContacto?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  nombreContacto?: string | null;

  @IsOptional()
  @IsBoolean()
  capitan?: boolean;

  /**
   * Si true, acepta el jugador aunque caiga en excepción de edad.
   * Sin este flag, el backend devuelve 409 con detalle para que la UI
   * muestre el modal de confirmación (ADR-0004).
   */
  @IsOptional()
  @IsBoolean()
  aceptarExcepcionEdad?: boolean;
}

export class UpdateJugadorClubDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  nombres?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  apellidos?: string;

  @IsOptional()
  @IsString()
  fechaNac?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  numeroCamiseta?: number | null;

  @IsOptional()
  @IsIn(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO'])
  posicion?: 'ARQUERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO' | null;

  @IsOptional()
  @IsIn(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO'])
  pieHabil?: 'IZQUIERDO' | 'DERECHO' | 'AMBIDIESTRO' | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  apodo?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefonoContacto?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  nombreContacto?: string | null;

  @IsOptional()
  @IsBoolean()
  capitan?: boolean;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}
