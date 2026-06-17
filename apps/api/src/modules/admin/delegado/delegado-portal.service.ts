import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  EstadisticasDelegado,
  EstadisticasInscripcion,
  FinanzasDelegado,
  IniciarPagoResponse,
  MiClubDelegado,
  PartidoDelegado,
  PlantelCategoriaDelegado,
  ResumenDelegado,
  SancionDelegado,
  SancionVigente,
} from '@fixtura/types';

import { Club } from '../../competition/entities/club.entity';
import { Cobro } from '../../competition/entities/cobro.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { CobrosAdminService } from '../cobros/cobros-admin.service';
import { InformesAdminService } from '../informes/informes-admin.service';
import { PagosService } from '../pagos/pagos.service';

/** Estados de partido que cuentan como "jugado" para estadísticas. */
const ESTADOS_JUGADOS = ['FINALIZADO', 'WALKOVER'];

@Injectable()
export class DelegadoPortalService {
  constructor(
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly inciRepo: Repository<IncidenciaPartido>,
    @InjectRepository(Cobro) private readonly cobroRepo: Repository<Cobro>,
    private readonly cobros: CobrosAdminService,
    private readonly pagos: PagosService,
    private readonly informes: InformesAdminService,
  ) {}

  // ─── Disciplina (acotada al club) ────────────────────────────────────
  /** Sancionados del club: fechas cumplidas/pendientes, cuándo vuelven, multa. */
  misSancionados(clubId: string, tenantId: string): Promise<SancionVigente[]> {
    return this.informes.sancionadosVigentes(tenantId, undefined, clubId, false);
  }

