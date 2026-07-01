import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { calcularTablaPosiciones } from '@fixtura/domain';

import { Club } from '../../competition/entities/club.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { EmailService } from '../../email/email.service';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../users/entities/user-role.entity';
import {
  FlyerPdfService,
  type FlyerData,
  type FlyerMatch,
  type FlyerTablaRow,
  type FlyerTorneo,
} from './flyer-pdf.service';

/**
 * FLY — Arma los datos del flyer semanal y lo envía a los delegados de club.
 *
 *   - datosTorneo: próxima fecha (fixture) + última jugada (resultados) +
 *     tabla de posiciones de un torneo.
 *   - pdfTorneo / pdfClub: generan el PDF (para preview del admin).
 *   - enviarSemanal: recorre los delegados activos del tenant, agrupa por
 *     club, arma un PDF por club (una página por torneo activo) y lo manda
 *     por email como adjunto. Best-effort — un email que falla no corta.
 */
@Injectable()
export class FlyerDelegadosService {
  private readonly log = new Logger(FlyerDelegadosService.name);

  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserRole) private readonly roleRepo: Repository<UserRole>,
    private readonly pdf: FlyerPdfService,
    private readonly email: EmailService,
  ) {}

  // ─── Preview (admin) ────────────────────────────────────────────────
  async pdfTorneo(torneoId: string, tenantId: string): Promise<Buffer> {
    const t = await this.datosTorneo(torneoId, tenantId, null);
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return this.pdf.generar({
      ligaNombre: await this.ligaNombre(tenantId),
      clubNombre: null,
      semanaLabel: this.semanaLabel(),
      torneos: [t],
    });
  }

  async pdfClub(clubId: string, tenantId: string): Promise<Buffer> {
    const data = await this.datosClub(
      clubId,
      tenantId,
      await this.ligaNombre(tenantId),
      this.semanaLabel(),
    );
    if (!data) throw new NotFoundException(`Club ${clubId} no encontrado`);
    return this.pdf.generar(data);
  }

  // ─── Envío semanal ──────────────────────────────────────────────────
  async enviarSemanal(tenantId: string): Promise<{ clubes: number; correos: number }> {
    const roles = await this.roleRepo.find({
      where: {
        tenantId,
        role: 'DELEGADO_EQUIPO',
        scopeType: 'TEAM',
        revokedAt: IsNull(),
      },
      relations: { user: true },
    });

    // Agrupar emails de delegados por club (un club puede tener varios).
    const emailsByClub = new Map<string, Set<string>>();
    for (const r of roles) {
      const clubId = r.scopeId;
      const email = r.user?.email?.trim().toLowerCase();
      if (!clubId || !email) continue;
      const set = emailsByClub.get(clubId) ?? new Set<string>();
      set.add(email);
      emailsByClub.set(clubId, set);
    }

    const ligaNombre = await this.ligaNombre(tenantId);
    const semanaLabel = this.semanaLabel();
    let clubes = 0;
    let correos = 0;

    for (const [clubId, emails] of emailsByClub) {
      const data = await this.datosClub(clubId, tenantId, ligaNombre, semanaLabel);
      // Sin torneos activos → no hay nada útil que mandar esta semana.
      if (!data || data.torneos.length === 0) continue;

      const pdf = await this.pdf.generar(data);
      const filename = `flyer-${this.slug(data.clubNombre ?? 'club')}.pdf`;
      clubes++;

      for (const to of emails) {
        const ok = await this.email.send({
          to,
          subject: `Fixture de la semana — ${data.clubNombre} (${ligaNombre})`,
          html: this.htmlEmail(data.clubNombre ?? 'tu club', ligaNombre),
          attachments: [{ filename, content: pdf }],
        });
        if (ok) correos++;
      }
    }

    this.log.log(
      `[flyer-semanal] tenant=${tenantId} clubes=${clubes} correos=${correos}`,
    );
    return { clubes, correos };
  }

  // ─── Armado de datos ────────────────────────────────────────────────
  private async datosClub(
    clubId: string,
    tenantId: string,
    ligaNombre: string,
    semanaLabel: string,
  ): Promise<FlyerData | null> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) return null;

    const inscripciones = await this.inscRepo.find({
      where: { clubId, tenantId },
      relations: { torneo: true },
    });
    const torneoIds = Array.from(
      new Set(
        inscripciones
          .filter((i) => i.torneo?.estado === 'ACTIVO')
          .map((i) => i.torneoId),
      ),
    );

    const torneos: FlyerTorneo[] = [];
    for (const tId of torneoIds) {
      const t = await this.datosTorneo(tId, tenantId, clubId);
      if (t) torneos.push(t);
    }

    return { ligaNombre, clubNombre: club.nombre, semanaLabel, torneos };
  }

  async datosTorneo(
    torneoId: string,
    tenantId: string,
    resaltarClubId: string | null,
  ): Promise<FlyerTorneo | null> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!torneo) return null;

    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true, categoria: true },
    });
    const primera = inscripciones[0];
    const cat = primera?.categoria?.nombre ?? null;
    const serie = primera?.serieSlug
      ? `Serie ${primera.serieSlug.toUpperCase()}`
      : null;
    const subtitulo = [cat, serie].filter(Boolean).join(' · ') || null;

    // Próxima fecha (menor número aún por jugar) y última jugada (mayor
    // número finalizado). Se excluyen las SUSPENDIDAS (reemplazadas por su
    // reprogramada, que conserva el número).
    const jugables = (
      await this.fechaRepo.find({ where: { torneoId, tenantId } })
    ).filter((f) => f.estado !== 'SUSPENDIDA');

    const proximaFecha =
      jugables
        .filter((f) => f.estado === 'PROGRAMADA' || f.estado === 'EN_CURSO')
        .sort((a, b) => a.numero - b.numero)[0] ?? null;
    const ultimaFecha =
      jugables
        .filter((f) => f.estado === 'FINALIZADA')
        .sort((a, b) => b.numero - a.numero)[0] ?? null;

    const proxima = proximaFecha
      ? (await this.partidosDeFecha(proximaFecha.id, tenantId)).map((p) =>
          this.toMatch(p, resaltarClubId),
        )
      : [];
    const ultima = ultimaFecha
      ? (await this.partidosDeFecha(ultimaFecha.id, tenantId)).map((p) =>
          this.toMatch(p, resaltarClubId),
        )
      : [];

    const tabla = await this.calcularTabla(torneo, inscripciones, tenantId, resaltarClubId);

    return {
      torneoNombre: torneo.nombre,
      subtitulo,
      proximaTitulo: proximaFecha ? this.fechaLabel(proximaFecha) : null,
      proxima,
      ultimaTitulo: ultimaFecha ? this.fechaLabel(ultimaFecha) : null,
      ultima,
      tabla,
    };
  }

  private async calcularTabla(
    torneo: Torneo,
    inscripciones: InscripcionTorneo[],
    tenantId: string,
    resaltarClubId: string | null,
  ): Promise<FlyerTablaRow[]> {
    const equipos = inscripciones
      .filter((i) => i.estado !== 'RETIRADO')
      .map((i) => ({
        id: i.id,
        nombre: i.club?.nombre ?? '',
        slug: i.club?.slug ?? '',
        escudoUrl: i.club?.escudoUrl ?? null,
      }));
    if (equipos.length === 0) return [];

    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :id', { id: torneo.id })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .andWhere('p.llave_id IS NULL')
      .getMany();
    const partidos = partidosRaw.map((p) => ({
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
    }));

    const tiebreakers =
      Array.isArray(torneo.tablaTiebreakers) && torneo.tablaTiebreakers.length > 0
        ? torneo.tablaTiebreakers
        : ['pts', 'dg', 'gf', 'nombre'];
    const filas = calcularTablaPosiciones(equipos, partidos, {
      puntosVictoria: torneo.puntosVictoria,
      puntosEmpate: torneo.puntosEmpate,
      puntosDerrota: torneo.puntosDerrota,
      tiebreakers,
    });

    const inscToClub = new Map(inscripciones.map((i) => [i.id, i.clubId]));
    return filas.map((f) => ({
      posicion: f.posicion,
      equipo: f.equipoNombre,
      pj: f.pj,
      pg: f.pg,
      pe: f.pe,
      pp: f.pp,
      gf: f.gf,
      gc: f.gc,
      dg: f.dg,
      pts: f.pts,
      esDelClub: !!resaltarClubId && inscToClub.get(f.equipoId) === resaltarClubId,
    }));
  }

  private partidosDeFecha(fechaId: string, tenantId: string): Promise<Partido[]> {
    return this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.fecha_id = :fechaId', { fechaId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();
  }

  private toMatch(p: Partido, resaltarClubId: string | null): FlyerMatch {
    const localClubId = p.inscripcionLocal?.club?.id ?? null;
    const visitaClubId = p.inscripcionVisita?.club?.id ?? null;
    const esDelClub =
      !!resaltarClubId &&
      (localClubId === resaltarClubId || visitaClubId === resaltarClubId);
    return {
      local: p.inscripcionLocal?.club?.nombre ?? 'Por definir',
      visita: p.inscripcionVisita?.club?.nombre ?? 'Por definir',
      fechaHora: p.fechaHora ? p.fechaHora.toISOString() : null,
      cancha: p.canchaNombre,
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
      esDelClub,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async ligaNombre(tenantId: string): Promise<string> {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    return t?.nombre ?? 'tu liga';
  }

  /** "Fecha 3 — sáb 27 jun". La fecha calendario se formatea TZ-safe. */
  private fechaLabel(f: Fecha): string {
    const base = `Fecha ${f.numero}`;
    const rep = f.tipoReprogramacion === 'REPROGRAMADA' ? ' (reprog.)' : '';
    if (!f.fechaInicio) return `${base}${rep}`;
    const [y, mo, d] = f.fechaInicio.slice(0, 10).split('-').map(Number);
    if (!y || !mo || !d) return `${base}${rep}`;
    const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    const fmt = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(dt);
    return `${base} — ${fmt}${rep}`;
  }

  private semanaLabel(): string {
    const fmt = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    return `Semana del ${fmt}`;
  }

  private slug(nombre: string): string {
    return (
      nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'club'
    );
  }

  private htmlEmail(clubNombre: string, ligaNombre: string): string {
    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <div style="background:#0F2A1F;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
          <div style="font-size:18px;font-weight:600">LigaPlus</div>
          <div style="color:#84CCA8;font-size:12px">${ligaNombre}</div>
        </div>
        <div style="border:1px solid #ece9e0;border-top:0;padding:20px 22px;border-radius:0 0 8px 8px">
          <p>Hola, delegado de <strong>${clubNombre}</strong>.</p>
          <p>Te adjuntamos el <strong>flyer de la semana</strong> en PDF con la
          próxima fecha, los resultados de la última jornada y la tabla de
          posiciones del torneo. Ideal para compartir con el equipo.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:18px">
            Recibís este correo porque sos delegado de un club en ${ligaNombre}.
          </p>
        </div>
      </div>
    `;
  }
}
