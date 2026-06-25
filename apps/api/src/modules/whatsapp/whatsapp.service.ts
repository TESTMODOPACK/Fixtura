import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { descifrarSecreto } from '../../common/crypto/secret-box';
import { Tenant } from '../tenants/entities/tenant.entity';
import { MetaWhatsAppCreds, WhatsAppProvider } from './whatsapp-provider';

/**
 * Service de alto nivel para envíos de WhatsApp.
 *
 * Encapsula la creación del template específico para invitaciones de
 * personal (RF-04b). Si más adelante hay otros casos de uso (designación
 * confirmar/rechazar vía WhatsApp, recordatorios morosidad, etc.), se
 * agregan métodos públicos aquí y el provider queda inalterado.
 *
 * BYO por liga: cuando el provider activo es META, las credenciales se
 * resuelven por tenant desde su config cifrada (Ajustes → WhatsApp). En MOCK
 * (dev/CI) no se resuelve nada.
 */
@Injectable()
export class WhatsAppService {
  private readonly log = new Logger(WhatsAppService.name);

  /** Nombre del template de invitación en WhatsApp Business. */
  private static readonly TEMPLATE_INVITACION_PERSONAL = 'fixtura_invitacion_personal';

  constructor(
    private readonly provider: WhatsAppProvider,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

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
   * Resuelve las credenciales Meta de la liga (BYO). Devuelve null si la liga
   * no tiene WhatsApp activo o le faltan datos (phoneNumberId / token).
   */
  private async resolverCredsMeta(tenantId: string): Promise<MetaWhatsAppCreds | null> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t || !t.whatsappTokenEnc) return null;
    const cfg = (t.whatsappConfig ?? {}) as {
      activo?: boolean;
      phoneNumberId?: string;
      apiVersion?: string;
    };
    if (!cfg.activo || !cfg.phoneNumberId) return null;
    const token = descifrarSecreto(t.whatsappTokenEnc);
    if (!token) return null;
    return {
      phoneNumberId: cfg.phoneNumberId,
      token,
      apiVersion: cfg.apiVersion,
    };
  }

  /**
   * Envía la invitación de personal. Si el número no es válido o la liga no
   * tiene WhatsApp configurado, retorna `enviado: false` y un error legible —
   * NO tira excepción. El caller decide si fallar o solo emitir warning según
   * el canal solicitado.
   */
  async enviarInvitacionPersonal(args: {
    tenantId: string;
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

    // BYO: si el provider real es META, resolvemos las credenciales de la liga.
    // Mock no necesita credenciales.
    let meta: MetaWhatsAppCreds | undefined;
    if (this.provider.nombre === 'META') {
      const creds = await this.resolverCredsMeta(args.tenantId);
      if (!creds) {
        return {
          enviado: false,
          error:
            'WhatsApp no está configurado para esta liga. Cárgalo en Ajustes → WhatsApp.',
          messageId: null,
        };
      }
      meta = creds;
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
        meta,
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
