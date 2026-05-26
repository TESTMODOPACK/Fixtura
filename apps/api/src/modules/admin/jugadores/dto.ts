import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const POSICIONES = ['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO'] as const;
const PIES = ['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO'] as const;

export class CreateJugadorDto {
  @IsString()
  @Length(2, 100)
  nombre!: string;

  @IsString()
  @Length(2, 100)
  apellido!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  apodo?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  rut?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  numeroCamiseta?: number | null;

  @IsOptional()
  @IsEnum(POSICIONES)
  posicion?: 'ARQUERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO' | null;

  @IsOptional()
  @IsEnum(PIES)
  pieHabil?: 'IZQUIERDO' | 'DERECHO' | 'AMBIDIESTRO' | null;

  @IsOptional()
  @IsDateString()
  fechaNac?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  capitan?: boolean = false;
}

export class BulkCreateJugadoresDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateJugadorDto)
  jugadores!: CreateJugadorDto[];
}
