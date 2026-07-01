import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

/**
 * Servicio de envío de email transaccional.
 *
 * Modos:
 *   - Producción: usa Resend si RESEND_API_KEY está definida.
 *   - Dev sin API key: solo loggea — útil para testear flows sin
 *     mandar correos reales. NO falla.
 *
 * Best-effort: si el envío real falla (red, rate limit, etc.),
 * loggea WARN pero no propaga la excepción. El caller decide si
 * eso es bloqueante o no.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromAddress =
      process.env.EMAIL_FROM ?? 'LigaPlus <onboarding@resend.dev>';

    if (apiKey && apiKey.trim().length > 0) {
      this.resend = new Resend(apiKey);
      this.log.log(`Email service ready (Resend, from="${this.fromAddress}")`);
    } else {
      this.log.warn(
        'RESEND_API_KEY no configurada — el envío de email caerá en modo log-only.',
      );
    }
  }

  /**
   * Envía email a un destinatario. Devuelve true si llegó al provider,
   * false si quedó en modo log-only o si el provider falló.
   *
   * Nunca propaga excepción — los emails no deben bloquear lógica de
   * negocio (al asignar una designación, falla del email no impide
   * que la designación quede persistida).
   */
  async send(opts: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    // Adjuntos (ej. el flyer semanal en PDF). content es el binario ya
    // en memoria; Resend lo acepta como Buffer.
    attachments?: Array<{ filename: string; content: Buffer }>;
  }): Promise<boolean> {
    if (!this.resend) {
      this.log.log(
        `[log-only] to=${opts.to} subject="${opts.subject}"${
          opts.attachments?.length ? ` (+${opts.attachments.length} adjunto/s)` : ''
        } — set RESEND_API_KEY para enviar real`,
      );
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        attachments: opts.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      });
      if (error) {
        this.log.warn(`Resend error to=${opts.to}: ${error.message}`);
        return false;
      }
      this.log.log(`Email enviado id=${data?.id} to=${opts.to}`);
      return true;
    } catch (err) {
      const e = err as Error;
      this.log.warn(`Excepción al enviar email to=${opts.to}: ${e.message}`);
      return false;
    }
  }
}
