import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  METODO_PAGO_LIQUIDACION,
  type MetodoPagoLiquidacion,
} from '@fixtura/types';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export class CrearLiquidacionDto {
  @IsUUID()
  personalId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  designacionIds!: string[];

  @IsIn(METODO_PAGO_LIQUIDACION)
  metodoPago!: MetodoPagoLiquidacion;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comprobante?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;

  @IsOptional()
  @Matches(FECHA_ISO, {
    message: 'fechaPago debe tener formato YYYY-MM-DD',
  })
  fechaPago?: string;
}

export class EmitirNominaDto {
  @Matches(FECHA_ISO, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde!: string;

  @Matches(FECHA_ISO, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  personalIds!: string[];

  @IsIn(METODO_PAGO_LIQUIDACION)
  metodoPago!: MetodoPagoLiquidacion;

  @IsOptional()
  @Matches(FECHA_ISO, { message: 'fechaPago debe tener formato YYYY-MM-DD' })
  fechaPago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}
