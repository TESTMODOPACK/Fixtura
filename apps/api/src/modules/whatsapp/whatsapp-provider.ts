import { Injectable, Logger } from '@nestjs/common';

/**
 * Sprint 17 — RF-04b extendido: WhatsApp como canal de invitación.
 *
 * Mismo patrón mock-first que WebpayProvider y SIIProvider. El módulo
 * elige la impl en runtime según WHATSAPP_PROVIDER (MOCK | TWILIO | META).
 *
 * En MOCK el "envío" solo loggea — útil para dev local y CI sin tener
 * que aprobar templates de Meta o pagar Twilio.
 *
 * Para producción real: ambas impls requieren:
 *   - Cuenta WhatsApp Business asociada a número aprobado.
 *   - Template HSM aprobado por Meta con placeholders.
 *   - ENV vars del provider (claves API, account SID, etc.).
 *
 * Decisión P-09 (Twilio vs Meta Cloud API) sigue pendiente.
 * Implementamos los stubs de los dos para no bloquearnos.
 */

export interface EnviarTemplateArgs {
  /** Número en formato E.164: +56912345678. El provider valida formato. */
  telefono: string;
  /** Nombre del template aprobado en WhatsApp Business. */
  template: string;
  /** Variables del template, en orden. */
  variables: string[];
  /** Idioma del template (es, es_CL, en_US, etc.). */
  idioma?: string;
}

export interface EnviarTemplateResult {
  enviado: boolean;
  /** ID del mensaje en el provider — para reconciliación de webhooks. */
  messageId: string | null;
  /** Raw payload del provider, para audit log. */
  raw: Record<string, unknown>;
}

export abstract class WhatsAppProvider {
  abstract get nombre(): 'MOCK' | 'TWILIO' | 'META';
  abstract enviarTemplate(args: EnviarTemplateArgs): Promise<EnviarTemplateResult>;
}

/**
 * Provider MOCK: loggea el envío y devuelve un messageId fake.
 *
 * Útil para:
 *   - Dev local sin cuenta Twilio/Meta.
 *   - CI / tests automatizados.
 *   - Demos a clientes antes de tener el template aprobado.
 *
 * Las variables se renderizan en el log para que el dev pueda copiar
 * el link de activación que iría en el mensaje real.
 */
@Injectable()
export class WhatsAppMockProvider extends WhatsAppProvider {
  private readonly log = new Logger(WhatsAppMockProvider.name);

  get nombre(): 'MOCK' {
    return 'MOCK';
  }

