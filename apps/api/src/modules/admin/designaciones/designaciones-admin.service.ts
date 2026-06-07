import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type {
  AutoAsignarResult,
  CoberturaFecha,
  CoberturaRol,
  DesignacionAdmin,
  DesignacionesPorFecha,
  EstadoDesignacion,
  RolDesignablePartido,
  RolPersonal,
} from '@fixtura/types';
import { ROLES_DESIGNABLES_PARTIDO, SLOTS_POR_ROL } from '@fixtura/types';

import { AusenciaPersonal } from '../../competition/entities/ausencia-personal.entity';
import { Designacion } from '../../competition/entities/designacion.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { DesignacionesEmailService } from './designaciones-email.service';
import type {
  AsignarDesignacionDto,
  AutoAsignarDto,
  UpdateDesignacionEstadoDto,
} from './dto';

const ROLES_ARBITRAJE: ReadonlyArray<RolPersonal> = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
];

/**
 * Margen en horas para considerar "mismo bloque" en doble booking.
 * Dos partidos con hora distinta pero a menos de 2h del personal asignado
 * se marca conflicto.
 */
const DOBLE_BOOKING_HORAS = 2;

/**
 * Etiquetas [singular, plural] por rol para armar el resumen de cobertura.
 */
const ROL_DEFICIT_LABEL: Record<RolDesignablePartido, [string, string]> = {
  ARBITRO_PRINCIPAL: ['árbitro principal', 'árbitros principales'],
  ARBITRO_ASISTENTE: ['árbitro asistente', 'árbitros asistentes'],
  PLANILLERO: ['planillero', 'planilleros'],
};

