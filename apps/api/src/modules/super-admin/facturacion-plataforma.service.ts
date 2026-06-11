import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  EstadoCuentaLiga,
  FacturaPlataforma as FacturaPlataformaDto,
} from '@fixtura/types';

import { PlanSuscripcion } from '../tenants/entities/plan-suscripcion.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { FacturaPlataforma } from './entities/factura-plataforma.entity';

/**
 * Sprint 24A — Facturación que LigaPlus cobra a las ligas suscriptas.
 *
 * Distinto al módulo Cobros (Sprint 7C) que es para que la liga cobre a
 * sus equipos. Acá LigaPlus es el acreedor y la liga el deudor.
 *
 * Flujo:
 *   1. Cron mensual día 1 → generarFacturasMes() crea PENDIENTES.
 *   2. Cron diario revisa moras → marca VENCIDAS + envía recordatorios.
 *   3. Liga paga via Webpay → marcaPagada() + emite boleta SII.
 *   4. O super admin registra pago manual con TRANSFERENCIA/MANUAL.
 *   5. Día 31 mora → suspender_tenant() del módulo super-admin.
 */
@Injectable()
export class FacturacionPlataformaService {
  private readonly log = new Logger(FacturacionPlataformaService.name);

  /** Vencimiento por defecto: día 10 del mismo mes que la emisión. */
  static readonly DIAS_HASTA_VENCIMIENTO = 10;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(FacturaPlataforma)
    private readonly repo: Repository<FacturaPlataforma>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(PlanSuscripcion)
    private readonly planRepo: Repository<PlanSuscripcion>,
  ) {}

  @Transactional()
  async list(filter?: {
    tenantId?: string;
    estado?: string;
    anio?: number;
    mes?: number;
  }): Promise<FacturaPlataformaDto[]> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const qb = this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.tenant', 't')
      .leftJoinAndSelect('f.plan', 'p')
      .orderBy('f.periodo_anio', 'DESC')
      .addOrderBy('f.periodo_mes', 'DESC')
      .addOrderBy('t.nombre', 'ASC');

    if (filter?.tenantId) qb.andWhere('f.tenant_id = :tid', { tid: filter.tenantId });
    if (filter?.estado) qb.andWhere('f.estado = :estado', { estado: filter.estado });
    if (filter?.anio) qb.andWhere('f.periodo_anio = :a', { a: filter.anio });
    if (filter?.mes) qb.andWhere('f.periodo_mes = :m', { m: filter.mes });

    const items = await qb.getMany();
    return items.map((i) => this.toDto(i));
  }

  @Transactional()
  async findOne(id: string): Promise<FacturaPlataformaDto> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const f = await this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.tenant', 't')
      .leftJoinAndSelect('f.plan', 'p')
      .where('f.id = :id', { id })
      .getOne();
    if (!f) throw new NotFoundException(`Factura ${id} no encontrada.`);
    return this.toDto(f);
  }

  /**
   * Lista las facturas de UNA liga específica (vista del LIGA_ADMIN).
   * No requiere bypass de RLS porque filtramos por tenantId explícito,
   * y RLS sobre la tabla facturas_plataforma no existe (datos plataforma).
   */
  async listPorTenant(tenantId: string): Promise<FacturaPlataformaDto[]> {
    const items = await this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.tenant', 't')
      .leftJoinAndSelect('f.plan', 'p')
      .where('f.tenant_id = :tid', { tid: tenantId })
      .orderBy('f.periodo_anio', 'DESC')
      .addOrderBy('f.periodo_mes', 'DESC')
      .getMany();
    return items.map((i) => this.toDto(i));
  }

  /**
   * Estado de cuenta de una liga: saldo + facturas pendientes/vencidas.
   * Usado en el detalle del tenant para el super admin y en la vista
   * "Mi suscripción" del LIGA_ADMIN.
   */
  @Transactional()
  async estadoCuenta(tenantId: string): Promise<EstadoCuentaLiga> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const tenant = await this.tenantRepo
      .createQueryBuilder('t')
      .leftJoinAndMapOne('t.plan', PlanSuscripcion, 'plan', 'plan.id = t.plan_id')
      .where('t.id = :id', { id: tenantId })
      .getOne() as (Tenant & { plan?: PlanSuscripcion | null }) | null;
    if (!tenant) throw new NotFoundException(`Liga ${tenantId} no encontrada.`);

    const facturas = await this.repo.find({
      where: { tenantId, estado: In(['PENDIENTE', 'VENCIDA']) },
    });

    const totalAdeudado = facturas.reduce((acc, f) => acc + f.monto, 0);
    const pendientes = facturas.filter((f) => f.estado === 'PENDIENTE').length;
    const vencidas = facturas.filter((f) => f.estado === 'VENCIDA').length;
    const hoy = new Date();
    const diasMaxMora = facturas.reduce((acc, f) => {
      const venc = new Date(f.fechaVencimiento + 'T00:00:00Z');
      const d = Math.floor((hoy.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000));
      return d > acc ? d : acc;
    }, 0);

    const ultimaPagada = await this.repo.findOne({
      where: { tenantId, estado: 'PAGADA' },
      order: { fechaPago: 'DESC' },
    });

    return {
      tenantId,
      tenantNombre: tenant.nombre,
      estadoSuscripcion: tenant.estadoSuscripcion,
      plan: tenant.plan
        ? {
            id: tenant.plan.id,
            nombre: tenant.plan.nombre,
            precioMensualClp: tenant.plan.precioMensualClp,
          }
        : null,
      totalAdeudado,
      facturasPendientes: pendientes,
      facturasVencidas: vencidas,
      diasMaxMora: Math.max(0, diasMaxMora),
      ultimaFacturaPagada: ultimaPagada
        ? {
            id: ultimaPagada.id,
            periodoMes: ultimaPagada.periodoMes,
            periodoAnio: ultimaPagada.periodoAnio,
            fechaPago: ultimaPagada.fechaPago!.toISOString(),
          }
        : null,
    };
  }

  /**
   * Cron mensual: genera facturas para todos los tenants ACTIVOS con plan.
   * Idempotente: si ya existe la factura del mes para un tenant, la saltea.
   */
  @Transactional()
  async generarFacturasMes(
    mes: number,
    anio: number,
  ): Promise<{ creadas: number; saltadas: number }> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    if (mes < 1 || mes > 12) throw new BadRequestException('Mes inválido');
    if (anio < 2000 || anio > 2100) throw new BadRequestException('Año inválido');

    const tenants = await this.tenantRepo
      .createQueryBuilder('t')
      .leftJoinAndMapOne('t.plan', PlanSuscripcion, 'plan', 'plan.id = t.plan_id')
      .where('t.estado_suscripcion = :estado', { estado: 'ACTIVO' })
      .andWhere('t.plan_id IS NOT NULL')
      .getMany() as Array<Tenant & { plan?: PlanSuscripcion | null }>;

    let creadas = 0;
    let saltadas = 0;
    const fechaEmision = new Date(anio, mes - 1, 1).toISOString().slice(0, 10);
    const fechaVencimiento = new Date(
      anio,
      mes - 1,
      FacturacionPlataformaService.DIAS_HASTA_VENCIMIENTO,
    )
      .toISOString()
      .slice(0, 10);

    for (const tenant of tenants) {
      if (!tenant.plan) continue;
      try {
        const yaExiste = await this.repo.findOne({
          where: { tenantId: tenant.id, periodoMes: mes, periodoAnio: anio },
        });
        if (yaExiste) {
          saltadas++;
          continue;
        }
        const factura = this.repo.create({
          tenantId: tenant.id,
          planId: tenant.plan.id,
          periodoMes: mes,
          periodoAnio: anio,
          monto: tenant.plan.precioMensualClp,
          fechaEmision,
          fechaVencimiento,
          estado: 'PENDIENTE',
        });
        await this.repo.save(factura);
        creadas++;
      } catch (err) {
        this.log.warn(
          `Error generando factura tenant=${tenant.id} ${mes}/${anio}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        saltadas++;
      }
    }

    this.log.log(
      `[facturacion-cron] ${mes}/${anio}: ${creadas} creadas, ${saltadas} saltadas, total tenants=${tenants.length}`,
    );
    return { creadas, saltadas };
  }

  /**
   * Marca una factura como PAGADA. Pensado para uso interno (lo llama el
   * controller después de confirmar Webpay) y para registro manual.
   */
  @Transactional()
  async marcarPagada(
    facturaId: string,
    metodoPago: 'WEBPAY' | 'MERCADOPAGO' | 'TRANSFERENCIA' | 'MANUAL' | 'ONECLICK',
    opts?: {
      transaccionId?: string;
      docTributarioId?: string;
      observaciones?: string;
      fechaPago?: Date;
    },
  ): Promise<FacturaPlataformaDto> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const f = await this.repo.findOne({ where: { id: facturaId } });
    if (!f) throw new NotFoundException(`Factura ${facturaId} no encontrada.`);
    if (f.estado === 'PAGADA')
      throw new ConflictException('La factura ya está pagada.');
    if (f.estado === 'ANULADA')
      throw new ConflictException('No se puede pagar una factura anulada.');

    f.estado = 'PAGADA';
    f.metodoPago = metodoPago;
    f.fechaPago = opts?.fechaPago ?? new Date();
    if (opts?.transaccionId) f.transaccionId = opts.transaccionId;
    if (opts?.docTributarioId) f.docTributarioId = opts.docTributarioId;
    if (opts?.observaciones)
      f.observaciones = (f.observaciones ?? '') + '\n' + opts.observaciones;
    await this.repo.save(f);
    // F57 — si la liga estaba suspendida por mora y, tras este pago, ya no
    // acumula ≥2 facturas vencidas, se reactiva automáticamente.
    await this.reactivarSiCorresponde(f.tenantId);
    return this.findOne(f.id);
  }

  /**
   * F57 — Reactiva el tenant a ACTIVO si estaba SUSPENDIDO y ya no debe
   * ≥2 facturas vencidas. La tabla `tenants` no tiene RLS.
   */
  private async reactivarSiCorresponde(tenantId: string): Promise<void> {
    const rows: Array<{ estado_suscripcion: string }> = await this.ds.query(
      `SELECT estado_suscripcion FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (rows[0]?.estado_suscripcion !== 'SUSPENDIDO') return;
    const venc: Array<{ n: number }> = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM facturas_plataforma
        WHERE tenant_id = $1 AND estado = 'VENCIDA'`,
      [tenantId],
    );
    if (Number(venc[0]?.n ?? 0) < 2) {
      await this.ds.query(
        `UPDATE tenants
            SET estado_suscripcion = 'ACTIVO',
                suspendido_at = NULL,
                suspendido_motivo = NULL,
                is_active = true
          WHERE id = $1`,
        [tenantId],
      );
    }
  }

  @Transactional()
  async anular(
    facturaId: string,
    motivo: string,
    actorUserId: string,
  ): Promise<FacturaPlataformaDto> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const f = await this.repo.findOne({ where: { id: facturaId } });
    if (!f) throw new NotFoundException(`Factura ${facturaId} no encontrada.`);
    if (f.estado === 'PAGADA')
      throw new ConflictException('No se puede anular una factura ya pagada.');
    if (f.estado === 'ANULADA')
      throw new ConflictException('La factura ya está anulada.');

    f.estado = 'ANULADA';
    f.anuladaMotivo = motivo.trim();
    f.anuladaAt = new Date();
    f.anuladaByUserId = actorUserId;
    await this.repo.save(f);
    return this.findOne(f.id);
  }

  /**
   * Cron diario: marca como VENCIDA las facturas PENDIENTE cuya fecha de
   * vencimiento ya pasó. Idempotente.
   */
  @Transactional()
  async marcarVencidas(): Promise<{ actualizadas: number }> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({ estado: 'VENCIDA' })
      .where(`estado = 'PENDIENTE'`)
      .andWhere(`fecha_vencimiento < CURRENT_DATE`)
      .execute();
    return { actualizadas: result.affected ?? 0 };
  }

  private toDto(f: FacturaPlataforma): FacturaPlataformaDto {
    const hoy = new Date();
    const venc = new Date(f.fechaVencimiento + 'T00:00:00Z');
    const diasMora =
      f.estado === 'PAGADA' || f.estado === 'ANULADA'
        ? 0
        : Math.max(0, Math.floor((hoy.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      id: f.id,
      tenantId: f.tenantId,
      tenantNombre: f.tenant?.nombre ?? '—',
      tenantSlug: f.tenant?.slug ?? '—',
      planId: f.planId,
      planNombre: f.plan?.nombre ?? null,
      periodoMes: f.periodoMes,
      periodoAnio: f.periodoAnio,
      monto: f.monto,
      fechaEmision: f.fechaEmision,
      fechaVencimiento: f.fechaVencimiento,
      fechaPago: f.fechaPago?.toISOString() ?? null,
      estado: f.estado,
      metodoPago: f.metodoPago,
      transaccionId: f.transaccionId,
      docTributarioId: f.docTributarioId,
      observaciones: f.observaciones,
      diasMora,
      createdAt: f.createdAt.toISOString(),
    };
  }
}