  async enviarTemplate(args: EnviarTemplateArgs): Promise<EnviarTemplateResult> {
    const messageId = `MOCK-WA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const renderizado = args.variables.reduce(
      (acc, v, i) => acc.replace(`{{${i + 1}}}`, v),
      args.template,
    );
    this.log.log(
      `[MOCK] WhatsApp → ${args.telefono} (template=${args.template}, idioma=${args.idioma ?? 'es'}) ` +
        `messageId=${messageId}\n        Mensaje renderizado (mock): ${renderizado}`,
    );
    return {
      enviado: true,
      messageId,
      raw: {
        provider: 'mock',
        telefono: args.telefono,
        template: args.template,
        variables: args.variables,
        idioma: args.idioma ?? 'es',
        renderizado,
        enviadoAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Provider Twilio WhatsApp Business API.
 *
 * Setup en prod:
 *   1. Cuenta Twilio + número WhatsApp Business aprobado.
 *   2. ENV: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.
 *   3. Templates aprobados con `Content-Sid` (Twilio gestiona en su UI).
 *   4. pnpm add twilio -F @fixtura/api
 *
 * Por ahora lanza error explícito si se intenta usar — el factory en
 * WhatsAppModule elige el provider basado en WHATSAPP_PROVIDER.
 */
@Injectable()
export class WhatsAppTwilioProvider extends WhatsAppProvider {
  get nombre(): 'TWILIO' {
    return 'TWILIO';
  }

  async enviarTemplate(_args: EnviarTemplateArgs): Promise<EnviarTemplateResult> {
    throw new Error(
      'WhatsAppTwilioProvider no implementado. Instalar twilio SDK + setear ' +
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM en .env. ' +
        'Mientras: usar WHATSAPP_PROVIDER=MOCK.',
    );
  }
}

/**
 * Provider Meta Cloud API directo (sin Twilio intermediario).
 *
 * Setup en prod:
 *   1. Meta Business Manager + WhatsApp Business Account.
 *   2. Phone Number ID asociado al número aprobado.
 *   3. System User Token con permisos de mensajería.
 *   4. ENV: META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN,
 *      META_WHATSAPP_API_VERSION (default v21.0).
 *   5. Templates aprobados en la consola Meta (con sus placeholders {{1}}…).
 *
 * Usa fetch nativo de Node — no requiere SDK.
 *
 * Errores (config faltante, red, respuesta no-2xx) NO lanzan: devuelven
 * `enviado: false` con el detalle en `raw` y un warn al log, para que el flujo
 * de invitación pueda reportar "no enviado" sin romper el request.
 */
@Injectable()
export class WhatsAppMetaProvider extends WhatsAppProvider {
  private readonly log = new Logger(WhatsAppMetaProvider.name);
  /** Cómo nos abandona Meta si tardamos: cortamos la espera en 10s. */
  private static readonly TIMEOUT_MS = 10_000;

  get nombre(): 'META' {
    return 'META';
  }

  async enviarTemplate(args: EnviarTemplateArgs): Promise<EnviarTemplateResult> {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.META_WHATSAPP_TOKEN;
    const apiVersion = process.env.META_WHATSAPP_API_VERSION ?? 'v21.0';

    if (!phoneNumberId || !token) {
      this.log.warn(
        'META_WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_TOKEN no configurados — ' +
          'no se envía (usar WHATSAPP_PROVIDER=MOCK en dev).',
      );
      return {
        enviado: false,
        messageId: null,
        raw: { provider: 'meta', error: 'config_missing' },
      };
    }

    // Meta espera el número en formato internacional sin símbolos (E.164 sin
    // el '+'): +56912345678 → 56912345678.
    const to = args.telefono.replace(/[^\d]/g, '');

    // El template puede no tener variables → omitir el componente body.
    const components =
      args.variables.length > 0
        ? [
            {
              type: 'body',
              parameters: args.variables.map((v) => ({ type: 'text', text: v })),
            },
          ]
        : undefined;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: args.template,
        language: { code: args.idioma ?? 'es' },
        ...(components ? { components } : {}),
      },
    };

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      WhatsAppMetaProvider.TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const err = (json.error ?? {}) as { message?: string; code?: number };
        this.log.warn(
          `[META] WhatsApp → ${to} (template=${args.template}) falló: ` +
            `${res.status} ${err.message ?? 'error desconocido'} (code=${err.code ?? '?'})`,
        );
        return { enviado: false, messageId: null, raw: { provider: 'meta', status: res.status, ...json } };
      }

      const messages = json.messages as Array<{ id?: string }> | undefined;
      const messageId = messages?.[0]?.id ?? null;
      this.log.log(
        `[META] WhatsApp → ${to} (template=${args.template}) enviado messageId=${messageId}`,
      );
      return { enviado: true, messageId, raw: { provider: 'meta', ...json } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = err instanceof Error && err.name === 'AbortError';
      this.log.warn(
        `[META] WhatsApp → ${to} (template=${args.template}) error de red: ` +
          (aborted ? `timeout (${WhatsAppMetaProvider.TIMEOUT_MS}ms)` : msg),
      );
      return {
        enviado: false,
        messageId: null,
        raw: { provider: 'meta', error: aborted ? 'timeout' : msg },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
