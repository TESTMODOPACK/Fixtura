import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  validarPlantelCategoria,
  type PlantelValidacionResult,
} from '@fixtura/domain';
import type {
  CreateEquipoRequest,
  EquipoAdmin,
  ValidarPlantelResult,
} from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class EquiposAdminService {
  constructor(
    @InjectRepository(Equipo) private readonly repo: Repository<Equipo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    @InjectRepository(InscripcionTorneo)
    private readonly inscRepo: Repository<InscripcionTorneo>,
  ) {}

  async listByTorneo(torneoId: string, tenantId: string): Promise<EquipoAdmin[]> {
    const torneo = await this.ensureTorneo(torneoId, tenantId);
    const equipos = await this.repo.find({
      where: { torneoId, tenantId },
      order: { nombre: 'ASC' },
    });
    // Resolvemos la categoría una sola vez para mapear serieSlug→nombre
    // y evitar un N+1 desde toDto.
    const categoria = torneo.categoriaId
      ? await this.categoriaRepo.findOne({
          where: { id: torneo.categoriaId, tenantId },
        })
      : null;
    return Promise.all(equipos.map((e) => this.toDto(e, categoria)));
  }

  async findOne(id: string, tenantId: string): Promise<EquipoAdmin> {
    const e = await this.repo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException(`Equipo ${id} no encontrado`);
    const torneo = await this.torneoRepo.findOne({
      where: { id: e.torneoId, tenantId },
    });
    const categoria = torneo?.categoriaId
      ? await this.categoriaRepo.findOne({
          where: { id: torneo.categoriaId, tenantId },
        })
      : null;
    return this.toDto(e, categoria);
  }

  async create(
    torneoId: string,
    tenantId: string,
    input: CreateEquipoRequest,
  ): Promise<EquipoAdmin> {
    const torneo = await this.ensureTorneoFull(torneoId, tenantId);

    // No se pueden inscribir equipos en un torneo ya iniciado o cerrado.
    // Si la liga necesita agregar un equipo después de arrancar, primero
    // tiene que volver el torneo a DRAFT (resetea fixture).
    if (torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        `No se pueden inscribir equipos en un torneo ${torneo.estado}. ` +
          'Para agregar equipos, el torneo debe estar en DRAFT (sin fixture generado).',
      );
    }

    // Validar serieSlug contra la categoría del torneo (Sprint 25 paso 3).
    // Si el torneo no tiene categoría, ignorar el slug que venga (no hay
    // contra qué validarlo). Si el torneo sí tiene categoría y el slug
    // viene, debe existir en su lista de series activas.
    const categoria = torneo.categoriaId
      ? await this.categoriaRepo.findOne({
          where: { id: torneo.categoriaId, tenantId },
        })
      : null;

    const serieSlug = await this.validarSerieSlug(input.serieSlug, categoria, torneo.categoriaId);

    const dup = await this.repo.findOne({ where: { torneoId, slug: input.slug } });
    if (dup) {
      throw new ConflictException(`Ya existe un equipo con slug "${input.slug}" en este torneo`);
    }

    const e = this.repo.create({
      tenantId,
      torneoId,
      nombre: input.nombre,
      slug: input.slug,
      escudoUrl: input.escudoUrl ?? null,
      colorPrimario: input.colorPrimario ?? null,
      colorSecundario: input.colorSecundario ?? null,
      delegadoUserId: input.delegadoUserId ?? null,
      estado: 'INSCRITO',
      serieSlug,
    });
    try {
      const saved = await this.repo.save(e);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      // Race condition con UNIQUE (torneo_id, slug)
      if (
        err instanceof Error &&
        (err.message.includes('duplicate key') || err.message.includes('UQ_'))
      ) {
        throw new ConflictException(
          `Ya existe un equipo con slug "${input.slug}" en este torneo`,
        );
      }
      throw err;
    }
  }

  /**
   * Eliminar un equipo del torneo. Solo permitido si el torneo está en
   * DRAFT (sin fixture activo) — un equipo con partidos jugados rompe
   * historial e integridad de actas/sanciones.
   *
   * Si el equipo es "sombra" de una inscripción de club (modelo 26),
   * lo bloqueamos y derivamos al flujo de desinscripción que mantiene
   * la consistencia de inscripciones_torneo + planilla.
   *
   * Las FKs de partidos son ON DELETE CASCADE — al borrar el equipo,
   * los partidos del fixture asociados se borran en cascada. En DRAFT
   * eso significa que no hay actas cerradas que perder.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const equipo = await this.repo.findOne({ where: { id, tenantId } });
    if (!equipo) throw new NotFoundException(`Equipo ${id} no encontrado`);

    const torneo = await this.torneoRepo.findOne({
      where: { id: equipo.torneoId, tenantId },
    });
    if (!torneo) {
      throw new NotFoundException('Torneo del equipo no encontrado');
    }
    if (torneo.estado !== 'DRAFT') {
      throw new ConflictException(
        `No se pueden eliminar equipos de un torneo ${torneo.estado}. ` +
          'Para retirar un equipo en competición, suspendelo desde su ficha.',
      );
    }

    const inscrip = await this.inscRepo.findOne({
      where: { equipoSombraId: id, tenantId },
      select: ['id'],
    });
    if (inscrip) {
      throw new ConflictException(
        'Este equipo está vinculado a una inscripción de club. ' +
          'Eliminalo desde la pestaña "Inscripciones" del torneo para ' +
          'mantener la planilla consistente.',
      );
    }

    await this.repo.delete({ id, tenantId });
  }

  /**
   * Valida el plantel del equipo contra la categoría del torneo.
   * Si el torneo no tiene categoría, devuelve un resultado "neutro" con
   * apto=true (no hay regla que aplicar).
   */
  async validarPlantel(
    equipoId: string,
    tenantId: string,
  ): Promise<ValidarPlantelResult> {
    const equipo = await this.repo.findOne({ where: { id: equipoId, tenantId } });
    if (!equipo) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);

    const torneo = await this.torneoRepo.findOne({
      where: { id: equipo.torneoId, tenantId },
    });
    if (!torneo) {
      throw new NotFoundException(`Torneo del equipo ${equipoId} no encontrado`);
    }

    // Sin categoría: nada que validar. Devolvemos un resultado vacío con
    // apto=true y sinCategoria=true para que la UI lo distinga del caso
    // "validó OK con regla".
    if (!torneo.categoriaId) {
      const jugadoresCount = await this.jugadorRepo.count({
        where: { equipoId, tenantId },
      });
      return {
        validos: jugadoresCount,
        enExcepcion: 0,
        bloqueados: 0,
        sinFecha: 0,
        totalJugadores: jugadoresCount,
        cupoExcepcionesDisponibles: 0,
        cupoExcepcionesUsado: 0,
        apto: true,
        motivosRechazo: [],
        sinCategoria: true,
      };
    }

    const categoria = await this.categoriaRepo.findOne({
      where: { id: torneo.categoriaId, tenantId },
    });
    if (!categoria) {
      // FK ON DELETE SET NULL puede dejar este escenario: el torneo tenía
      // categoría que se borró. El field debería ya estar en null por la
      // FK action, pero por las dudas.
      throw new BadRequestException(
        'La categoría asociada al torneo ya no existe. Editá el torneo para asignar una nueva.',
      );
    }

    const jugadores = await this.jugadorRepo.find({
      where: { equipoId, tenantId },
      select: ['id', 'nombre', 'apellido', 'fechaNac'],
    });

    const resultado: PlantelValidacionResult = validarPlantelCategoria(
      jugadores.map((j) => ({
        id: j.id,
        nombre: j.nombre ?? '',
        apellido: j.apellido ?? '',
        fechaNac: j.fechaNac,
      })),
      {
        edadMinimaGeneral: categoria.edadMinimaGeneral,
        cupoExcepcionesPorEquipo: categoria.cupoExcepcionesPorEquipo,
        edadMinimaExcepcion: categoria.edadMinimaExcepcion,
      },
    );

    // El tipo ValidarPlantelResult expuesto al frontend no incluye
    // `detalle` (lista por jugador) para evitar payload grande en
    // /list. Si la UI lo necesita, hacemos un endpoint /:id/validar-plantel/detalle.
    return {
      validos: resultado.validos,
      enExcepcion: resultado.enExcepcion,
      bloqueados: resultado.bloqueados,
      sinFecha: resultado.sinFecha,
      totalJugadores: resultado.totalJugadores,
      cupoExcepcionesDisponibles: resultado.cupoExcepcionesDisponibles,
      cupoExcepcionesUsado: resultado.cupoExcepcionesUsado,
      apto: resultado.apto,
      motivosRechazo: resultado.motivosRechazo,
      sinCategoria: false,
    };
  }

  private async ensureTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<{ id: string; estado: 'DRAFT' | 'ACTIVO' | 'CERRADO'; categoriaId: string | null }> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return { id: torneo.id, estado: torneo.estado, categoriaId: torneo.categoriaId };
  }

  private async ensureTorneoFull(
    torneoId: string,
    tenantId: string,
  ): Promise<Torneo> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    return torneo;
  }

  /**
   * Si el torneo tiene categoría y vino un serieSlug, valida que exista
   * en la lista de series ACTIVAS de la categoría. Si el torneo NO tiene
   * categoría, ignora el slug (devuelve null) — no tiene sentido guardarlo.
   */
  private async validarSerieSlug(
    slug: string | null | undefined,
    categoria: CategoriaJugadores | null,
    torneoCategoriaId: string | null,
  ): Promise<string | null> {
    if (!slug) return null;
    if (!torneoCategoriaId) return null; // sin categoría no hay series
    if (!categoria) {
      throw new BadRequestException(
        'El torneo apunta a una categoría que ya no existe. Editá el torneo primero.',
      );
    }
    const series = Array.isArray(categoria.series) ? categoria.series : [];
    const found = series.find((s) => s.slug === slug && s.activa);
    if (!found) {
      const disponibles = series
        .filter((s) => s.activa)
        .map((s) => s.slug)
        .join(', ');
      throw new BadRequestException(
        `La serie "${slug}" no existe (o está inactiva) en la categoría del torneo. ` +
          (disponibles ? `Disponibles: ${disponibles}.` : 'No hay series definidas.'),
      );
    }
    return slug;
  }

  private async toDto(
    e: Equipo,
    categoria: CategoriaJugadores | null,
  ): Promise<EquipoAdmin> {
    const jugadoresCount = await this.jugadorRepo.count({ where: { equipoId: e.id } });
    const series = categoria && Array.isArray(categoria.series) ? categoria.series : [];
    const serie = e.serieSlug ? series.find((s) => s.slug === e.serieSlug) : null;
    return {
      id: e.id,
      torneoId: e.torneoId,
      nombre: e.nombre,
      slug: e.slug,
      escudoUrl: e.escudoUrl,
      colorPrimario: e.colorPrimario,
      colorSecundario: e.colorSecundario,
      delegadoUserId: e.delegadoUserId,
      estado: e.estado,
      jugadoresCount,
      serieSlug: e.serieSlug,
      serieNombre: serie?.nombre ?? null,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
