import { Injectable, Logger } from '@nestjs/common';

import { WhatsAppProvider } from './whatsapp-provider';

/**
 * Service de alto nivel para envíos de WhatsApp.
 *
 * Encapsula la creación del template específico para invitaciones de
 * personal (RF-04b). Si más adelante hay otros casos de uso (designación
 * confirmar/rechazar vía WhatsApp, recordatorios morosidad, etc.), se
 * agregan métodos públicos acá y el provider queda inalterado.
 */
@Injectable()
export class WhatsAppService {
  private readonly log = new Logger(WhatsAppService.name);

  /** Nombre del template de invitación en WhatsApp Business. */
  private static readonly TEMPLATE_INVITACION_PERSONAL = 'fixtura_invitacion_personal';

  constructor(private readonly provider: WhatsAppProvider) {}

  /**
   * Normaliza teléfono chileno a E.164. Acepta variaciones comunes:
   *   "+56912345678", "56912345678", "912345678", "9 1234 5678".
   *
   * No valida que el número esté activo — eso lo rechaza el provider
   * en el envío y queda capturado en el log de error.
   */
  normalizarTelefono(telefono: string): string | null {
    const limpio = telefono.replace(/[^\d+]/g, '');
    if (!limpio) return null;
    if (limpio.startsWith('+')) return limpio;
    if (limpio.startsWith('56')) return `+${limpio}`;
    // Si arranca con 9 y tiene 9 dígitos → móvil chileno sin código país.
    if (limpio.startsWith('9') && limpio.length === 9) return `+56${limpio}`;
    return null;
  }

  /**
   * Envía la invitación de personal. Si el número no es válido, retorna
   * `enviado: false` y un error legible — NO tira excepción. El caller
   * decide si fallar o solo emitir warning según el canal solicitado.
   */
  async enviarInvitacionPersonal(args: {
    telefono: string;
    nombre: string;
    tenantName: string;
    rol: string;
    link: string;
  }): Promise<{ enviado: boolean; error: string | null; messageId: string | null }> {
    const telE164 = this.normalizarTelefono(args.telefono);
    if (!telE164) {
      const err = `Teléfono inválido: "${args.telefono}". Esperado formato chileno (+56912345678 o 912345678).`;
      this.log.warn(err);
      return { enviado: false, error: err, messageId: null };
    }

    try {
      const result = await this.provider.enviarTemplate({
        telefono: telE164,
        template: WhatsAppService.TEMPLATE_INVITACION_PERSONAL,
        idioma: 'es',
        // Orden definido por el template aprobado:
        //   1: nombre del invitado
        //   2: nombre de la liga
        //   3: rol que se le asigna
        //   4: link de activación
        variables: [args.nombre, args.tenantName, args.rol, args.link],
      });
      return {
        enviado: result.enviado,
        error: result.enviado ? null : 'El provider respondió enviado=false sin error explícito.',
        messageId: result.messageId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Error enviando WhatsApp a ${telE164}: ${msg}`);
      return { enviado: false, error: msg, messageId: null };
    }
  }
}
