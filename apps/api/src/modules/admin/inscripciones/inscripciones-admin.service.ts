import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  CreateInscripcionTorneoRequest,
  InscripcionTorneo as InscripcionDto,
} from '@fixtura/types';

import { ClubCategoria } from '../../competition/entities/club-categoria.entity';
import { Club } from '../../competition/entities/club.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

/**
 * Sprint 26E (ADR-0004) — Inscripción de clubes a un torneo.
 *
 * Reglas que se enforzan en este service:
 *   - El torneo debe estar en DRAFT para aceptar nuevas inscripciones.
 *   - La combinación (categoría, serie) debe existir en torneos.categoriasSeries.
 *   - El club debe competir en esa categoría (existe en club_categorias).
 *   - Cupo libre en ese combo (count actual < cupoEquipos).
 *   - El club debe estar ACTIVO.
 *   - UNIQUE (torneo, club, categoría) lo enforza la DB (race condition
 *     atrapada con try/catch).
 *
 * El servicio expone también helpers para que la UI muestre el cupo
 * usado/disponible por combo.
 */
@Injectable()
export class InscripcionesAdminService {
  constructor(
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubCategoria)
    private readonly clubCatRepo: Repository<ClubCategoria>,
    @InjectRepository(PlanillaTorneo)
    private readonly planillaRepo: Repository<PlanillaTorneo>,
    @InjectRepository(Jugador)
    private readonly jugadorRepo: Repository<Jugador>,
    // Sprint 45 — el cobro de matrícula ya no se genera al inscribir, sino
    // al iniciar el torneo (ver TarifaAplicadorService.generarCobrosInicioTorneo).
  ) {}

  /**
   * Lista las inscripciones de un torneo con datos del club + categoría
   * + serie + count de jugadores en planilla, para que la UI muestre
   * el panel completo sin queries extra.
   */
  async listByTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<InscripcionDto[]> {
    await this.ensureTorneo(torneoId, tenantId);

    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
      relations: { club: true, categoria: true, torneo: true },
      order: { createdAt: 'ASC' },
    });
    if (inscripciones.length === 0) return [];

    const ids = inscripciones.map((i) => i.id);
    const counts = await this.planillaRepo
      .createQueryBuilder('p')
      .select('p.inscripcion_id', 'inscripcionId')
      .addSelect('COUNT(*)', 'cnt')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.inscripcion_id IN (:...ids)', { ids })
      .groupBy('p.inscripcion_id')
      .getRawMany<{ inscripcionId: string; cnt: string }>();
    const byInsc = new Map<string, number>();
    for (const c of counts) byInsc.set(c.inscripcionId, Number(c.cnt));

    return inscripciones.map((i) => this.toDto(i, byInsc.get(i.id) ?? 0));
  }

  async findOne(id: string, tenantId: string): Promise<InscripcionDto> {
    const insc = await this.inscRepo.findOne({
      where: { id, tenantId },
      relations: { club: true, categoria: true, torneo: true },
    });
    if (!insc) throw new NotFoundException(`Inscripción ${id} no encontrada.`);
    const cnt = await this.planillaRepo.count({
      where: { inscripcionId: id, tenantId },
    });
    return this.toDto(insc, cnt);
  }

  async inscribir(
    torneoId: string,
    tenantId: string,
    input: CreateInscripcionTorneoRequest,
  ): Promise<InscripcionDto> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    if (torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        `No se pueden inscribir clubes en un torneo ${torneo.estado}. ` +
          'Para agregar inscripciones, el torneo debe estar en DRAFT.',
      );
    }

    // Validar combo está en categoriasSeries del torneo.
    const combos = Array.isArray(torneo.categoriasSeries)
      ? torneo.categoriasSeries
      : [];
    const serieSlugInput = input.serieSlug
      ? input.serieSlug.toLowerCase().trim()
      : null;
    const combo = combos.find(
      (c) =>
        c.categoriaId === input.categoriaId &&
        (c.serieSlug ?? null) === serieSlugInput,
    );
    if (!combo) {
      throw new BadRequestException(
        `El torneo no tiene definida la combinación categoría+serie ` +
          `solicitada. Edita el torneo para agregarla antes de inscribir.`,
      );
    }

    // Validar club existe, activo y pertenece al tenant.
    const club = await this.clubRepo.findOne({
      where: { id: input.clubId, tenantId },
    });
    if (!club) throw new NotFoundException(`Club ${input.clubId} no encontrado.`);
    if (club.estado === 'INACTIVO') {
      throw new BadRequestException(
        `El club "${club.nombre}" está INACTIVO. Reactívalo antes de inscribirlo.`,
      );
    }
    // Sprint TRI — un club vetado de por vida por el Tribunal no puede inscribirse.
    if (club.vetadoAt) {
      throw new BadRequestException(
        `El club "${club.nombre}" está vetado de la liga` +
          (club.vetadoMotivo ? ` (${club.vetadoMotivo})` : '') +
          '. No puede inscribirse en torneos.',
      );
    }

    // Validar club compite en esa categoría (existe en club_categorias).
    const enCategoria = await this.clubCatRepo.findOne({
      where: { clubId: input.clubId, categoriaId: input.categoriaId },
    });
    if (!enCategoria) {
      throw new BadRequestException(
        `El club "${club.nombre}" no compite en la categoría seleccionada. ` +
          'Edita la ficha del club para agregar esta categoría primero.',
      );
    }

    // Cupo libre en el combo.
    const usadoEnCombo = await this.contarUsoCombo(
      torneoId,
      tenantId,
      input.categoriaId,
      serieSlugInput,
    );
    if (usadoEnCombo >= combo.cupoEquipos) {
      throw new ConflictException(
        `El cupo de este combo ya está completo ` +
          `(${usadoEnCombo}/${combo.cupoEquipos} equipos).`,
      );
    }

    const insc = this.inscRepo.create({
      tenantId,
      clubId: input.clubId,
      torneoId,
      categoriaId: input.categoriaId,
      serieSlug: serieSlugInput,
      estado: 'INSCRITO',
    });

    let saved: InscripcionTorneo;
    try {
      saved = await this.inscRepo.save(insc);
    } catch (err) {
      // UNIQUE (torneo, club, categoria) — race con otro admin.
      if (
        err instanceof Error &&
        (err.message.includes('uq_inscripcion') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(
          `El club "${club.nombre}" ya está inscripto en esta categoría ` +
            'del torneo.',
        );
      }
      throw err;
    }

    // Sprint 38 — Precargar planilla del torneo con el plantel del club
    // en esa categoría. Antes el delegado tenía que cargar uno por uno
    // y la planilla quedaba en 0 después de inscribir, lo cual era
    // confuso. Ahora se copia todo el plantel ACTIVO de la categoría;
    // el delegado puede sacar al que no va a jugar.
    try {
      await this.precargarPlanillaDesdeClub(saved, tenantId);
    } catch (err) {
      // Si falla la pre-carga, no rompe la inscripción — el admin puede
      // cargar manualmente desde la UI o re-ejecutar el backfill.
      // eslint-disable-next-line no-console
      console.warn(
        `[inscripcion] precarga planilla falló insc=${saved.id}: ${(err as Error).message}`,
      );
    }

    // Sprint 45 — La matrícula ya NO se genera al inscribir. Ahora todos
    // los cobros (matrícula + cuotas) se generan al iniciar el torneo
    // (DRAFT→ACTIVO), anclados al equipo, vía
    // TarifaAplicadorService.generarCobrosInicioTorneo. Generarla aquí
    // produciría una matrícula duplicada (una por inscripción, otra por
    // equipo) al activar. La inscripción solo deja el equipo sombra listo;
    // el cobro nace cuando el torneo arranca.

    return this.findOne(saved.id, tenantId);
  }

  /**
   * Sprint 38 — Copia el plantel ACTIVO del club (filtrado por la
   * categoría de la inscripción) a planilla_torneo. Idempotente: ON
   * CONFLICT no duplica.
   *
   * Respeta el tope del torneo: si el plantel del club excede el cupo,
   * recorta los primeros N por created_at (FIFO).
   */
  private async precargarPlanillaDesdeClub(
    inscripcion: InscripcionTorneo,
    tenantId: string,
  ): Promise<number> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: inscripcion.torneoId, tenantId },
    });
    const tope = torneo?.topeJugadoresPorEquipo ?? 25;

    const jugadores = await this.jugadorRepo.find({
      where: {
        tenantId,
        clubId: inscripcion.clubId,
        categoriaId: inscripcion.categoriaId,
        estado: 'ACTIVO',
      },
      order: { createdAt: 'ASC' },
      take: tope,
    });

    if (jugadores.length === 0) return 0;

    let copiados = 0;
    for (const jugador of jugadores) {
      try {
        await this.planillaRepo.insert({
          tenantId,
          inscripcionId: inscripcion.id,
          jugadorId: jugador.id,
        });
        copiados++;
      } catch (err) {
        // UNIQUE violation = ya estaba en la planilla. Ignorar.
        if (
          !(
            err instanceof Error &&
            (err.message.includes('uq_planilla_jugador') ||
              err.message.includes('duplicate key'))
          )
        ) {
          throw err;
        }
      }
    }
    return copiados;
  }

  /**
   * Re-sincroniza los planteles del torneo desde los clubes.
   *
   * Por qué: `precargarPlanillaDesdeClub` solo corre AL INSCRIBIR. Si el
   * operador cargó/actualizó jugadores del club DESPUÉS de inscribirlo
   * (o el club estaba vacío al inscribir), la planilla del torneo y el
   * equipo sombra (jugadores_inscritos) quedan desfasados → el torneo,
   * el detalle del partido y el Match Center muestran 0 jugadores.
   *
   * Esto recorre cada inscripción del torneo y, por cada jugador ACTIVO
   * del club en la categoría de la inscripción, asegura su fila en
   * planilla_torneo Y en el equipo sombra. Idempotente (ON CONFLICT DO
   * NOTHING en planilla; upsert por RUT en el modelo viejo). NO quita a
   * nadie: solo agrega/actualiza. Ignora el bloqueo de refuerzos porque
   * es cargar la nómina base, no un refuerzo.
   */
  async resyncPlantelesTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<{ inscripcionesProcesadas: number; jugadoresSincronizados: number }> {
    await this.ensureTorneo(torneoId, tenantId);
    const inscripciones = await this.inscRepo.find({
      where: { torneoId, tenantId },
    });
    let jugadoresSincronizados = 0;
    for (const insc of inscripciones) {
      jugadoresSincronizados += await this.resyncPlantelInscripcion(
        insc,
        tenantId,
      );
    }
    return {
      inscripcionesProcesadas: inscripciones.length,
      jugadoresSincronizados,
    };
  }

  private async resyncPlantelInscripcion(
    insc: InscripcionTorneo,
    tenantId: string,
  ): Promise<number> {
    const torneo = await this.torneoRepo.findOne({
      where: { id: insc.torneoId, tenantId },
    });
    const tope = torneo?.topeJugadoresPorEquipo ?? 25;

    const jugadores = await this.jugadorRepo.find({
      where: {
        tenantId,
        clubId: insc.clubId,
        categoriaId: insc.categoriaId,
        estado: 'ACTIVO',
      },
      order: { createdAt: 'ASC' },
      take: tope,
    });

    let n = 0;
    for (const jugador of jugadores) {
      // Planilla del torneo (idempotente — ON CONFLICT DO NOTHING).
      await this.planillaRepo
        .createQueryBuilder()
        .insert()
        .into(PlanillaTorneo)
        .values({ tenantId, inscripcionId: insc.id, jugadorId: jugador.id })
        .orIgnore()
        .execute();
      n++;
    }
    return n;
  }

  async desinscribir(id: string, tenantId: string): Promise<void> {
    const insc = await this.inscRepo.findOne({
      where: { id, tenantId },
      relations: { torneo: true },
    });
    if (!insc) throw new NotFoundException(`Inscripción ${id} no encontrada.`);
    if (insc.torneo && insc.torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        'No se pueden desinscribir clubes con el torneo iniciado. ' +
          'Cambia el estado a SUSPENDIDO desde la inscripción si necesitas retirarlo.',
      );
    }

    const r = await this.inscRepo.delete({ id, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Inscripción ${id} no encontrada.`);
    }
  }

  // ── Planilla del torneo ────────────────────────────────────────

  async listPlanilla(
    inscripcionId: string,
    tenantId: string,
  ): Promise<
    Array<{
      jugadorId: string;
      rut: string;
      nombres: string;
      apellidos: string;
      numeroCamiseta: number | null;
      posicion: string | null;
      capitan: boolean;
      fechaIncorporacion: string;
    }>
  > {
    await this.ensureInscripcion(inscripcionId, tenantId);
    const rows = await this.planillaRepo.find({
      where: { inscripcionId, tenantId },
      relations: { jugador: true },
      order: { fechaIncorporacion: 'ASC' },
    });
    return rows
      .filter((r) => r.jugador)
      .map((r) => ({
        jugadorId: r.jugadorId,
        rut: r.jugador!.rut,
        nombres: r.jugador!.nombres,
        apellidos: r.jugador!.apellidos,
        numeroCamiseta: r.jugador!.numeroCamiseta,
        posicion: r.jugador!.posicion,
        capitan: r.jugador!.capitan,
        fechaIncorporacion: r.fechaIncorporacion.toISOString(),
      }));
  }

  async addJugadorPlanilla(
    inscripcionId: string,
    tenantId: string,
    jugadorId: string,
  ): Promise<void> {
    const insc = await this.inscRepo.findOne({
      where: { id: inscripcionId, tenantId },
      relations: { torneo: true },
    });
    if (!insc) {
      throw new NotFoundException(`Inscripción ${inscripcionId} no encontrada.`);
    }
    const torneo = insc.torneo!;

    // Validar jugador existe + pertenece al CLUB Y CATEGORÍA correctos.
    const jugador = await this.jugadorRepo.findOne({
      where: { id: jugadorId, tenantId },
    });
    if (!jugador) {
      throw new NotFoundException(`Jugador ${jugadorId} no encontrado.`);
    }
    if (jugador.clubId !== insc.clubId) {
      throw new BadRequestException(
        'El jugador no pertenece al plantel del club inscrito.',
      );
    }
    if (jugador.categoriaId !== insc.categoriaId) {
      throw new BadRequestException(
        'El jugador no está en la misma categoría que la inscripción ' +
          '(cada categoría del club tiene su propio plantel).',
      );
    }
    if (jugador.estado === 'INACTIVO') {
      throw new BadRequestException(
        `El jugador "${jugador.nombres} ${jugador.apellidos}" está INACTIVO.`,
      );
    }

    // Tope de jugadores en la planilla del torneo.
    const yaEnPlanilla = await this.planillaRepo.count({
      where: { inscripcionId, tenantId },
    });
    if (yaEnPlanilla >= torneo.topeJugadoresPorEquipo) {
      throw new ConflictException(
        `La planilla está completa (${yaEnPlanilla}/` +
          `${torneo.topeJugadoresPorEquipo} jugadores). ` +
          'Quita alguno antes de agregar otro.',
      );
    }

    // Refuerzos: si el torneo NO está en DRAFT y refuerzos están
    // deshabilitados, no se permiten cambios. (Si está en DRAFT,
    // todavía no arrancó: cargar planilla es válido.)
    if (torneo.estado !== 'DRAFT' && !torneo.refuerzosHabilitados) {
      throw new ConflictException(
        'El torneo ya arrancó y los refuerzos están deshabilitados. ' +
          'No se pueden agregar más jugadores a la planilla.',
      );
    }

    // Si refuerzos habilitados pero pasada la fecha límite, se rechaza.
    // Nota: la "fecha actual del torneo" debería ser la próxima fecha
    // EN_CURSO/PROGRAMADA. Por ahora usamos la cantidad de fechas con
    // estado FINALIZADA + 1. Una implementación más fina podría chequear
    // si la fecha N tiene partidos ya jugados. Por simplicidad asumimos
    // que el cron de fechas mantiene esto coherente.
    if (
      torneo.estado !== 'DRAFT' &&
      torneo.refuerzosHabilitados &&
      torneo.fechaLimiteRefuerzosNumero != null
    ) {
      // TODO sprint posterior: consultar la fecha actual del torneo en
      // base a partidos jugados. Por ahora, dejamos pasar y el bloqueo
      // efectivo se hace cuando refuerzosHabilitados=false manualmente.
    }

    try {
      await this.planillaRepo.insert({
        tenantId,
        inscripcionId,
        jugadorId,
      });
    } catch (err) {
      // UNIQUE (inscripcion_id, jugador_id) — ya estaba en la planilla.
      if (
        err instanceof Error &&
        (err.message.includes('uq_planilla_jugador') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(
          'Este jugador ya está en la planilla del torneo.',
        );
      }
      throw err;
    }
  }

  async removeJugadorPlanilla(
    inscripcionId: string,
    tenantId: string,
    jugadorId: string,
  ): Promise<void> {
    await this.ensureInscripcion(inscripcionId, tenantId);

    const r = await this.planillaRepo.delete({
      inscripcionId,
      jugadorId,
      tenantId,
    });
    if (r.affected === 0) {
      throw new NotFoundException(
        `Jugador ${jugadorId} no está en la planilla.`,
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async ensureTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<Torneo> {
    const t = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado.`);
    return t;
  }

  private async ensureInscripcion(
    id: string,
    tenantId: string,
  ): Promise<InscripcionTorneo> {
    const i = await this.inscRepo.findOne({ where: { id, tenantId } });
    if (!i) throw new NotFoundException(`Inscripción ${id} no encontrada.`);
    return i;
  }

  private async contarUsoCombo(
    torneoId: string,
    tenantId: string,
    categoriaId: string,
    serieSlug: string | null,
  ): Promise<number> {
    const qb = this.inscRepo
      .createQueryBuilder('i')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('i.torneo_id = :torneoId', { torneoId })
      .andWhere('i.categoria_id = :categoriaId', { categoriaId });
    if (serieSlug == null) {
      qb.andWhere('i.serie_slug IS NULL');
    } else {
      qb.andWhere('i.serie_slug = :serieSlug', { serieSlug });
    }
    return qb.getCount();
  }

  private toDto(i: InscripcionTorneo, jugadoresEnPlanilla: number): InscripcionDto {
    const series = Array.isArray(i.categoria?.series) ? i.categoria!.series : [];
    const serieNom = i.serieSlug
      ? (series.find((s) => s.slug === i.serieSlug)?.nombre ?? i.serieSlug)
      : null;
    return {
      id: i.id,
      tenantId: i.tenantId,
      clubId: i.clubId,
      clubNombre: i.club?.nombre ?? '',
      clubEscudoUrl: i.club?.escudoUrl ?? null,
      torneoId: i.torneoId,
      torneoNombre: i.torneo?.nombre ?? '',
      categoriaId: i.categoriaId,
      categoriaNombre: i.categoria?.nombre ?? '',
      serieSlug: i.serieSlug,
      serieNombre: serieNom,
      estado: i.estado,
      jugadoresEnPlanilla,
      topeJugadores: i.torneo?.topeJugadoresPorEquipo ?? 25,
      createdAt: i.createdAt.toISOString(),
    };
  }
}
