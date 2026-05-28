import { Injectable, Logger } from '@nestjs/common';

/**
 * Provider abstracto de push notifications.
 *
 *   - MockProvider: log-only. Útil para dev y para tests sin
 *     credenciales reales.
 *   - FCMProvider / WebPushProvider (stubs): cuando estén las credenciales
 *     (FIREBASE_SERVICE_ACCOUNT o VAPID keys) se implementan.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Path relativo del frontend al que ir si el user hace click. */
  url?: string;
  /** Tag para que el browser colapse notifs del mismo evento. */
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionLike {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  provider: 'MOCK' | 'FCM' | 'WEBPUSH';
}

export interface PushResult {
  enviado: boolean;
  /** True si el endpoint quedó inválido y hay que revocarlo. */
  endpointInvalido: boolean;
  error?: string;
}

export abstract class PushProvider {
  abstract get nombre(): 'MOCK' | 'FCM' | 'WEBPUSH';
  abstract enviar(
    sub: PushSubscriptionLike,
    payload: PushPayload,
  ): Promise<PushResult>;
}

@Injectable()
export class PushMockProvider extends PushProvider {
  private readonly log = new Logger(PushMockProvider.name);

  get nombre(): 'MOCK' {
    return 'MOCK';
  }

  async enviar(
    sub: PushSubscriptionLike,
    payload: PushPayload,
  ): Promise<PushResult> {
    this.log.log(
      `[MOCK push] endpoint=${sub.endpoint.slice(0, 30)}… title="${payload.title}" body="${payload.body.slice(0, 40)}"`,
    );
    return { enviado: true, endpointInvalido: false };
  }
}

/**
 * Stub para Firebase Cloud Messaging. Cuando se agreguen credenciales:
 *   1. pnpm add firebase-admin -F @fixtura/api
 *   2. Iniciar admin SDK con FIREBASE_SERVICE_ACCOUNT (JSON base64 env).
 *   3. Implementar enviar() con messaging().send().
 */
@Injectable()
export class PushFCMProvider extends PushProvider {
  get nombre(): 'FCM' {
    return 'FCM';
  }

  async enviar(
    _sub: PushSubscriptionLike,
    _payload: PushPayload,
  ): Promise<PushResult> {
    throw new Error(
      'PushFCMProvider no implementado. Setear PUSH_MODE=mock o completar integración FCM.',
    );
  }
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
