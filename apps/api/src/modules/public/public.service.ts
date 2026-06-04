import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  FilaTabla,
  FixturePublico,
  PartidoPublico,
  Ranking,
  RankingItem,
  ResumenLiga,
  SponsorPublico,
  TablaPosiciones,
  TorneoListaPublico,
  TorneoPublico,
} from '@fixtura/types';

import { CategoriaJugadores } from '../competition/entities/categoria-jugadores.entity';
import { Designacion } from '../competition/entities/designacion.entity';
import { Equipo } from '../competition/entities/equipo.entity';
import { Fecha } from '../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../competition/entities/incidencia-partido.entity';
import { Partido } from '../competition/entities/partido.entity';
import { Sponsor } from '../competition/entities/sponsor.entity';
import { Torneo } from '../competition/entities/torneo.entity';

/**
 * Servicio del portal público. Lee directamente de la DB — sin mocks.
 *
 * El tenant context ya viene seteado por TenantContextInterceptor cuando
 * el request llega. RLS filtra los resultados al tenant correcto
 * automáticamente.
 */
@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    @InjectRepository(Sponsor)
    private readonly sponsorRepo: Repository<Sponsor>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
  ) {}

  /**
   * Sprint 36A — Lista los torneos publicos del tenant (activos + cerrados,
   * los DRAFT se excluyen). Devuelve metadata suficiente para dibujar
   * cards en el hub publico del portal, sin traer tabla/fixture
   * completos por torneo.
   */
  async getTorneos(slug: string): Promise<TorneoListaPublico[]> {
    // Resolver tenantId del slug — reusa la logica defensiva del helper.
    const torneoCualquiera = await this.torneoRepo
      .createQueryBuilder('t')
      .innerJoin('t.tenant', 'tenant')
      .where('tenant.slug = :slug', { slug })
      .getOne();
    if (!torneoCualquiera) {
      return [];
    }
    const tenantId = torneoCualquiera.tenantId;

    // Map de categorias del tenant — para resolver categoriaId → nombre.
    const categorias = await this.categoriaRepo.find({ where: { tenantId } });
    const catById = new Map(categorias.map((c) => [c.id, c]));

    const torneos = await this.torneoRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.temporada', 'temporada')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere(`t.estado IN ('ACTIVO','CERRADO')`)
      // ACTIVO primero, despues CERRADO. Dentro de cada grupo, mas
      // reciente primero.
      .orderBy(`CASE WHEN t.estado = 'ACTIVO' THEN 0 ELSE 1 END`)
      .addOrderBy('t.created_at', 'DESC')
      .getMany();

    if (torneos.length === 0) return [];

    const result: TorneoListaPublico[] = [];
    for (const t of torneos) {
      const fechas = await this.fechaRepo.find({ where: { torneoId: t.id } });
      const fechasFinalizadas = fechas.filter(
        (f) => f.estado === 'FINALIZADA',
      ).length;
      const equiposCount = await this.equipoRepo.count({ where: { torneoId: t.id } });

      // Categorias: agrupar las categorias_series por categoriaId.
      const cats = Array.isArray(t.categoriasSeries) ? t.categoriasSeries : [];
      const catGroups = new Map<string, Set<string>>();
      for (const cs of cats) {
        if (!cs.categoriaId) continue;
        if (!catGroups.has(cs.categoriaId)) {
          catGroups.set(cs.categoriaId, new Set());
        }
        if (cs.serieSlug) {
          catGroups.get(cs.categoriaId)!.add(cs.serieSlug);
        }
      }
      const categoriasDto: TorneoListaPublico['categorias'] = [];
      for (const [catId, series] of catGroups) {
        const cat = catById.get(catId);
        if (!cat) continue;
        categoriasDto.push({
          categoriaId: catId,
          nombre: cat.nombre,
          series: Array.from(series),
        });
      }

      // Proximo partido si activo, ultimo si cerrado.
      let proximoPartidoAt: string | null = null;
      let ultimoPartidoAt: string | null = null;
      if (t.estado === 'ACTIVO') {
        const prox = await this.partidoRepo
          .createQueryBuilder('p')
          .innerJoin('p.fecha', 'f')
          .where('f.torneo_id = :torneoId', { torneoId: t.id })
          .andWhere(`p.estado IN ('PROGRAMADO','EN_CURSO')`)
          .andWhere('p.fecha_hora IS NOT NULL')
          .orderBy('p.fecha_hora', 'ASC')
          .getOne();
        proximoPartidoAt = prox?.fechaHora ? prox.fechaHora.toISOString() : null;
      } else {
        const ult = await this.partidoRepo
          .createQueryBuilder('p')
          .innerJoin('p.fecha', 'f')
          .where('f.torneo_id = :torneoId', { torneoId: t.id })
          .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
          .andWhere('p.fecha_hora IS NOT NULL')
          .orderBy('p.fecha_hora', 'DESC')
          .getOne();
        ultimoPartidoAt = ult?.fechaHora ? ult.fechaHora.toISOString() : null;
      }

      result.push({
        id: t.id,
        slug: t.slug,
        nombre: t.nombre,
        temporadaNombre: t.temporada?.nombre ?? String(new Date(t.createdAt).getFullYear()),
        estado: t.estado as 'ACTIVO' | 'CERRADO',
        fechaActual: fechasFinalizadas,
        fechasTotales: fechas.length,
        equiposCount,
        categorias: categoriasDto,
        proximoPartidoAt,
        ultimoPartidoAt,
      });
    }
    return result;
  }

  /**
   * Lista los sponsors activos y vigentes del tenant indicado. Filtra
   * por:
   *   - activo = TRUE
   *   - vigente_desde IS NULL OR vigente_desde <= hoy
   *   - vigente_hasta IS NULL OR vigente_hasta >= hoy
   *
   * Devuelve agrupados por posición — el frontend público los toma
   * según dónde están en la página.
   */
  async getSponsors(slug: string, posicion?: string): Promise<SponsorPublico[]> {
    const torneo = await this.findTorneoActivo(slug);
    const tenantId = torneo.tenantId;

    const qb = this.sponsorRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.activo = true')
      .andWhere('(s.vigente_desde IS NULL OR s.vigente_desde <= CURRENT_DATE)')
      .andWhere('(s.vigente_hasta IS NULL OR s.vigente_hasta >= CURRENT_DATE)')
      .orderBy('s.prioridad', 'DESC')
      .addOrderBy('s.created_at', 'DESC');

    if (posicion) {
      qb.andWhere('s.posicion = :posicion', { posicion });
    }

    const items = await qb.getMany();
    return items.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      imagenUrl: s.imagenUrl,
      linkUrl: s.linkUrl,
      posicion: s.posicion,
    }));
  }

  // ─── Resumen home pública ────────────────────────────────────────
  async getResumen(slug: string, torneoSlug?: string): Promise<ResumenLiga> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const liga = torneo.tenant!;

    if (!torneo) {
      return {
        liga: this.toLigaPublica(liga),
        torneoActivo: null,
        proximaFecha: null,
        resultadosRecientes: [],
        topGoleadores: [],
      };
    }

    const torneoDto = await this.buildTorneoPublico(torneo);
    const proximaFechaData = await this.getProximaFecha(torneo.id);
    const resultadosRecientes = await this.getResultadosRecientes(torneo.id, 4);
    const topGoleadores = (await this.computeRanking(torneo.id, 'GOLEADORES')).slice(0, 5);

    return {
      liga: this.toLigaPublica(liga),
      torneoActivo: torneoDto,
      proximaFecha: proximaFechaData,
      resultadosRecientes,
      topGoleadores,
    };
  }

  // ─── Tabla de posiciones ──────────────────────────────────────────
  async getTabla(slug: string, torneoSlug?: string): Promise<TablaPosiciones> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    const equipos = await this.equipoRepo.find({ where: { torneoId: torneo.id } });
    // AUDIT-1 fix: incluir WALKOVER. `declararWalkover()` ya persiste
    // golesLocal=3 / golesVisita=0 (o inverso), así que la suma de stats
    // funciona idéntica a un partido normal. Antes solo se contaban
    // FINALIZADO → equipos ganadores por inasistencia no sumaban puntos.
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId: torneo.id })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .getMany();

    // Calcular stats por equipo en JS — simple y suficiente para volúmenes
    // de torneo amateur (8-20 equipos × 14-28 partidos). Para escala mayor
    // se mueve a una vista materializada.
    const stats = new Map<string, { pj: number; pg: number; pe: number; pp: number; gf: number; gc: number }>();
    for (const eq of equipos) {
      stats.set(eq.id, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
    }

    for (const p of partidos) {
      const gl = p.golesLocal ?? 0;
      const gv = p.golesVisita ?? 0;
      const sL = stats.get(p.equipoLocalId);
      const sV = stats.get(p.equipoVisitaId);
      if (!sL || !sV) continue;
      sL.pj++;
      sV.pj++;
      sL.gf += gl;
      sL.gc += gv;
      sV.gf += gv;
      sV.gc += gl;
      if (gl > gv) {
        sL.pg++;
        sV.pp++;
      } else if (gl < gv) {
        sV.pg++;
        sL.pp++;
      } else {
        sL.pe++;
        sV.pe++;
      }
    }

    const filasSinOrdenar: FilaTabla[] = equipos.map((eq) => {
      const s = stats.get(eq.id)!;
      return {
        posicion: 0,
        equipoId: eq.id,
        equipoNombre: eq.nombre,
        equipoSlug: eq.slug,
        escudoUrl: eq.escudoUrl,
        pj: s.pj,
        pg: s.pg,
        pe: s.pe,
        pp: s.pp,
        gf: s.gf,
        gc: s.gc,
        dg: s.gf - s.gc,
        pts: s.pg * torneo.puntosVictoria + s.pe * torneo.puntosEmpate + s.pp * torneo.puntosDerrota,
      };
    });

    // Sprint 12: orden configurable de tiebreakers.
    // Default: ["pts","dg","gf","nombre"]. Cada key compara DESC excepto
    // "gc" (menos goles en contra es mejor) y "nombre" (ASC, último recurso).
    const orden =
      Array.isArray(torneo.tablaTiebreakers) && torneo.tablaTiebreakers.length > 0
        ? torneo.tablaTiebreakers
        : ['pts', 'dg', 'gf', 'nombre'];

    // AUDIT-4: precomputar head-to-head map para tiebreaker 'ed'.
    // headToHead.get(eqA).get(eqB) = puntos que eqA hizo VS eqB en
    // todos los partidos entre ellos (suma de ambos si jugaron 2x en
    // formato ida y vuelta). En desempates 2-equipos resuelve bien; en
    // grupos de 3+ funciona razonable porque el sort N×N evalúa pares.
    const headToHead = this.calcularHeadToHead(
      partidos,
      torneo.puntosVictoria,
      torneo.puntosEmpate,
      torneo.puntosDerrota,
    );

    filasSinOrdenar.sort((a, b) => {
      for (const key of orden) {
        const cmp = this.compararTiebreaker(a, b, key, headToHead);
        if (cmp !== 0) return cmp;
      }
      // Fallback determinístico si todo empata.
      return a.equipoNombre.localeCompare(b.equipoNombre);
    });

    const filas = filasSinOrdenar.map((f, idx) => ({ ...f, posicion: idx + 1 }));

    return {
      torneo: torneoDto,
      filas,
      actualizadaAt: new Date().toISOString(),
    };
  }

  /**
   * Sprint 12 + AUDIT-4: compara dos filas según un criterio de tiebreaker.
   * Devuelve >0 si b va antes que a, <0 si a va antes, 0 si empata.
   * Casi todos DESC (mayor es mejor) excepto `gc` y `nombre`.
   *
   * `headToHead` se pasa para que el criterio 'ed' (enfrentamiento
   * directo) pueda comparar puntos en partidos entre los dos equipos.
   */
  private compararTiebreaker(
    a: FilaTabla,
    b: FilaTabla,
    key: string,
    headToHead: Map<string, Map<string, number>>,
  ): number {
    switch (key) {
      case 'pts':
        return b.pts - a.pts;
      case 'dg':
        return b.dg - a.dg;
      case 'gf':
        return b.gf - a.gf;
      case 'gc':
        // Menos goles en contra es mejor.
        return a.gc - b.gc;
      case 'pg':
        return b.pg - a.pg;
      case 'ed': {
        // AUDIT-4: enfrentamiento directo. Comparamos puntos que cada
        // equipo hizo en los partidos entre ellos. Si A le ganó a B
        // y B no le ganó a A (en ida y vuelta el agregado puede ser
        // 6-3, 4-4, etc.), gana A.
        const ptsAvsB = headToHead.get(a.equipoId)?.get(b.equipoId) ?? 0;
        const ptsBvsA = headToHead.get(b.equipoId)?.get(a.equipoId) ?? 0;
        return ptsBvsA - ptsAvsB;
      }
      case 'nombre':
        return a.equipoNombre.localeCompare(b.equipoNombre);
      default:
        return 0;
    }
  }

  /**
   * AUDIT-4: precomputa puntos head-to-head para tiebreaker 'ed'.
   * Devuelve map[equipoA][equipoB] = pts que equipoA hizo CONTRA equipoB
   * en todos los partidos entre ellos. Considera FINALIZADO y WALKOVER.
   *
   * Para grupos de 3+ equipos empatados, JavaScript Array.sort
   * (TimSort) compara pares O(N log N); este map cubre todos los pares
   * relevantes.
   */
  private calcularHeadToHead(
    partidos: Partido[],
    puntosVictoria: number,
    puntosEmpate: number,
    puntosDerrota: number,
  ): Map<string, Map<string, number>> {
    const m = new Map<string, Map<string, number>>();
    const sumar = (de: string, contra: string, pts: number): void => {
      let inner = m.get(de);
      if (!inner) {
        inner = new Map();
        m.set(de, inner);
      }
      inner.set(contra, (inner.get(contra) ?? 0) + pts);
    };
    for (const p of partidos) {
      const gl = p.golesLocal ?? 0;
      const gv = p.golesVisita ?? 0;
      if (gl > gv) {
        sumar(p.equipoLocalId, p.equipoVisitaId, puntosVictoria);
        sumar(p.equipoVisitaId, p.equipoLocalId, puntosDerrota);
      } else if (gl < gv) {
        sumar(p.equipoVisitaId, p.equipoLocalId, puntosVictoria);
        sumar(p.equipoLocalId, p.equipoVisitaId, puntosDerrota);
      } else {
        sumar(p.equipoLocalId, p.equipoVisitaId, puntosEmpate);
        sumar(p.equipoVisitaId, p.equipoLocalId, puntosEmpate);
      }
    }
    return m;
  }

  // ─── Fixture ──────────────────────────────────────────────────────
  async getFixture(slug: string, torneoSlug?: string): Promise<FixturePublico> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    const fechas = await this.fechaRepo.find({
      where: { torneoId: torneo.id },
      order: { numero: 'ASC' },
    });

    const fechaIds = fechas.map((f) => f.id);
    const partidos = fechaIds.length
      ? await this.partidoRepo.find({
          where: fechaIds.map((id) => ({ fechaId: id })),
          relations: { equipoLocal: true, equipoVisita: true, fecha: true },
          order: { fechaHora: 'ASC' },
        })
      : [];

    const partidosPorFecha = new Map<string, Partido[]>();
    for (const p of partidos) {
      const arr = partidosPorFecha.get(p.fechaId) ?? [];
      arr.push(p);
      partidosPorFecha.set(p.fechaId, arr);
    }

    // Cargar designaciones confirmadas / asistidas para los partidos del
    // fixture en una sola query, agrupadas por partido_id.
    const arbitrosPorPartido = await this.cargarArbitrosPublicos(
      partidos.map((p) => p.id),
    );

    return {
      torneo: torneoDto,
      fechas: fechas.map((f) => ({
        numero: f.numero,
        etiqueta: f.etiqueta ?? `Fecha ${f.numero}`,
        partidos: (partidosPorFecha.get(f.id) ?? []).map((p) => ({
          ...this.toPartidoPublico(p, f.numero),
          arbitros: arbitrosPorPartido.get(p.id) ?? [],
        })),
      })),
    };
  }

  /**
   * Carga los árbitros visibles públicamente para una lista de partidos.
   * Sólo expone nombre + apellido + rol de designaciones CONFIRMADAS,
   * ASISTIO o PROPUESTA (para no esperar a la confirmación). NO expone
   * carnet, tarifa, contacto — eso queda en admin.
   */
  private async cargarArbitrosPublicos(
    partidoIds: string[],
  ): Promise<Map<string, PartidoPublico['arbitros']>> {
    const out = new Map<string, PartidoPublico['arbitros']>();
    if (partidoIds.length === 0) return out;

    const rows = await this.designacionRepo
      .createQueryBuilder('d')
      .leftJoin('d.personal', 'personal')
      .select([
        'd.partido_id AS "partidoId"',
        'd.rol_asignado AS "rol"',
        'd.estado AS "estado"',
        'personal.nombre AS "nombre"',
        'personal.apellido AS "apellido"',
      ])
      .where('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere(`d.estado IN ('PROPUESTA','CONFIRMADA','ASISTIO')`)
      .getRawMany<{
        partidoId: string;
        rol: PartidoPublico['arbitros'][number]['rol'];
        estado: string;
        nombre: string;
        apellido: string;
      }>();

    for (const r of rows) {
      const arr = out.get(r.partidoId) ?? [];
      arr.push({ nombre: r.nombre, apellido: r.apellido, rol: r.rol });
      out.set(r.partidoId, arr);
    }
    return out;
  }

  // ─── Rankings ─────────────────────────────────────────────────────
  async getRanking(
    slug: string,
    tipo: Ranking['tipo'],
    torneoSlug?: string,
  ): Promise<Ranking> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const torneoDto = await this.buildTorneoPublico(torneo);
    const items = await this.computeRanking(torneo.id, tipo);
    return { torneo: torneoDto, tipo, items };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Busca el torneo "activo" más reciente del tenant. Si no hay torneo
   * con estado ACTIVO, devuelve el último creado (incluso DRAFT).
   * Esto permite que el portal muestre algo siempre que haya al menos
   * un torneo en la DB.
   */
  /**
   * Resuelve el torneo a usar:
   *  - Si `torneoSlug` viene: busca ese torneo específico (debe ser
   *    ACTIVO o CERRADO; los DRAFT no son públicos).
   *  - Si no viene: fallback al más activo/reciente (compat sprint 1-35).
   */
  private async findTorneoActivo(
    slug: string,
    torneoSlug?: string,
  ): Promise<
    Torneo & {
      tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
    }
  > {
    const qb = this.torneoRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.tenant', 'tenant')
      .where('tenant.slug = :slug', { slug });

    if (torneoSlug) {
      qb.andWhere('t.slug = :torneoSlug', { torneoSlug }).andWhere(
        `t.estado IN ('ACTIVO','CERRADO')`,
      );
    } else {
      qb.orderBy(
        `CASE WHEN t.estado = 'ACTIVO' THEN 0 WHEN t.estado = 'DRAFT' THEN 1 ELSE 2 END`,
      ).addOrderBy('t.created_at', 'DESC');
    }
    const torneo = await qb.getOne();

    if (!torneo) {
      throw new NotFoundException(
        torneoSlug
          ? `Torneo "${torneoSlug}" no encontrado en la liga "${slug}"`
          : `Liga "${slug}" no tiene torneos creados aún`,
      );
    }
    return torneo as Torneo & {
      tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
    };
  }

  private async buildTorneoPublico(torneo: Torneo): Promise<TorneoPublico> {
    const fechas = await this.fechaRepo.find({ where: { torneoId: torneo.id } });
    const fechasFinalizadas = fechas.filter((f) => f.estado === 'FINALIZADA').length;

    return {
      id: torneo.id,
      nombre: torneo.nombre,
      temporada: String(new Date(torneo.createdAt).getFullYear()),
      estado: torneo.estado,
      fechaActual: fechasFinalizadas,
      fechasTotales: fechas.length,
    };
  }

  private async getProximaFecha(
    torneoId: string,
  ): Promise<ResumenLiga['proximaFecha']> {
    const fecha = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere(`f.estado IN ('PROGRAMADA', 'EN_CURSO')`)
      .orderBy('f.numero', 'ASC')
      .getOne();

    if (!fecha) return null;

    const partidos = await this.partidoRepo.find({
      where: { fechaId: fecha.id },
      relations: { equipoLocal: true, equipoVisita: true },
      order: { fechaHora: 'ASC' },
    });

    return {
      numero: fecha.numero,
      etiqueta: fecha.etiqueta ?? `Fecha ${fecha.numero}`,
      partidos: partidos.map((p) => this.toPartidoPublico(p, fecha.numero)),
    };
  }

  private async getResultadosRecientes(torneoId: string, limit: number): Promise<PartidoPublico[]> {
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.fecha', 'f')
      .innerJoinAndSelect('p.equipoLocal', 'eL')
      .innerJoinAndSelect('p.equipoVisita', 'eV')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('p.estado = :estado', { estado: 'FINALIZADO' })
      .orderBy('p.fecha_hora', 'DESC')
      .limit(limit)
      .getMany();

    return partidos.map((p) => this.toPartidoPublico(p, p.fecha!.numero));
  }

  private toPartidoPublico(p: Partido, fechaNumero: number): PartidoPublico {
    return {
      id: p.id,
      fechaNumero,
      fechaHora: (p.fechaHora ?? new Date()).toISOString(),
      estado: p.estado,
      local: {
        equipoId: p.equipoLocalId,
        nombre: p.equipoLocal?.nombre ?? '',
        slug: p.equipoLocal?.slug ?? '',
        escudoUrl: p.equipoLocal?.escudoUrl ?? null,
        goles: p.golesLocal,
      },
      visita: {
        equipoId: p.equipoVisitaId,
        nombre: p.equipoVisita?.nombre ?? '',
        slug: p.equipoVisita?.slug ?? '',
        escudoUrl: p.equipoVisita?.escudoUrl ?? null,
        goles: p.golesVisita,
      },
      canchaNombre: p.canchaNombre,
      // Las designaciones se enriquecen sólo en endpoints que lo necesiten
      // (ver getFixture). Aquí dejamos default vacío para no cargar
      // designaciones en queries que no las muestran (resumen, recientes).
      arbitros: [],
    };
  }

  private toLigaPublica(t: {
    id: string;
    slug: string;
    nombre: string;
    brandingJson: Record<string, unknown>;
  }): ResumenLiga['liga'] {
    return {
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      brandingJson: t.brandingJson ?? {},
    };
  }

  /**
   * Computa ranking de jugadores por tipo. Hace SQL crudo porque la
   * agrupación con joins múltiples es más eficiente que el query builder.
   */
  private async computeRanking(torneoId: string, tipo: Ranking['tipo']): Promise<RankingItem[]> {
    const tipoIncidencia = tipo === 'MVP' ? 'MVP' : tipo === 'ASISTENCIAS' ? 'ASISTENCIA' : 'GOL';

    // Para FAIR_PLAY más adelante: contar AMARILLA + ROJA × 3 invertido.
    // Para ahora solo soportamos GOLEADORES / ASISTENCIAS / MVP.
    const rows = (await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('i.jugador_inscrito_id', 'jugadorId')
      .addSelect('j.nombre', 'nombre')
      .addSelect('j.apellido', 'apellido')
      .addSelect('e.nombre', 'equipoNombre')
      .addSelect('e.slug', 'equipoSlug')
      .addSelect('COUNT(*)::int', 'valor')
      .innerJoin('jugadores_inscritos', 'j', 'j.id = i.jugador_inscrito_id')
      .innerJoin('equipos', 'e', 'e.id = j.equipo_id')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('i.tipo = :tipo', { tipo: tipoIncidencia })
      .andWhere('i.jugador_inscrito_id IS NOT NULL')
      .groupBy('i.jugador_inscrito_id, j.nombre, j.apellido, e.nombre, e.slug')
      .orderBy('valor', 'DESC')
      .addOrderBy('j.apellido', 'ASC')
      .limit(50)
      .getRawMany()) as Array<{
      jugadorId: string;
      nombre: string;
      apellido: string;
      equipoNombre: string;
      equipoSlug: string;
      valor: number;
    }>;

    return rows.map((r, idx) => ({
      posicion: idx + 1,
      jugadorId: r.jugadorId,
      jugadorNombre: `${r.nombre} ${r.apellido}`,
      jugadorSlug: `${r.nombre}-${r.apellido}`.toLowerCase().replace(/\s+/g, '-'),
      fotoUrl: null,
      equipoNombre: r.equipoNombre,
      equipoSlug: r.equipoSlug,
      valor: r.valor,
    }));
  }
}
