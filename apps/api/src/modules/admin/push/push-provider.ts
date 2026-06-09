import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';

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

/**
 * Web Push real (VAPID). Se activa con PUSH_MODE=webpush + las claves
 * VAPID en el entorno. Si faltan las claves, el módulo cae a MOCK.
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generar con `web-push generate-vapid-keys`)
 *   - VAPID_SUBJECT (mailto:... o https://...)
 */
@Injectable()
export class PushWebPushProvider extends PushProvider {
  private readonly log = new Logger(PushWebPushProvider.name);

  constructor() {
    super();
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:tech@fixtura.cl';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
    } else {
      this.log.warn(
        'PUSH_MODE=webpush pero faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — los envíos fallarán.',
      );
    }
  }

  get nombre(): 'WEBPUSH' {
    return 'WEBPUSH';
  }

  async enviar(sub: PushSubscriptionLike, payload: PushPayload): Promise<PushResult> {
    if (!sub.p256dh || !sub.auth) {
      return { enviado: false, endpointInvalido: false, error: 'Faltan claves p256dh/auth' };
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      return { enviado: true, endpointInvalido: false };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 → la suscripción ya no existe (browser la borró) → revocar.
      const invalido = status === 404 || status === 410;
      return {
        enviado: false,
        endpointInvalido: invalido,
        error: (err as Error).message,
      };
    }
  }
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
