import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { JugadorGlobal, JugadoresGlobalQuery } from '@fixtura/types';

import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';

/**
 * Vista cross-tenant de jugadores con stats agregadas del torneo.
 *
 * Estrategia para no hacer N queries:
 *   1) Una query trae todos los jugadores con su equipo y torneo (joins).
 *   2) Otra agrega incidencias agrupadas por jugador (goles, amarillas,
 *      rojas, mvps, partidos jugados).
 *   3) Otra trae sanciones activas (cumplida=false, pendientes>0) para
 *      marcar warning.
 *   4) Se hace el merge en memoria.
 *
 * El admin de liga típico tiene ~300-500 jugadores en total → las
 * tres queries combinadas son razonables (<200ms en datasets reales).
 */
@Injectable()
export class JugadoresGlobalService {
  constructor(
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
  ) {}

  async list(tenantId: string, query: JugadoresGlobalQuery): Promise<JugadorGlobal[]> {
    const qb = this.jugadorRepo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.equipo', 'equipo')
      .leftJoinAndSelect('equipo.torneo', 'torneo')
      .where('j.tenant_id = :tenantId', { tenantId });

    if (query.equipoId) {
      qb.andWhere('j.equipo_id = :equipoId', { equipoId: query.equipoId });
    }
    if (query.torneoId) {
      qb.andWhere('equipo.torneo_id = :torneoId', { torneoId: query.torneoId });
    }
    if (query.estado !== 'todos') {
      qb.andWhere('j.activo = true');
    }
    if (query.search) {
      const term = `%${query.search.toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(j.nombre) LIKE :term OR LOWER(j.apellido) LIKE :term OR LOWER(COALESCE(j.apodo,'')) LIKE :term OR COALESCE(j.rut,'') LIKE :rutTerm)`,
        { term, rutTerm: `%${query.search}%` },
      );
    }

    qb.orderBy('equipo.nombre', 'ASC')
      .addOrderBy('j.apellido', 'ASC')
      .addOrderBy('j.nombre', 'ASC');

    const jugadores = await qb.getMany();
    if (jugadores.length === 0) return [];

    const jugadorIds = jugadores.map((j) => j.id);

    // Stats agregados por jugador
    const statsRows = await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('i.jugador_inscrito_id', 'jugadorId')
      .addSelect(`SUM(CASE WHEN i.tipo = 'GOL' THEN 1 ELSE 0 END)`, 'goles')
      .addSelect(`SUM(CASE WHEN i.tipo = 'AMARILLA' THEN 1 ELSE 0 END)`, 'amarillas')
      .addSelect(
        `SUM(CASE WHEN i.tipo IN ('ROJA','AMARILLA_ROJA') THEN 1 ELSE 0 END)`,
        'rojas',
      )
      .addSelect(`SUM(CASE WHEN i.tipo = 'MVP' THEN 1 ELSE 0 END)`, 'mvps')
      .addSelect(`COUNT(DISTINCT i.partido_id)`, 'partidos')
      .where('i.jugador_inscrito_id IN (:...jugadorIds)', { jugadorIds })
      .andWhere('i.tenant_id = :tenantId', { tenantId })
      .groupBy('i.jugador_inscrito_id')
      .getRawMany<{
        jugadorId: string;
        goles: string;
        amarillas: string;
        rojas: string;
        mvps: string;
        partidos: string;
      }>();

    const statsByJugador = new Map<
      string,
      { goles: number; amarillas: number; rojas: number; mvps: number; partidos: number }
    >();
    for (const row of statsRows) {
      statsByJugador.set(row.jugadorId, {
        goles: Number(row.goles),
        amarillas: Number(row.amarillas),
        rojas: Number(row.rojas),
        mvps: Number(row.mvps),
        partidos: Number(row.partidos),
      });
    }

    // Sanciones activas por jugador (por id directo; el match por RUT se
    // hace en el motor de cierre de acta, no acá)
    const sancionesActivas = await this.sancionRepo
      .createQueryBuilder('s')
      .select('s.jugador_inscrito_id', 'jugadorId')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.jugador_inscrito_id IN (:...jugadorIds)', { jugadorIds })
      .andWhere('s.cumplida = false')
      .andWhere('s.fechas_pendientes > 0')
      .getRawMany<{ jugadorId: string }>();
    const sancionados = new Set(sancionesActivas.map((r) => r.jugadorId));

    return jugadores.map((j) => {
      const stats = statsByJugador.get(j.id);
      return {
        jugadorId: j.id,
        nombre: j.nombre,
        apellido: j.apellido,
        apodo: j.apodo,
        rut: j.rut,
        numeroCamiseta: j.numeroCamiseta,
        posicion: j.posicion,
        capitan: j.capitan,
        activo: j.activo,
        equipoId: j.equipoId,
        equipoNombre: j.equipo?.nombre ?? '',
        equipoSlug: j.equipo?.slug ?? '',
        torneoId: j.equipo?.torneoId ?? '',
        torneoNombre: j.equipo?.torneo?.nombre ?? '',
        torneoEstado: j.equipo?.torneo?.estado ?? '',
        goles: stats?.goles ?? 0,
        amarillas: stats?.amarillas ?? 0,
        rojas: stats?.rojas ?? 0,
        mvps: stats?.mvps ?? 0,
        partidosJugados: stats?.partidos ?? 0,
        tieneSancionActiva: sancionados.has(j.id),
      };
    });
  }
}
