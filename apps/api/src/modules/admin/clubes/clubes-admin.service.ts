import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import {
  calcularEdad,
  calcularEdadCalendario,
  validarPlantelCategoria,
} from '@fixtura/domain';
import {
  limpiarRut,
  validarRut,
  type Club as ClubDto,
  type ContactoDirectiva,
  type CreateClubRequest,
  type CreateJugadorClubRequest,
  type Jugador as JugadorDto,
  type UpdateClubRequest,
  type UpdateJugadorClubRequest,
} from '@fixtura/types';

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { ClubCategoria } from '../../competition/entities/club-categoria.entity';
import { Club } from '../../competition/entities/club.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';

/**
 * Sprint 26B (ADR-0004) — CRUD de clubes + plantel global del club.
 *
 * Reglas críticas validadas:
 *   - Slug único por tenant.
 *   - Categorías del club deben existir y ser del mismo tenant.
 *   - Al editar categorías: no se puede quitar una categoría que
 *     tiene jugadores cargados (rechaza con detalle).
 *   - Al inscribir jugador: RUT válido, no vetado, no en otro club,
 *     edad cumple categoría (o flag aceptarExcepcionEdad).
 *
 * El service NO usa transacciones explícitas — confiamos en la
 * envoltura de typeorm-transactional global. Si en el futuro hace
 * falta atomicidad para operaciones multi-tabla (ej. crear club +
 * categorías + jugadores en un solo POST), se agrega @Transactional.
 */
