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
 *   4. ENV: META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN, META_WHATSAPP_API_VERSION (v18.0).
 *   5. Templates aprobados en la consola Meta.
 *
 * Usa fetch nativo de Node 22 — no requiere SDK.
 */
@Injectable()
export class WhatsAppMetaProvider extends WhatsAppProvider {
  get nombre(): 'META' {
    return 'META';
  }

  async enviarTemplate(_args: EnviarTemplateArgs): Promise<EnviarTemplateResult> {
    throw new Error(
      'WhatsAppMetaProvider no implementado. Setear META_WHATSAPP_PHONE_NUMBER_ID + ' +
        'META_WHATSAPP_TOKEN en .env y descomentar la llamada a la Graph API. ' +
        'Mientras: usar WHATSAPP_PROVIDER=MOCK.',
    );
  }
}
