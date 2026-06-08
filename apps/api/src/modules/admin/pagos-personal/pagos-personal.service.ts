import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  CuentaPorPagarPersona,
  CuentasPorPagarResumen,
  DesignacionPendientePago,
  LiquidacionPersonal as LiquidacionPersonalDto,
  LiquidacionPersonalDetalle,
} from '@fixtura/types';

import { AuditLogService } from '../../audit';
import { Designacion } from '../../competition/entities/designacion.entity';
import { LiquidacionPersonal } from '../../competition/entities/liquidacion-personal.entity';
import type { CrearLiquidacionDto } from './dto';

@Injectable()
export class PagosPersonalService {
  constructor(
    @InjectRepository(Designacion)
    private readonly desigRepo: Repository<Designacion>,
    @InjectRepository(LiquidacionPersonal)
    private readonly liqRepo: Repository<LiquidacionPersonal>,
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
    equipo: { nombre?: string | null } | null | undefined,
  ): string {
    return insc?.club?.nombre ?? equipo?.nombre ?? 'Equipo';
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
      equipoLocalNombre: this.nombreEquipo(
        partido?.inscripcionLocal,
        partido?.equipoLocal,
      ),
      equipoVisitaNombre: this.nombreEquipo(
        partido?.inscripcionVisita,
        partido?.equipoVisita,
      ),
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
          equipoLocal: true,
          equipoVisita: true,
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
      throw new BadRequestException('Debés seleccionar al menos una designación.');
    }

    const designaciones = await this.desigRepo.find({
      where: { id: In(ids), tenantId },
      relations: {
        personal: true,
        partido: {
          fecha: { torneo: true },
          inscripcionLocal: { club: true },
          inscripcionVisita: { club: true },
          equipoLocal: true,
          equipoVisita: true,
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

    const liq = this.liqRepo.create({
      tenantId,
      personalId: input.personalId,
      total,
      metodoPago: input.metodoPago,
      comprobante: input.comprobante?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      fechaPago: input.fechaPago ?? this.hoySantiagoISO(),
      createdBy: userId,
    });
    const saved = await this.liqRepo.save(liq);

    // Guard optimista contra doble pago: solo vinculamos designaciones que
    // siguen ASISTIO y sin liquidar. Si dos liquidaciones concurrentes tocan
    // las mismas filas, la segunda afectará menos de lo esperado → lanzamos y
    // la tx revierte (incluido el insert de la liquidación).
    const result = await this.desigRepo.update(
      { id: In(ids), tenantId, estado: 'ASISTIO', liquidacionId: IsNull() },
      { liquidacionId: saved.id },
    );
    if (result.affected !== ids.length) {
      throw new BadRequestException(
        'Una o más designaciones cambiaron de estado o ya fueron liquidadas. Recargá e intentá de nuevo.',
      );
    }

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
          equipoLocal: true,
          equipoVisita: true,
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
}
