import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrarPagoManualDto {
  @IsEnum(['TRANSFERENCIA', 'MANUAL'])
  metodoPago!: 'TRANSFERENCIA' | 'MANUAL';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @IsOptional()
  @IsString()
  fechaPago?: string;
}

export class AnularFacturaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  motivo!: string;
}

export class IniciarPagoWebpayDto {
  @IsOptional()
  @IsString()
  baseUrlFrontend?: string;
}
