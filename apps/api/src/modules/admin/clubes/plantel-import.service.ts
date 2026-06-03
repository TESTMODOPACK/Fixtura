import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  calcularEdadCalendario,
  validarPlantelCategoria,
} from '@fixtura/domain';
import {
  limpiarRut,
  validarRut,
  type BulkImportConfirmRequest,
  type BulkImportPreview,
  type BulkImportPreviewRow,
  type BulkImportResult,
  type BulkImportRow,
} from '@fixtura/types';

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { ClubCategoria } from '../../competition/entities/club-categoria.entity';
import { Club } from '../../competition/entities/club.entity';
import { Jugador } from '../../competition/entities/jugador.entity';
import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';

/**
 * Sprint 28 — Servicio de importación masiva de planteles.
 *
 * Reglas (ADR-0004 + decisiones del usuario):
 *   - El admin elige una categoría destino. Debe ser una de las
 *     asignadas al club (existe en club_categorias).
 *   - Match por RUT a nivel del tenant.
 *   - RUT en otro club del tenant → RECHAZADO ("ya está en X").
 *   - RUT vetado → RECHAZADO con motivo.
 *   - Si edad cae en excepción del cupo de la categoría y aún hay
 *     cupo, marca como EN_EXCEPCION. Si se excede, rechaza.
 *   - Jugadores actuales del plantel que NO vienen en el archivo →
 *     se proponen INACTIVAR (estado = INACTIVO, NO se borran).
 *   - Preview NO commitea cambios. Confirm aplica.
 *   - Confirm es idempotente: re-valida todo antes de aplicar.
 *     Si en el medio cambió algo (ej. otro admin agregó al jugador a
 *     otro club), se rechaza esa fila en confirm sin romper el resto.
 */
