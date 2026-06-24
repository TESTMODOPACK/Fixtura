import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { DashboardAdmin } from '@fixtura/types';

import { Club } from '../../competition/entities/club.entity';
import { Designacion } from '../../competition/entities/designacion.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sprint 30 (ADR-0004) — Dashboard refactor al modelo Clubes.
 *
 * Antes leía de tablas viejas (equipos, jugadores_inscritos) que el shim
 * de 26G.2 mantiene sincronizadas pero con nombres que el modelo viejo
 * heredó (ej. "lifegreen.cl"). Ahora lee de las tablas nuevas:
 *   - clubes → equiposTotales (mostramos como "clubes activos").
 *   - jugadores → jugadoresTotales.
 *   - inscripciones_torneo + partidos.inscripcion_*_id → topEquipos.
 *   - incidencias + match por RUT → topGoleadores con nombre real.
 */
@Injectable()
export class DashboardAdminService {
  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscripcionRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async get(tenantId: string): Promise<DashboardAdmin> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const requiereCarnetAnfa = tenant?.requiereCarnetAnfa ?? false;

    const torneoActivo = await this.torneoRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.temporada', 'temporada')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere(`t.estado = 'ACTIVO'`)
      .orderBy('t.created_at', 'DESC')
      .getOne();

    const [
      torneosCounts,
      clubesCount,
      jugadoresCount,
      personalCounts,
      sancionesActivasCount,
      actasPendientesCount,
      proximaFechaData,
      topGoleadoresRows,
      topEquiposRows,
    ] = await Promise.all([
      this.contarTorneos(tenantId),
      this.clubRepo.count({ where: { tenantId, estado: 'ACTIVO' } }),
      this.jugadorRepo.count({ where: { tenantId, estado: 'ACTIVO' } }),
      this.contarPersonal(tenantId),
      this.contarSancionesActivas(tenantId),
      this.contarActasPendientes(tenantId),
      torneoActivo ? this.calcularProximaFecha(tenantId, torneoActivo.id) : null,
      torneoActivo ? this.topGoleadores(tenantId, torneoActivo.id) : [],
      torneoActivo ? this.topEquipos(tenantId, torneoActivo.id) : [],
    ]);