@Injectable()
export class ClubesAdminService {
  constructor(
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubCategoria)
    private readonly clubCatRepo: Repository<ClubCategoria>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
    private readonly dataSource: DataSource,
  ) {}

  // ── CRUD club ──────────────────────────────────────────────────

  async list(tenantId: string): Promise<ClubDto[]> {
    const clubes = await this.clubRepo.find({
      where: { tenantId },
      order: { nombre: 'ASC' },
    });
    if (clubes.length === 0) return [];

    // Categorías + counts en batch (1 query cada uno).
    const clubIds = clubes.map((c) => c.id);

    const clubCats = await this.clubCatRepo.find({
      where: { clubId: In(clubIds) },
      relations: { categoria: true },
    });
    const catsByClub = new Map<string, { id: string; nombre: string }[]>();
    for (const cc of clubCats) {
      const arr = catsByClub.get(cc.clubId) ?? [];
      arr.push({
        id: cc.categoriaId,
        nombre: cc.categoria?.nombre ?? '',
      });
      catsByClub.set(cc.clubId, arr);
    }

    const counts = await this.jugadorRepo
      .createQueryBuilder('j')
      .select('j.club_id', 'clubId')
      .addSelect('COUNT(*)', 'cnt')
      .where('j.tenant_id = :tenantId', { tenantId })
      .andWhere('j.club_id IN (:...clubIds)', { clubIds })
      .groupBy('j.club_id')
      .getRawMany<{ clubId: string; cnt: string }>();
    const countByClub = new Map<string, number>();
    for (const row of counts) countByClub.set(row.clubId, Number(row.cnt));

    return clubes.map((c) => this.toDto(c, catsByClub.get(c.id) ?? [], countByClub.get(c.id) ?? 0));
  }

  async findOne(id: string, tenantId: string): Promise<ClubDto> {
    const club = await this.clubRepo.findOne({ where: { id, tenantId } });
    if (!club) throw new NotFoundException(`Club ${id} no encontrado.`);

    const cats = await this.clubCatRepo.find({
      where: { clubId: id, tenantId },
      relations: { categoria: true },
    });
    const jugadoresCount = await this.jugadorRepo.count({
      where: { clubId: id, tenantId },
    });

    return this.toDto(
      club,
      cats.map((cc) => ({
        id: cc.categoriaId,
        nombre: cc.categoria?.nombre ?? '',
      })),
      jugadoresCount,
    );
  }

  async create(tenantId: string, input: CreateClubRequest): Promise<ClubDto> {
    const slug = input.slug.toLowerCase().trim();

    // Validar categorías
    await this.assertCategoriasValidas(tenantId, input.categoriaIds);

    // Verificar duplicado de slug (luego try/catch atrapa race).
    const dup = await this.clubRepo.findOne({ where: { tenantId, slug } });
    if (dup) {
      throw new ConflictException(`Ya existe un club con slug '${slug}'.`);
    }

    const club = this.clubRepo.create({
      tenantId,
      slug,
      nombre: input.nombre.trim(),
      escudoUrl: input.escudoUrl ?? null,
      colorPrimario: input.colorPrimario ?? null,
      colorSecundario: input.colorSecundario ?? null,
      paginaWeb: input.paginaWeb ?? null,
      resena: input.resena?.trim() || null,
      presidenteNombre: input.presidente?.nombre ?? null,
      presidenteEmail: input.presidente?.email ?? null,
      presidenteTelefono: input.presidente?.telefono ?? null,
      delegados: this.normalizarDelegados(input.delegados),
      historialManual: input.historialManual ?? null,
      estado: 'ACTIVO',
    });

    try {
      const saved = await this.clubRepo.save(club);
      // Insertar pivote categorías. Sin transacción explícita —
      // confiamos en typeorm-transactional global. Si falla aquí,
      // queda el club sin categorías y el siguiente PATCH lo arregla.
      await this.clubCatRepo.insert(
        input.categoriaIds.map((catId) => ({
          tenantId,
          clubId: saved.id,
          categoriaId: catId,
        })),
      );
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      // Race condition por UNIQUE slug — convertimos a 409 limpio.
      if (
        err instanceof Error &&
        (err.message.includes('uq_club_slug') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(`Ya existe un club con slug '${slug}'.`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateClubRequest,
  ): Promise<ClubDto> {
    const club = await this.clubRepo.findOne({ where: { id, tenantId } });
    if (!club) throw new NotFoundException(`Club ${id} no encontrado.`);

    if (input.nombre !== undefined) club.nombre = input.nombre.trim();
    if (input.escudoUrl !== undefined) club.escudoUrl = input.escudoUrl;
    if (input.colorPrimario !== undefined) club.colorPrimario = input.colorPrimario;
    if (input.colorSecundario !== undefined) club.colorSecundario = input.colorSecundario;
    if (input.paginaWeb !== undefined) club.paginaWeb = input.paginaWeb;
    if (input.resena !== undefined) club.resena = input.resena?.trim() || null;
    if (input.presidente !== undefined) {
      club.presidenteNombre = input.presidente?.nombre ?? null;
      club.presidenteEmail = input.presidente?.email ?? null;
      club.presidenteTelefono = input.presidente?.telefono ?? null;
    }
    if (input.delegados !== undefined) {
      club.delegados = this.normalizarDelegados(input.delegados);
    }
    if (input.historialManual !== undefined) {
      club.historialManual = input.historialManual;
    }
    if (input.estado !== undefined) club.estado = input.estado;

    await this.clubRepo.save(club);

    // Si vinieron categorías, re-sincronizar la tabla pivote.
    if (input.categoriaIds !== undefined) {
      await this.sincronizarCategorias(tenantId, id, input.categoriaIds);
    }

    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    // Eliminar club. FK CASCADE limpia club_categorias, jugadores y
    // (en sprint 26G) inscripciones que apunten a él. Si hay actas
    // ya cerradas en el modelo viejo, dejamos que el constraint hable.
    const result = await this.clubRepo.delete({ id, tenantId });
    if (result.affected === 0) {
      throw new NotFoundException(`Club ${id} no encontrado.`);
    }
  }

  // ── Plantel del club ───────────────────────────────────────────

  async listPlantel(
    clubId: string,
    tenantId: string,
    categoriaId?: string,
  ): Promise<JugadorDto[]> {
    await this.ensureClub(clubId, tenantId);
    const where: { clubId: string; tenantId: string; categoriaId?: string } = {
      clubId,
      tenantId,
    };
    if (categoriaId) where.categoriaId = categoriaId;
    const jugadores = await this.jugadorRepo.find({
      where,
      order: { apellidos: 'ASC', nombres: 'ASC' },
    });
    return jugadores.map((j) => this.toJugadorDto(j));
  }

  async addJugador(
    clubId: string,
    tenantId: string,
    input: CreateJugadorClubRequest,
  ): Promise<JugadorDto> {
    const club = await this.ensureClub(clubId, tenantId);
    if (club.estado === 'INACTIVO') {
      throw new BadRequestException(
        'El club está INACTIVO. Reactivalo antes de cargar jugadores.',
      );
    }

    // Validar RUT (formato + dígito verificador chileno).
    if (!validarRut(input.rut)) {
      throw new BadRequestException(
        'RUT inválido: chequeá el dígito verificador.',
      );
    }
    const rutNormalizado = limpiarRut(input.rut);

    // Validar categoría existe + pertenece al club.
    const categoria = await this.categoriaRepo.findOne({
      where: { id: input.categoriaId, tenantId },
    });
    if (!categoria) {
      throw new NotFoundException(
        `Categoría ${input.categoriaId} no encontrada.`,
      );
    }
    const pivote = await this.clubCatRepo.findOne({
      where: { clubId, categoriaId: input.categoriaId },
    });
    if (!pivote) {
      throw new BadRequestException(
        `El club no compite en la categoría '${categoria.nombre}'. ` +
          'Agregala desde la ficha del club antes de cargar jugadores.',
      );
    }

    // RUT no esté vetado en este tenant.
    const vetado = await this.vetadoRepo.findOne({
      where: { tenantId, rut: rutNormalizado },
    });
    if (vetado) {
      throw new ConflictException(
        `RUT ${rutNormalizado} está en la lista de vetados de la liga. ` +
          `Motivo: ${vetado.motivo ?? 'sin motivo registrado'}.`,
      );
    }

    // RUT no esté en otro club del tenant (UNIQUE lo respalda, validamos
    // antes para devolver un mensaje útil).
    const yaInscrito = await this.jugadorRepo.findOne({
      where: { tenantId, rut: rutNormalizado },
      relations: { club: true },
    });
    if (yaInscrito) {
      throw new ConflictException(
        `El jugador con RUT ${rutNormalizado} ya está fichado en ` +
          `'${yaInscrito.club?.nombre ?? 'otro club'}'. ` +
          'Un jugador solo puede estar en un club por liga.',
      );
    }

    // Validar edad contra la categoría. Si cae en excepción, requiere
    // flag aceptarExcepcionEdad para confirmar (modal en UI).
    if (input.fechaNac) {
      const resultado = validarPlantelCategoria(
        [{ id: 'tmp', fechaNac: input.fechaNac }],
        {
          edadMinimaGeneral: categoria.edadMinimaGeneral,
          cupoExcepcionesPorEquipo: categoria.cupoExcepcionesPorEquipo,
          edadMinimaExcepcion: categoria.edadMinimaExcepcion,
        },
      );
      const det = resultado.detalle[0];
      if (det?.estado === 'BLOQUEADO') {
        throw new BadRequestException(
          `El jugador (${det.edadCalendario} años calendario) no cumple ` +
            `la edad mínima de la categoría '${categoria.nombre}' ` +
            `(mín. ${categoria.edadMinimaGeneral} años` +
            (categoria.cupoExcepcionesPorEquipo > 0 &&
            categoria.edadMinimaExcepcion != null
              ? `, excepción desde ${categoria.edadMinimaExcepcion}`
              : '') +
            `).`,
        );
      }
      if (det?.estado === 'EN_EXCEPCION' && !input.aceptarExcepcionEdad) {
        throw new ConflictException(
          `El jugador (${det.edadCalendario} años) entra en EXCEPCIÓN de ` +
            `edad para '${categoria.nombre}'. Confirmá la inscripción ` +
            `reenviando con aceptarExcepcionEdad=true.`,
        );
      }
    }

    const jugador = this.jugadorRepo.create({
      tenantId,
      clubId,
      categoriaId: input.categoriaId,
      rut: rutNormalizado,
      nombres: input.nombres.trim(),
      apellidos: input.apellidos.trim(),
      fechaNac: input.fechaNac ?? null,
      email: input.email ?? null,
      telefono: input.telefono ?? null,
      numeroCamiseta: input.numeroCamiseta ?? null,
      posicion: input.posicion ?? null,
      pieHabil: input.pieHabil ?? null,
      apodo: input.apodo?.trim() || null,
      capitan: input.capitan ?? false,
      estado: 'ACTIVO',
    });

    try {
      const saved = await this.jugadorRepo.save(jugador);
      return this.toJugadorDto(saved);
    } catch (err) {
      // Race condition con UNIQUE (tenant_id, rut)
      if (
        err instanceof Error &&
        (err.message.includes('uq_jugador_rut') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(
          `El RUT ${rutNormalizado} ya está fichado en otro club ` +
            'de esta liga.',
        );
      }
      throw err;
    }
  }

  async updateJugador(
    clubId: string,
    jugadorId: string,
    tenantId: string,
    input: UpdateJugadorClubRequest,
  ): Promise<JugadorDto> {
    await this.ensureClub(clubId, tenantId);
    const jugador = await this.jugadorRepo.findOne({
      where: { id: jugadorId, clubId, tenantId },
    });
    if (!jugador) {
      throw new NotFoundException(`Jugador ${jugadorId} no encontrado.`);
    }

    if (input.nombres !== undefined) jugador.nombres = input.nombres.trim();
    if (input.apellidos !== undefined) jugador.apellidos = input.apellidos.trim();
    if (input.fechaNac !== undefined) jugador.fechaNac = input.fechaNac;
    if (input.email !== undefined) jugador.email = input.email;
    if (input.telefono !== undefined) jugador.telefono = input.telefono;
    if (input.numeroCamiseta !== undefined) {
      jugador.numeroCamiseta = input.numeroCamiseta;
    }
    if (input.posicion !== undefined) jugador.posicion = input.posicion;
    if (input.pieHabil !== undefined) jugador.pieHabil = input.pieHabil;
    if (input.apodo !== undefined) jugador.apodo = input.apodo?.trim() || null;
    if (input.capitan !== undefined) jugador.capitan = input.capitan;
    if (input.estado !== undefined) jugador.estado = input.estado;

    // No permitimos cambiar categoria_id ni RUT por PATCH — son
    // cambios estructurales que requieren borrar y volver a crear.

    const saved = await this.jugadorRepo.save(jugador);
    return this.toJugadorDto(saved);
  }

  async removeJugador(
    clubId: string,
    jugadorId: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureClub(clubId, tenantId);
    const r = await this.jugadorRepo.delete({
      id: jugadorId,
      clubId,
      tenantId,
    });
    if (r.affected === 0) {
      throw new NotFoundException(`Jugador ${jugadorId} no encontrado.`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async ensureClub(clubId: string, tenantId: string): Promise<Club> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) throw new NotFoundException(`Club ${clubId} no encontrado.`);
    return club;
  }

  private async assertCategoriasValidas(
    tenantId: string,
    categoriaIds: string[],
  ): Promise<void> {
    if (categoriaIds.length === 0) {
      throw new BadRequestException('Elegí al menos una categoría.');
    }
    // Dedupe
    const ids = Array.from(new Set(categoriaIds));
    const found = await this.categoriaRepo.find({
      where: { tenantId, id: In(ids) },
    });
    if (found.length !== ids.length) {
      const faltantes = ids.filter((id) => !found.some((c) => c.id === id));
      throw new BadRequestException(
        `Categoría(s) inválida(s) o de otro tenant: ${faltantes.join(', ')}.`,
      );
    }
    // No bloqueamos si alguna está inactiva — el admin puede querer
    // mantener históricamente al club en una categoría desactivada.
  }

  private async sincronizarCategorias(
    tenantId: string,
    clubId: string,
    nuevasCategoriaIds: string[],
  ): Promise<void> {
    await this.assertCategoriasValidas(tenantId, nuevasCategoriaIds);

    const actuales = await this.clubCatRepo.find({ where: { clubId, tenantId } });
    const actualSet = new Set(actuales.map((c) => c.categoriaId));
    const nuevasSet = new Set(nuevasCategoriaIds);

    const aQuitar = actuales.filter((c) => !nuevasSet.has(c.categoriaId));
    const aAgregar = nuevasCategoriaIds.filter((id) => !actualSet.has(id));

    // No permitir quitar categorías que tienen jugadores cargados.
    if (aQuitar.length > 0) {
      const counts = await this.jugadorRepo
        .createQueryBuilder('j')
        .select('j.categoria_id', 'categoriaId')
        .addSelect('COUNT(*)', 'cnt')
        .where('j.club_id = :clubId AND j.tenant_id = :tenantId', {
          clubId,
          tenantId,
        })
        .andWhere('j.categoria_id IN (:...ids)', {
          ids: aQuitar.map((c) => c.categoriaId),
        })
        .groupBy('j.categoria_id')
        .getRawMany<{ categoriaId: string; cnt: string }>();
      const bloqueadas = counts.filter((c) => Number(c.cnt) > 0);
      if (bloqueadas.length > 0) {
        throw new ConflictException(
          'No se pueden quitar categorías con jugadores cargados. ' +
            `Categorías con plantel: ${bloqueadas.map((b) => b.categoriaId).join(', ')}. ` +
            'Eliminá primero los jugadores o desactivá el club.',
        );
      }
    }

    if (aQuitar.length > 0) {
      await this.clubCatRepo.delete({
        clubId,
        categoriaId: In(aQuitar.map((c) => c.categoriaId)),
      });
    }
    if (aAgregar.length > 0) {
      await this.clubCatRepo.insert(
        aAgregar.map((catId) => ({ tenantId, clubId, categoriaId: catId })),
      );
    }
  }

  private normalizarDelegados(
    delegados: ContactoDirectiva[] | undefined,
  ): ContactoDirectiva[] {
    if (!delegados) return [];
    return delegados.map((d) => ({
      nombre: d.nombre.trim(),
      email: d.email?.trim() || null,
      telefono: d.telefono?.trim() || null,
    }));
  }

  private toDto(
    c: Club,
    categorias: { id: string; nombre: string }[],
    jugadoresCount: number,
  ): ClubDto {
    return {
      id: c.id,
      tenantId: c.tenantId,
      slug: c.slug,
      nombre: c.nombre,
      escudoUrl: c.escudoUrl,
      colorPrimario: c.colorPrimario,
      colorSecundario: c.colorSecundario,
      paginaWeb: c.paginaWeb,
      resena: c.resena,
      presidente: c.presidenteNombre
        ? {
            nombre: c.presidenteNombre,
            email: c.presidenteEmail,
            telefono: c.presidenteTelefono,
          }
        : null,
      delegados: Array.isArray(c.delegados) ? c.delegados : [],
      historialManual: c.historialManual,
      estado: c.estado,
      categoriaIds: categorias.map((cat) => cat.id),
      categoriaNombres: categorias.map((cat) => cat.nombre),
      jugadoresCount,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private toJugadorDto(j: Jugador): JugadorDto {
    return {
      id: j.id,
      tenantId: j.tenantId,
      clubId: j.clubId,
      categoriaId: j.categoriaId,
      rut: j.rut,
      nombres: j.nombres,
      apellidos: j.apellidos,
      fechaNac: j.fechaNac,
      email: j.email,
      telefono: j.telefono,
      numeroCamiseta: j.numeroCamiseta,
      posicion: j.posicion,
      pieHabil: j.pieHabil,
      apodo: j.apodo,
      capitan: j.capitan,
      estado: j.estado,
      edad: calcularEdad(j.fechaNac),
      edadCalendario: calcularEdadCalendario(j.fechaNac),
      createdAt: j.createdAt.toISOString(),
    };
  }
}