@Injectable()
export class PlantelImportService {
  constructor(
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubCategoria)
    private readonly clubCatRepo: Repository<ClubCategoria>,
    @InjectRepository(CategoriaJugadores)
    private readonly categoriaRepo: Repository<CategoriaJugadores>,
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    @InjectRepository(JugadorVetado)
    private readonly vetadoRepo: Repository<JugadorVetado>,
  ) {}

  /**
   * Evalúa cada fila del archivo contra el estado actual sin commitear.
   */
  async previsualizar(
    clubId: string,
    tenantId: string,
    categoriaId: string,
    rows: BulkImportRow[],
  ): Promise<BulkImportPreview> {
    const { club, categoria } = await this.ensureClubYCategoria(
      clubId,
      tenantId,
      categoriaId,
    );

    // Estado actual del plantel en esta categoría
    const plantelActual = await this.jugadorRepo.find({
      where: { clubId, categoriaId, tenantId },
    });
    const plantelByRut = new Map(plantelActual.map((j) => [j.rut, j]));

    // RUTs vetados del tenant
    const vetados = await this.vetadoRepo.find({
      where: { tenantId },
      select: ['rut', 'motivo'],
    });
    const vetadoByRut = new Map(vetados.map((v) => [v.rut, v.motivo]));

    // Resolver duplicados internos del archivo (mismo RUT dos veces)
    const rutsArchivo = new Set<string>();
    const rutsDuplicados = new Set<string>();
    for (const r of rows) {
      const rut = limpiarRut(r.rut ?? '');
      if (rutsArchivo.has(rut)) rutsDuplicados.add(rut);
      else rutsArchivo.add(rut);
    }

    // Jugadores con ese RUT en OTROS clubes del mismo tenant
    let otrosClubesByRut = new Map<string, { clubNombre: string }>();
    if (rutsArchivo.size > 0) {
      const enOtrosClubes = await this.jugadorRepo
        .createQueryBuilder('j')
        .leftJoinAndSelect('j.club', 'club')
        .where('j.tenant_id = :tenantId', { tenantId })
        .andWhere('j.rut IN (:...ruts)', { ruts: Array.from(rutsArchivo) })
        .andWhere('j.club_id <> :clubId', { clubId })
        .getMany();
      otrosClubesByRut = new Map(
        enOtrosClubes.map((j) => [j.rut, { clubNombre: j.club?.nombre ?? '?' }]),
      );
    }

    // Procesar filas
    const filasPreview: BulkImportPreviewRow[] = [];
    let cupoExcepcionesUsado = 0;
    const cupoExcepcionesDisponible = categoria.cupoExcepcionesPorEquipo;

    for (const raw of rows) {
      const rut = limpiarRut(raw.rut ?? '');
      const nombres = (raw.nombres ?? '').trim();
      const apellidos = (raw.apellidos ?? '').trim();

      // Validaciones bloqueantes (orden importa para mensaje claro)
      if (!rut || !validarRut(rut)) {
        filasPreview.push({
          rut: raw.rut ?? '(vacío)',
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: 'RUT inválido — chequeá el dígito verificador.',
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      if (rutsDuplicados.has(rut)) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: 'RUT duplicado dentro del mismo archivo.',
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      if (!nombres || nombres.length < 2) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: 'Nombres faltantes o muy cortos.',
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      if (!apellidos || apellidos.length < 2) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: 'Apellidos faltantes o muy cortos.',
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      if (raw.email && !this.emailValido(raw.email)) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: `Email inválido: "${raw.email}".`,
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      const veto = vetadoByRut.get(rut);
      if (veto !== undefined) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: `Vetado de por vida en la liga${veto ? ` — ${veto}` : ''}.`,
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      const otroClub = otrosClubesByRut.get(rut);
      if (otroClub) {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: 'RECHAZADO',
          motivo: `Ya está fichado en "${otroClub.clubNombre}". Un jugador solo puede estar en un club por liga.`,
          edadCalendario: null,
          jugadorId: null,
          cambios: [],
        });
        continue;
      }

      // Edad calendario para validación de categoría
      const fechaNac = raw.fechaNac ?? null;
      const edadCal = calcularEdadCalendario(fechaNac);

      // Validar con el helper compartido (defensa en profundidad)
      let estaEnExcepcion = false;
      if (fechaNac && edadCal != null) {
        const validacion = validarPlantelCategoria(
          [{ id: 'tmp', fechaNac }],
          {
            edadMinimaGeneral: categoria.edadMinimaGeneral,
            cupoExcepcionesPorEquipo: categoria.cupoExcepcionesPorEquipo,
            edadMinimaExcepcion: categoria.edadMinimaExcepcion,
          },
        );
        const det = validacion.detalle[0];
        if (det?.estado === 'BLOQUEADO') {
          filasPreview.push({
            rut,
            nombres,
            apellidos,
            action: 'RECHAZADO',
            motivo: `Edad calendario ${edadCal} insuficiente para "${categoria.nombre}" (mín. ${categoria.edadMinimaGeneral}).`,
            edadCalendario: edadCal,
            jugadorId: null,
            cambios: [],
          });
          continue;
        }
        if (det?.estado === 'EN_EXCEPCION') {
          if (cupoExcepcionesUsado >= cupoExcepcionesDisponible) {
            filasPreview.push({
              rut,
              nombres,
              apellidos,
              action: 'RECHAZADO',
              motivo: `Excede el cupo de excepciones de edad (${cupoExcepcionesDisponible} máximo).`,
              edadCalendario: edadCal,
              jugadorId: null,
              cambios: [],
            });
            continue;
          }
          estaEnExcepcion = true;
          cupoExcepcionesUsado++;
        }
      }

      // ACTUALIZAR vs NUEVO
      const existente = plantelByRut.get(rut);
      if (existente) {
        const cambios: string[] = [];
        const nuevoEmail = raw.email?.trim() || null;
        const nuevoTel = raw.telefono?.trim() || null;
        const nuevoNum = this.parseNumeroCamiseta(raw.numeroCamiseta);
        const nuevaPos = this.parsePosicion(raw.posicion);
        const nuevoCap = this.parseBoolean(raw.capitan);
        const nuevoTelContacto = raw.telefonoContacto?.trim() || null;
        const nuevoNombreContacto = raw.nombreContacto?.trim() || null;

        if (existente.estado === 'INACTIVO') cambios.push('reactivar (estaba inactivo)');
        if (existente.email !== nuevoEmail) cambios.push('email');
        if (existente.telefono !== nuevoTel) cambios.push('teléfono');
        if (existente.numeroCamiseta !== nuevoNum) cambios.push('camiseta');
        if (existente.posicion !== nuevaPos) cambios.push('posición');
        if (existente.capitan !== nuevoCap) cambios.push('capitán');
        if (existente.telefonoContacto !== nuevoTelContacto) {
          cambios.push('teléfono de contacto');
        }
        if (existente.nombreContacto !== nuevoNombreContacto) {
          cambios.push('nombre de contacto');
        }

        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: estaEnExcepcion ? 'EN_EXCEPCION' : 'ACTUALIZAR',
          motivo:
            cambios.length === 0
              ? 'Sin cambios — el jugador ya está al día.'
              : null,
          edadCalendario: edadCal,
          jugadorId: existente.id,
          cambios,
        });
      } else {
        filasPreview.push({
          rut,
          nombres,
          apellidos,
          action: estaEnExcepcion ? 'EN_EXCEPCION' : 'NUEVO',
          motivo: null,
          edadCalendario: edadCal,
          jugadorId: null,
          cambios: [],
        });
      }
    }

    // Inactivar: jugadores actuales que NO están en el archivo y están
    // activos. Si ya están INACTIVO no los tocamos.
    const rutsEnArchivo = new Set(rows.map((r) => limpiarRut(r.rut ?? '')));
    const inactivarFilas = plantelActual
      .filter((j) => !rutsEnArchivo.has(j.rut) && j.estado === 'ACTIVO')
      .map((j) => ({
        jugadorId: j.id,
        rut: j.rut,
        nombres: j.nombres,
        apellidos: j.apellidos,
      }));

    const nuevos = filasPreview.filter((f) => f.action === 'NUEVO').length;
    const actualizados = filasPreview.filter(
      (f) => f.action === 'ACTUALIZAR',
    ).length;
    const enExcepcion = filasPreview.filter(
      (f) => f.action === 'EN_EXCEPCION',
    ).length;
    const rechazados = filasPreview.filter(
      (f) => f.action === 'RECHAZADO',
    ).length;

    return {
      clubId,
      clubNombre: club.nombre,
      categoriaId,
      categoriaNombre: categoria.nombre,
      totalFilas: rows.length,
      nuevos,
      actualizados,
      inactivados: inactivarFilas.length,
      rechazados,
      enExcepcion,
      cupoExcepcionesDisponible,
      filas: filasPreview,
      inactivarFilas,
    };
  }

  /**
   * Aplica los cambios. Idempotente: re-evalúa todo antes (estado
   * pudo haber cambiado entre preview y confirm).
   */
  async confirmar(
    clubId: string,
    tenantId: string,
    input: BulkImportConfirmRequest,
  ): Promise<BulkImportResult> {
    const preview = await this.previsualizar(
      clubId,
      tenantId,
      input.categoriaId,
      input.rows,
    );

    let creados = 0;
    let actualizados = 0;
    let enExcepcion = 0;
    const errores: BulkImportResult['errores'] = [];

    // Aplicar filas
    for (const fila of preview.filas) {
      if (fila.action === 'RECHAZADO') {
        errores.push({
          rut: fila.rut,
          motivo: fila.motivo ?? 'Rechazado',
        });
        continue;
      }

      const raw = input.rows.find((r) => limpiarRut(r.rut ?? '') === fila.rut);
      if (!raw) continue; // safety net

      try {
        if (fila.action === 'NUEVO' || fila.action === 'EN_EXCEPCION') {
          if (fila.jugadorId) {
            // Era ACTUALIZAR pero por race condition no lo detectamos arriba.
            // Mejor refetch y actualizar.
            await this.aplicarUpdate(fila.jugadorId, tenantId, raw);
            actualizados++;
          } else {
            await this.jugadorRepo.insert({
              tenantId,
              clubId,
              categoriaId: input.categoriaId,
              rut: fila.rut,
              nombres: fila.nombres,
              apellidos: fila.apellidos,
              fechaNac: raw.fechaNac ?? null,
              email: raw.email?.trim() || null,
              telefono: raw.telefono?.trim() || null,
              numeroCamiseta: this.parseNumeroCamiseta(raw.numeroCamiseta),
              posicion: this.parsePosicion(raw.posicion),
              pieHabil: null,
              apodo: null,
              telefonoContacto: raw.telefonoContacto?.trim() || null,
              nombreContacto: raw.nombreContacto?.trim() || null,
              capitan: this.parseBoolean(raw.capitan),
              estado: 'ACTIVO',
            });
            creados++;
          }
          if (fila.action === 'EN_EXCEPCION') enExcepcion++;
        } else if (fila.action === 'ACTUALIZAR' && fila.jugadorId) {
          await this.aplicarUpdate(fila.jugadorId, tenantId, raw);
          actualizados++;
        }
      } catch (err) {
        errores.push({
          rut: fila.rut,
          motivo:
            err instanceof Error ? err.message : 'Error inesperado',
        });
      }
    }

    // Inactivar faltantes (si el admin no canceló)
    let inactivados = 0;
    if (input.inactivarFaltantes && preview.inactivarFilas.length > 0) {
      const ids = preview.inactivarFilas.map((j) => j.jugadorId);
      const r = await this.jugadorRepo.update(
        { id: In(ids), tenantId, clubId, categoriaId: input.categoriaId },
        { estado: 'INACTIVO' },
      );
      inactivados = r.affected ?? 0;
    }

    return {
      totalFilas: input.rows.length,
      creados,
      actualizados,
      inactivados,
      rechazados: preview.rechazados,
      enExcepcion,
      errores,
    };
  }

  private async ensureClubYCategoria(
    clubId: string,
    tenantId: string,
    categoriaId: string,
  ): Promise<{ club: Club; categoria: CategoriaJugadores }> {
    const club = await this.clubRepo.findOne({ where: { id: clubId, tenantId } });
    if (!club) throw new NotFoundException(`Club ${clubId} no encontrado.`);
    if (club.estado === 'INACTIVO') {
      throw new BadRequestException(
        `El club "${club.nombre}" está INACTIVO. Reactivalo antes de importar.`,
      );
    }
    const categoria = await this.categoriaRepo.findOne({
      where: { id: categoriaId, tenantId },
    });
    if (!categoria) {
      throw new NotFoundException(`Categoría ${categoriaId} no encontrada.`);
    }
    const pivote = await this.clubCatRepo.findOne({
      where: { clubId, categoriaId },
    });
    if (!pivote) {
      throw new BadRequestException(
        `El club no compite en la categoría "${categoria.nombre}". Agregala desde la ficha del club antes de importar.`,
      );
    }
    return { club, categoria };
  }

  private async aplicarUpdate(
    jugadorId: string,
    tenantId: string,
    raw: BulkImportRow,
  ): Promise<void> {
    await this.jugadorRepo.update(
      { id: jugadorId, tenantId },
      {
        email: raw.email?.trim() || null,
        telefono: raw.telefono?.trim() || null,
        numeroCamiseta: this.parseNumeroCamiseta(raw.numeroCamiseta),
        posicion: this.parsePosicion(raw.posicion),
        telefonoContacto: raw.telefonoContacto?.trim() || null,
        nombreContacto: raw.nombreContacto?.trim() || null,
        capitan: this.parseBoolean(raw.capitan),
        // Reactivar: si el jugador estaba INACTIVO y vuelve a venir en el
        // archivo, queda ACTIVO. Es lo que el admin espera al reimportar.
        estado: 'ACTIVO',
      },
    );
  }

  private parseNumeroCamiseta(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0 || n > 99) return null;
    return Math.trunc(n);
  }

  /**
   * La posición es informativa y opcional. Si el Excel trae algo que
   * no coincide con el enum (ej. "VOLANTE", "Mediocampista", "9"), se
   * persiste como null en vez de tumbar el INSERT con el CHECK
   * constraint de la tabla `jugadores`. El operador puede corregirla
   * a mano después si quiere.
   */
  private parsePosicion(v: unknown): Jugador['posicion'] {
    if (v == null) return null;
    const t = String(v).trim().toUpperCase();
    if (
      t === 'ARQUERO' ||
      t === 'DEFENSA' ||
      t === 'MEDIO' ||
      t === 'DELANTERO'
    ) {
      return t;
    }
    return null;
  }

  private parseBoolean(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      return t === 'true' || t === 'si' || t === 'sí' || t === '1' || t === 'x';
    }
    return false;
  }

  private emailValido(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }
}