    return {
      requiereCarnetAnfa,
      torneoActivo: torneoActivo
        ? {
            id: torneoActivo.id,
            nombre: torneoActivo.nombre,
            temporadaNombre: torneoActivo.temporada?.nombre ?? '',
            equiposCount: 0,
            fechasCount: 0,
          }
        : null,
      proximaFecha: proximaFechaData,
      actasPendientes: actasPendientesCount,
      sancionesActivas: sancionesActivasCount,
      carnetVencido: requiereCarnetAnfa ? personalCounts.carnetVencido : 0,
      carnetPorVencer: requiereCarnetAnfa ? personalCounts.carnetPorVencer : 0,
      torneosActivos: torneosCounts.activos,
      torneosDraft: torneosCounts.draft,
      equiposTotales: clubesCount,
      jugadoresTotales: jugadoresCount,
      personalActivo: personalCounts.total,
      topGoleadores: topGoleadoresRows,
      topEquipos: topEquiposRows,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async contarTorneos(
    tenantId: string,
  ): Promise<{ activos: number; draft: number }> {
    const rows = await this.torneoRepo
      .createQueryBuilder('t')
      .select('t.estado', 'estado')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.tenant_id = :tenantId', { tenantId })
      .groupBy('t.estado')
      .getRawMany<{ estado: string; cnt: string }>();
    let activos = 0;
    let draft = 0;
    for (const r of rows) {
      if (r.estado === 'ACTIVO') activos = Number(r.cnt);
      else if (r.estado === 'DRAFT') draft = Number(r.cnt);
    }
    return { activos, draft };
  }

  private async contarPersonal(
    tenantId: string,
  ): Promise<{ total: number; carnetVencido: number; carnetPorVencer: number }> {
    const personal = await this.personalRepo.find({
      where: { tenantId, activo: true },
    });
    const hoy = Date.now();
    let carnetVencido = 0;
    let carnetPorVencer = 0;
    for (const p of personal) {
      if (p.rol !== 'ARBITRO_PRINCIPAL' && p.rol !== 'ARBITRO_ASISTENTE') continue;
      if (!p.carnetAnfaVence) continue;
      const ts = new Date(p.carnetAnfaVence).getTime();
      if (Number.isNaN(ts)) continue;
      const diff = ts - hoy;
      if (diff < 0) carnetVencido++;
      else if (diff < TREINTA_DIAS_MS) carnetPorVencer++;
    }
    return { total: personal.length, carnetVencido, carnetPorVencer };
  }

  private async contarSancionesActivas(tenantId: string): Promise<number> {
    return this.sancionRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .getCount();
  }

  private async contarActasPendientes(tenantId: string): Promise<number> {
    // Solo cuentan los partidos que de verdad esperan resultado: PROGRAMADO o
    // EN_CURSO. Quedan fuera FINALIZADO/WALKOVER (ya resueltos) y también
    // SUSPENDIDO_FUERZA_MAYOR / REPROGRAMADO (un suspendido no tiene acta que
    // cerrar; un reprogramado es el registro histórico y el partido real vive
    // en otra fecha). Whitelist en vez de blacklist para no recontar estos al
    // agregar estados nuevos al enum.
    return this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.acta_cerrada_at IS NULL')
      .andWhere(`p.estado IN ('PROGRAMADO', 'EN_CURSO')`)
      .andWhere('p.fecha_hora IS NOT NULL')
      .andWhere('p.fecha_hora < NOW()')
      .getCount();
  }

  private async calcularProximaFecha(
    tenantId: string,
    torneoId: string,
  ): Promise<DashboardAdmin['proximaFecha']> {
    const fecha = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('f.tenant_id = :tenantId', { tenantId })
      .andWhere(`f.estado IN ('PROGRAMADA', 'EN_CURSO')`)
      .orderBy('f.numero', 'ASC')
      .getOne();
    if (!fecha) return null;

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.fecha_id = :fechaId', { fechaId: fecha.id })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .getMany();
    const partidosCount = partidos.length;
    if (partidosCount === 0) {
      return {
        numero: fecha.numero,
        etiqueta: fecha.etiqueta,
        partidosCount: 0,
        arbitrosAsignados: 0,
        cobertura: 0,
      };
    }

    const partidoIds = partidos.map((p) => p.id);
    const rows = await this.designacionRepo
      .createQueryBuilder('d')
      .select('DISTINCT d.partido_id', 'partidoId')
      .where('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .andWhere(`d.rol_asignado = 'ARBITRO_PRINCIPAL'`)
      .andWhere(`d.estado NOT IN ('RECHAZADA', 'AUSENTE')`)
      .getRawMany<{ partidoId: string }>();
    const arbitrosAsignados = rows.length;
    const cobertura = Math.round((arbitrosAsignados / partidosCount) * 100);

    return {
      numero: fecha.numero,
      etiqueta: fecha.etiqueta,
      partidosCount,
      arbitrosAsignados,
      cobertura,
    };
  }

  /**
   * Top 5 goleadores del torneo activo.
   *
   * Las incidencias siguen referenciando jugador_inscrito_id (modelo
   * viejo). Para mostrar el nombre canónico hacemos match por RUT al
   * modelo nuevo: jugador_inscrito.rut == jugadores.rut. Si no hay
   * match, fallback al nombre del modelo viejo.
   */
  private async topGoleadores(
    tenantId: string,
    torneoId: string,
  ): Promise<DashboardAdmin['topGoleadores']> {
    type Row = {
      rut: string | null;
      nombreNuevo: string | null;
      apellidoNuevo: string | null;
      nombreViejo: string | null;
      apellidoViejo: string | null;
      clubNombre: string | null;
      equipoNombre: string | null;
      jugadorId: string | null;
      goles: string;
    };
    // ADR-0005 — goleadores desde el modelo nuevo: incidencia.jugador_id →
    // jugadores; club vía inscripcion. Las incidencias históricas tienen
    // jugador_id backfilled por RUT, así que cubre old + new.
    const rows = await this.incidenciaRepo.query(
      `
      SELECT
        j.rut AS rut,
        j.id AS "jugadorId",
        j.nombres AS "nombreNuevo",
        j.apellidos AS "apellidoNuevo",
        NULL AS "nombreViejo",
        NULL AS "apellidoViejo",
        c.nombre AS "clubNombre",
        NULL AS "equipoNombre",
        COUNT(*) AS goles
      FROM incidencias_partido i
      JOIN jugadores j ON j.id = i.jugador_id
      LEFT JOIN inscripciones_torneo it ON it.id = i.inscripcion_id
      LEFT JOIN clubes c ON c.id = it.club_id
      WHERE i.tenant_id = $1
        AND i.tipo = 'GOL'
        AND it.torneo_id = $2
      GROUP BY j.rut, j.id, j.nombres, j.apellidos, c.nombre
      ORDER BY goles DESC
      LIMIT 5
      `,
      [tenantId, torneoId],
    ) as Row[];

    return rows.map((r) => ({
      jugadorId: r.jugadorId ?? r.rut ?? '',
      nombre: r.nombreNuevo ?? r.nombreViejo ?? '?',
      apellido: r.apellidoNuevo ?? r.apellidoViejo ?? '',
      equipoNombre: r.clubNombre ?? r.equipoNombre ?? '?',
      goles: Number(r.goles),
    }));
  }

  /**
   * Top 5 equipos por puntos del torneo activo.
   *
   * Camino preferido: inscripciones_torneo (modelo nuevo) + partidos
   * via inscripcion_local_id/inscripcion_visita_id (poblados por shim
   * en 26G.2 + backfill 26G.1). El nombre viene del club.
   */
  private async topEquipos(
    tenantId: string,
    torneoId: string,
  ): Promise<DashboardAdmin['topEquipos']> {
    type InscripcionRow = {
      inscripcion_id: string;
      club_nombre: string;
    };
    const inscripciones: InscripcionRow[] = await this.inscripcionRepo.query(
      `
      SELECT it.id AS inscripcion_id, c.nombre AS club_nombre
      FROM inscripciones_torneo it
      JOIN clubes c ON c.id = it.club_id
      WHERE it.torneo_id = $1
        AND it.tenant_id = $2
        AND it.estado <> 'RETIRADO'
      `,
      [torneoId, tenantId],
    );
    if (inscripciones.length === 0) return [];

    const inscripcionIds = inscripciones.map((i) => i.inscripcion_id);
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where(`p.estado IN ('FINALIZADO', 'WALKOVER')`)
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(
        '(p.inscripcion_local_id IN (:...ids) OR p.inscripcion_visita_id IN (:...ids))',
        { ids: inscripcionIds },
      )
      .getMany();

    type Stat = {
      equipoId: string;
      nombre: string;
      partidosJugados: number;
      victorias: number;
      empates: number;
      derrotas: number;
      golesFavor: number;
      golesContra: number;
      puntos: number;
    };
    const statsMap = new Map<string, Stat>();
    for (const i of inscripciones) {
      statsMap.set(i.inscripcion_id, {
        equipoId: i.inscripcion_id,
        nombre: i.club_nombre,
        partidosJugados: 0,
        victorias: 0,
        empates: 0,
        derrotas: 0,
        golesFavor: 0,
        golesContra: 0,
        puntos: 0,
      });
    }
    for (const p of partidos) {
      const localId = p.inscripcionLocalId;
      const visitaId = p.inscripcionVisitaId;
      if (!localId || !visitaId) continue;
      const local = statsMap.get(localId);
      const visita = statsMap.get(visitaId);
      if (!local || !visita) continue;
      const gl = p.golesLocal ?? 0;
      const gv = p.golesVisita ?? 0;
      local.partidosJugados++;
      visita.partidosJugados++;
      local.golesFavor += gl;
      local.golesContra += gv;
      visita.golesFavor += gv;
      visita.golesContra += gl;
      if (gl > gv) {
        local.victorias++;
        local.puntos += 3;
        visita.derrotas++;
      } else if (gv > gl) {
        visita.victorias++;
        visita.puntos += 3;
        local.derrotas++;
      } else {
        local.empates++;
        visita.empates++;
        local.puntos += 1;
        visita.puntos += 1;
      }
    }
    return Array.from(statsMap.values())
      .sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        const dgB = b.golesFavor - b.golesContra;
        const dgA = a.golesFavor - a.golesContra;
        if (dgB !== dgA) return dgB - dgA;
        return b.golesFavor - a.golesFavor;
      })
      .slice(0, 5);
  }
}
