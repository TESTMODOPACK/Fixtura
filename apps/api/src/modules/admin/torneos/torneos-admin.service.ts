import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { In } from 'typeorm';

import type {
  CreateTorneoRequest,
  TorneoAdmin,
  UpdateTorneoRequest,
} from '@fixtura/types';

interface CategoriaSerieInput {
  categoriaId: string;
  serieSlug?: string | null;
  cupoEquipos: number;
}

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Temporada } from '../../competition/entities/temporada.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class TorneosAdminService {
  constructor(
    @InjectRepository(Torneo) private readonly repo: Repository<Torneo>,
    @InjectRepository(Temporada) private readonly temporadaRepo: Repository<Temporada>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
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

    // Sprint 30 fix — si el admin solo definió la categoría legacy
    // (sin armar combos categoría+serie+cupo) y no vino nada en
    // categoriasSeries, autogeneramos un combo único con cupo amplio.
    // Sin esto la página de Inscripciones muestra "TORNEO SIN
    // CATEGORÍAS" pese a que el form de Configuración sí muestra la
    // categoría guardada.
    if (categoriasSeries.length === 0 && input.categoriaId) {
      categoriasSeries = [
        { categoriaId: input.categoriaId, serieSlug: null, cupoEquipos: 99 },
      ];
    }

    // Refuerzos: si están deshabilitados, ignorar fechaLimite que venga.
    const refuerzosHabilitados = input.refuerzosHabilitados ?? true;
    const fechaLimiteRefuerzosNumero = refuerzosHabilitados
      ? (input.fechaLimiteRefuerzosNumero ?? null)
      : null;

    // Unique (tenant, slug)
    const dup = await this.repo.findOne({ where: { tenantId, slug: input.slug } });
    if (dup) {
      throw new ConflictException(`Ya existe un torneo con slug "${input.slug}"`);
    }

    const t = this.repo.create({
      tenantId,
      temporadaId: input.temporadaId,
      nombre: input.nombre,
      slug: input.slug,
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
      categoriaId: input.categoriaId ?? null,
      categoriasSeries,
      topeJugadoresPorEquipo: input.topeJugadoresPorEquipo ?? 25,
      refuerzosHabilitados,
      fechaLimiteRefuerzosNumero,
      duracionPeriodoMinutos: input.duracionPeriodoMinutos ?? 40,
      duracionEntretiempoMinutos: input.duracionEntretiempoMinutos ?? 10,
    });
    try {
      const saved = await this.repo.save(t);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      // Race condition con UNIQUE (tenant, slug) — atrapamos para
      // devolver 409 limpio en vez de un 500 con stack de Postgres.
      if (
        err instanceof Error &&
        (err.message.includes('duplicate key') ||
          err.message.includes('IDX_') ||
          err.message.includes('UQ_'))
      ) {
        throw new ConflictException(
          `Ya existe un torneo con slug "${input.slug}"`,
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateTorneoRequest,
  ): Promise<TorneoAdmin> {
    const existing = await this.repo.findOne({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Torneo ${id} no encontrado`);

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
        await this.equipoRepo
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
    });

    // Si se desactivan los refuerzos, limpiar la fecha límite para
    // mantener el estado coherente (defensa: el cron de refuerzos
    // chequea ambos campos, pero un null evita confusión visual).
    if (input.refuerzosHabilitados === false) {
      existing.fechaLimiteRefuerzosNumero = null;
    }

    await this.repo.save(existing);
    return this.findOne(id, tenantId);
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
      this.equipoRepo.count({ where: { torneoId: t.id } }),
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
      createdAt: t.createdAt.toISOString(),
    };
  }
}
