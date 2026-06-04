import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { calcularEdad, calcularEdadCalendario } from '@fixtura/domain';
import type { JugadorGlobal, JugadoresGlobalQuery } from '@fixtura/types';

import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';

/**
 * Sprint 28' (ADR-0004) — Vista cross-tenant del plantel global de la
 * liga, basada en el modelo nuevo de Clubes.
 *
 * Estrategia para no hacer N queries:
 *   1) Una query trae todos los jugadores con club + categoría (joins).
 *   2) Una query trae los RUTs vetados del tenant.
 *   3) Una agrega incidencias por RUT (goles, amarillas, etc.). El
 *      join es por RUT — el shim del Sprint 26G.2 garantiza que cada
 *      jugador del modelo nuevo tiene un jugador_inscrito sombra con
 *      el mismo RUT, donde apuntan las incidencias del modelo viejo.
 *   4) Una trae sanciones activas por RUT.
 *   5) Merge en memoria.
 */
@Injectable()
export class JugadoresGlobalService {
  constructor(
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
  ) {}

  async list(tenantId: string, query: JugadoresGlobalQuery): Promise<JugadorGlobal[]> {
    const qb = this.jugadorRepo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.club', 'club')
      .leftJoinAndSelect('j.categoria', 'categoria')
      .where('j.tenant_id = :tenantId', { tenantId });

    if (query.clubId) {
      qb.andWhere('j.club_id = :clubId', { clubId: query.clubId });
    }
    if (query.categoriaId) {
      qb.andWhere('j.categoria_id = :categoriaId', { categoriaId: query.categoriaId });
    }
    // Sprint 34G+ — Pre-filtro SQL para INACTIVO. El estado consolidado
    // ACTIVO|INACTIVO|VETADO se calcula despues con el merge contra
    // jugadores_vetados, asi que el filtro final por "activos" o
    // "vetados" tiene que correr en memoria sobre el resultado del map
    // (ver al final del metodo).
    //
    // Optimizacion: si el filtro es 'activos', ya podemos descartar los
    // INACTIVO del modelo nuevo antes de traerlos. Los VETADOs igual
    // salen de aca porque su columna estado puede ser 'ACTIVO' — esos
    // se filtran luego en memoria.
    if (query.estado === 'activos') {
      qb.andWhere(`j.estado = 'ACTIVO'`);
    }

    qb.orderBy('club.nombre', 'ASC')
      .addOrderBy('categoria.orden', 'ASC')
      .addOrderBy('j.apellidos', 'ASC')
      .addOrderBy('j.nombres', 'ASC');

    if (query.search) {
      const term = `%${query.search.toLowerCase()}%`;
      // RUT lo buscamos con LIKE bruto sin lowercase (puede tener K).
      qb.andWhere(
        `(LOWER(j.nombres) LIKE :term OR LOWER(j.apellidos) LIKE :term OR LOWER(COALESCE(j.apodo,'')) LIKE :term OR j.rut LIKE :rutTerm)`,
        { term, rutTerm: `%${query.search}%` },
      );
    }

    const jugadores = await qb.getMany();
    if (jugadores.length === 0) return [];

    const ruts = Array.from(new Set(jugadores.map((j) => j.rut)));

    // Vetados del tenant — match por RUT.
    const vetados = await this.vetadoRepo.find({
      where: { tenantId },
      select: ['rut', 'motivo'],
    });
    const vetadoByRut = new Map<string, { motivo: string | null }>();
    for (const v of vetados) {
      vetadoByRut.set(v.rut, { motivo: v.motivo });
    }

    // Stats agregadas vía RUT match al modelo viejo.
    // El SQL hace JOIN incidencias → jugadores_inscritos por id, después
    // agrupa por rut de jugadores_inscritos. Esto suma todas las
    // incidencias del jugador a través de todos los torneos donde
    // participó con ese RUT.
    let statsByRut = new Map<
      string,
      { goles: number; amarillas: number; rojas: number; mvps: number; partidos: number }
    >();
    if (ruts.length > 0) {
      const statsRows = await this.incidenciaRepo
        .createQueryBuilder('i')
        .innerJoin('jugadores_inscritos', 'ji', 'ji.id = i.jugador_inscrito_id')
        .select('ji.rut', 'rut')
        .addSelect(`SUM(CASE WHEN i.tipo = 'GOL' THEN 1 ELSE 0 END)`, 'goles')
        .addSelect(`SUM(CASE WHEN i.tipo = 'AMARILLA' THEN 1 ELSE 0 END)`, 'amarillas')
        .addSelect(
          `SUM(CASE WHEN i.tipo IN ('ROJA','AMARILLA_ROJA') THEN 1 ELSE 0 END)`,
          'rojas',
        )
        .addSelect(`SUM(CASE WHEN i.tipo = 'MVP' THEN 1 ELSE 0 END)`, 'mvps')
        .addSelect(`COUNT(DISTINCT i.partido_id)`, 'partidos')
        .where('i.tenant_id = :tenantId', { tenantId })
        .andWhere('ji.rut IN (:...ruts)', { ruts })
        .groupBy('ji.rut')
        .getRawMany<{
          rut: string;
          goles: string;
          amarillas: string;
          rojas: string;
          mvps: string;
          partidos: string;
        }>();

      statsByRut = new Map(
        statsRows.map((row) => [
          row.rut,
          {
            goles: Number(row.goles),
            amarillas: Number(row.amarillas),
            rojas: Number(row.rojas),
            mvps: Number(row.mvps),
            partidos: Number(row.partidos),
          },
        ]),
      );
    }

    // Sanciones activas por RUT.
    let rutsSancionados = new Set<string>();
    if (ruts.length > 0) {
      const sancionesActivas = await this.sancionRepo
        .createQueryBuilder('s')
        .select('s.rut', 'rut')
        .where('s.tenant_id = :tenantId', { tenantId })
        .andWhere('s.rut IN (:...ruts)', { ruts })
        .andWhere('s.cumplida = false')
        .andWhere('s.fechas_pendientes > 0')
        .getRawMany<{ rut: string }>();
      rutsSancionados = new Set(sancionesActivas.map((r) => r.rut));
    }

    const result: JugadorGlobal[] = jugadores.map((j) => {
      const veto = vetadoByRut.get(j.rut);
      const stats = statsByRut.get(j.rut);
      // Estado consolidado. VETADO tiene prioridad sobre INACTIVO.
      let estado: JugadorGlobal['estado'];
      if (veto) {
        estado = 'VETADO';
      } else if (j.estado === 'INACTIVO') {
        estado = 'INACTIVO';
      } else {
        estado = 'ACTIVO';
      }

      return {
        jugadorId: j.id,
        nombres: j.nombres,
        apellidos: j.apellidos,
        apodo: j.apodo,
        rut: j.rut,
        email: j.email,
        telefono: j.telefono,
        numeroCamiseta: j.numeroCamiseta,
        posicion: j.posicion,
        fechaNac: j.fechaNac,
        edad: calcularEdad(j.fechaNac),
        edadCalendario: calcularEdadCalendario(j.fechaNac),
        capitan: j.capitan,
        estado,
        vetoMotivo: veto?.motivo ?? null,
        clubId: j.clubId,
        clubNombre: j.club?.nombre ?? '',
        clubSlug: j.club?.slug ?? '',
        clubEscudoUrl: j.club?.escudoUrl ?? null,
        categoriaId: j.categoriaId,
        categoriaNombre: j.categoria?.nombre ?? '',
        goles: stats?.goles ?? 0,
        amarillas: stats?.amarillas ?? 0,
        rojas: stats?.rojas ?? 0,
        mvps: stats?.mvps ?? 0,
        partidosJugados: stats?.partidos ?? 0,
        tieneSancionActiva: rutsSancionados.has(j.rut),
      };
    });

    // Filtros que dependen del estado consolidado (no se pueden hacer
    // en SQL porque VETADO viene de cross-table contra jugadores_vetados).
    if (query.estado === 'vetados') {
      return result.filter((j) => j.estado === 'VETADO');
    }
    if (query.estado === 'activos') {
      // BUGFIX: el filtro SQL `j.estado = 'ACTIVO'` no descarta los que
      // estan en jugadores_vetados — el flag VETADO se calcula DESPUES.
      // Sin este filtro post-consolidado, "Solo activos" mostraba
      // jugadores con badge VETADO.
      return result.filter((j) => j.estado === 'ACTIVO');
    }
    return result;
  }
}
