import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Sprint 24A — Provider abstracto para MercadoPago (Checkout Pro).
 *
 * Mantiene la misma forma que WebpayProvider para que el caller pueda
 * elegir gateway sin cambiar el flujo. Mock-first: la integración real
 * con `mercadopago` SDK se implementa cuando lleguen credenciales.
 *
 * Selección via env `MERCADOPAGO_MODE`:
 *   - mock (default)      → MercadoPagoMockProvider
 *   - sandbox|production  → MercadoPagoRealProvider (stub)
 */

export interface MPIniciarPagoArgs {
  monto: number;
  ordenCompra: string;
  descripcion: string;
  urlRetornoExito: string;
  urlRetornoFracaso: string;
  urlRetornoPendiente: string;
  emailPagador?: string;
}

export interface MPIniciarPagoResult {
  /** preferenceId que MercadoPago asigna. */
  preferenceId: string;
  /** URL de checkout (init_point). */
  initPoint: string;
  raw: Record<string, unknown>;
}

export interface MPConfirmarPagoResult {
  aprobado: boolean;
  monto: number;
  /** payment_id de MP. */
  paymentId: string | null;
  raw: Record<string, unknown>;
}

export abstract class MercadoPagoProvider {
  abstract get nombre(): 'MOCK' | 'MERCADOPAGO';
  abstract iniciarPago(args: MPIniciarPagoArgs): Promise<MPIniciarPagoResult>;
  abstract confirmarPago(preferenceId: string): Promise<MPConfirmarPagoResult>;
}

@Injectable()
export class MercadoPagoMockProvider extends MercadoPagoProvider {
  private readonly log = new Logger(MercadoPagoMockProvider.name);

  get nombre(): 'MOCK' {
    return 'MOCK';
  }

  async iniciarPago(args: MPIniciarPagoArgs): Promise<MPIniciarPagoResult> {
    const preferenceId = `MP-MOCK-${randomBytes(12).toString('base64url')}`;
    const initPoint = `${args.urlRetornoExito}?preference_id=${encodeURIComponent(
      preferenceId,
    )}&status=approved&monto=${args.monto}`;
    this.log.log(
      `[MP-MOCK] iniciarPago ordenCompra=${args.ordenCompra} monto=${args.monto} → pref=${preferenceId.slice(0, 24)}…`,
    );
    return {
      preferenceId,
      initPoint,
      raw: {
        mode: 'mock',
        ordenCompra: args.ordenCompra,
        descripcion: args.descripcion,
        creadoAt: new Date().toISOString(),
      },
    };
  }

  async confirmarPago(preferenceId: string): Promise<MPConfirmarPagoResult> {
    if (!preferenceId.startsWith('MP-MOCK-')) {
      throw new Error(`PreferenceId MOCK inválido: ${preferenceId.slice(0, 24)}…`);
    }
    const denegado = preferenceId.includes('-DENY');
    this.log.log(
      `[MP-MOCK] confirmarPago pref=${preferenceId.slice(0, 24)}… → ${denegado ? 'RECHAZADO' : 'APROBADO'}`,
    );
    return {
      aprobado: !denegado,
      monto: 0,
      paymentId: denegado ? null : `MP-PAY-${Math.floor(Math.random() * 1_000_000_000)}`,
      raw: {
        mode: 'mock',
        preferenceId,
        confirmadoAt: new Date().toISOString(),
        status: denegado ? 'rejected' : 'approved',
      },
    };
  }
}

/**
 * Stub para la integración real. Cuando lleguen las credenciales del
 * cliente, instalar `pnpm add mercadopago -F @fixtura/api` y conectar
 * el SDK contra `MercadoPagoConfig + Preference` y el endpoint de
 * notifications webhook (separado, no este provider).
 */
@Injectable()
export class MercadoPagoRealProvider extends MercadoPagoProvider {
  get nombre(): 'MERCADOPAGO' {
    return 'MERCADOPAGO';
  }

  async iniciarPago(_args: MPIniciarPagoArgs): Promise<MPIniciarPagoResult> {
    throw new Error(
      'MercadoPagoRealProvider no implementado. Setear MERCADOPAGO_MODE=mock o completar la integración SDK.',
    );
  }

  async confirmarPago(_preferenceId: string): Promise<MPConfirmarPagoResult> {
    throw new Error(
      'MercadoPagoRealProvider no implementado. Setear MERCADOPAGO_MODE=mock o completar la integración SDK.',
    );
  }
}

export const MERCADOPAGO_PROVIDER = Symbol('MERCADOPAGO_PROVIDER');
