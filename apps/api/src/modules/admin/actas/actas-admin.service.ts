import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { ActaResumen, ActasGlobalQuery, EstadoPartidoGlobal } from '@fixtura/types';

import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { Partido } from '../../competition/entities/partido.entity';

/**
 * Vista cross-torneo de actas para el admin de liga.
 *
 * Una query única con JOIN a torneo+fecha+equipos, ordenada por
 * fecha_hora desc (más recientes primero). Los counts de incidencias
 * se calculan en una segunda query agrupada para no inflar el JOIN.
 */
@Injectable()
export class ActasAdminService {
  constructor(
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
  ) {}

  async list(tenantId: string, query: ActasGlobalQuery): Promise<ActaResumen[]> {
    const qb = this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.fecha', 'fecha')
      .leftJoinAndSelect('fecha.torneo', 'torneo')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.tenant_id = :tenantId', { tenantId });

    if (query.torneoId) {
      qb.andWhere('fecha.torneo_id = :torneoId', { torneoId: query.torneoId });
    }
    if (query.fechaId) {
      qb.andWhere('p.fecha_id = :fechaId', { fechaId: query.fechaId });
    }
    if (query.estado) {
      qb.andWhere('p.estado = :estado', { estado: query.estado });
    }
    if (query.filtro === 'pendientes') {
      // "Pendientes" = solo lo que espera resultado (PROGRAMADO/EN_CURSO).
      // FINALIZADO/WALKOVER ya están resueltos; SUSPENDIDO_FUERZA_MAYOR no tiene
      // acta que cerrar y REPROGRAMADO es el registro histórico (el partido real
      // vive en otra fecha). Mismo criterio que el contador del panel.
      qb.andWhere('p.acta_cerrada_at IS NULL').andWhere(
        `p.estado IN ('PROGRAMADO', 'EN_CURSO')`,
      );
    } else if (query.filtro === 'cerradas') {
      qb.andWhere('p.acta_cerrada_at IS NOT NULL');
    }

    qb.orderBy('p.fecha_hora', 'DESC', 'NULLS LAST').addOrderBy('p.created_at', 'DESC');

    const partidos = await qb.getMany();
    if (partidos.length === 0) return [];

    // Counts de incidencias agrupados — 1 query
    const partidoIds = partidos.map((p) => p.id);
    const counts = await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('i.partido_id', 'partidoId')
      .addSelect('COUNT(*)', 'cnt')
      .where('i.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere('i.tenant_id = :tenantId', { tenantId })
      .groupBy('i.partido_id')
      .getRawMany<{ partidoId: string; cnt: string }>();

    const countByPartido = new Map<string, number>();
    for (const row of counts) {
      countByPartido.set(row.partidoId, Number(row.cnt));
    }

    return partidos.map((p) => ({
      partidoId: p.id,
      torneoId: p.fecha?.torneoId ?? '',
      torneoNombre: p.fecha?.torneo?.nombre ?? '',
      fechaId: p.fechaId,
      fechaNumero: p.fecha?.numero ?? 0,
      fechaEtiqueta: p.fecha?.etiqueta ?? null,
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoLocalNombre: p.inscripcionLocal?.club?.nombre ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      equipoVisitaNombre: p.inscripcionVisita?.club?.nombre ?? '',
      fechaHora: p.fechaHora ? p.fechaHora.toISOString() : null,
      canchaNombre: p.canchaNombre,
      estado: p.estado as EstadoPartidoGlobal,
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
      actaCerradaAt: p.actaCerradaAt ? p.actaCerradaAt.toISOString() : null,
      incidenciasCount: countByPartido.get(p.id) ?? 0,
    }));
  }
}
