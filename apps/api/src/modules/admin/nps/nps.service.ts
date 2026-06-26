import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  type DispararNpsResultado,
  type EncuestaNpsInfo,
  type NpsResumenAdmin,
  ResponderNpsSchema,
} from '@fixtura/types';

import { Club } from '../../competition/entities/club.entity';
import { EncuestaNps } from '../../competition/entities/encuesta-nps.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { EmailService } from '../../email/email.service';

/** Payload del token firmado que viaja en el link del email. */
interface NpsTokenPayload {
  type: 'nps_response';
  encuestaId: string;
  tenantId: string;
}

/**
 * NPS (módulo M5, etapa 2). El admin dispara una encuesta por (torneo, club);
 * el delegado del club la responde desde un link con token firmado, sin login.
 *
 * El endpoint público re-setea el contexto RLS desde el tenantId del token
 * (firmado, no falsificable) antes de leer/escribir — mismo patrón que la
 * respuesta de designaciones.
 */
@Injectable()
export class NpsService {
  private readonly log = new Logger(NpsService.name);

  constructor(
    @InjectRepository(EncuestaNps) private readonly repo: Repository<EncuestaNps>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscripcionRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ── Token ────────────────────────────────────────────────────────────

  private signToken(payload: NpsTokenPayload): string {
    return this.jwt.sign(payload, { expiresIn: '30d' });
  }

  private verifyToken(token: string): NpsTokenPayload | null {
    try {
      const decoded = this.jwt.verify<NpsTokenPayload>(token);
      if (decoded.type !== 'nps_response') return null;
      if (!decoded.encuestaId || !decoded.tenantId) return null;
      return decoded;
    } catch (err) {
      this.log.debug(`Token NPS inválido: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Disparo (admin) ──────────────────────────────────────────────────

  /** Email de contacto del club: presidente de la directiva, o primer delegado con email. */
  private emailDelClub(club: Club): string | null {
    if (club.presidenteEmail && club.presidenteEmail.trim()) {
      return club.presidenteEmail.trim();
    }
    const delegado = (club.delegados ?? []).find((d) => d.email && d.email.trim());
    return delegado?.email?.trim() ?? null;
  }

  async dispararPorTorneo(tenantId: string, torneoId: string): Promise<DispararNpsResultado> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException('Torneo no encontrado.');

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const liga = tenant?.nombre ?? 'la liga';

    const inscripciones = await this.inscripcionRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true },
    });

    // Un club puede inscribirse en varias categorías del torneo; lo encuestamos
    // una sola vez.
    const clubesUnicos = new Map<string, Club>();
    for (const ins of inscripciones) {
      if (ins.club && !clubesUnicos.has(ins.clubId)) {
        clubesUnicos.set(ins.clubId, ins.club);
      }
    }

    let enviadas = 0;
    let sinEmail = 0;
    let yaEnviadas = 0;

    for (const [clubId, club] of clubesUnicos) {
      try {
        const existente = await this.repo.findOne({ where: { tenantId, torneoId, clubId } });
        if (existente) {
          yaEnviadas += 1;
          continue;
        }

        const email = this.emailDelClub(club);
        if (!email) {
          sinEmail += 1;
          continue;
        }

        let encuesta = this.repo.create({
          tenantId,
          torneoId,
          clubId,
          emailDestino: email,
          token: '',
          estado: 'PENDIENTE',
        });
        encuesta = await this.repo.save(encuesta);

        const token = this.signToken({ type: 'nps_response', encuestaId: encuesta.id, tenantId });
        encuesta.token = token;
        encuesta.enviadaAt = new Date();
        await this.repo.save(encuesta);

        await this.enviarEmail(email, liga, club.nombre, torneo.nombre, token);
        enviadas += 1;
      } catch (err) {
        this.log.warn(`NPS torneo ${torneoId} club ${clubId}: ${(err as Error).message}`);
      }
    }

    return { enviadas, sinEmail, yaEnviadas };
  }

  private async enviarEmail(
    to: string,
    liga: string,
    club: string,
    torneo: string,
    token: string,
  ): Promise<void> {
    const frontUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const link = `${frontUrl}/nps/responder?token=${token}`;

    const esc = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safe = { liga: esc(liga), club: esc(club), torneo: esc(torneo) };

    const subject = `¿Cómo viviste ${torneo}? — Tu opinión cuenta`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><title>${esc(subject)}</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f1ece2; padding:24px; margin:0;">
        <div style="max-width:560px; margin:0 auto; background:white; border-radius:8px; padding:32px; border:1px solid #e5e0d3;">
          <div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#0F2A1F; font-weight:bold; margin-bottom:8px;">→ ${safe.torneo.toUpperCase()}</div>
          <h1 style="margin:0 0 16px 0; font-size:24px; color:#0F2A1F; line-height:1.2;">${safe.club},<br>¿cómo viviste el torneo?</h1>

          <p style="color:#1a1a1a; line-height:1.5;">
            En ${safe.liga} queremos mejorar cada temporada. Te tomará menos de un minuto:
            una nota general y, si quieres, una valoración del arbitraje, los recintos y la
            organización.
          </p>

          <div style="margin:24px 0; padding:16px; background:#f1ece2; border-radius:6px; text-align:center;">
            <a href="${link}" style="display:inline-block; background:#E76F26; color:white; padding:12px 28px; text-decoration:none; border-radius:6px; font-weight:bold;">Responder la encuesta</a>
          </div>

          <p style="font-size:12px; color:#777; line-height:1.4;">
            El enlace es personal y expira en 30 días. Tus respuestas se usan de forma
            agregada para mejorar la liga.
          </p>
          <hr style="margin:24px 0; border:0; border-top:1px solid #e5e0d3;">
          <p style="font-size:11px; color:#777; margin:0;">
            Encuesta automática de LigaPlus. No respondas a esta dirección — el remitente
            es solo de envío.
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `${club}, ¿cómo viviste ${torneo}?

En ${liga} queremos mejorar cada temporada. Te tomará menos de un minuto.

Responder la encuesta: ${link}

(El enlace es personal y expira en 30 días.)
`;

    await this.email.send({ to, subject, html, text });
  }

  // ── Resumen (admin) ──────────────────────────────────────────────────

  async resumen(tenantId: string): Promise<NpsResumenAdmin> {
    const rows = (await this.repo.query(
      `
      SELECT
        COUNT(*)::int AS "totalEnviadas",
        COUNT(*) FILTER (WHERE estado = 'RESPONDIDA' AND nps IS NOT NULL)::int AS "totalRespondidas",
        COUNT(*) FILTER (WHERE nps >= 9)::int AS promotores,
        COUNT(*) FILTER (WHERE nps BETWEEN 7 AND 8)::int AS pasivos,
        COUNT(*) FILTER (WHERE nps BETWEEN 0 AND 6)::int AS detractores,
        AVG(eval_arbitraje) FILTER (WHERE eval_arbitraje IS NOT NULL) AS "promArbitraje",
        AVG(eval_recinto) FILTER (WHERE eval_recinto IS NOT NULL) AS "promRecinto",
        AVG(eval_organizacion) FILTER (WHERE eval_organizacion IS NOT NULL) AS "promOrganizacion"
      FROM encuestas_nps
      WHERE tenant_id = $1
      `,
      [tenantId],
    )) as Array<{
      totalEnviadas: number;
      totalRespondidas: number;
      promotores: number;
      pasivos: number;
      detractores: number;
      promArbitraje: string | null;
      promRecinto: string | null;
      promOrganizacion: string | null;
    }>;

    const r = rows[0];
    const totalRespondidas = Number(r?.totalRespondidas ?? 0);
    const promotores = Number(r?.promotores ?? 0);
    const detractores = Number(r?.detractores ?? 0);
    const score =
      totalRespondidas > 0
        ? Math.round(((promotores - detractores) / totalRespondidas) * 100)
        : 0;

    const prom = (v: string | null | undefined): number | null =>
      v == null ? null : Math.round(Number(v) * 10) / 10;

    const comentariosRaw = (await this.repo.query(
      `
      SELECT c.nombre AS club, t.nombre AS torneo, e.nps AS nps,
             e.comentario AS comentario, e.respondida_at AS fecha
      FROM encuestas_nps e
      JOIN clubes c ON c.id = e.club_id
      JOIN torneos t ON t.id = e.torneo_id
      WHERE e.tenant_id = $1
        AND e.comentario IS NOT NULL
        AND length(btrim(e.comentario)) > 0
      ORDER BY e.respondida_at DESC NULLS LAST
      LIMIT 20
      `,
      [tenantId],
    )) as Array<{
      club: string;
      torneo: string;
      nps: number | null;
      comentario: string;
      fecha: Date | null;
    }>;

    return {
      score,
      totalEnviadas: Number(r?.totalEnviadas ?? 0),
      totalRespondidas,
      promotores,
      pasivos: Number(r?.pasivos ?? 0),
      detractores,
      promArbitraje: prom(r?.promArbitraje),
      promRecinto: prom(r?.promRecinto),
      promOrganizacion: prom(r?.promOrganizacion),
      comentarios: comentariosRaw.map((c) => ({
        club: c.club,
        torneo: c.torneo,
        nps: Number(c.nps ?? 0),
        comentario: c.comentario,
        fecha: c.fecha ? new Date(c.fecha).toISOString() : '',
      })),
    };
  }

  // ── Flujo público (token, sin login) ─────────────────────────────────

  /**
   * Re-setea el contexto RLS al tenant del token firmado. En endpoints
   * @Public el interceptor dejó tenant_id='' (bypass); acotamos al tenant
   * correcto antes de tocar la encuesta.
   */
  private async setTenant(tenantId: string): Promise<void> {
    await this.dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
  }

  async infoPorToken(token: string): Promise<EncuestaNpsInfo> {
    const payload = this.verifyToken(token);
    if (!payload) throw new BadRequestException('Enlace inválido o expirado.');
    await this.setTenant(payload.tenantId);

    const encuesta = await this.repo.findOne({
      where: { id: payload.encuestaId, tenantId: payload.tenantId },
      relations: { club: true, torneo: true, tenant: true },
    });
    if (!encuesta) throw new NotFoundException('Encuesta no encontrada.');

    return {
      liga: encuesta.tenant?.nombre ?? 'la liga',
      club: encuesta.club?.nombre ?? '',
      torneo: encuesta.torneo?.nombre ?? '',
      yaRespondida: encuesta.estado === 'RESPONDIDA',
    };
  }

  async responderPorToken(token: string, body: unknown): Promise<{ ok: boolean; yaRespondida: boolean }> {
    const payload = this.verifyToken(token);
    if (!payload) throw new BadRequestException('Enlace inválido o expirado.');

    const parsed = ResponderNpsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Respuesta inválida. Revisa la nota (0-10) y las valoraciones (1-5).');
    }
    const r = parsed.data;

    await this.setTenant(payload.tenantId);
    const encuesta = await this.repo.findOne({
      where: { id: payload.encuestaId, tenantId: payload.tenantId },
    });
    if (!encuesta) throw new NotFoundException('Encuesta no encontrada.');

    // Idempotente: si ya respondió y recarga el link, no sobrescribimos.
    if (encuesta.estado === 'RESPONDIDA') {
      return { ok: true, yaRespondida: true };
    }

    encuesta.nps = r.nps;
    encuesta.evalArbitraje = r.evalArbitraje ?? null;
    encuesta.evalRecinto = r.evalRecinto ?? null;
    encuesta.evalOrganizacion = r.evalOrganizacion ?? null;
    encuesta.comentario = r.comentario && r.comentario.length > 0 ? r.comentario : null;
    encuesta.estado = 'RESPONDIDA';
    encuesta.respondidaAt = new Date();
    await this.repo.save(encuesta);

    return { ok: true, yaRespondida: false };
  }
}
