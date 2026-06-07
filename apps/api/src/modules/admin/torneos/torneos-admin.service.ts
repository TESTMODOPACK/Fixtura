import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { In } from 'typeorm';

import { calcularTablaPosiciones } from '@fixtura/domain';

import type {
  CreateTorneoRequest,
  TablaPosicionesAdmin,
  TorneoAdmin,
  UpdateTorneoRequest,
} from '@fixtura/types';

interface CategoriaSerieInput {
  categoriaId: string;
  serieSlug?: string | null;
  cupoEquipos: number;
}

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Temporada } from '../../competition/entities/temporada.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { TarifaAplicadorService } from '../tarifas/tarifa-aplicador.service';

@Injectable()
export class TorneosAdminService {
  private readonly logger = new Logger(TorneosAdminService.name);

  constructor(
    @InjectRepository(Torneo) private readonly repo: Repository<Torneo>,
    @InjectRepository(Temporada) private readonly temporadaRepo: Repository<Temporada>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    // Sprint 45 — al activar el torneo generamos los cobros del tarifario.
    private readonly tarifaAplicador: TarifaAplicadorService,
  ) {}

  /**
   * Si el input trae categoriaId, valida que exista en este tenant y
   * esté activa. Devuelve la categoría o null. Lanza si el id existe
   * pero pertenece a otro tenant (defense-in-depth: RLS también bloquea).
   */
  private async resolveCategoria(
    tenantId: string,
    categoriaId: string | null | undefined,
  ): Promise<CategoriaJugadores | null> {
    if (categoriaId == null) return null;
    const cat = await this.categoriaRepo.findOne({
      where: { id: categoriaId, tenantId },
    });
    if (!cat) {
      throw new NotFoundException(
        `Categoría ${categoriaId} no encontrada en este tenant.`,
      );
    }
    if (!cat.activa) {
      throw new BadRequestException(
        `La categoría "${cat.nombre}" está inactiva. Reactivala o elegí otra.`,
      );
    }
    return cat;
  }

  /**
   * Sprint 26D — Valida la lista de (categoría, serie, cupo) del torneo:
   *   - Cada categoriaId existe en el tenant.
   *   - Si trae serieSlug, esa serie existe (y está activa) en la
   *     categoría correspondiente.
   *   - No hay combos duplicados (categoria_id, serie_slug).
   *   - cupoEquipos > 0 (zod ya lo enforza, defensa en profundidad).
   *
   * Devuelve la lista normalizada (slugs en lowercase, serie_slug null
   * si no vino).
   */
  private async validarCategoriasSeries(
    tenantId: string,
    input: CategoriaSerieInput[] | undefined,
  ): Promise<
    Array<{ categoriaId: string; serieSlug: string | null; cupoEquipos: number }>
  > {
    if (!input || input.length === 0) return [];

    // Validar categorías de un tirón (1 query)
    const catIds = Array.from(new Set(input.map((c) => c.categoriaId)));
    const cats = await this.categoriaRepo.find({
      where: { tenantId, id: In(catIds) },
    });
    if (cats.length !== catIds.length) {
      const faltantes = catIds.filter((id) => !cats.some((c) => c.id === id));
      throw new BadRequestException(
        `Categoría(s) inválida(s) o de otro tenant: ${faltantes.join(', ')}.`,
      );
    }
    const catById = new Map(cats.map((c) => [c.id, c]));

    const seen = new Set<string>();
    const out: Array<{
      categoriaId: string;
      serieSlug: string | null;
      cupoEquipos: number;
    }> = [];

    for (const combo of input) {
      const cat = catById.get(combo.categoriaId);
      if (!cat) continue; // ya validado arriba pero TS no lo sabe

      const serieSlug = combo.serieSlug ? combo.serieSlug.toLowerCase().trim() : null;

      if (serieSlug) {
        const series = Array.isArray(cat.series) ? cat.series : [];
        const match = series.find((s) => s.slug === serieSlug && s.activa);
        if (!match) {
          const disponibles = series
            .filter((s) => s.activa)
            .map((s) => s.slug)
            .join(', ');
          throw new BadRequestException(
            `La serie "${serieSlug}" no existe (o está inactiva) en la ` +
              `categoría "${cat.nombre}". Series disponibles: ` +
              (disponibles || 'ninguna'),
          );
        }
      }

      const key = `${combo.categoriaId}::${serieSlug ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Hay combo duplicado en la lista: ${cat.nombre}${serieSlug ? ` / ${serieSlug}` : ''}.`,
        );
      }
      seen.add(key);

