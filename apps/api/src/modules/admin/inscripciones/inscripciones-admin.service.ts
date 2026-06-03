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

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { ClubCategoria } from '../../competition/entities/club-categoria.entity';
import { Club } from '../../competition/entities/club.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { PlanillaTorneo } from '../../competition/entities/planilla-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { TarifaAplicadorService } from '../tarifas/tarifa-aplicador.service';

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
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    // ── Shim de coexistencia (Sprint 26G.2) ──────────────────────
    // Estos dos repos del modelo viejo se usan SÓLO para mantener
    // sincronizado el "equipo sombra" + sus jugadores_inscritos. No
    // se exponen en endpoints — son detalle de implementación del
    // shim que permite que fixture/actas/sanciones sigan funcionando.
    @InjectRepository(Equipo)
    private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorInscritoRepo: Repository<JugadorInscrito>,
    // Sprint 34C — hook de matrícula automática al inscribir.
    private readonly tarifaAplicador: TarifaAplicadorService,
  ) {}

  /**
   * Sprint 26G.2 — Asegura el "equipo sombra" del modelo viejo que
   * corresponde a esta inscripción. Si ya existe, devuelve el ID.
   * Si no, lo crea con datos copiados del club + categoría.
   */
  private async ensureEquipoSombra(
    insc: InscripcionTorneo,
    club: Club,
    tenantId: string,
  ): Promise<string> {
    if (insc.equipoSombraId) return insc.equipoSombraId;

    // Slug del equipo sombra: <club.slug>-<categoria.slug> para evitar
    // colisión cuando un mismo club se inscribe a dos categorías del
    // mismo torneo (UNIQUE de equipos es torneo_id + slug).
    const cat = await this.categoriaRepo.findOne({
      where: { id: insc.categoriaId, tenantId },
    });
    const catSlug = cat?.slug ?? insc.categoriaId.slice(0, 8);
    let slugBase = `${club.slug}-${catSlug}`;
    // En el remoto caso que ya exista por una migración previa, agregamos
    // sufijo aleatorio. Es un fallback raro; en flujo limpio nunca pasa.
    let slug = slugBase;
    let attempt = 1;
    while (
      await this.equipoRepo.findOne({
        where: { torneoId: insc.torneoId, slug },
      })
    ) {
      attempt++;
      if (attempt > 5) {
        slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
        break;
      }
      slug = `${slugBase}-${attempt}`;
    }

    const equipo = this.equipoRepo.create({
      tenantId,
      torneoId: insc.torneoId,
      nombre: club.nombre,
      slug,
      escudoUrl: club.escudoUrl,
      colorPrimario: club.colorPrimario,
      colorSecundario: club.colorSecundario,
      delegadoUserId: null,
      estado: 'INSCRITO',
      serieSlug: insc.serieSlug,
    });
    const saved = await this.equipoRepo.save(equipo);

    // Anotar en la inscripción
    insc.equipoSombraId = saved.id;
    await this.inscRepo.save(insc);

    return saved.id;
  }

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
          `solicitada. Editá el torneo para agregarla antes de inscribir.`,
      );
    }

    // Validar club existe, activo y pertenece al tenant.
    const club = await this.clubRepo.findOne({
      where: { id: input.clubId, tenantId },
    });
    if (!club) throw new NotFoundException(`Club ${input.clubId} no encontrado.`);
    if (club.estado === 'INACTIVO') {
      throw new BadRequestException(
        `El club "${club.nombre}" está INACTIVO. Reactivalo antes de inscribirlo.`,
      );
    }

    // Validar club compite en esa categoría (existe en club_categorias).
    const enCategoria = await this.clubCatRepo.findOne({
      where: { clubId: input.clubId, categoriaId: input.categoriaId },
    });
    if (!enCategoria) {
      throw new BadRequestException(
        `El club "${club.nombre}" no compite en la categoría seleccionada. ` +
          'Editá la ficha del club para agregar esta categoría primero.',
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

    // Sprint 26G.2 — Shim: crear equipo sombra en el modelo viejo para
    // que fixture/actas/sanciones puedan operar sobre el equipo "real".
    await this.ensureEquipoSombra(saved, club, tenantId);

    // Sprint 34C — Hook: generar el cobro de MATRICULA si el torneo
    // tiene tarifa configurada. Si no hay tarifa, el aplicador deja
    // un audit log y devuelve null silenciosamente — no bloquea la
    // inscripción. Cualquier excepción inesperada también la
    // contenemos acá para que no rompa el caller.
    try {
      await this.tarifaAplicador.aplicarMatricula(saved.id, tenantId);
    } catch (err) {
      // Log y seguir — la inscripción ya está, lo financiero se puede
      // reponer manualmente desde /admin/finanzas.
      // eslint-disable-next-line no-console
      console.warn(
        `[inscripcion] matricula auto falló insc=${saved.id}: ${(err as Error).message}`,
      );
    }

    return this.findOne(saved.id, tenantId);
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
          'Cambiá el estado a SUSPENDIDO desde la inscripción si necesitás retirarlo.',
      );
    }

    const equipoSombraId = insc.equipoSombraId;

    const r = await this.inscRepo.delete({ id, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Inscripción ${id} no encontrada.`);
    }

    // Sprint 26G.2 — Shim: si el equipo sombra no tiene partidos
    // jugados todavía (estamos en DRAFT, recién validado arriba), lo
    // borramos. Esto cascade a sus jugadores_inscritos.
    // Si tuviera partidos, la FK del partido lo bloquearía — en ese
    // caso lo dejamos como histórico.
    if (equipoSombraId) {
      try {
        await this.equipoRepo.delete({ id: equipoSombraId, tenantId });
      } catch {
        // Si falla por FK (partidos existentes), lo dejamos. Sigue
        // funcionando porque inscripcion_*_id en partido también
        // quedó NULL por ON DELETE SET NULL.
      }
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
          'Quitá alguno antes de agregar otro.',
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
      // Sprint 26G.2 — Shim: replicar el jugador al jugadores_inscritos
      // del equipo sombra para que actas/sanciones lo vean.
      const club = await this.clubRepo.findOne({
        where: { id: insc.clubId, tenantId },
      });
      if (club) {
        const equipoSombraId = await this.ensureEquipoSombra(
          insc,
          club,
          tenantId,
        );
        await this.sincronizarJugadorAModeloViejo(
          tenantId,
          equipoSombraId,
          jugador,
        );
      }
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
    const insc = await this.ensureInscripcion(inscripcionId, tenantId);

    // Antes de borrar, buscar el jugador (necesitamos el RUT para el
    // shim) y el equipo sombra para limpiar el modelo viejo.
    const jugador = await this.jugadorRepo.findOne({
      where: { id: jugadorId, tenantId },
    });

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

    // Sprint 26G.2 — Shim: borrar el jugador_inscrito del equipo sombra.
    if (insc.equipoSombraId && jugador) {
      await this.jugadorInscritoRepo.delete({
        equipoId: insc.equipoSombraId,
        tenantId,
        rut: jugador.rut,
      });
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

  /**
   * Sprint 26G.2 — Replica el jugador del modelo nuevo (jugadores)
   * a un jugadores_inscritos del modelo viejo dentro del equipo
   * sombra. Idempotente: si ya existe el RUT en ese equipo, actualiza
   * los datos para que se mantengan en sync.
   *
   * El modelo viejo usa RUT (tenant_id, rut, torneo_id) como key
   * lógica para sanciones — por eso la sincronización pasa por RUT.
   */
  private async sincronizarJugadorAModeloViejo(
    tenantId: string,
    equipoId: string,
    jugadorNuevo: Jugador,
  ): Promise<void> {
    const existente = await this.jugadorInscritoRepo.findOne({
      where: { tenantId, equipoId, rut: jugadorNuevo.rut },
    });
    if (existente) {
      // Actualizar datos por si cambió algo en el modelo nuevo
      existente.nombre = jugadorNuevo.nombres;
      existente.apellido = jugadorNuevo.apellidos;
      existente.fechaNac = jugadorNuevo.fechaNac;
      existente.numeroCamiseta = jugadorNuevo.numeroCamiseta;
      existente.posicion = jugadorNuevo.posicion;
      existente.pieHabil = jugadorNuevo.pieHabil;
      existente.apodo = jugadorNuevo.apodo;
      existente.capitan = jugadorNuevo.capitan;
      await this.jugadorInscritoRepo.save(existente);
      return;
    }
    const inscrito = this.jugadorInscritoRepo.create({
      tenantId,
      equipoId,
      nombre: jugadorNuevo.nombres,
      apellido: jugadorNuevo.apellidos,
      apodo: jugadorNuevo.apodo,
      rut: jugadorNuevo.rut,
      numeroCamiseta: jugadorNuevo.numeroCamiseta,
      posicion: jugadorNuevo.posicion,
      pieHabil: jugadorNuevo.pieHabil,
      fechaNac: jugadorNuevo.fechaNac,
      capitan: jugadorNuevo.capitan,
    });
    await this.jugadorInscritoRepo.save(inscrito);
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
