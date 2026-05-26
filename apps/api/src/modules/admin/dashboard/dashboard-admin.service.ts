import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { DashboardAdmin } from '@fixtura/types';

import { Designacion } from '../../competition/entities/designacion.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardAdminService {
  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
  ) {}

  async get(tenantId: string): Promise<DashboardAdmin> {
    // 1) Torneo activo (el más reciente ACTIVO; si no hay, el más reciente)
    const torneoActivo = await this.torneoRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.temporada', 'temporada')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere(`t.estado = 'ACTIVO'`)
      .orderBy('t.created_at', 'DESC')
      .getOne();

    // 2-N) En paralelo: counts globales + datos del torneo activo
    const [
      torneosCounts,
      equiposCount,
      jugadoresCount,
      personalCounts,
      sancionesActivasCount,
      actasPendientesCount,
      proximaFechaData,
      topGoleadoresRows,
      topEquiposRows,
    ] = await Promise.all([
      this.contarTorneos(tenantId),
      this.equipoRepo.count({ where: { tenantId } }),
      this.jugadorRepo.count({ where: { tenantId, activo: true } }),
      this.contarPersonal(tenantId),
      this.contarSancionesActivas(tenantId),
      this.contarActasPendientes(tenantId),
      torneoActivo ? this.calcularProximaFecha(tenantId, torneoActivo.id) : null,
      torneoActivo ? this.topGoleadores(tenantId, torneoActivo.id) : [],
      torneoActivo ? this.topEquipos(tenantId, torneoActivo.id) : [],
    ]);

    return {
      torneoActivo: torneoActivo
        ? {
            id: torneoActivo.id,
            nombre: torneoActivo.nombre,
            temporadaNombre: torneoActivo.temporada?.nombre ?? '',
            equiposCount: 0, // se llena abajo si torneo activo
            fechasCount: 0,
          }
        : null,
      proximaFecha: proximaFechaData,
      actasPendientes: actasPendientesCount,
      sancionesActivas: sancionesActivasCount,
      carnetVencido: personalCounts.carnetVencido,
      carnetPorVencer: personalCounts.carnetPorVencer,
      torneosActivos: torneosCounts.activos,
      torneosDraft: torneosCounts.draft,
      equiposTotales: equiposCount,
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

  /**
   * Partidos cuya fecha_hora ya pasó pero no tienen acta cerrada y no
   * están finalizados/walkover. Si fecha_hora es NULL, no se cuenta
   * (no podemos saber si "pasó").
   */
  private async contarActasPendientes(tenantId: string): Promise<number> {
    return this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.acta_cerrada_at IS NULL')
      .andWhere(`p.estado NOT IN ('FINALIZADO', 'WALKOVER')`)
      .andWhere('p.fecha_hora IS NOT NULL')
      .andWhere('p.fecha_hora < NOW()')
      .getCount();
  }

  /**
   * Próxima fecha del torneo activo: la fecha con menor `numero` cuyo
   * estado sea PROGRAMADA o EN_CURSO. Calcula cobertura arbitral:
   * % de partidos con árbitro principal en estado != RECHAZADA/AUSENTE.
   */
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

    // Cuántos partidos tienen un ARBITRO_PRINCIPAL en estado activo
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

  private async topGoleadores(
    tenantId: string,
    torneoId: string,
  ): Promise<DashboardAdmin['topGoleadores']> {
    return (await this.incidenciaRepo
      .createQueryBuilder('i')
      .leftJoin('i.jugadorInscrito', 'j')
      .leftJoin('j.equipo', 'e')
      .select('j.id', 'jugadorId')
      .addSelect('j.nombre', 'nombre')
      .addSelect('j.apellido', 'apellido')
      .addSelect('e.nombre', 'equipoNombre')
      .addSelect('COUNT(*)', 'goles')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere(`i.tipo = 'GOL'`)
      .andWhere('e.torneo_id = :torneoId', { torneoId })
      .andWhere('j.id IS NOT NULL')
      .groupBy('j.id, j.nombre, j.apellido, e.nombre')
      .orderBy('goles', 'DESC')
      .limit(5)
      .getRawMany<{
        jugadorId: string;
        nombre: string;
        apellido: string;
        equipoNombre: string;
        goles: string;
      }>()).map((r) => ({
      jugadorId: r.jugadorId,
      nombre: r.nombre,
      apellido: r.apellido,
      equipoNombre: r.equipoNombre,
      goles: Number(r.goles),
    }));
  }

  /**
   * Top 5 equipos por puntos. Calcula puntos en SQL agregando victorias,
   * empates y derrotas a partir de partidos FINALIZADOS / WALKOVER.
   * 3 pts victoria / 1 empate / 0 derrota (defaults — el torneo puede
   * tenerlos personalizados pero acá usamos los stándar).
   */
  private async topEquipos(
    tenantId: string,
    torneoId: string,
  ): Promise<DashboardAdmin['topEquipos']> {
    const equipos = await this.equipoRepo
      .createQueryBuilder('e')
      .where('e.torneo_id = :torneoId', { torneoId })
      .andWhere('e.tenant_id = :tenantId', { tenantId })
      .getMany();
    if (equipos.length === 0) return [];

    const equipoIds = equipos.map((e) => e.id);
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where(`p.estado IN ('FINALIZADO', 'WALKOVER')`)
      .andWhere('p.equipo_local_id IN (:...equipoIds)', { equipoIds })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
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
    for (const e of equipos) {
      statsMap.set(e.id, {
        equipoId: e.id,
        nombre: e.nombre,
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
      const local = statsMap.get(p.equipoLocalId);
      const visita = statsMap.get(p.equipoVisitaId);
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
