import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { calcularTablaPosiciones } from '@fixtura/domain';

import type {
  EnVivoPublico,
  FilaTabla,
  FixturePublico,
  PartidoEnVivo,
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
import { InscripcionTorneo } from '../competition/entities/inscripcion-torneo.entity';
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
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
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
   * Partidos EN VIVO de toda la liga (Match Center EN_VIVO o PAUSADO).
   * Para la pestaña "En vivo" del portal de hinchas. El cronómetro se
   * calcula igual que en MatchCenterService; el front lo avanza local.
   */
  async getEnVivo(slug: string): Promise<EnVivoPublico> {
    const actualizadaAt = new Date().toISOString();
    const t0 = await this.torneoRepo
      .createQueryBuilder('t')
      .innerJoin('t.tenant', 'tenant')
      .where('tenant.slug = :slug', { slug })
      .getOne();
    if (!t0) return { partidos: [], actualizadaAt };
    const tenantId = t0.tenantId;

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .leftJoinAndSelect('p.cancha', 'cancha')
      .leftJoinAndSelect('p.fecha', 'f')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere(`p.centro_estado IN ('EN_VIVO','PAUSADO')`)
      .getMany();
    if (partidos.length === 0) return { partidos: [], actualizadaAt };

    const torneoIds = [
      ...new Set(
        partidos.map((p) => p.fecha?.torneoId).filter((x): x is string => !!x),
      ),
    ];
    const torneos = torneoIds.length
      ? await this.torneoRepo.findBy({ id: In(torneoIds) })
      : [];
    const torneoById = new Map(torneos.map((t) => [t.id, t]));

    const items: PartidoEnVivo[] = partidos.map((p) => {
      const torneo = p.fecha?.torneoId ? torneoById.get(p.fecha.torneoId) : undefined;
      return {
        partidoId: p.id,
        torneoNombre: torneo?.nombre ?? 'Torneo',
        torneoSlug: torneo?.slug ?? '',
        fechaNumero: p.fecha?.numero ?? null,
        estado: p.centroEstado === 'PAUSADO' ? 'PAUSADO' : 'EN_VIVO',
        periodo: p.centroPeriodo ?? 0,
        minutosPorPeriodo: p.centroMinutosPorPeriodo ?? 40,
        segundosTranscurridos: this.calcularSegundosCentro(p),
        golesLocal: p.golesLocal ?? 0,
        golesVisita: p.golesVisita ?? 0,
        equipoLocalNombre: p.inscripcionLocal?.club?.nombre ?? '?',
        equipoVisitaNombre: p.inscripcionVisita?.club?.nombre ?? '?',
        canchaNombre: p.cancha?.nombre ?? p.canchaNombre ?? null,
      };
    });

    // EN_VIVO primero; dentro, ordenado por torneo.
    items.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'EN_VIVO' ? -1 : 1;
      return a.torneoNombre.localeCompare(b.torneoNombre);
    });
    return { partidos: items, actualizadaAt };
  }

  private calcularSegundosCentro(p: Partido): number {
    const acumulado = p.centroSegundosAcumulados ?? 0;
    if (p.centroEstado !== 'EN_VIVO' || !p.centroArrancadoAt) return acumulado;
    const delta = Math.max(
      0,
      Math.floor((Date.now() - p.centroArrancadoAt.getTime()) / 1000),
    );
    return acumulado + delta;
  }

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
      const equiposCount = await this.inscRepo.count({ where: { torneoId: t.id } });

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
    // Si viene torneoSlug específico (rutas /torneos/[slug]) y no existe,
    // 404 es correcto. Si NO viene slug (home /), toleramos "sin torneos
    // activos" — la home debe seguir cargando con torneoActivo: null.
    let torneo:
      | (Torneo & {
          tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
        })
      | null;
    if (torneoSlug) {
      torneo = await this.findTorneoActivo(slug, torneoSlug);
    } else {
      torneo = await this.findTorneoActivoOrNull(slug);
    }

    // Resolver la liga aunque no haya torneo visible: buscamos el tenant
    // por slug directamente. Si tampoco existe el tenant, ahí sí 404.
    const liga = torneo
      ? torneo.tenant
      : await this.resolveLigaPorSlug(slug);

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

  /**
   * Sprint 44 fix — resolver el tenant aunque no haya torneo visible.
   * Usado por getResumen() cuando la liga existe pero todavía no lanzó
   * ningún torneo (todos en DRAFT).
   */
  private async resolveLigaPorSlug(
    slug: string,
  ): Promise<{
    id: string;
    slug: string;
    nombre: string;
    brandingJson: Record<string, unknown>;
  }> {
    const result = await this.torneoRepo.manager
      .createQueryBuilder()
      .select(['t.id AS id', 't.slug AS slug', 't.nombre AS nombre', 't.branding_json AS "brandingJson"'])
      .from('tenants', 't')
      .where('t.slug = :slug', { slug })
      .getRawOne<{
        id: string;
        slug: string;
        nombre: string;
        brandingJson: Record<string, unknown> | null;
      }>();
    if (!result) {
      throw new NotFoundException(`Liga "${slug}" no encontrada`);
    }
    return {
      id: result.id,
      slug: result.slug,
      nombre: result.nombre,
      brandingJson: result.brandingJson ?? {},
    };
  }

  // ─── Tabla de posiciones ──────────────────────────────────────────
  async getTabla(slug: string, torneoSlug?: string): Promise<TablaPosiciones> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    // ADR-0005 — los equipos de la tabla son las inscripciones del torneo.
    const inscripciones = await this.inscRepo.find({
      where: { torneoId: torneo.id },
      relations: { club: true },
    });
    const equipos = inscripciones
      .filter((i) => i.estado !== 'RETIRADO')
      .map((i) => ({
        id: i.id,
        nombre: i.club?.nombre ?? '',
        slug: i.club?.slug ?? '',
        escudoUrl: i.club?.escudoUrl ?? null,
      }));
    // AUDIT-1 fix: incluir WALKOVER. `declararWalkover()` ya persiste
    // golesLocal=3 / golesVisita=0 (o inverso), así que la suma de stats
    // funciona idéntica a un partido normal. Antes solo se contaban
    // FINALIZADO → equipos ganadores por inasistencia no sumaban puntos.
    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :torneoId', { torneoId: torneo.id })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
      .getMany();
    const partidos = partidosRaw.map((p) => ({
      equipoLocalId: p.inscripcionLocalId ?? '',
      equipoVisitaId: p.inscripcionVisitaId ?? '',
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
    }));

    // Cálculo de la tabla en lógica de dominio compartida (packages/domain),
    // así el admin y el portal público calculan idéntico. Los partidos ya
    // vienen filtrados a FINALIZADO/WALKOVER por la query de arriba.
    const filas: FilaTabla[] = calcularTablaPosiciones(equipos, partidos, {
      puntosVictoria: torneo.puntosVictoria,
      puntosEmpate: torneo.puntosEmpate,
      puntosDerrota: torneo.puntosDerrota,
      tiebreakers: Array.isArray(torneo.tablaTiebreakers)
        ? torneo.tablaTiebreakers
        : [],
    });

    return {
      torneo: torneoDto,
      filas,
      actualizadaAt: new Date().toISOString(),
    };
  }

  // ─── Fixture ──────────────────────────────────────────────────────
  async getFixture(slug: string, torneoSlug?: string): Promise<FixturePublico> {
    const torneo = await this.findTorneoActivo(slug, torneoSlug);
    const torneoDto = await this.buildTorneoPublico(torneo);

    const fechasRaw = await this.fechaRepo.find({
      where: { torneoId: torneo.id },
      order: { numero: 'ASC' },
    });
    // No mostramos la jornada SUSPENDIDA original: el hincha ve la
    // REPROGRAMADA (con su fecha nueva y el distintivo).
    const fechas = fechasRaw.filter((f) => f.estado !== 'SUSPENDIDA');

    const fechaIds = fechas.map((f) => f.id);
    const partidos = fechaIds.length
      ? await this.partidoRepo.find({
          where: fechaIds.map((id) => ({ fechaId: id })),
          relations: {
            inscripcionLocal: { club: true },
            inscripcionVisita: { club: true },
            fecha: true,
          },
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
        fechaInicio: f.fechaInicio ?? null,
        reprogramada: f.tipoReprogramacion === 'REPROGRAMADA',
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
    const torneo = await this.findTorneoActivoOrNull(slug, torneoSlug);
    if (!torneo) {
      throw new NotFoundException(
        torneoSlug
          ? `Torneo "${torneoSlug}" no encontrado en la liga "${slug}"`
          : `Liga "${slug}" no tiene torneos activos para mostrar`,
      );
    }
    return torneo;
  }

  /**
   * Misma búsqueda que findTorneoActivo pero retorna null en lugar de
   * tirar 404 si no hay match. Usado por getResumen() — la home pública
   * debe seguir cargando aunque la liga todavía no tenga torneos en
   * estado visible (muestra "SIN TORNEO ACTIVO").
   *
   * IMPORTANTE: filtra `estado IN ('ACTIVO','CERRADO')` SIEMPRE. Antes
   * el caso sin torneoSlug aceptaba cualquier estado y caía a un DRAFT
   * como fallback — eso publicaba en la home torneos que el admin aún
   * no había lanzado.
   */
  private async findTorneoActivoOrNull(
    slug: string,
    torneoSlug?: string,
  ): Promise<
    | (Torneo & {
        tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
      })
    | null
  > {
    const qb = this.torneoRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.tenant', 'tenant')
      .where('tenant.slug = :slug', { slug })
      .andWhere(`t.estado IN ('ACTIVO','CERRADO')`);

    if (torneoSlug) {
      qb.andWhere('t.slug = :torneoSlug', { torneoSlug });
    } else {
      // ACTIVO primero, después CERRADO. Dentro de cada grupo el más
      // reciente. Coincide con el orden de getTorneos() (grid).
      qb.orderBy(`CASE WHEN t.estado = 'ACTIVO' THEN 0 ELSE 1 END`)
        .addOrderBy('t.created_at', 'DESC');
    }
    const torneo = await qb.getOne();
    return torneo as (Torneo & {
      tenant: { id: string; slug: string; nombre: string; brandingJson: Record<string, unknown> };
    }) | null;
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
      relations: {
        inscripcionLocal: { club: true },
        inscripcionVisita: { club: true },
      },
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
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
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
        equipoId: p.inscripcionLocalId ?? '',
        nombre: p.inscripcionLocal?.club?.nombre ?? '',
        slug: p.inscripcionLocal?.club?.slug ?? '',
        escudoUrl: p.inscripcionLocal?.club?.escudoUrl ?? null,
        goles: p.golesLocal,
      },
      visita: {
        equipoId: p.inscripcionVisitaId ?? '',
        nombre: p.inscripcionVisita?.club?.nombre ?? '',
        slug: p.inscripcionVisita?.club?.slug ?? '',
        escudoUrl: p.inscripcionVisita?.club?.escudoUrl ?? null,
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
    // ADR-0005 — ranking desde el modelo nuevo: incidencia.jugador_id →
    // jugadores; club vía inscripcion. jugador_id está backfilled por RUT
    // para las incidencias históricas, así que cubre old + new.
    const rows = (await this.incidenciaRepo
      .createQueryBuilder('i')
      .select('i.jugador_id', 'jugadorId')
      .addSelect('j.nombres', 'nombre')
      .addSelect('j.apellidos', 'apellido')
      .addSelect('c.nombre', 'equipoNombre')
      .addSelect('c.slug', 'equipoSlug')
      .addSelect('COUNT(*)::int', 'valor')
      .innerJoin('jugadores', 'j', 'j.id = i.jugador_id')
      .leftJoin('inscripciones_torneo', 'it', 'it.id = i.inscripcion_id')
      .leftJoin('clubes', 'c', 'c.id = it.club_id')
      .innerJoin('partidos', 'p', 'p.id = i.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .where('f.torneo_id = :torneoId', { torneoId })
      .andWhere('i.tipo = :tipo', { tipo: tipoIncidencia })
      .andWhere('i.jugador_id IS NOT NULL')
      .groupBy('i.jugador_id, j.nombres, j.apellidos, c.nombre, c.slug')
      .orderBy('valor', 'DESC')
      .addOrderBy('j.apellidos', 'ASC')
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