@Injectable()
export class DesignacionesAdminService {
  constructor(
    @InjectRepository(Designacion) private readonly repo: Repository<Designacion>,
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AusenciaPersonal)
    private readonly ausenciaRepo: Repository<AusenciaPersonal>,
    private readonly emailSvc: DesignacionesEmailService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Vista por fecha: lista todos los partidos de la fecha con sus
   * designaciones agrupadas. Incluye análisis de conflictos.
   */
  async listPorFecha(
    torneoId: string,
    fechaId: string,
    tenantId: string,
  ): Promise<DesignacionesPorFecha> {
    await this.ensureTorneo(torneoId, tenantId);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .where('p.fecha_id = :fechaId', { fechaId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();

    if (partidos.length === 0) {
      return {
        fechaId: fecha.id,
        fechaNumero: fecha.numero,
        fechaEtiqueta: fecha.etiqueta,
        partidos: [],
      };
    }

    const partidoIds = partidos.map((p) => p.id);
    const designaciones = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.personal', 'personal')
      .where('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .getMany();

    // Index para detectar doble booking. Antes solo cruzábamos partidos
    // de ESTA fecha; ahora cargamos también las designaciones de los
    // mismos personal en OTROS partidos del tenant para detectar
    // solapamientos cross-fecha (ej. un árbitro asignado a fecha 3 a
    // las 18:00 y a un partido de la fecha 4 también a las 18:00 del
    // mismo día calendario).
    const personalIdsInvolucrados = Array.from(new Set(designaciones.map((d) => d.personalId)));
    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();

    if (personalIdsInvolucrados.length > 0) {
      const cruceRaw = await this.repo
        .createQueryBuilder('d2')
        .leftJoin('d2.partido', 'partido')
        .where('d2.personal_id IN (:...personalIds)', {
          personalIds: personalIdsInvolucrados,
        })
        .andWhere('d2.tenant_id = :tenantId', { tenantId })
        .select([
          'd2.personal_id AS "personalId"',
          'd2.partido_id AS "partidoId"',
          'partido.fecha_hora AS "fechaHora"',
        ])
        .getRawMany<{ personalId: string; partidoId: string; fechaHora: string | null }>();

      for (const row of cruceRaw) {
        const arr = porPersonal.get(row.personalId) ?? [];
        arr.push({
          partidoId: row.partidoId,
          fechaHora: row.fechaHora ? new Date(row.fechaHora) : null,
        });
        porPersonal.set(row.personalId, arr);
      }
    }

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;

    const partidosOut = partidos.map((p) => {
      const desigsDelPartido = designaciones
        .filter((d) => d.partidoId === p.id)
        .map((d) => this.toDto(d, p, porPersonal, hoy, treintaDias));

      return {
        partidoId: p.id,
        equipoLocalNombre: p.inscripcionLocal?.club?.nombre ?? '',
        equipoVisitaNombre: p.inscripcionVisita?.club?.nombre ?? '',
        fechaHora: p.fechaHora ? p.fechaHora.toISOString() : null,
        canchaNombre: p.canchaNombre,
        designaciones: desigsDelPartido,
      };
    });

    return {
      fechaId: fecha.id,
      fechaNumero: fecha.numero,
      fechaEtiqueta: fecha.etiqueta,
      partidos: partidosOut,
    };
  }

  async listPorPartido(
    partidoId: string,
    tenantId: string,
  ): Promise<DesignacionAdmin[]> {
    const partido = await this.partidoRepo.findOne({
      where: { id: partidoId, tenantId },
    });
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado`);

    const designaciones = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.personal', 'personal')
      .where('d.partido_id = :partidoId', { partidoId })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .getMany();

    // Para análisis de doble booking necesitamos el resto de designaciones
    // del personal en partidos a la misma fecha/hora cercana.
    const personalIds = designaciones.map((d) => d.personalId);
    const otras = personalIds.length
      ? await this.repo
          .createQueryBuilder('d')
          .leftJoin('d.partido', 'partido')
          .where('d.personal_id IN (:...personalIds)', { personalIds })
          .andWhere('d.tenant_id = :tenantId', { tenantId })
          .andWhere('d.partido_id <> :partidoId', { partidoId })
          .select(['d.id', 'd.personalId', 'd.partidoId', 'partido.fechaHora'])
          .getRawMany()
      : [];

    // Map: personalId → lista de { partidoId, fechaHora }. Combina las
    // designaciones del personal en OTROS partidos + las de este partido
    // (toDto compara cada designación contra el resto excluyendo la propia).
    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();
    for (const row of otras) {
      const pid = row.d_personalId as string;
      const arr = porPersonal.get(pid) ?? [];
      arr.push({
        partidoId: row.d_partidoId as string,
        fechaHora: row.partido_fechaHora ? new Date(row.partido_fechaHora as string) : null,
      });
      porPersonal.set(pid, arr);
    }
    for (const d of designaciones) {
      const arr = porPersonal.get(d.personalId) ?? [];
      arr.push({ partidoId: partido.id, fechaHora: partido.fechaHora });
      porPersonal.set(d.personalId, arr);
    }

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;

    return designaciones.map((d) => this.toDto(d, partido, porPersonal, hoy, treintaDias));
  }

  async asignar(
    tenantId: string,
    input: AsignarDesignacionDto,
  ): Promise<DesignacionAdmin> {
    const partido = await this.partidoRepo.findOne({
      where: { id: input.partidoId, tenantId },
    });
    if (!partido) throw new NotFoundException(`Partido ${input.partidoId} no encontrado`);

    const personal = await this.personalRepo.findOne({
      where: { id: input.personalId, tenantId },
    });
    if (!personal) throw new NotFoundException(`Personal ${input.personalId} no encontrado`);
    if (!personal.activo) {
      throw new BadRequestException('No se puede designar personal inactivo');
    }

    // UNIQUE (partido_id, personal_id, rol_asignado) — chequeo previo
    const existente = await this.repo.findOne({
      where: {
        partidoId: input.partidoId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
      },
    });
    if (existente) {
      throw new ConflictException(
        'Esa persona ya está designada en ese partido con el mismo rol',
      );
    }

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        partidoId: input.partidoId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
        estado: 'PROPUESTA',
        montoPago: input.montoPago ?? personal.tarifaBase ?? null,
        notas: input.notas ?? null,
      }),
    );

    // Notificar por email — best-effort. No await crítico: si falla,
    // el caller no se entera (la designación queda persistida igual).
    // Cargamos relaciones necesarias para armar el contenido.
    void this.notificarAsignacionPorEmail(created.id, tenantId);

    return this.findOne(created.id, tenantId);
  }

  /**
   * Carga los datos asociados a una designación recién creada y
   * dispara el email al personal designado. Se ejecuta en background
   * (no se espera) para no demorar la respuesta del endpoint.
   */
  private async notificarAsignacionPorEmail(
    designacionId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      const d = await this.repo.findOne({
        where: { id: designacionId, tenantId },
        relations: {
          personal: true,
          partido: {
            inscripcionLocal: { club: true },
            inscripcionVisita: { club: true },
            fecha: { torneo: true },
          },
        },
      });
      if (!d || !d.personal || !d.partido) return;
      if (!d.personal.email) return; // sin email no se envía

      await this.emailSvc.notificarAsignacion({
        designacion: d,
        personalNombre: d.personal.nombre,
        personalApellido: d.personal.apellido,
        personalEmail: d.personal.email,
        equipoLocalNombre: d.partido.inscripcionLocal?.club?.nombre ?? '',
        equipoVisitaNombre: d.partido.inscripcionVisita?.club?.nombre ?? '',
        fechaHora: d.partido.fechaHora,
        canchaNombre: d.partido.canchaNombre,
        torneoNombre: d.partido.fecha?.torneo?.nombre ?? '',
      });
    } catch (err) {
      // log y siguiente — nunca propagar
      // eslint-disable-next-line no-console
      console.warn(
        `[designaciones-email] No se pudo enviar email para ${designacionId}:`,
        (err as Error).message,
      );
    }
  }

  /**
   * Cambio de estado público — usado por el endpoint sin auth cuando
   * el árbitro hace click en el link del email. No requiere JWT del
   * usuario porque el token de la URL ya valida la acción.
   */
  async aplicarRespuestaPorToken(
    designacionId: string,
    tenantId: string,
    accion: 'CONFIRMAR' | 'RECHAZAR',
  ): Promise<{ ok: boolean; estado: string }> {
    // Endpoint público: el TenantContextInterceptor setea tenant_id=''
    // (bypass RLS). Re-seteamos al tenant del token firmado antes de
    // operar — defensa en profundidad para evitar lectura/escritura
    // cross-tenant si en el futuro se agregan filtros sólo por RLS.
    await this.dataSource.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
      tenantId,
    ]);

    const d = await this.repo.findOne({ where: { id: designacionId, tenantId } });
    if (!d) return { ok: false, estado: 'NO_ENCONTRADA' };

    // Si ya estaba CONFIRMADA/RECHAZADA/ASISTIO, devolvemos idempotente OK
    // para que el usuario no se confunda si recarga el link.
    if (accion === 'CONFIRMAR') {
      if (d.estado === 'CONFIRMADA' || d.estado === 'ASISTIO') {
        return { ok: true, estado: d.estado };
      }
      d.estado = 'CONFIRMADA';
      d.confirmadoAt = new Date();
    } else {
      if (d.estado === 'RECHAZADA') return { ok: true, estado: 'RECHAZADA' };
      d.estado = 'RECHAZADA';
    }
    await this.repo.save(d);
    return { ok: true, estado: d.estado };
  }

  async findOne(id: string, tenantId: string): Promise<DesignacionAdmin> {
    const d = await this.repo.findOne({
      where: { id, tenantId },
      relations: { personal: true, partido: true },
    });
    if (!d || !d.partido) throw new NotFoundException(`Designación ${id} no encontrada`);

    // Para una sola designación, computamos sus warnings comparando con el
    // resto de designaciones de ese personal.
    const otras = await this.repo
      .createQueryBuilder('d2')
      .leftJoin('d2.partido', 'partido')
      .where('d2.personal_id = :personalId', { personalId: d.personalId })
      .andWhere('d2.tenant_id = :tenantId', { tenantId })
      .select(['d2.id', 'd2.partidoId', 'partido.fechaHora'])
      .getRawMany();

    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();
    porPersonal.set(
      d.personalId,
      otras.map((r) => ({
        partidoId: r.d2_partidoId as string,
        fechaHora: r.partido_fechaHora ? new Date(r.partido_fechaHora as string) : null,
      })),
    );

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;
    return this.toDto(d, d.partido, porPersonal, hoy, treintaDias);
  }

  async updateEstado(
    id: string,
    tenantId: string,
    input: UpdateDesignacionEstadoDto,
  ): Promise<DesignacionAdmin> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación ${id} no encontrada`);
    d.estado = input.estado;
    if (input.estado === 'CONFIRMADA' && !d.confirmadoAt) {
      d.confirmadoAt = new Date();
    }
    await this.repo.save(d);
    return this.findOne(d.id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación ${id} no encontrada`);
    await this.repo.remove(d);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<void> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
  }

  private toDto(
    d: Designacion,
    partido: Partido,
    porPersonal: Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>,
    hoy: Date,
    treintaDiasMs: number,
  ): DesignacionAdmin {
    const conflictoDobleBooking = this.checkDobleBooking(
      d.personalId,
      partido.id,
      partido.fechaHora,
      porPersonal,
    );

    const carnetAnfaWarning = this.checkCarnetWarning(
      d.rolAsignado,
      d.personal?.carnetAnfaVence ?? null,
      hoy,
      treintaDiasMs,
    );

    return {
      id: d.id,
      partidoId: d.partidoId,
      personalId: d.personalId,
      personalNombre: d.personal?.nombre ?? '',
      personalApellido: d.personal?.apellido ?? '',
      personalRolBase: d.personal?.rol ?? d.rolAsignado,
      carnetAnfaVence: d.personal?.carnetAnfaVence ?? null,
      // El DTO restringe a ROLES_DESIGNABLES_PARTIDO. Si hay registros
      // antiguos con PARAMEDICO/OTRO en DB (de antes del restringir),
      // se castean — la UI los muestra pero ya no se pueden crear.
      rolAsignado: d.rolAsignado as RolDesignablePartido,
      estado: d.estado as EstadoDesignacion,
      montoPago: d.montoPago,
      confirmadoAt: d.confirmadoAt ? d.confirmadoAt.toISOString() : null,
      notas: d.notas,
      conflictoDobleBooking,
      carnetAnfaWarning,
      createdAt: d.createdAt.toISOString(),
    };
  }

  /**
   * Doble booking: el mismo personal asignado a >1 partido cuya
   * fecha_hora está dentro de DOBLE_BOOKING_HORAS de diferencia.
   * Si alguno no tiene fecha_hora, no podemos decidir → no marcamos.
   */
  private checkDobleBooking(
    personalId: string,
    partidoId: string,
    fechaHora: Date | null,
    porPersonal: Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>,
  ): boolean {
    if (!fechaHora) return false;
    const lista = porPersonal.get(personalId) ?? [];
    const margenMs = DOBLE_BOOKING_HORAS * 60 * 60 * 1000;
    for (const otro of lista) {
      if (otro.partidoId === partidoId) continue;
      if (!otro.fechaHora) continue;
      const diff = Math.abs(otro.fechaHora.getTime() - fechaHora.getTime());
      if (diff < margenMs) return true;
    }
    return false;
  }

  private checkCarnetWarning(
    rol: RolPersonal,
    vence: string | null,
    hoy: Date,
    treintaDiasMs: number,
  ): 'VENCIDO' | 'POR_VENCER' | 'OK' | 'NO_APLICA' {
    if (!ROLES_ARBITRAJE.includes(rol)) return 'NO_APLICA';
    if (!vence) return 'NO_APLICA';
    const venceDate = new Date(vence);
    if (Number.isNaN(venceDate.getTime())) return 'NO_APLICA';
    const diff = venceDate.getTime() - hoy.getTime();
    if (diff < 0) return 'VENCIDO';
    if (diff < treintaDiasMs) return 'POR_VENCER';
    return 'OK';
  }

  // ─── Disponibilidad / ausencias (F48) ───────────────────────────────
  /**
   * Fecha calendario (YYYY-MM-DD) de un partido en America/Santiago. Si el
   * partido no tiene fecha_hora, cae a fecha_inicio de la jornada. Se usa
   * 'en-CA' porque produce el formato ISO YYYY-MM-DD de forma estable y
   * en la zona correcta (no depende del TZ del proceso).
   */
  private partidoFechaISO(p: Partido, fecha: Fecha): string | null {
    if (p.fechaHora) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(p.fechaHora);
    }
    return fecha.fechaInicio ?? null;
  }

  /**
   * Carga las ausencias del personal del tenant que solapan el rango de
   * fechas dado. Devuelve un map personalId → lista de rangos [desde,hasta].
   * Si no hay fechas resolubles, devuelve map vacío (no se puede decidir).
   */
  private async cargarAusenciasMap(
    tenantId: string,
    fechasISO: string[],
  ): Promise<Map<string, Array<{ desde: string; hasta: string }>>> {
    const map = new Map<string, Array<{ desde: string; hasta: string }>>();
    const validas = fechasISO.filter((f): f is string => !!f);
    if (validas.length === 0) return map;
    const min = validas.reduce((a, b) => (a < b ? a : b));
    const max = validas.reduce((a, b) => (a > b ? a : b));

    // TO_CHAR garantiza string 'YYYY-MM-DD' (el parser de pg podría devolver
    // las columnas DATE como objeto Date en getRawMany).
    const rows = await this.ausenciaRepo
      .createQueryBuilder('a')
      .select([
        'a.personal_id AS "personalId"',
        `TO_CHAR(a.desde, 'YYYY-MM-DD') AS "desde"`,
        `TO_CHAR(a.hasta, 'YYYY-MM-DD') AS "hasta"`,
      ])
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.hasta >= :min', { min })
      .andWhere('a.desde <= :max', { max })
      .getRawMany<{ personalId: string; desde: string; hasta: string }>();

    for (const r of rows) {
      const arr = map.get(r.personalId) ?? [];
      arr.push({ desde: r.desde, hasta: r.hasta });
      map.set(r.personalId, arr);
    }
    return map;
  }

  private tieneAusenciaEnFecha(
    map: Map<string, Array<{ desde: string; hasta: string }>>,
    personalId: string,
    fechaISO: string | null,
  ): boolean {
    if (!fechaISO) return false;
    const rangos = map.get(personalId);
    if (!rangos) return false;
    return rangos.some((r) => r.desde <= fechaISO && fechaISO <= r.hasta);
  }

  // ─── Auto-asignación ────────────────────────────────────────────────
  /**
   * Asigna automáticamente personal disponible a los partidos de una
   * fecha. Algoritmo greedy con balance:
   *
   *   1. Para cada rol pedido (default: ARBITRO_PRINCIPAL):
   *   2.   Ordena los partidos por fecha_hora ASC.
   *   3.   Trae el catálogo de personal activo del tenant que coincide
   *        con el rol base.
   *   4.   Para cada partido sin designación en ese rol (o todos, si
   *        sobreescribir=true):
   *        - Filtra candidatos:
   *           a) que tengan carnet ANFA vigente si aplica
   *           b) que no estén designados en otro partido del tenant
   *              cuya fecha_hora esté a <2h de diferencia
   *        - Elige al candidato con MENOS designaciones en estado
   *          PROPUESTA/CONFIRMADA/ASISTIO en el torneo (balance).
   *        - Si no hay candidato: registra "sin disponibilidad".
   *   5.   Persiste las designaciones nuevas, dispara emails async.
   *
   * Devuelve resumen de qué se asignó, qué quedó sin asignar y qué
   * ya tenía designación (cuando sobreescribir=false).
   */
  async autoAsignar(
    torneoId: string,
    fechaId: string,
    tenantId: string,
    input: AutoAsignarDto,
  ): Promise<AutoAsignarResult> {
    await this.ensureTorneo(torneoId, tenantId);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    // Leer el setting de la liga: ¿requiere carnet ANFA vigente?
    // Si SÍ → excluir árbitros con carnet vencido.
    // Si NO → cualquier árbitro activo es elegible (liga libre).
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const requiereCarnetAnfa = tenant?.requiereCarnetAnfa ?? false;

    const roles: RolDesignablePartido[] = input.roles ?? ['ARBITRO_PRINCIPAL'];
    const sobreescribir = input.sobreescribir ?? false;

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.fecha_id = :fechaId', { fechaId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();

    // F48 — fecha calendario de cada partido + ausencias del personal que
    // solapan la jornada (para excluir personal no disponible).
    const partidoFechaMap = new Map<string, string | null>();
    for (const p of partidos) partidoFechaMap.set(p.id, this.partidoFechaISO(p, fecha));
    const ausenciasMap = await this.cargarAusenciasMap(
      tenantId,
      Array.from(partidoFechaMap.values()).filter((f): f is string => !!f),
    );

    // Catálogo de personal activo agrupado por rol base
    const personalActivo = await this.personalRepo.find({
      where: { tenantId, activo: true },
    });

    // Carga inicial: cuántas designaciones activas (no rechazada/ausente)
    // tiene cada personal en este torneo — para balance de carga.
    const cargaTorneo = await this.repo
      .createQueryBuilder('d')
      .leftJoin('d.partido', 'partido')
      .leftJoin('partido.fecha', 'fecha')
      .select('d.personal_id', 'personalId')
      .addSelect('COUNT(*)', 'cnt')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('fecha.torneo_id = :torneoId', { torneoId })
      .andWhere(`d.estado NOT IN ('RECHAZADA','AUSENTE')`)
      .groupBy('d.personal_id')
      .getRawMany<{ personalId: string; cnt: string }>();
    const cargaPorPersonal = new Map<string, number>();
    for (const r of cargaTorneo) {
      cargaPorPersonal.set(r.personalId, Number(r.cnt));
    }

    // Designaciones existentes en esta fecha — para conflictos por fecha_hora
    const partidoIds = partidos.map((p) => p.id);
    const designacionesExistentes = partidoIds.length
      ? await this.repo
          .createQueryBuilder('d')
          .leftJoin('d.partido', 'partido')
          .select([
            'd.id AS "id"',
            'd.personal_id AS "personalId"',
            'd.partido_id AS "partidoId"',
            'd.rol_asignado AS "rolAsignado"',
            'partido.fecha_hora AS "fechaHora"',
          ])
          .where('d.tenant_id = :tenantId', { tenantId })
          .andWhere('d.partido_id IN (:...partidoIds)', { partidoIds })
          .andWhere(`d.estado NOT IN ('RECHAZADA','AUSENTE')`)
          .getRawMany<{
            id: string;
            personalId: string;
            partidoId: string;
            rolAsignado: string;
            fechaHora: string | null;
          }>()
      : [];

    // Index: { partidoId-rol → array de { designacionId, personalId } }
    // para saber cuántos SLOTS de ese rol ya están cubiertos por partido.
    // Permite manejar 2 árbitros asistentes (o más) por partido.
    const cubiertoMap = new Map<
      string,
      Array<{ designacionId: string; personalId: string }>
    >();
    // Index: personalId → lista de fechaHora donde ya está ocupado
    const ocupadoMap = new Map<string, Array<Date>>();
    for (const d of designacionesExistentes) {
      const key = `${d.partidoId}-${d.rolAsignado}`;
      const arr = cubiertoMap.get(key) ?? [];
      arr.push({ designacionId: d.id, personalId: d.personalId });
      cubiertoMap.set(key, arr);
      const fh = d.fechaHora ? new Date(d.fechaHora) : null;
      if (fh) {
        const arrO = ocupadoMap.get(d.personalId) ?? [];
        arrO.push(fh);
        ocupadoMap.set(d.personalId, arrO);
      }
    }

    const result: AutoAsignarResult = {
      asignados: [],
      sinDisponibilidad: [],
      yaAsignados: [],
    };

    const hoy = new Date();
    const treintaDiasMs = 30 * 24 * 60 * 60 * 1000;
    const margenMs = DOBLE_BOOKING_HORAS * 60 * 60 * 1000;
    const nuevasParaNotificar: string[] = [];

    for (const rol of roles) {
      // Candidatos: personal activo cuyo rol base = rol pedido. Si el rol
      // pedido es PLANILLERO y no hay planilleros, NO usamos árbitros como
      // fallback — sería sorpresivo.
      const candidatosBase = personalActivo.filter((p) => p.rol === rol);
      // Cuántos slots de este rol se necesitan por partido (ej. 2 para
      // ARBITRO_ASISTENTE — uno por línea).
      const slotsNecesarios = SLOTS_POR_ROL[rol];

      for (const partido of partidos) {
        const key = `${partido.id}-${rol}`;
        let cubiertos = cubiertoMap.get(key) ?? [];

        // Si sobreescribir, removemos los existentes para empezar desde
        // cero los N slots
        if (cubiertos.length > 0 && sobreescribir) {
          for (const c of cubiertos) {
            const prev = await this.repo.findOne({
              where: { id: c.designacionId, tenantId },
            });
            if (prev) await this.repo.remove(prev);
          }
          cubiertos = [];
          cubiertoMap.set(key, cubiertos);
        }

        // Slots que faltan para llegar a la cuota
        const slotsRestantes = slotsNecesarios - cubiertos.length;

        if (slotsRestantes <= 0) {
          // Ya está todo cubierto en este rol/partido — marcamos como
          // ya asignado (una entrada en yaAsignados por slot)
          for (let i = 0; i < slotsNecesarios; i++) {
            result.yaAsignados.push({ partidoId: partido.id, rolAsignado: rol });
          }
          continue;
        }

        // Filtrar candidatos disponibles excluyendo los que ya están
        // asignados en este partido+rol (evita duplicar el mismo
        // asistente como asistente 1 y asistente 2).
        const idsYaUsados = new Set(cubiertos.map((c) => c.personalId));
        const disponibles = candidatosBase.filter((p) => {
          if (idsYaUsados.has(p.id)) return false;
          // F48 — Ausencia declarada que cubre la fecha de este partido.
          if (
            this.tieneAusenciaEnFecha(
              ausenciasMap,
              p.id,
              partidoFechaMap.get(partido.id) ?? null,
            )
          ) {
            return false;
          }
          // Solo bloqueamos por carnet vencido si la liga es ANFA. Para
          // ligas libres (corporativas, barriales) el carnet ANFA no es
          // obligatorio y no debe excluir candidatos.
          if (requiereCarnetAnfa && ROLES_ARBITRAJE.includes(rol as RolPersonal)) {
            const w = this.checkCarnetWarning(
              p.rol,
              p.carnetAnfaVence,
              hoy,
              treintaDiasMs,
            );
            if (w === 'VENCIDO') return false;
          }
          // Doble booking: ya designado a otro partido a <2h
          if (partido.fechaHora) {
            const ocupados = ocupadoMap.get(p.id) ?? [];
            for (const otro of ocupados) {
              if (Math.abs(otro.getTime() - partido.fechaHora.getTime()) < margenMs) {
                return false;
              }
            }
          }
          return true;
        });

        if (disponibles.length === 0) {
          // No hay nadie para cubrir ni siquiera 1 slot restante
          for (let i = 0; i < slotsRestantes; i++) {
            result.sinDisponibilidad.push({
              partidoId: partido.id,
              rolAsignado: rol,
              motivo: candidatosBase.length === 0
                ? `No hay personal activo con rol ${rol}`
                : 'Todos los candidatos tienen conflicto de horario, carnet vencido o ausencia declarada',
            });
          }
          continue;
        }

        // Iterar hasta llenar los slots restantes (o hasta quedarnos sin
        // disponibles, lo que pase primero).
        for (let slot = 0; slot < slotsRestantes; slot++) {
          // Re-filtrar para excluir los ya elegidos en iteraciones previas
          const idsUsadosAhora = new Set([
            ...idsYaUsados,
            ...(cubiertoMap.get(key) ?? []).map((c) => c.personalId),
          ]);
          const aunDisponibles = disponibles.filter((p) => !idsUsadosAhora.has(p.id));

          if (aunDisponibles.length === 0) {
            result.sinDisponibilidad.push({
              partidoId: partido.id,
              rolAsignado: rol,
              motivo: 'No hay suficientes candidatos para cubrir todos los slots',
            });
            break;
          }

          // Elegir el que tiene MENOS carga en este torneo (balance).
          // En empate, el de menor apellido (orden estable).
          aunDisponibles.sort((a, b) => {
            const ca = cargaPorPersonal.get(a.id) ?? 0;
            const cb = cargaPorPersonal.get(b.id) ?? 0;
            if (ca !== cb) return ca - cb;
            return a.apellido.localeCompare(b.apellido);
          });
          const elegido = aunDisponibles[0]!;

          const created = await this.repo.save(
            this.repo.create({
              tenantId,
              partidoId: partido.id,
              personalId: elegido.id,
              rolAsignado: rol,
              estado: 'PROPUESTA',
              montoPago: elegido.tarifaBase ?? null,
              notas: null,
            }),
          );

          // Actualizar índices in-memory para que el resto del loop respete
          // este nuevo lock (otro partido del mismo elegido a <2h se evita)
          const cubiertosKey = cubiertoMap.get(key) ?? [];
          cubiertosKey.push({ designacionId: created.id, personalId: elegido.id });
          cubiertoMap.set(key, cubiertosKey);
          if (partido.fechaHora) {
            const arr = ocupadoMap.get(elegido.id) ?? [];
            arr.push(partido.fechaHora);
            ocupadoMap.set(elegido.id, arr);
          }
          cargaPorPersonal.set(
            elegido.id,
            (cargaPorPersonal.get(elegido.id) ?? 0) + 1,
          );

          result.asignados.push({
            partidoId: partido.id,
            rolAsignado: rol,
            personalId: elegido.id,
            personalNombre: elegido.nombre,
            personalApellido: elegido.apellido,
          });
          nuevasParaNotificar.push(created.id);
        }
      }
    }

    // Disparar emails async — fuera del loop principal para no demorar
    // la respuesta. Errores no propagan (best-effort).
    for (const designacionId of nuevasParaNotificar) {
      void this.notificarAsignacionPorEmail(designacionId, tenantId);
    }

    return result;
  }

  // ─── Análisis de cobertura (F48, dry-run) ───────────────────────────
  /**
   * Simula la auto-asignación SIN persistir y reporta, por rol, el déficit
   * de personal de la fecha. Reusa la misma lógica greedy (balance de
   * carga + doble-booking + carnet ANFA + ausencias) para que el déficit
   * sea realista: un árbitro que puede cubrir dos partidos separados >2h
   * NO infla el faltante. Pensado para un panel proactivo que avise antes
   * de asignar que falta personal de apoyo.
   */
  async analizarCobertura(
    torneoId: string,
    fechaId: string,
    tenantId: string,
    roles?: RolDesignablePartido[],
  ): Promise<CoberturaFecha> {
    await this.ensureTorneo(torneoId, tenantId);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    const rolesValidos = new Set<string>(ROLES_DESIGNABLES_PARTIDO);
    const rolesAnalizar: RolDesignablePartido[] =
      roles && roles.length > 0
        ? roles.filter((r) => rolesValidos.has(r))
        : ['ARBITRO_PRINCIPAL', 'ARBITRO_ASISTENTE'];

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.fecha_id = :fechaId', { fechaId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();

    const fechaNumero = fecha.numero;

    if (partidos.length === 0) {
      return {
        fechaId: fecha.id,
        fechaNumero,
        roles: rolesAnalizar.map((rol) => ({
          rol,
          partidosCount: 0,
          slotsNecesarios: 0,
          slotsCubiertos: 0,
          slotsAsignablesAhora: 0,
          deficit: 0,
          personalDisponible: 0,
          personalNoDisponible: 0,
        })),
        hayDeficit: false,
        resumen: null,
      };
    }

    const partidoFechaMap = new Map<string, string | null>();
    for (const p of partidos) partidoFechaMap.set(p.id, this.partidoFechaISO(p, fecha));
    const fechasISO = Array.from(partidoFechaMap.values()).filter((f): f is string => !!f);
    const ausenciasMap = await this.cargarAusenciasMap(tenantId, fechasISO);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const requiereCarnetAnfa = tenant?.requiereCarnetAnfa ?? false;

    const personalActivo = await this.personalRepo.find({
      where: { tenantId, activo: true },
    });

    // Designaciones existentes (no rechazada/ausente) → cubiertos + ocupación.
    const partidoIds = partidos.map((p) => p.id);
    const existentes = await this.repo
      .createQueryBuilder('d')
      .leftJoin('d.partido', 'partido')
      .select([
        'd.personal_id AS "personalId"',
        'd.partido_id AS "partidoId"',
        'd.rol_asignado AS "rolAsignado"',
        'partido.fecha_hora AS "fechaHora"',
      ])
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere(`d.estado NOT IN ('RECHAZADA','AUSENTE')`)
      .getRawMany<{
        personalId: string;
        partidoId: string;
        rolAsignado: string;
        fechaHora: string | null;
      }>();

    const cubiertoCount = new Map<string, number>(); // `${partidoId}-${rol}` → count
    const ocupadoBase = new Map<string, Date[]>();
    for (const d of existentes) {
      const key = `${d.partidoId}-${d.rolAsignado}`;
      cubiertoCount.set(key, (cubiertoCount.get(key) ?? 0) + 1);
      if (d.fechaHora) {
        const arr = ocupadoBase.get(d.personalId) ?? [];
        arr.push(new Date(d.fechaHora));
        ocupadoBase.set(d.personalId, arr);
      }
    }

    // Carga por personal en el torneo (mismo criterio de balance que autoAsignar).
    const cargaTorneo = await this.repo
      .createQueryBuilder('d')
      .leftJoin('d.partido', 'partido')
      .leftJoin('partido.fecha', 'fecha')
      .select('d.personal_id', 'personalId')
      .addSelect('COUNT(*)', 'cnt')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('fecha.torneo_id = :torneoId', { torneoId })
      .andWhere(`d.estado NOT IN ('RECHAZADA','AUSENTE')`)
      .groupBy('d.personal_id')
      .getRawMany<{ personalId: string; cnt: string }>();
    const cargaBase = new Map<string, number>();
    for (const r of cargaTorneo) cargaBase.set(r.personalId, Number(r.cnt));

    const hoy = new Date();
    const treintaDiasMs = 30 * 24 * 60 * 60 * 1000;
    const margenMs = DOBLE_BOOKING_HORAS * 60 * 60 * 1000;

    const rolesOut: CoberturaRol[] = [];

    for (const rol of rolesAnalizar) {
      const slotsPorPartido = SLOTS_POR_ROL[rol];
      const slotsNecesarios = partidos.length * slotsPorPartido;
      const candidatosBase = personalActivo.filter((p) => p.rol === rol);

      // Personal disponible/no disponible: ausencia que cubra alguna fecha
      // de la jornada (aprox. para el panel; el déficit real sale del greedy).
      let personalNoDisponible = 0;
      for (const p of candidatosBase) {
        const ausente = fechasISO.some((f) =>
          this.tieneAusenciaEnFecha(ausenciasMap, p.id, f),
        );
        if (ausente) personalNoDisponible++;
      }
      const personalDisponible = candidatosBase.length - personalNoDisponible;

      // Clonar estructuras mutables para no contaminar entre roles.
      const ocupadoSim = new Map<string, Date[]>();
      for (const [k, v] of ocupadoBase) ocupadoSim.set(k, [...v]);
      const cargaSim = new Map<string, number>(cargaBase);

      let slotsCubiertos = 0;
      let slotsAsignablesAhora = 0;

      for (const partido of partidos) {
        const key = `${partido.id}-${rol}`;
        const yaCubiertos = Math.min(cubiertoCount.get(key) ?? 0, slotsPorPartido);
        slotsCubiertos += yaCubiertos;
        let restantes = slotsPorPartido - yaCubiertos;
        if (restantes <= 0) continue;

        const partidoFecha = partidoFechaMap.get(partido.id) ?? null;
        const usadosEnPartido = new Set<string>();

        while (restantes > 0) {
          const candidatos = candidatosBase.filter((p) => {
            if (usadosEnPartido.has(p.id)) return false;
            if (this.tieneAusenciaEnFecha(ausenciasMap, p.id, partidoFecha)) return false;
            if (requiereCarnetAnfa && ROLES_ARBITRAJE.includes(rol as RolPersonal)) {
              if (
                this.checkCarnetWarning(p.rol, p.carnetAnfaVence, hoy, treintaDiasMs) ===
                'VENCIDO'
              ) {
                return false;
              }
            }
            if (partido.fechaHora) {
              const oc = ocupadoSim.get(p.id) ?? [];
              for (const o of oc) {
                if (Math.abs(o.getTime() - partido.fechaHora.getTime()) < margenMs) {
                  return false;
                }
              }
            }
            return true;
          });
          if (candidatos.length === 0) break;
          candidatos.sort((a, b) => {
            const ca = cargaSim.get(a.id) ?? 0;
            const cb = cargaSim.get(b.id) ?? 0;
            if (ca !== cb) return ca - cb;
            return a.apellido.localeCompare(b.apellido);
          });
          const elegido = candidatos[0]!;
          usadosEnPartido.add(elegido.id);
          slotsAsignablesAhora++;
          restantes--;
          cargaSim.set(elegido.id, (cargaSim.get(elegido.id) ?? 0) + 1);
          if (partido.fechaHora) {
            const arr = ocupadoSim.get(elegido.id) ?? [];
            arr.push(partido.fechaHora);
            ocupadoSim.set(elegido.id, arr);
          }
        }
      }

      const deficit = Math.max(0, slotsNecesarios - slotsCubiertos - slotsAsignablesAhora);
      rolesOut.push({
        rol,
        partidosCount: partidos.length,
        slotsNecesarios,
        slotsCubiertos,
        slotsAsignablesAhora,
        deficit,
        personalDisponible,
        personalNoDisponible,
      });
    }

    const conDeficit = rolesOut.filter((r) => r.deficit > 0);
    const hayDeficit = conDeficit.length > 0;
    const resumen = hayDeficit
      ? `Faltan ${conDeficit
          .map((r) => `${r.deficit} ${ROL_DEFICIT_LABEL[r.rol][r.deficit === 1 ? 0 : 1]}`)
          .join(', ')} para la fecha ${fechaNumero} — conseguí personal de apoyo.`
      : null;

    return { fechaId: fecha.id, fechaNumero, roles: rolesOut, hayDeficit, resumen };
  }
}