      out.push({
        categoriaId: combo.categoriaId,
        serieSlug,
        cupoEquipos: combo.cupoEquipos,
      });
    }

    return out;
  }

  async list(tenantId: string): Promise<TorneoAdmin[]> {
    const torneos = await this.repo.find({
      where: { tenantId },
      relations: { temporada: true, categoria: true },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(torneos.map((t) => this.toDto(t)));
  }

  async findOne(id: string, tenantId: string): Promise<TorneoAdmin> {
    const t = await this.repo.findOne({
      where: { id, tenantId },
      relations: { temporada: true, categoria: true },
    });
    if (!t) throw new NotFoundException(`Torneo ${id} no encontrado`);
    return this.toDto(t);
  }

  /**
   * Tabla de posiciones del torneo para el panel admin. Usa la MISMA
   * lógica de dominio que el portal público (packages/domain), así no hay
   * drift entre lo que ve el operador y lo que ven los hinchas. A
   * diferencia del público, acá funciona para cualquier estado del torneo
   * (incluido DRAFT, donde sale en ceros porque no hay partidos jugados).
   */
  async getTabla(id: string, tenantId: string): Promise<TablaPosicionesAdmin> {
    const torneo = await this.repo.findOne({ where: { id, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${id} no encontrado`);

    // ADR-0005 — los "equipos" de la tabla son las inscripciones (id =
    // inscripcionId); nombre/slug/escudo salen del club.
    const inscripciones = await this.inscRepo.find({
      where: { torneoId: id, tenantId },
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
    // Solo partidos ya jugados: FINALIZADO o WALKOVER (mismo criterio que
    // el portal público — el walkover ya persiste 3-0).
    const partidosRaw = await this.partidoRepo
      .createQueryBuilder('p')
      .innerJoin('p.fecha', 'f')
      .where('f.torneo_id = :id', { id })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere(`p.estado IN ('FINALIZADO','WALKOVER')`)
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

    return {
      filas,
      tiebreakers,
      hayResultados: partidos.length > 0,
    };
  }

  /**
   * Sprint 42 — Si el input trae N combos (>=2), creamos N torneos
   * separados, cada uno con su propio nombre+slug derivados del original.
   * Cada torneo tiene UN solo combo. Si trae 0 o 1 combo, comportamiento
   * legacy: un solo torneo.
   *
   * Devolvemos el PRIMERO creado (shape compat con el endpoint público).
   * El frontend después de recibir la respuesta consulta /admin/torneos
   * y se entera de los hermanos.
   */
  @Transactional()
  async create(tenantId: string, input: CreateTorneoRequest): Promise<TorneoAdmin> {
    // Validar que la temporada existe en este tenant (RLS lo respalda
    // pero damos error claro al cliente).
    const temporada = await this.temporadaRepo.findOne({
      where: { id: input.temporadaId, tenantId },
    });
    if (!temporada) {
      throw new NotFoundException(`Temporada ${input.temporadaId} no encontrada`);
    }

    // Validar categoría legacy (sprint 25 paso 3) — opcional.
    await this.resolveCategoria(tenantId, input.categoriaId ?? null);

    // Sprint 26D — validar categoriasSeries del torneo nuevo.
    let categoriasSeries = await this.validarCategoriasSeries(
      tenantId,
      input.categoriasSeries,
    );

    // Sprint 30 fix — si solo viene categoría legacy, sintetizamos
    // un combo único.
    if (categoriasSeries.length === 0 && input.categoriaId) {
      categoriasSeries = [
        { categoriaId: input.categoriaId, serieSlug: null, cupoEquipos: 99 },
      ];
    }

    // Refuerzos
    const refuerzosHabilitados = input.refuerzosHabilitados ?? true;
    const fechaLimiteRefuerzosNumero = refuerzosHabilitados
      ? (input.fechaLimiteRefuerzosNumero ?? null)
      : null;

    // Sprint 42 — Determinar si vamos a split en N torneos.
    const splitEnMultiples = categoriasSeries.length >= 2;

    // Cargar categorías (con series) para resolver nombres y slugs de
    // los sufijos cuando hagamos split.
    let categoriasMap = new Map<string, CategoriaJugadores>();
    if (splitEnMultiples) {
      const catIds = Array.from(new Set(categoriasSeries.map((c) => c.categoriaId)));
      const cats = await this.categoriaRepo.find({
        where: { id: In(catIds), tenantId },
      });
      categoriasMap = new Map(cats.map((c) => [c.id, c]));
      // Sprint 42 hotfix — race condition: si alguna categoría se borró
      // entre la validación de validarCategoriasSeries y este punto, el
      // fallback a 'sin-categoria' generaría dos slugs idénticos para
      // distintos combos. Mejor fallar temprano con error claro.
      for (const combo of categoriasSeries) {
        if (!categoriasMap.has(combo.categoriaId)) {
          throw new NotFoundException(
            `La categoría ${combo.categoriaId} ya no existe. Probá recargar el form de torneo.`,
          );
        }
      }
    }

    // Helper común para crear un torneo individual con un set de
    // categoriasSeries (1 elemento en modo split, N en modo legacy).
    const crearTorneo = async (
      nombre: string,
      slug: string,
      combos: CategoriaSerieInput[],
      categoriaIdLegacy: string | null,
    ): Promise<Torneo> => {
      // Unique (tenant, slug) — chequeo previo para error legible.
      const dup = await this.repo.findOne({ where: { tenantId, slug } });
      if (dup) {
        throw new ConflictException(`Ya existe un torneo con slug "${slug}"`);
      }
      const t = this.repo.create({
        tenantId,
        temporadaId: input.temporadaId,
        nombre,
        slug,
        tipoFormato: input.tipoFormato,
        ruedas: input.ruedas,
        puntosVictoria: input.puntosVictoria,
        puntosEmpate: input.puntosEmpate,
        puntosDerrota: input.puntosDerrota,
        tablaTiebreakers: input.tablaTiebreakers ?? ['pts', 'dg', 'gf', 'nombre'],
        estado: 'DRAFT',
        fechaInicio: input.fechaInicio ?? null,
        fechaFin: input.fechaFin ?? null,
        reglamentoUrl: input.reglamentoUrl ?? null,
        categoriaId: categoriaIdLegacy,
        categoriasSeries: combos,
        topeJugadoresPorEquipo: input.topeJugadoresPorEquipo ?? 25,
        refuerzosHabilitados,
        fechaLimiteRefuerzosNumero,
        duracionPeriodoMinutos: input.duracionPeriodoMinutos ?? 40,
        duracionEntretiempoMinutos: input.duracionEntretiempoMinutos ?? 10,
        minJugadoresParaIniciar: input.minJugadoresParaIniciar ?? 7,
      });
      try {
        return await this.repo.save(t);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('duplicate key') ||
            err.message.includes('IDX_') ||
            err.message.includes('UQ_'))
        ) {
          throw new ConflictException(`Ya existe un torneo con slug "${slug}"`);
        }
        throw err;
      }
    };

    if (!splitEnMultiples) {
      // Modo clásico — un torneo único.
      const saved = await crearTorneo(
        input.nombre,
        input.slug,
        categoriasSeries,
        input.categoriaId ?? null,
      );
      return this.findOne(saved.id, tenantId);
    }

    // Modo split — uno por combo.
    const creados: Torneo[] = [];
    for (const combo of categoriasSeries) {
      const cat = categoriasMap.get(combo.categoriaId);
      const sufijoNombre = this.armarSufijoNombre(cat, combo.serieSlug ?? null);
      const sufijoSlug = this.armarSufijoSlug(cat, combo.serieSlug ?? null);
      const nombre = `${input.nombre} · ${sufijoNombre}`;
      const slug = `${input.slug}-${sufijoSlug}`;
      // Sprint 42 hotfix — validar largo contra el schema. Las columnas
      // son slug VARCHAR(100) y nombre VARCHAR(200). Mejor fallar con
      // error claro que con un genérico de Postgres.
      if (slug.length > 100) {
        throw new BadRequestException(
          `El slug derivado "${slug}" (${slug.length} chars) supera el máximo ` +
            `de 100. Acortá el slug base del torneo.`,
        );
      }
      if (nombre.length > 200) {
        throw new BadRequestException(
          `El nombre derivado supera el máximo de 200 caracteres. ` +
            `Acortá el nombre base del torneo.`,
        );
      }
      const saved = await crearTorneo(
        nombre,
        slug,
        [combo],
        combo.categoriaId, // legacy categoriaId también queda poblado
      );
      creados.push(saved);
    }

    // Devolvemos el primero para mantener shape del endpoint.
    return this.findOne(creados[0]!.id, tenantId);
  }

  private armarSufijoNombre(
    cat: CategoriaJugadores | undefined,
    serieSlug: string | null,
  ): string {
    if (!cat) return 'Sin categoría';
    const serieNombre = serieSlug
      ? (Array.isArray(cat.series) ? cat.series : []).find(
          (s) => s.slug === serieSlug,
        )?.nombre
      : null;
    return serieNombre ? `${cat.nombre} · ${serieNombre}` : cat.nombre;
  }

  private armarSufijoSlug(
    cat: CategoriaJugadores | undefined,
    serieSlug: string | null,
  ): string {
    const catSlug = cat?.slug ?? 'sin-categoria';
    return serieSlug ? `${catSlug}-${serieSlug}` : catSlug;
  }

  // Sprint 45 — @Transactional para que la activación (cambio de estado +
  // generación de cobros) sea atómica. Si la generación falla, se revierte
  // el cambio de estado y el operador puede reintentar; evitamos un torneo
  // "ACTIVO pero sin cobros" que no se podría reintentar (ya no es DRAFT).
  @Transactional()
  async update(
    id: string,
    tenantId: string,
    input: UpdateTorneoRequest,
  ): Promise<TorneoAdmin> {
    const existing = await this.repo.findOne({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Torneo ${id} no encontrado`);

    // Sprint 45 — capturamos el estado previo para detectar la activación.
    const estadoPrevio = existing.estado;

    if (input.slug && input.slug !== existing.slug) {
      const dup = await this.repo.findOne({ where: { tenantId, slug: input.slug } });
      if (dup) throw new ConflictException(`Slug "${input.slug}" ya está en uso`);
    }

    // Validar categoría si viene en el patch. Si llega null explícito,
    // se desvincula. Si no viene la key, no se toca.
    if (input.categoriaId !== undefined) {
      await this.resolveCategoria(tenantId, input.categoriaId);

      // Si cambia la categoría (a otra distinta o a null) y ya hay equipos
      // inscritos con un serie_slug, esos slugs pueden no existir en la
      // nueva categoría. Limpiamos serie_slug de equipos del torneo —
      // mejor null que un slug colgado que apunta a series fantasma.
      const cambioCategoria = (input.categoriaId ?? null) !== existing.categoriaId;
      if (cambioCategoria) {
        await this.inscRepo
          .createQueryBuilder()
          .update()
          .set({ serieSlug: null })
          .where('torneo_id = :id AND tenant_id = :tenantId', { id, tenantId })
          .andWhere('serie_slug IS NOT NULL')
          .execute();
      }
    }

    // Sprint 26D — re-validar categoriasSeries si vinieron en el patch.
    let categoriasSeriesValidadas: typeof existing.categoriasSeries | undefined;
    if (input.categoriasSeries !== undefined) {
      categoriasSeriesValidadas = await this.validarCategoriasSeries(
        tenantId,
        input.categoriasSeries,
      );
    }

    // Sprint 30 fix — si el admin cambia la categoría legacy desde la
    // pestaña Configuración y categoriasSeries todavía está vacío,
    // autopoblar para que la página de Inscripciones funcione sin
    // forzar al admin a recrear el torneo.
    const efectivoCategoriaId =
      input.categoriaId !== undefined ? input.categoriaId : existing.categoriaId;
    const efectivoCombos =
      categoriasSeriesValidadas ?? existing.categoriasSeries ?? [];
    if (efectivoCombos.length === 0 && efectivoCategoriaId) {
      categoriasSeriesValidadas = [
        { categoriaId: efectivoCategoriaId, serieSlug: null, cupoEquipos: 99 },
      ];
    }
    // Si el admin desvinculó la categoría legacy y los combos quedaron
    // apuntando a ella, los limpiamos. Sin esto, el combo huérfano
    // referencia una categoría que el torneo ya no usa.
    if (
      input.categoriaId === null &&
      Array.isArray(existing.categoriasSeries) &&
      existing.categoriasSeries.length === 1 &&
      existing.categoriasSeries[0]?.categoriaId === existing.categoriaId
    ) {
      categoriasSeriesValidadas = [];
    }

    Object.assign(existing, {
      ...(input.nombre !== undefined && { nombre: input.nombre }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.tipoFormato !== undefined && { tipoFormato: input.tipoFormato }),
      ...(input.ruedas !== undefined && { ruedas: input.ruedas }),
      ...(input.puntosVictoria !== undefined && { puntosVictoria: input.puntosVictoria }),
      ...(input.puntosEmpate !== undefined && { puntosEmpate: input.puntosEmpate }),
      ...(input.puntosDerrota !== undefined && { puntosDerrota: input.puntosDerrota }),
      ...(input.estado !== undefined && { estado: input.estado }),
      ...(input.fechaInicio !== undefined && { fechaInicio: input.fechaInicio }),
      ...(input.fechaFin !== undefined && { fechaFin: input.fechaFin }),
      ...(input.reglamentoUrl !== undefined && { reglamentoUrl: input.reglamentoUrl }),
      ...(input.tablaTiebreakers !== undefined && {
        tablaTiebreakers: input.tablaTiebreakers,
      }),
      ...(input.categoriaId !== undefined && { categoriaId: input.categoriaId }),
      ...(categoriasSeriesValidadas !== undefined && {
        categoriasSeries: categoriasSeriesValidadas,
      }),
      ...(input.topeJugadoresPorEquipo !== undefined && {
        topeJugadoresPorEquipo: input.topeJugadoresPorEquipo,
      }),
      ...(input.refuerzosHabilitados !== undefined && {
        refuerzosHabilitados: input.refuerzosHabilitados,
      }),
      ...(input.fechaLimiteRefuerzosNumero !== undefined && {
        fechaLimiteRefuerzosNumero: input.fechaLimiteRefuerzosNumero,
      }),
      ...(input.duracionPeriodoMinutos !== undefined && {
        duracionPeriodoMinutos: input.duracionPeriodoMinutos,
      }),
      ...(input.duracionEntretiempoMinutos !== undefined && {
        duracionEntretiempoMinutos: input.duracionEntretiempoMinutos,
      }),
      ...(input.minJugadoresParaIniciar !== undefined && {
        minJugadoresParaIniciar: input.minJugadoresParaIniciar,
      }),
    });

    // Si se desactivan los refuerzos, limpiar la fecha límite para
    // mantener el estado coherente (defensa: el cron de refuerzos
    // chequea ambos campos, pero un null evita confusión visual).
    if (input.refuerzosHabilitados === false) {
      existing.fechaLimiteRefuerzosNumero = null;
    }

    await this.repo.save(existing);

    // Sprint 45 — Al pasar el torneo a ACTIVO (típicamente desde DRAFT),
    // generamos los cobros del tarifario: matrícula + N cuotas por equipo.
    // generarCobrosInicioTorneo es idempotente por equipo, así que correrlo
    // en cada activación es seguro: reactivar tras sumar un equipo en DRAFT
    // solo le genera cobros al equipo nuevo. cobros_generados_at marca la
    // primera vez (para mostrarlo en la UI). No bloqueamos el cambio de
    // estado si la generación falla — los cobros se reponen manualmente.
    if (estadoPrevio !== 'ACTIVO' && existing.estado === 'ACTIVO') {
      try {
        const r = await this.tarifaAplicador.generarCobrosInicioTorneo(
          id,
          tenantId,
        );
        if (existing.cobrosGeneradosAt == null) {
          existing.cobrosGeneradosAt = new Date();
          await this.repo.save(existing);
        }
        this.logger.log(
          `[activar torneo ${id}] cobros generados: equipos=${r.equiposProcesados} matriculas=${r.matriculasCreadas} cuotas=${r.cuotasCreadas}`,
        );
      } catch (err) {
        // Atómico (ver @Transactional): re-lanzamos para revertir también el
        // cambio de estado. Mejor fallar fuerte y que el operador reintente
        // que dejar el torneo activo con cobros a medias.
        this.logger.error(
          `[activar torneo ${id}] falló la generación de cobros, se revierte la activación: ${
            (err as Error).message
          }`,
        );
        throw new InternalServerErrorException(
          'No se pudieron generar los cobros del torneo, así que la activación se ' +
            'revirtió. Reintentá; si el problema persiste, revisá el tarifario.',
        );
      }
    }

    return this.findOne(id, tenantId);
  }

  /**
   * Genera (o completa) los cobros del tarifario para un torneo ya ACTIVO.
   *
   * Recuperación manual para el caso común: el operador configuró el
   * tarifario DESPUÉS de iniciar el torneo (la generación automática solo
   * corre en la transición DRAFT→ACTIVO, así que esos cobros nunca nacían
   * y no había forma de recuperarlos sin volver a DRAFT — lo que resetea el
   * fixture). Idempotente: no duplica cobros que ya existan.
   */
  async generarCobros(
    id: string,
    tenantId: string,
  ): Promise<{
    equiposProcesados: number;
    matriculasCreadas: number;
    cuotasCreadas: number;
  }> {
    const torneo = await this.repo.findOne({ where: { id, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${id} no encontrado`);
    if (torneo.estado === 'DRAFT') {
      throw new BadRequestException(
        'El torneo está en DRAFT. Configurá el tarifario y después iniciálo ' +
          '(ponelo "En curso"): los cobros se generan solos al arrancar.',
      );
    }
    const r = await this.tarifaAplicador.generarCobrosInicioTorneo(id, tenantId);
    if (torneo.cobrosGeneradosAt == null) {
      torneo.cobrosGeneradosAt = new Date();
      await this.repo.save(torneo);
    }
    this.logger.log(
      `[generar-cobros manual torneo ${id}] equipos=${r.equiposProcesados} ` +
        `matriculas=${r.matriculasCreadas} cuotas=${r.cuotasCreadas}`,
    );
    return r;
  }

  /**
   * Sprint 31 — eliminar torneo. Solo permitido en estado DRAFT.
   *
   * Por qué no permitir borrar ACTIVO/CERRADO:
   *   - ACTIVO: ya hay partidos en juego, designaciones asignadas,
   *     posibles cobros emitidos. Borrar perdería data en vivo.
   *   - CERRADO: es histórico de la liga. Si se borra, se pierde
   *     el track de campeón, goleador, sanciones, etc.
   *
   * Para casos de error real en la creación, el admin debe borrar
   * cuando todavía está en DRAFT (antes de activar).
   *
   * Si alguna vez se necesita borrar un torneo activo/cerrado por
   * razones extremas (test data, compliance, etc.), va por SQL
   * directo con el super admin.
   *
   * FK con ON DELETE CASCADE en equipos/fechas/partidos garantiza
   * que el borrado en DRAFT limpia todo lo que pudo haberse creado
   * antes (equipos inscritos pero sin fixture todavía, por ej.).
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const torneo = await this.repo.findOne({ where: { id, tenantId } });
    if (!torneo) {
      throw new NotFoundException(`Torneo ${id} no encontrado.`);
    }
    if (torneo.estado !== 'DRAFT') {
      throw new BadRequestException(
        `Solo se pueden eliminar torneos en estado DRAFT. ` +
          `Este torneo está en ${torneo.estado}. Si fue creado por error, ` +
          `podés cerrarlo desde la pestaña Configuración para mantenerlo ` +
          `como histórico.`,
      );
    }
    await this.repo.delete({ id, tenantId });
  }

  private async toDto(t: Torneo): Promise<TorneoAdmin> {
    const [equiposCount, fechasCount] = await Promise.all([
      this.inscRepo.count({ where: { torneoId: t.id } }),
      this.fechaRepo.count({ where: { torneoId: t.id } }),
    ]);

    // Sprint 30 fix — defensa en profundidad: si la fila quedó con
    // categoriaId legacy poblado pero categoriasSeries vacío (caso de
    // torneos creados antes del 26D), sintetizamos el combo en la
    // respuesta para que la UI de Inscripciones funcione sin requerir
    // un update del torneo. El healing en cleanup-orphans persiste el
    // mismo cambio en DB para que la lectura sea consistente.
    const combosSinSintetizar = Array.isArray(t.categoriasSeries)
      ? t.categoriasSeries
      : [];
    const combosEfectivos =
      combosSinSintetizar.length === 0 && t.categoriaId
        ? [{ categoriaId: t.categoriaId, serieSlug: null, cupoEquipos: 99 }]
        : combosSinSintetizar;

    return {
      id: t.id,
      temporadaId: t.temporadaId,
      temporadaNombre: t.temporada?.nombre ?? '',
      nombre: t.nombre,
      slug: t.slug,
      tipoFormato: t.tipoFormato,
      ruedas: t.ruedas,
      puntosVictoria: t.puntosVictoria,
      puntosEmpate: t.puntosEmpate,
      puntosDerrota: t.puntosDerrota,
      tablaTiebreakers:
        Array.isArray(t.tablaTiebreakers) && t.tablaTiebreakers.length > 0
          ? t.tablaTiebreakers
          : ['pts', 'dg', 'gf', 'nombre'],
      estado: t.estado,
      fechaInicio: t.fechaInicio,
      fechaFin: t.fechaFin,
      reglamentoUrl: t.reglamentoUrl,
      equiposCount,
      fechasCount,
      categoriaId: t.categoriaId,
      categoriaNombre: t.categoria?.nombre ?? null,
      categoriaSlug: t.categoria?.slug ?? null,
      categoriasSeries: combosEfectivos,
      topeJugadoresPorEquipo: t.topeJugadoresPorEquipo ?? 25,
      refuerzosHabilitados: t.refuerzosHabilitados ?? true,
      fechaLimiteRefuerzosNumero: t.fechaLimiteRefuerzosNumero,
      duracionPeriodoMinutos: t.duracionPeriodoMinutos ?? 40,
      duracionEntretiempoMinutos: t.duracionEntretiempoMinutos ?? 10,
      minJugadoresParaIniciar: t.minJugadoresParaIniciar ?? 7,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
