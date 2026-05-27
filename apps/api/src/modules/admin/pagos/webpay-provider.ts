import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Provider abstracto para integraciones de pago.
 *
 * `iniciarPago`: genera una URL a la que se redirige al usuario para
 *   completar el pago. Devuelve un token que la pasarela emite y que
 *   nosotros guardamos para confirmar luego.
 *
 * `confirmarPago`: recibido el token de retorno, consulta a la pasarela
 *   el estado final del pago. Devuelve un payload normalizado.
 */
export interface IniciarPagoArgs {
  monto: number;
  ordenCompra: string;
  sessionId: string;
  urlRetorno: string;
}

export interface IniciarPagoResult {
  token: string;
  url: string;
  // Cualquier metadata útil que el provider devuelva.
  raw: Record<string, unknown>;
}

export interface ConfirmarPagoResult {
  aprobado: boolean;
  monto: number;
  /** Código de autorización del banco si aplica (Webpay lo devuelve). */
  authorizationCode: string | null;
  /** Payload completo recibido del provider, para audit y SII. */
  raw: Record<string, unknown>;
}

export abstract class WebpayProvider {
  abstract get nombre(): 'MOCK' | 'WEBPAY';
  abstract iniciarPago(args: IniciarPagoArgs): Promise<IniciarPagoResult>;
  abstract confirmarPago(token: string): Promise<ConfirmarPagoResult>;
}

/**
 * Provider MOCK: simula la integración con Webpay para desarrollo y
 * tests. La "URL de redirección" es la URL local de retorno con un token
 * fabricado. El consumidor puede aprobar/rechazar manualmente o llamar
 * a `confirmarPago(token)` que aprueba por default (modo "siempre OK").
 *
 * Convención del token: `MOCK-{base64url}`. Si el token incluye `-DENY`,
 * `confirmarPago` retorna aprobado=false (útil para tests).
 */
@Injectable()
export class WebpayMockProvider extends WebpayProvider {
  private readonly log = new Logger(WebpayMockProvider.name);

  get nombre(): 'MOCK' {
    return 'MOCK';
  }

  async iniciarPago(args: IniciarPagoArgs): Promise<IniciarPagoResult> {
    const token = `MOCK-${randomBytes(18).toString('base64url')}`;
    // En mock, redirigimos directo a la URL de retorno con el token como
    // query param — eso emula el comportamiento de Webpay que hace POST
    // al merchant después del flujo.
    const url = `${args.urlRetorno}?token_ws=${encodeURIComponent(token)}&monto=${args.monto}`;
    this.log.log(
      `[MOCK] iniciarPago ordenCompra=${args.ordenCompra} monto=${args.monto} → token=${token.slice(0, 16)}…`,
    );
    return {
      token,
      url,
      raw: {
        mode: 'mock',
        ordenCompra: args.ordenCompra,
        sessionId: args.sessionId,
        creadoAt: new Date().toISOString(),
      },
    };
  }

  async confirmarPago(token: string): Promise<ConfirmarPagoResult> {
    if (!token.startsWith('MOCK-')) {
      throw new Error(`Token MOCK inválido: ${token.slice(0, 16)}…`);
    }
    const denegado = token.includes('-DENY');
    this.log.log(
      `[MOCK] confirmarPago token=${token.slice(0, 16)}… → ${denegado ? 'RECHAZADO' : 'APROBADO'}`,
    );
    return {
      aprobado: !denegado,
      monto: 0, // el monto real lo lee el caller desde la transaccion guardada
      authorizationCode: denegado ? null : `MOCKAUTH${Math.floor(Math.random() * 1_000_000)}`,
      raw: {
        mode: 'mock',
        token,
        confirmadoAt: new Date().toISOString(),
        statusCode: denegado ? 'REJECTED' : 'APPROVED',
      },
    };
  }
}

/**
 * Stub del provider real de Transbank Webpay Plus.
 *
 * Cuando lleguen las credenciales sandbox/producción, hay que:
 *   1. Instalar `transbank-sdk` (pnpm add transbank-sdk -F @fixtura/api)
 *   2. Leer env vars: WEBPAY_COMMERCE_CODE, WEBPAY_API_KEY, WEBPAY_ENVIRONMENT
 *   3. Implementar iniciarPago / confirmarPago contra `WebpayPlus.Transaction`.
 *
 * Por ahora lanza error explícito si se intenta usar — el WebpayModule
 * elige el provider basado en env WEBPAY_MODE.
 */
@Injectable()
export class WebpayPlusProvider extends WebpayProvider {
  get nombre(): 'WEBPAY' {
    return 'WEBPAY';
  }

  async iniciarPago(_args: IniciarPagoArgs): Promise<IniciarPagoResult> {
    throw new Error(
      'WebpayPlusProvider no implementado. Setear WEBPAY_MODE=mock o completar la integración Transbank.',
    );
  }

  async confirmarPago(_token: string): Promise<ConfirmarPagoResult> {
    throw new Error(
      'WebpayPlusProvider no implementado. Setear WEBPAY_MODE=mock o completar la integración Transbank.',
    );
  }
}

/**
 * Token de DI para el provider activo, seleccionado al bootstrap según
 * `WEBPAY_MODE`. Inyectado por `WEBPAY_PROVIDER_TOKEN`.
 */
export const WEBPAY_PROVIDER = Symbol('WEBPAY_PROVIDER');
