import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { Designacion } from '../../competition/entities/designacion.entity';
import { EmailService } from '../../email/email.service';

const ROL_LABEL: Record<string, string> = {
  ARBITRO_PRINCIPAL: 'Árbitro principal',
  ARBITRO_ASISTENTE: 'Árbitro asistente',
  PLANILLERO: 'Planillero',
  PARAMEDICO: 'Paramédico',
  OTRO: 'Otro',
};

export interface DesignacionEmailPayload {
  designacion: Designacion;
  personalNombre: string;
  personalApellido: string;
  personalEmail: string;
  equipoLocalNombre: string;
  equipoVisitaNombre: string;
  fechaHora: Date | null;
  canchaNombre: string | null;
  torneoNombre: string;
}

/** Payload del token firmado que viaja en el email. */
export interface RespuestaTokenPayload {
  type: 'designacion_response';
  designacionId: string;
  accion: 'CONFIRMAR' | 'RECHAZAR';
  tenantId: string;
}

@Injectable()
export class DesignacionesEmailService {
  private readonly log = new Logger(DesignacionesEmailService.name);

  constructor(
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Firma un token corto que codifica una acción específica
   * (CONFIRMAR/RECHAZAR) sobre una designación. El JWT_SECRET es el
   * mismo que para autenticación, pero el campo `type` distingue el
   * propósito y debe validarse en el endpoint.
   */
  signToken(payload: RespuestaTokenPayload): string {
    return this.jwt.sign(payload, { expiresIn: '7d' });
  }

  /**
   * Valida un token de respuesta. Devuelve el payload si es válido,
   * null si no.
   */
  verifyToken(token: string): RespuestaTokenPayload | null {
    try {
      const decoded = this.jwt.verify<RespuestaTokenPayload>(token);
      if (decoded.type !== 'designacion_response') return null;
      if (!decoded.designacionId || !decoded.tenantId) return null;
      if (decoded.accion !== 'CONFIRMAR' && decoded.accion !== 'RECHAZAR') {
        return null;
      }
      return decoded;
    } catch (err) {
      this.log.debug(`Token inválido: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Envía el email de notificación de designación. Best-effort:
   * cualquier error se loggea pero no propaga al caller.
   */
  async notificarAsignacion(input: DesignacionEmailPayload): Promise<void> {
    if (!input.personalEmail) {
      this.log.log(
        `Designación ${input.designacion.id}: personal sin email, no se envía notificación`,
      );
      return;
    }

    const tokenConfirmar = this.signToken({
      type: 'designacion_response',
      designacionId: input.designacion.id,
      accion: 'CONFIRMAR',
      tenantId: input.designacion.tenantId,
    });
    const tokenRechazar = this.signToken({
      type: 'designacion_response',
      designacionId: input.designacion.id,
      accion: 'RECHAZAR',
      tenantId: input.designacion.tenantId,
    });

    const frontUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const linkConfirmar = `${frontUrl}/designaciones/respuesta?token=${tokenConfirmar}`;
    const linkRechazar = `${frontUrl}/designaciones/respuesta?token=${tokenRechazar}`;

    const rol = ROL_LABEL[input.designacion.rolAsignado] ?? input.designacion.rolAsignado;
    const cuandoStr = input.fechaHora
      ? new Date(input.fechaHora).toLocaleString('es-CL', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Fecha y hora por confirmar';
    const dondeStr = input.canchaNombre ?? 'Cancha por confirmar';
    const montoStr =
      input.designacion.montoPago != null
        ? `$${input.designacion.montoPago.toLocaleString('es-CL')} CLP`
        : 'Por confirmar';

    // Escape HTML básico para los valores que vienen de la DB (nombre del
    // equipo, cancha, etc.) — defensa contra XSS en plantilla aunque el
    // contenido sea inerte para la mayoría de clientes de email.
    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safe = {
      nombre: esc(input.personalNombre),
      rol: esc(rol),
      local: esc(input.equipoLocalNombre),
      visita: esc(input.equipoVisitaNombre),
      cuando: esc(cuandoStr),
      donde: esc(dondeStr),
      monto: esc(montoStr),
      torneo: esc(input.torneoNombre),
    };

    const subject = `Designación ${rol} — ${input.equipoLocalNombre} vs ${input.equipoVisitaNombre}`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><title>${subject}</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f1ece2; padding:24px; margin:0;">
        <div style="max-width:560px; margin:0 auto; background:white; border-radius:8px; padding:32px; border:1px solid #e5e0d3;">
          <div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#0F2A1F; font-weight:bold; margin-bottom:8px;">→ ${safe.torneo.toUpperCase()}</div>
          <h1 style="margin:0 0 16px 0; font-size:24px; color:#0F2A1F; line-height:1.2;">Hola ${safe.nombre},<br>te designamos para un partido</h1>

          <p style="color:#1a1a1a; line-height:1.5;">
            <strong>Rol:</strong> ${safe.rol}<br>
            <strong>Partido:</strong> ${safe.local} vs ${safe.visita}<br>
            <strong>Cuándo:</strong> ${safe.cuando}<br>
            <strong>Dónde:</strong> ${safe.donde}<br>
            <strong>Honorario:</strong> ${safe.monto}
          </p>

          <div style="margin:24px 0; padding:16px; background:#f1ece2; border-radius:6px;">
            <p style="margin:0 0 12px 0; font-size:14px; color:#1a1a1a;">¿Podés cubrirlo?</p>
            <a href="${linkConfirmar}" style="display:inline-block; background:#E76F26; color:white; padding:10px 20px; text-decoration:none; border-radius:6px; font-weight:bold; margin-right:8px;">✓ Confirmar</a>
            <a href="${linkRechazar}" style="display:inline-block; background:transparent; color:#1a1a1a; padding:10px 20px; text-decoration:none; border-radius:6px; border:1px solid #1a1a1a; font-weight:bold;">✗ No puedo</a>
          </div>

          <p style="font-size:12px; color:#777; line-height:1.4;">
            Estos enlaces expiran en 7 días. Si no podés decidir ahora, contestá este mail
            directamente y el responsable de designaciones lo gestiona a mano.
          </p>
          <hr style="margin:24px 0; border:0; border-top:1px solid #e5e0d3;">
          <p style="font-size:11px; color:#777; margin:0;">
            Notificación automática de Fixtura. No respondas a esta dirección — el remitente
            es solo de envío. Para hablar con la liga, llamá o escribí al responsable directo.
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `Hola ${input.personalNombre},

Te designamos para un partido:

Torneo: ${input.torneoNombre}
Rol: ${rol}
Partido: ${input.equipoLocalNombre} vs ${input.equipoVisitaNombre}
Cuándo: ${cuandoStr}
Dónde: ${dondeStr}
Honorario: ${montoStr}

¿Podés cubrirlo?

Confirmar:  ${linkConfirmar}
No puedo:   ${linkRechazar}

(Los enlaces expiran en 7 días.)
`;

    await this.email.send({
      to: input.personalEmail,
      subject,
      html,
      text,
    });
  }
}
