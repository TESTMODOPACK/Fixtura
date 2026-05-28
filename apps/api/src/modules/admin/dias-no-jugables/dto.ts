import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

const SCOPES = ['GLOBAL', 'TORNEO'] as const;
const ORIGENES = ['MANUAL', 'FERIADO_CHILE', 'IMPORT'] as const;

export class CreateDiaNoJugableDto {
  @IsDateString()
  fecha!: string;

  @IsOptional()
  @IsEnum(SCOPES)
  scope?: 'GLOBAL' | 'TORNEO' = 'GLOBAL';

  @IsOptional()
  @IsUUID()
  torneoId?: string | null;

  @IsString()
  @Length(2, 150)
  motivo!: string;

  @IsOptional()
  @IsEnum(ORIGENES)
  origen?: 'MANUAL' | 'FERIADO_CHILE' | 'IMPORT' = 'MANUAL';
}

export class BulkCreateDiasNoJugablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateDiaNoJugableDto)
  dias!: CreateDiaNoJugableDto[];
}