  // ─── Mi club ───────────────────────────────────────────────────────
  async miClub(clubId: string, tenantId: string): Promise<MiClubDelegado> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) throw new NotFoundException('Club no encontrado');
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });

    const inscripciones = await this.inscRepo.find({
      where: { clubId, tenantId },
      relations: { torneo: true, categoria: true },
      order: { createdAt: 'DESC' },
    });

    return {
      clubId: club.id,
      nombre: club.nombre,
      escudoUrl: club.escudoUrl,
      colorPrimario: club.colorPrimario,
      colorSecundario: club.colorSecundario,
      ligaNombre: tenant?.nombre ?? '',
      inscripciones: inscripciones.map((i) => ({
        inscripcionId: i.id,
        torneoId: i.torneoId,
        torneoNombre: i.torneo?.nombre ?? '',
        categoriaNombre: i.categoria?.nombre ?? null,
        serieNombre: i.serieSlug ? `Serie ${i.serieSlug.toUpperCase()}` : null,
        estado: i.estado,
      })),
    };
  }

  // ─── Plantel (por categoría) ─────────────────────────────────────────
  async plantel(clubId: string, tenantId: string): Promise<PlantelCategoriaDelegado[]> {
    const jugadores = await this.jugadorRepo.find({
      where: { clubId, tenantId },
      relations: { categoria: true },
      order: { numeroCamiseta: 'ASC' },
    });
    const grupos = new Map<string, PlantelCategoriaDelegado>();
    for (const j of jugadores) {
      const catId = j.categoriaId;
      if (!grupos.has(catId)) {
        grupos.set(catId, {
          categoriaId: catId,
          categoriaNombre: j.categoria?.nombre ?? null,
          jugadores: [],
        });
      }
      grupos.get(catId)!.jugadores.push({
        id: j.id,
        nombre: j.nombres,
        apellido: j.apellidos,
        rut: j.rut,
        numeroCamiseta: j.numeroCamiseta,
        posicion: j.posicion,
        estado: j.estado,
      });
    }
    return [...grupos.values()];
  }

  // ─── Partidos / resultados ───────────────────────────────────────────
  private async inscripcionesDelClub(clubId: string, tenantId: string) {
    const inscripciones = await this.inscRepo.find({
      where: { clubId, tenantId },
      relations: { torneo: true, categoria: true },
    });
    const map = new Map<string, { torneoNombre: string; categoriaNombre: string | null }>();
    for (const i of inscripciones) {
      map.set(i.id, {
        torneoNombre: i.torneo?.nombre ?? '',
        categoriaNombre: i.categoria?.nombre ?? null,
      });
    }
    return { ids: inscripciones.map((i) => i.id), map };
  }

  async partidos(clubId: string, tenantId: string): Promise<PartidoDelegado[]> {
    const { ids, map } = await this.inscripcionesDelClub(clubId, tenantId);
    if (ids.length === 0) return [];

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .leftJoinAndSelect('p.fecha', 'f')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(p.inscripcion_local_id IN (:...ids) OR p.inscripcion_visita_id IN (:...ids))',
        { ids },
      )
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();

    return partidos.map((p) => this.toPartidoDto(p, ids, map));
  }

  private toPartidoDto(
    p: Partido,
    clubInscIds: string[],
    inscMap: Map<string, { torneoNombre: string; categoriaNombre: string | null }>,
  ): PartidoDelegado {
    const esLocal = !!p.inscripcionLocalId && clubInscIds.includes(p.inscripcionLocalId);
    const clubInscId = esLocal ? p.inscripcionLocalId : p.inscripcionVisitaId;
    const meta = clubInscId ? inscMap.get(clubInscId) : undefined;
    const rivalNombre = esLocal
      ? p.inscripcionVisita?.club?.nombre ?? 'Por definir'
      : p.inscripcionLocal?.club?.nombre ?? 'Por definir';
    const golesFavor = esLocal ? p.golesLocal : p.golesVisita;
    const golesContra = esLocal ? p.golesVisita : p.golesLocal;

    let resultado: PartidoDelegado['resultado'] = null;
    if (
      ESTADOS_JUGADOS.includes(p.estado) &&
      golesFavor !== null &&
      golesContra !== null
    ) {
      resultado =
        golesFavor > golesContra
          ? 'GANADO'
          : golesFavor === golesContra
            ? 'EMPATADO'
            : 'PERDIDO';
    }

    return {
      partidoId: p.id,
      torneoNombre: meta?.torneoNombre ?? '',
      categoriaNombre: meta?.categoriaNombre ?? null,
      fechaNumero: p.fecha?.numero ?? null,
      fechaReprogramada: p.fecha?.tipoReprogramacion === 'REPROGRAMADA',
      fechaHora: p.fechaHora ? p.fechaHora.toISOString() : null,
      canchaNombre: p.canchaNombre,
      esLocal,
      rivalNombre,
      golesFavor,
      golesContra,
      estado: p.estado,
      resultado,
    };
  }

  // ─── Estadísticas ────────────────────────────────────────────────────
  async estadisticas(clubId: string, tenantId: string): Promise<EstadisticasDelegado> {
    const { ids, map } = await this.inscripcionesDelClub(clubId, tenantId);
    if (ids.length === 0) return { porInscripcion: [], sanciones: [] };

    // Tarjetas por inscripción.
    const tarjetas =
      ids.length > 0
        ? await this.inciRepo
            .createQueryBuilder('i')
            .select('i.inscripcion_id', 'inscId')
            .addSelect('i.tipo', 'tipo')
            .addSelect('COUNT(*)', 'cnt')
            .where('i.tenant_id = :tenantId', { tenantId })
            .andWhere('i.inscripcion_id IN (:...ids)', { ids })
            .andWhere(`i.tipo IN ('AMARILLA','ROJA','AMARILLA_ROJA')`)
            .groupBy('i.inscripcion_id')
            .addGroupBy('i.tipo')
            .getRawMany<{ inscId: string; tipo: string; cnt: string }>()
        : [];

    // Recolectamos por inscripción. Pero los partidos vienen mapeados a
    // torneo/categoría, no a inscripcionId — agregamos por (torneo+categoría)
    // usando la inscripción del club. Reconstruimos por inscripción real.
    const statPorInsc = new Map<string, EstadisticasInscripcion>();
    for (const [inscId, meta] of map.entries()) {
      statPorInsc.set(inscId, {
        inscripcionId: inscId,
        torneoNombre: meta.torneoNombre,
        categoriaNombre: meta.categoriaNombre,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        puntos: 0,
        amarillas: 0,
        rojas: 0,
      });
    }

    // Necesitamos saber a qué inscripción del club pertenece cada partido.
    // Recargamos partidos crudos con los ids local/visita para mapear.
    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.inscripcionLocalId', 'p.inscripcionVisitaId', 'p.estado', 'p.golesLocal', 'p.golesVisita'])
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(p.inscripcion_local_id IN (:...ids) OR p.inscripcion_visita_id IN (:...ids))',
        { ids },
      )
      .getMany();

    for (const p of partidosRaw) {
      if (!ESTADOS_JUGADOS.includes(p.estado)) continue;
      const esLocal = !!p.inscripcionLocalId && ids.includes(p.inscripcionLocalId);
      const inscId = esLocal ? p.inscripcionLocalId : p.inscripcionVisitaId;
      if (!inscId) continue;
      const s = statPorInsc.get(inscId);
      if (!s) continue;
      const gf = (esLocal ? p.golesLocal : p.golesVisita) ?? 0;
      const gc = (esLocal ? p.golesVisita : p.golesLocal) ?? 0;
      s.pj += 1;
      s.gf += gf;
      s.gc += gc;
      if (gf > gc) {
        s.pg += 1;
        s.puntos += 3;
      } else if (gf === gc) {
        s.pe += 1;
        s.puntos += 1;
      } else {
        s.pp += 1;
      }
    }

    for (const t of tarjetas) {
      const s = statPorInsc.get(t.inscId);
      if (!s) continue;
      const n = Number(t.cnt);
      if (t.tipo === 'AMARILLA') s.amarillas += n;
      else s.rojas += n; // ROJA + AMARILLA_ROJA
    }

    const sanciones = await this.sanciones(clubId, tenantId);

    return { porInscripcion: [...statPorInsc.values()], sanciones };
  }

  private async sanciones(clubId: string, tenantId: string): Promise<SancionDelegado[]> {
    const rows = await this.cobroRepo.manager
      .createQueryBuilder()
      .from('sanciones_activas', 's')
      // Match por jugador_id (modelo nuevo) O por rut (sanciones legacy que
      // pueden tener jugador_id NULL). rut es UNIQUE por tenant, así que el
      // OR machea a un único jugador del club — sin duplicar filas.
      .innerJoin(
        'jugadores',
        'j',
        'j.club_id = :clubId AND (j.id = s.jugador_id OR j.rut = s.rut)',
        { clubId },
      )
      .leftJoin('torneos', 't', 't.id = s.torneo_id')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.cumplida = false')
      .select('s.id', 'id')
      .addSelect('s.rut', 'rut')
      .addSelect('s.motivo', 'motivo')
      .addSelect('s.fechas_pendientes', 'fechasPendientes')
      .addSelect('s.cumplida', 'cumplida')
      .addSelect(`j.nombres || ' ' || j.apellidos`, 'jugadorNombre')
      .addSelect('t.nombre', 'torneoNombre')
      .getRawMany<{
        id: string;
        rut: string | null;
        motivo: string;
        fechasPendientes: number;
        cumplida: boolean;
        jugadorNombre: string;
        torneoNombre: string | null;
      }>();
    return rows.map((r) => ({
      id: r.id,
      jugadorNombre: r.jugadorNombre,
      rut: r.rut,
      torneoNombre: r.torneoNombre,
      motivo: r.motivo,
      fechasPendientes: Number(r.fechasPendientes),
      cumplida: r.cumplida,
    }));
  }

  // ─── Finanzas / deudas ───────────────────────────────────────────────
  async finanzas(clubId: string, tenantId: string): Promise<FinanzasDelegado> {
    const cobros = await this.cobros.list(
      tenantId,
      undefined,
      undefined,
      undefined,
      clubId,
    );
    let totalPendiente = 0;
    let totalVencido = 0;
    for (const c of cobros) {
      if (c.estado === 'PENDIENTE' || c.estado === 'VENCIDO') totalPendiente += c.monto;
      if (c.estado === 'VENCIDO') totalVencido += c.monto;
    }
    return { cobros, totalPendiente, totalVencido };
  }

  // ─── Resumen (panel) ─────────────────────────────────────────────────
  async resumen(clubId: string, tenantId: string): Promise<ResumenDelegado> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) throw new NotFoundException('Club no encontrado');

    const { cobros, totalPendiente } = await this.finanzas(clubId, tenantId);
    const cobrosPendientes = cobros.filter(
      (c) => c.estado === 'PENDIENTE' || c.estado === 'VENCIDO',
    ).length;

    const sanciones = await this.sanciones(clubId, tenantId);
    const partidos = await this.partidos(clubId, tenantId);
    const ahora = Date.now();
    const proximo =
      partidos.find(
        (p) => p.estado === 'PROGRAMADO' && p.fechaHora && new Date(p.fechaHora).getTime() >= ahora,
      ) ?? null;

    return {
      clubNombre: club.nombre,
      escudoUrl: club.escudoUrl,
      totalPendiente,
      cobrosPendientes,
      sancionesActivas: sanciones.length,
      proximoPartido: proximo,
    };
  }

  // ─── Pago online (valida ownership del cobro) ────────────────────────
  async pagar(
    clubId: string,
    tenantId: string,
    userId: string,
    cobroId: string,
    urlRetornoBase: string,
  ): Promise<IniciarPagoResponse> {
    const cobro = await this.cobroRepo.findOne({
      where: { id: cobroId, tenantId },
      relations: { inscripcion: true },
    });
    if (!cobro) throw new NotFoundException('Cobro no encontrado');
    if (!cobro.inscripcion || cobro.inscripcion.clubId !== clubId) {
      throw new ForbiddenException('Ese cobro no pertenece a tu club.');
    }
    return this.pagos.iniciarPago(cobroId, tenantId, userId, urlRetornoBase);
  }
}
