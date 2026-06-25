import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import * as XLSX from 'xlsx';

import type {
  CuentaPorPagarPersona,
  CuentasPorPagarResumen,
  DesignacionPendientePago,
  EmitirNominaRequest,
  LiquidacionPersonal as LiquidacionPersonalDto,
  LiquidacionPersonalDetalle,
  MetodoPagoLiquidacion,
  NominaPago as NominaPagoDto,
  NominaPagoDetalle,
  NominaPersonaLinea,
  NominaPreview,
} from '@fixtura/types';
import { TIPO_CUENTA_BANCARIA_LABEL } from '@fixtura/types';

import { sanitizarFilaExcel } from '../../../common/excel/sanitize';
import { AuditLogService } from '../../audit';
import { Designacion } from '../../competition/entities/designacion.entity';
import { LiquidacionPersonal } from '../../competition/entities/liquidacion-personal.entity';
import { NominaPago } from '../../competition/entities/nomina-pago.entity';
import type { Partido } from '../../competition/entities/partido.entity';
import type { Personal } from '../../competition/entities/personal.entity';
import type { CrearLiquidacionDto } from './dto';

interface GrupoPeriodo {
  personal: Personal;
  designaciones: Designacion[];
  total: number;
}

@Injectable()
export class PagosPersonalService {
  constructor(
    @InjectRepository(Designacion)
    private readonly desigRepo: Repository<Designacion>,
    @InjectRepository(LiquidacionPersonal)
    private readonly liqRepo: Repository<LiquidacionPersonal>,
    @InjectRepository(NominaPago)
    private readonly nominaRepo: Repository<NominaPago>,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Fecha de hoy (YYYY-MM-DD) en America/Santiago. Estable e independiente
   * del TZ del proceso (en-CA produce ISO YYYY-MM-DD).
   */
  private hoySantiagoISO(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /** Nombre del equipo desde inscripción (modelo nuevo) con fallback al viejo. */
  private nombreEquipo(
    insc: { club?: { nombre?: string | null } | null } | null | undefined,
  ): string {
    return insc?.club?.nombre ?? 'Equipo';
  }

  private toLineaPendiente(d: Designacion): DesignacionPendientePago {
    const partido = d.partido;
    const fecha = partido?.fecha;
    const torneo = fecha?.torneo;
    return {
      designacionId: d.id,
      partidoId: d.partidoId,
      torneoId: fecha?.torneoId ?? '',
      torneoNombre: torneo?.nombre ?? 'Torneo',
      fechaNumero: fecha?.numero ?? null,
      fechaHora: partido?.fechaHora ? partido.fechaHora.toISOString() : null,
      equipoLocalNombre: this.nombreEquipo(partido?.inscripcionLocal),
      equipoVisitaNombre: this.nombreEquipo(partido?.inscripcionVisita),
      rolAsignado: d.rolAsignado,
      monto: d.montoPago ?? 0,
    };
  }

  /**
   * Carga designaciones ASISTIO sin liquidar (cuentas por pagar abiertas)
   * con todas las relaciones para armar las líneas de detalle.
   */
  private async cargarPendientes(tenantId: string): Promise<Designacion[]> {
    return this.desigRepo.find({
      where: { tenantId, estado: 'ASISTIO', liquidacionId: IsNull() },
      relations: {
        personal: true,
        partido: {
          fecha: { torneo: true },
          inscripcionLocal: { club: true },
          inscripcionVisita: { club: true },
        },
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Cuentas por pagar agrupadas por persona. Solo cuenta designaciones
   * ASISTIO con `liquidacion_id` NULL. Las que no tienen `montoPago` se
   * cuentan aparte (`sinMontoCount`) porque no se pueden liquidar.
   */
  async cuentasPorPagar(tenantId: string): Promise<CuentasPorPagarResumen> {
    const pendientes = await this.cargarPendientes(tenantId);

    const porPersona = new Map<string, CuentaPorPagarPersona>();
    let totalPendienteGlobal = 0;
    let sinMontoCount = 0;

    for (const d of pendientes) {
      // Sin monto definido: no liquidable. Lo contamos pero no lo sumamos.
      if (d.montoPago == null || d.montoPago <= 0) {
        sinMontoCount += 1;
        continue;
      }
      const p = d.personal;
      if (!p) continue;

      let persona = porPersona.get(d.personalId);
      if (!persona) {
        persona = {
          personalId: d.personalId,
          nombre: p.nombre,
          apellido: p.apellido,
          rut: p.rut ?? null,
          rol: p.rol,
          designacionesCount: 0,
          totalPendiente: 0,
          detalle: [],
        };
        porPersona.set(d.personalId, persona);
      }
      persona.detalle.push(this.toLineaPendiente(d));
      persona.designacionesCount += 1;
      persona.totalPendiente += d.montoPago;
      totalPendienteGlobal += d.montoPago;
    }

    const personas = Array.from(porPersona.values()).sort((a, b) =>
      `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'),
    );

    return { personas, totalPendienteGlobal, sinMontoCount };
  }

  /**
   * Crea una liquidación que salda N designaciones ASISTIO de una misma
   * persona. El total es un snapshot (suma de montos al momento de pagar).
   * Atómico: o se crea la liquidación y se vinculan todas, o nada.
   */
  @Transactional()
  async liquidar(
    tenantId: string,
    userId: string,
    input: CrearLiquidacionDto,
  ): Promise<LiquidacionPersonalDetalle> {
    const ids = Array.from(new Set(input.designacionIds));
    if (ids.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos una designación.');
    }

    const designaciones = await this.desigRepo.find({
      where: { id: In(ids), tenantId },
      relations: {
        personal: true,
        partido: {
          fecha: { torneo: true },
          inscripcionLocal: { club: true },
          inscripcionVisita: { club: true },
        },
      },
    });

    if (designaciones.length !== ids.length) {
      throw new BadRequestException(
        'Una o más designaciones no existen o no pertenecen a esta liga.',
      );
    }

    for (const d of designaciones) {
      if (d.personalId !== input.personalId) {
        throw new BadRequestException(
          'Todas las designaciones deben ser de la misma persona.',
        );
      }
      if (d.estado !== 'ASISTIO') {
        throw new BadRequestException(
          'Solo se pueden liquidar designaciones con asistencia confirmada (ASISTIO).',
        );
      }
      if (d.liquidacionId) {
        throw new BadRequestException(
          'Una o más designaciones ya fueron liquidadas.',
        );
      }
      if (d.montoPago == null || d.montoPago <= 0) {
        throw new BadRequestException(
          'Una o más designaciones no tienen monto definido — no se pueden pagar.',
        );
      }
    }

    const total = designaciones.reduce((acc, d) => acc + (d.montoPago ?? 0), 0);

    const saved = await this.crearLiquidacionInterna({
      tenantId,
      userId,
      personalId: input.personalId,
      designacionIds: ids,
      total,
      metodoPago: input.metodoPago,
      comprobante: input.comprobante?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      fechaPago: input.fechaPago ?? this.hoySantiagoISO(),
      nominaId: null,
    });

    try {
      await this.audit.record({
        action: 'pago_personal.liquidado',
        tenantId,
        userId,
        entityType: 'LiquidacionPersonal',
        entityId: saved.id,
        metadata: {
          personalId: input.personalId,
          total,
          metodoPago: input.metodoPago,
          designacionesCount: ids.length,
          designacionIds: ids,
        },
      });
    } catch {
      // best-effort
    }

    return this.getLiquidacion(saved.id, tenantId);
  }

  /**
   * Crea una liquidación y vincula sus designaciones con guard optimista
   * contra doble pago (solo toma las que siguen ASISTIO y sin liquidar). Si
   * el número afectado no coincide, lanza y la tx revierte. Compartido por
   * la liquidación individual (F47) y la nómina (F49).
   */
  private async crearLiquidacionInterna(params: {
    tenantId: string;
    userId: string;
    personalId: string;
    designacionIds: string[];
    total: number;
    metodoPago: MetodoPagoLiquidacion;
    comprobante: string | null;
    observaciones: string | null;
    fechaPago: string;
    nominaId: string | null;
  }): Promise<LiquidacionPersonal> {
    const liq = this.liqRepo.create({
      tenantId: params.tenantId,
      personalId: params.personalId,
      total: params.total,
      metodoPago: params.metodoPago,
      comprobante: params.comprobante,
      observaciones: params.observaciones,
      fechaPago: params.fechaPago,
      nominaId: params.nominaId,
      createdBy: params.userId,
    });
    const saved = await this.liqRepo.save(liq);

    const result = await this.desigRepo.update(
      {
        id: In(params.designacionIds),
        tenantId: params.tenantId,
        estado: 'ASISTIO',
        liquidacionId: IsNull(),
      },
      { liquidacionId: saved.id },
    );
    if (result.affected !== params.designacionIds.length) {
      throw new BadRequestException(
        'Una o más designaciones cambiaron de estado o ya fueron liquidadas. Recarga e intenta de nuevo.',
      );
    }
    return saved;
  }

  /** Lista las liquidaciones registradas (pagos hechos), más recientes primero. */
  async listLiquidaciones(tenantId: string): Promise<LiquidacionPersonalDto[]> {
    const liqs = await this.liqRepo.find({
      where: { tenantId },
      relations: { personal: true, createdByUser: true },
      order: { fechaPago: 'DESC', createdAt: 'DESC' },
    });

    if (liqs.length === 0) return [];

    // Contamos designaciones por liquidación en una sola query agregada.
    const counts = await this.desigRepo
      .createQueryBuilder('d')
      .select('d.liquidacion_id', 'liquidacionId')
      .addSelect('COUNT(*)', 'count')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.liquidacion_id IN (:...ids)', { ids: liqs.map((l) => l.id) })
      .groupBy('d.liquidacion_id')
      .getRawMany<{ liquidacionId: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.liquidacionId, Number(c.count)]));

    return liqs.map((l) => this.toLiquidacionDto(l, countMap.get(l.id) ?? 0));
  }

  /** Detalle de una liquidación: cabecera + las designaciones que saldó. */
  async getLiquidacion(
    id: string,
    tenantId: string,
  ): Promise<LiquidacionPersonalDetalle> {
    const liq = await this.liqRepo.findOne({
      where: { id, tenantId },
      relations: { personal: true, createdByUser: true },
    });
    if (!liq) throw new NotFoundException(`Liquidación ${id} no encontrada`);

    const designaciones = await this.desigRepo.find({
      where: { tenantId, liquidacionId: id },
      relations: {
        partido: {
          fecha: { torneo: true },
          inscripcionLocal: { club: true },
          inscripcionVisita: { club: true },
        },
      },
      order: { createdAt: 'ASC' },
    });

    return {
      ...this.toLiquidacionDto(liq, designaciones.length),
      detalle: designaciones.map((d) => this.toLineaPendiente(d)),
    };
  }

  /**
   * Revierte una liquidación: la borra y libera sus designaciones
   * (ON DELETE SET NULL deja liquidacion_id en NULL → vuelven a "pendiente").
   */
  @Transactional()
  async eliminarLiquidacion(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const liq = await this.liqRepo.findOne({ where: { id, tenantId } });
    if (!liq) throw new NotFoundException(`Liquidación ${id} no encontrada`);

    // Liberamos explícitamente (no dependemos solo del ON DELETE SET NULL,
    // que igual actúa; esto deja la intención clara y funciona aunque el
    // FK no esté creado todavía en algún entorno).
    await this.desigRepo.update(
      { tenantId, liquidacionId: id },
      { liquidacionId: null },
    );
    await this.liqRepo.remove(liq);

    try {
      await this.audit.record({
        action: 'pago_personal.revertido',
        tenantId,
        userId,
        entityType: 'LiquidacionPersonal',
        entityId: id,
        metadata: { personalId: liq.personalId, total: liq.total },
      });
    } catch {
      // best-effort
    }
  }

  private toLiquidacionDto(
    l: LiquidacionPersonal,
    designacionesCount: number,
  ): LiquidacionPersonalDto {
    return {
      id: l.id,
      personalId: l.personalId,
      personalNombre: l.personal?.nombre ?? '',
      personalApellido: l.personal?.apellido ?? '',
      total: l.total,
      metodoPago: l.metodoPago,
      comprobante: l.comprobante,
      observaciones: l.observaciones,
      fechaPago: l.fechaPago,
      designacionesCount,
      createdByNombre: l.createdByUser
        ? `${l.createdByUser.nombre ?? ''} ${l.createdByUser.apellido ?? ''}`.trim() ||
          null
        : null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  // ─── F49: Nómina de pago (pago masivo por período) ────────────────

  /**
   * Fecha calendario (YYYY-MM-DD) del partido en America/Santiago. Cae a
   * fecha_inicio de la jornada si el partido no tiene fecha_hora.
   */
  private partidoFechaISO(partido: Partido | null | undefined): string | null {
    if (!partido) return null;
    if (partido.fechaHora) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(partido.fechaHora);
    }
    return partido.fecha?.fechaInicio ?? null;
  }

  private tieneCuenta(p: Personal): boolean {
    return !!(p.banco && p.tipoCuenta && p.numeroCuenta);
  }

  private toNominaLinea(
    p: Personal,
    designacionesCount: number,
    total: number,
  ): NominaPersonaLinea {
    return {
      personalId: p.id,
      nombre: p.nombre,
      apellido: p.apellido,
      rut: p.rut ?? null,
      rol: p.rol,
      banco: p.banco ?? null,
      tipoCuenta: p.tipoCuenta ?? null,
      numeroCuenta: p.numeroCuenta ?? null,
      titularNombre: p.titularNombre ?? null,
      titularRut: p.titularRut ?? null,
      designacionesCount,
      total,
      tieneCuenta: this.tieneCuenta(p),
    };
  }

  /**
   * Agrupa por persona las asistencias ASISTIO sin liquidar cuyo partido cae
   * en [desde, hasta] y tienen monto > 0. Si se pasa `soloPersonalIds`, solo
   * considera esas personas. Base compartida por preview y emisión.
   */
  private async construirGruposPeriodo(
    tenantId: string,
    desde: string,
    hasta: string,
    soloPersonalIds?: Set<string>,
  ): Promise<Map<string, GrupoPeriodo>> {
    const pendientes = await this.cargarPendientes(tenantId);
    const grupos = new Map<string, GrupoPeriodo>();
    for (const d of pendientes) {
      if (d.montoPago == null || d.montoPago <= 0) continue;
      if (soloPersonalIds && !soloPersonalIds.has(d.personalId)) continue;
      const fISO = this.partidoFechaISO(d.partido);
      if (!fISO || fISO < desde || fISO > hasta) continue;
      const p = d.personal;
      if (!p) continue;
      let g = grupos.get(d.personalId);
      if (!g) {
        g = { personal: p, designaciones: [], total: 0 };
        grupos.set(d.personalId, g);
      }
      g.designaciones.push(d);
      g.total += d.montoPago;
    }
    return grupos;
  }

  /**
   * Preview (dry-run) de una nómina para un período: a quién se le pagaría y
   * cuánto, con sus datos bancarios, sin persistir nada.
   */
  async previewNomina(
    tenantId: string,
    desde: string,
    hasta: string,
  ): Promise<NominaPreview> {
    if (hasta < desde) {
      throw new BadRequestException('El rango de fechas es inválido.');
    }
    const grupos = await this.construirGruposPeriodo(tenantId, desde, hasta);
    const personas = Array.from(grupos.values())
      .map((g) => this.toNominaLinea(g.personal, g.designaciones.length, g.total))
      .sort((a, b) =>
        `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'),
      );
    return {
      desde,
      hasta,
      personas,
      totalGlobal: personas.reduce((acc, p) => acc + p.total, 0),
      personasCount: personas.length,
      sinCuentaCount: personas.filter((p) => !p.tieneCuenta).length,
    };
  }

  /**
   * Emite una nómina: registra el pago (crea una liquidación por persona
   * seleccionada) de sus asistencias ASISTIO sin liquidar en el período.
   * Atómico: o se crea la nómina con todas sus liquidaciones, o nada.
   */
  @Transactional()
  async emitirNomina(
    tenantId: string,
    userId: string,
    input: EmitirNominaRequest,
  ): Promise<NominaPagoDetalle> {
    if (input.hasta < input.desde) {
      throw new BadRequestException('El rango de fechas es inválido.');
    }
    const fechaPago = input.fechaPago ?? this.hoySantiagoISO();
    const grupos = await this.construirGruposPeriodo(
      tenantId,
      input.desde,
      input.hasta,
      new Set(input.personalIds),
    );
    if (grupos.size === 0) {
      throw new BadRequestException(
        'No hay asistencias por pagar para la selección y el período indicado.',
      );
    }

    const nomina = this.nominaRepo.create({
      tenantId,
      periodoDesde: input.desde,
      periodoHasta: input.hasta,
      fechaPago,
      metodoPago: input.metodoPago,
      total: 0,
      cantidadPersonas: 0,
      observaciones: input.observaciones?.trim() || null,
      createdBy: userId,
    });
    const savedNomina = await this.nominaRepo.save(nomina);

    let total = 0;
    for (const g of grupos.values()) {
      await this.crearLiquidacionInterna({
        tenantId,
        userId,
        personalId: g.personal.id,
        designacionIds: g.designaciones.map((d) => d.id),
        total: g.total,
        metodoPago: input.metodoPago,
        comprobante: null,
        observaciones: null,
        fechaPago,
        nominaId: savedNomina.id,
      });
      total += g.total;
    }

    savedNomina.total = total;
    savedNomina.cantidadPersonas = grupos.size;
    await this.nominaRepo.save(savedNomina);

    try {
      await this.audit.record({
        action: 'pago_personal.nomina_emitida',
        tenantId,
        userId,
        entityType: 'NominaPago',
        entityId: savedNomina.id,
        metadata: {
          periodoDesde: input.desde,
          periodoHasta: input.hasta,
          metodoPago: input.metodoPago,
          total,
          cantidadPersonas: grupos.size,
        },
      });
    } catch {
      // best-effort
    }

    return this.getNomina(savedNomina.id, tenantId);
  }

  /** Lista las nóminas emitidas, más recientes primero. */
  async listNominas(tenantId: string): Promise<NominaPagoDto[]> {
    const nominas = await this.nominaRepo.find({
      where: { tenantId },
      relations: { createdByUser: true },
      order: { fechaPago: 'DESC', createdAt: 'DESC' },
    });
    return nominas.map((n) => this.toNominaDto(n));
  }

  /** Detalle de una nómina: cabecera + una línea por persona pagada. */
  async getNomina(id: string, tenantId: string): Promise<NominaPagoDetalle> {
    const nomina = await this.nominaRepo.findOne({
      where: { id, tenantId },
      relations: { createdByUser: true },
    });
    if (!nomina) throw new NotFoundException(`Nómina ${id} no encontrada`);

    const liqs = await this.liqRepo.find({
      where: { tenantId, nominaId: id },
      relations: { personal: true },
    });

    let countMap = new Map<string, number>();
    if (liqs.length > 0) {
      const counts = await this.desigRepo
        .createQueryBuilder('d')
        .select('d.liquidacion_id', 'liquidacionId')
        .addSelect('COUNT(*)', 'count')
        .where('d.tenant_id = :tenantId', { tenantId })
        .andWhere('d.liquidacion_id IN (:...ids)', { ids: liqs.map((l) => l.id) })
        .groupBy('d.liquidacion_id')
        .getRawMany<{ liquidacionId: string; count: string }>();
      countMap = new Map(counts.map((c) => [c.liquidacionId, Number(c.count)]));
    }

    const lineas = liqs
      .filter((l) => l.personal)
      .map((l) =>
        this.toNominaLinea(l.personal!, countMap.get(l.id) ?? 0, l.total),
      )
      .sort((a, b) =>
        `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'),
      );

    return { ...this.toNominaDto(nomina), lineas };
  }

  /**
   * Revierte una nómina: borra sus liquidaciones (liberando las designaciones
   * a "pendiente") y la cabecera. Atómico.
   */
  @Transactional()
  async eliminarNomina(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const nomina = await this.nominaRepo.findOne({ where: { id, tenantId } });
    if (!nomina) throw new NotFoundException(`Nómina ${id} no encontrada`);

    const liqs = await this.liqRepo.find({ where: { tenantId, nominaId: id } });
    const liqIds = liqs.map((l) => l.id);
    if (liqIds.length > 0) {
      await this.desigRepo.update(
        { tenantId, liquidacionId: In(liqIds) },
        { liquidacionId: null },
      );
      await this.liqRepo.remove(liqs);
    }
    await this.nominaRepo.remove(nomina);

    try {
      await this.audit.record({
        action: 'pago_personal.nomina_revertida',
        tenantId,
        userId,
        entityType: 'NominaPago',
        entityId: id,
        metadata: {
          total: nomina.total,
          cantidadPersonas: nomina.cantidadPersonas,
        },
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Genera el Excel (.xlsx) de una nómina, con columnas estándar para
   * transferencia masiva (RUT/banco/tipo/n° cuenta/monto). Re-descargable.
   */
  async exportarNominaExcel(id: string, tenantId: string): Promise<Buffer> {
    const det = await this.getNomina(id, tenantId);
    const rows = det.lineas.map((l) => ({
      RUT: l.titularRut ?? l.rut ?? '',
      Nombre: l.titularNombre ?? `${l.nombre} ${l.apellido}`,
      Banco: l.banco ?? '',
      'Tipo de cuenta': l.tipoCuenta
        ? TIPO_CUENTA_BANCARIA_LABEL[l.tipoCuenta]
        : '',
      'N° de cuenta': l.numeroCuenta ?? '',
      Monto: l.total,
      Asistencias: l.designacionesCount,
    }));
    // Sanitiza cada celda contra formula injection antes de escribir el .xlsx.
    const ws = XLSX.utils.json_to_sheet(rows.map(sanitizarFilaExcel));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private toNominaDto(n: NominaPago): NominaPagoDto {
    return {
      id: n.id,
      periodoDesde: n.periodoDesde,
      periodoHasta: n.periodoHasta,
      fechaPago: n.fechaPago,
      metodoPago: n.metodoPago,
      total: n.total,
      cantidadPersonas: n.cantidadPersonas,
      observaciones: n.observaciones,
      createdByNombre: n.createdByUser
        ? `${n.createdByUser.nombre ?? ''} ${n.createdByUser.apellido ?? ''}`.trim() ||
          null
        : null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
