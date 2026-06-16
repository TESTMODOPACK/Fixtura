import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * Provider real de Flow (https://www.flow.cl). A diferencia de Webpay, las
 * credenciales son POR LIGA: cada tenant guarda su apiKey/secretKey cifradas
 * (ver common/crypto/secret-box) y se pasan en cada llamada — el provider
 * no tiene estado de credenciales.
 *
 * El entorno (sandbox vs producción) es global de la plataforma vía
 * `FLOW_MODE`: durante testing se usa sandbox para todas las ligas; al
 * salir a producción se cambia a 'production'. Las credenciales de cada
 * liga deben corresponder al entorno activo.
 *
 * Firma: Flow exige firmar los parámetros con HMAC-SHA256 usando el
 * secretKey. El string a firmar es la concatenación de `nombre+valor` de
 * cada parámetro ordenado alfabéticamente por nombre (sin separadores).
 */
export interface FlowCredenciales {
  apiKey: string;
  secretKey: string;
}

export interface FlowCrearArgs {
  /** Monto en CLP (entero, sin decimales). */
  monto: number;
  /** Orden de comercio único nuestro (lo usamos para trazar la transacción). */
  comercioOrden: string;
  asunto: string;
  /** Email del pagador — Flow le manda el comprobante. */
  email: string;
  /** Webhook server-to-server donde Flow confirma el pago. */
  urlConfirmation: string;
  /** URL del navegador a la que Flow devuelve al pagador. */
  urlRetorno: string;
}

export interface FlowCrearResult {
  token: string;
  /** URL completa a la que redirigir al pagador (ya incluye ?token=). */
  url: string;
  flowOrder: number | null;
  raw: Record<string, unknown>;
}

export type FlowEstadoNorm = 'APROBADO' | 'RECHAZADO' | 'PENDIENTE';

export interface FlowEstadoResult {
  estado: FlowEstadoNorm;
  monto: number;
  raw: Record<string, unknown>;
}

interface FlowCreateResponse {
  url?: string;
  token?: string;
  flowOrder?: number;
  code?: number;
  message?: string;
}

interface FlowStatusResponse {
  status?: number;
  amount?: number | string;
  commerceOrder?: string;
  code?: number;
  message?: string;
}

@Injectable()
export class FlowProvider {
  private readonly log = new Logger(FlowProvider.name);
  private static readonly TIMEOUT_MS = 12_000;

  /** ¿La plataforma está en modo sandbox? (para exponerlo en la UI/logs). */
  get sandbox(): boolean {
    return (process.env.FLOW_MODE ?? 'sandbox').toLowerCase() !== 'production';
  }

  private baseUrl(): string {
    return this.sandbox ? 'https://sandbox.flow.cl/api' : 'https://www.flow.cl/api';
  }

  private firmar(params: Record<string, string>, secretKey: string): string {
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k] ?? ''}`)
      .join('');
    return createHmac('sha256', secretKey).update(toSign, 'utf8').digest('hex');
  }

  private async pedir<T>(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; body: T }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FlowProvider.TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let body: unknown = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      return { status: res.status, body: body as T };
    } finally {
      clearTimeout(timer);
    }
  }

  async crearPago(
    creds: FlowCredenciales,
    args: FlowCrearArgs,
  ): Promise<FlowCrearResult> {
    const params: Record<string, string> = {
      apiKey: creds.apiKey,
      commerceOrder: args.comercioOrden,
      subject: args.asunto.slice(0, 255),
      currency: 'CLP',
      amount: String(Math.round(args.monto)),
      email: args.email,
      urlConfirmation: args.urlConfirmation,
      urlReturn: args.urlRetorno,
    };
    params.s = this.firmar(params, creds.secretKey);

    const { status, body } = await this.pedir<FlowCreateResponse>(
      `${this.baseUrl()}/payment/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      },
    );

    if (status < 200 || status >= 300 || !body.url || !body.token) {
      throw new Error(
        `Flow payment/create falló (HTTP ${status}): ${body.message ?? 'sin detalle'}`,
      );
    }

    const token = String(body.token);
    return {
      token,
      url: `${body.url}?token=${encodeURIComponent(token)}`,
      flowOrder: typeof body.flowOrder === 'number' ? body.flowOrder : null,
      raw: body as unknown as Record<string, unknown>,
    };
  }

  async obtenerEstado(
    creds: FlowCredenciales,
    token: string,
  ): Promise<FlowEstadoResult> {
    const params: Record<string, string> = { apiKey: creds.apiKey, token };
    params.s = this.firmar(params, creds.secretKey);
    const qs = new URLSearchParams(params).toString();

    const { status, body } = await this.pedir<FlowStatusResponse>(
      `${this.baseUrl()}/payment/getStatus?${qs}`,
      { method: 'GET' },
    );

    if (status < 200 || status >= 300) {
      throw new Error(
        `Flow getStatus falló (HTTP ${status}): ${body.message ?? 'sin detalle'}`,
      );
    }

    // Flow status: 1=pendiente, 2=pagada, 3=rechazada, 4=anulada.
    const st = Number(body.status);
    const estado: FlowEstadoNorm =
      st === 2 ? 'APROBADO' : st === 3 || st === 4 ? 'RECHAZADO' : 'PENDIENTE';
    return {
      estado,
      monto: Number(body.amount ?? 0),
      raw: body as unknown as Record<string, unknown>,
    };
  }
}
