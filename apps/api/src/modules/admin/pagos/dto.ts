import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class IniciarPagoDto {
  @IsUUID()
  cobroId!: string;

  /**
   * URL base donde Webpay va a redirigir al usuario después de pagar.
   * El service le anexa `/{transaccionId}` para resolver cuál confirmar.
   * Si no se pasa, se usa FRONTEND_URL/pago/retorno.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  urlRetornoBase?: string;
}
