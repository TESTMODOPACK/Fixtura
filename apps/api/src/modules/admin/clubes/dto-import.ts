import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

/**
 * Sprint 28 — DTOs class-validator para los endpoints de import.
 *
 * DELIBERADAMENTE PERMISIVO en los campos por fila: aceptamos rut,
 * nombres y apellidos vacíos, demasiado cortos, etc. La validación
 * profunda (RUT chileno, nombres/apellidos mínimos, email válido,
 * edad por categoría, RUT en otro club, vetados) vive en el service
 * `plantel-import.service.ts → previsualizar()` para que cada fila
 * inválida quede como RECHAZADO con motivo claro en el preview, en
 * lugar de tumbar el endpoint completo con un 400 críptico.
 *
 * El tope superior de longitud sigue para evitar payloads abusivos.
 *
 * MAX_FILAS_POR_IMPORT: límite duro para evitar OOM si alguien sube
 * un archivo enorme por accidente. 2000 jugadores cubre cualquier
 * caso real (un club promedio tiene 30-50 por categoría).
 */
const MAX_FILAS_POR_IMPORT = 2000;

export class BulkImportRowDto {
  @IsOptional()
  @IsString()
  @Length(0, 30)
  rut?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  nombres?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  apellidos?: string | null;

  @IsOptional()
  @IsString()
  fechaNac?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 150)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;

  @IsOptional()
  numeroCamiseta?: number | string | null;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  posicion?: string | null;

  @IsOptional()
  capitan?: unknown;
}

export class BulkImportPreviewDto {
  @IsUUID('4')
  categoriaId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene filas.' })
  @ArrayMaxSize(MAX_FILAS_POR_IMPORT, {
    message: `Máximo ${MAX_FILAS_POR_IMPORT} filas por importación.`,
  })
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows!: BulkImportRowDto[];
}

export class BulkImportConfirmDto {
  @IsUUID('4')
  categoriaId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FILAS_POR_IMPORT)
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows!: BulkImportRowDto[];

  @IsOptional()
  @IsBoolean()
  inactivarFaltantes?: boolean;
}

export const PLANTEL_IMPORT_MAX_FILAS = MAX_FILAS_POR_IMPORT;
