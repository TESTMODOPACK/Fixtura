import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';

import { EmailService } from '../email/email.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { FacturaPlataforma } from './entities/factura-plataforma.entity';
import { FacturacionPlataformaService } from './facturacion-plataforma.service';

/**
 * Sprint 24A — Crons de facturación plataforma.
 *
 *   - Día 1 de cada mes a las 02:00 → genera facturas del mes.
 *   - Todos los días a las 09:00 → marca vencidas + envía recordatorios
 *     + suspende tenants con >= 30 días de mora.
 *
 * Calendario de recordatorios (días después del vencimiento):
 *   - Día 1  → "Tu factura venció ayer"
 *   - Día 10 → "Tu factura tiene 10 días de mora"
 *   - Día 20 → "Última advertencia: a 10 días de suspensión"
 *   - Día 30 → suspensión automática + email de aviso
 */
@Injectable()
export class FacturacionPlataformaCron {
  private readonly log = new Logger(FacturacionPlataformaCron.name);

  /** Días de mora a los que se envía cada recordatorio. */
  static readonly DIAS_RECORDATORIO_1 = 1;
  static readonly DIAS_RECORDATORIO_2 = 10;
  static readonly DIAS_RECORDATORIO_3 = 20;
  static readonly DIAS_SUSPENSION = 30;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(FacturaPlataforma)
    private readonly facturaRepo: Repository<FacturaPlataforma>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>,
    private readonly facturacionSvc: FacturacionPlataformaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Día 1 de cada mes a las 02:00 — genera facturas del mes en curso
   * para todos los tenants ACTIVOS con plan asignado.
   */
  @Cron('0 2 1 * *', { name: 'facturacion-mensual' })
  async generarFacturasDelMes(): Promise<void> {
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();
    this.log.log(`[cron] Generando facturas ${mes}/${anio}…`);
    try {
      const r = await this.facturacionSvc.generarFacturasMes(mes, anio);
      this.log.log(
        `[cron] facturacion-mensual ${mes}/${anio}: ${r.creadas} creadas, ${r.saltadas} saltadas.`,
      );
    } catch (err) {
      this.log.error(
        `[cron] facturacion-mensual FALLÓ: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Diario a las 09:00 — pipeline de mora:
   *   1. Marcar VENCIDAS las pendientes con fecha_vencimiento < hoy.
   *   2. Enviar recordatorios a las que cumplen días de mora exactos.
   *   3. Suspender tenants con cualquier factura ≥ 30 días de mora.
   */
  @Cron('0 9 * * *', { name: 'facturacion-mora' })
  async procesarMora(): Promise<void> {
    this.log.log('[cron] Procesando mora de facturas plataforma…');
    try {
      const { actualizadas } = await this.facturacionSvc.marcarVencidas();
      if (actualizadas > 0) {
        this.log.log(`[cron] ${actualizadas} facturas marcadas VENCIDAS.`);
      }
      await this.enviarRecordatorios();
      await this.suspenderMorososPorMaxDias();
    } catch (err) {
      this.log.error(
        `[cron] facturacion-mora FALLÓ: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async enviarRecordatorios(): Promise<void> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    // Tomar facturas VENCIDAS con días de mora EXACTOS = 1, 10, 20.
    // Trabajamos en días enteros para evitar disparar 2 veces el mismo recordatorio.
    const facturas = await this.facturaRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.tenant', 't')
      .leftJoinAndSelect('f.plan', 'p')
      .where(`f.estado = 'VENCIDA'`)
      .andWhere(`CURRENT_DATE - f.fecha_vencimiento IN (1, 10, 20)`)
      .getMany();

    for (const factura of facturas) {
      const dias = this.diasDeMora(factura.fechaVencimiento);
      try {
        await this.enviarEmailRecordatorio(factura, dias);
      } catch (err) {
        this.log.warn(
          `Error enviando recordatorio factura=${factura.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    if (facturas.length > 0) {
      this.log.log(`[cron] ${facturas.length} recordatorios enviados.`);
    }
  }

  private async enviarEmailRecordatorio(
    factura: FacturaPlataforma,
    dias: number,
  ): Promise<void> {
    // Buscar admins del tenant para enviar el email.
    const adminRoles = await this.userRoleRepo.find({
      where: { scopeId: factura.tenantId, role: 'LIGA_ADMIN', userId: Not(IsNull()) },
    });
    if (adminRoles.length === 0) return;
    const userIds = adminRoles.map((r) => r.userId).filter((x): x is string => !!x);
    if (userIds.length === 0) return;
    const users = await this.userRepo.find({ where: { id: In(userIds) } });
    const emails = users.map((u) => u.email).filter(Boolean);
    if (emails.length === 0) return;

    const ligaNombre = factura.tenant?.nombre ?? 'tu liga';
    const planNombre = factura.plan?.nombre ?? 'tu plan';
    const monto = factura.monto.toLocaleString('es-CL');
    const periodo = `${String(factura.periodoMes).padStart(2, '0')}/${factura.periodoAnio}`;

    let asunto: string;
    let urgencia: string;
    if (dias === FacturacionPlataformaCron.DIAS_RECORDATORIO_1) {
      asunto = `Tu factura de LigaPlus está vencida — ${ligaNombre}`;
      urgencia = 'amistoso';
    } else if (dias === FacturacionPlataformaCron.DIAS_RECORDATORIO_2) {
      asunto = `Recordatorio: 10 días de mora — ${ligaNombre}`;
      urgencia = 'firme';
    } else {
      asunto = `Última advertencia: a 10 días de suspensión — ${ligaNombre}`;
      urgencia = 'urgente';
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const linkPago = `${frontendUrl}/admin/mi-suscripcion`;

    const html = `
      <h2 style="color:#15803d">Recordatorio de pago</h2>
      <p>Hola,</p>
      <p>Tu factura del plan <strong>${planNombre}</strong> correspondiente al
      período <strong>${periodo}</strong> está vencida hace
      <strong>${dias} día${dias === 1 ? '' : 's'}</strong>.</p>
      <p>Monto: <strong>$${monto} CLP</strong></p>
      ${urgencia === 'urgente'
        ? `<p style="color:#dc2626"><strong>Atención:</strong> si no recibimos el pago en los próximos 10 días, tu liga será suspendida automáticamente.</p>`
        : ''
      }
      <p style="margin:20px 0">
        <a href="${linkPago}"
           style="background:#15803d;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Pagar ahora
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        Si ya hiciste el pago por transferencia, ignorá este aviso. Te
        avisaremos cuando lo registremos.
      </p>
      <p>Saludos,<br/>Equipo LigaPlus</p>
    `;
    const text = `Tu factura ${periodo} de LigaPlus tiene ${dias} días de mora. Monto $${monto} CLP. Pagá en ${linkPago}.`;

    for (const email of emails) {
      await this.email.send({ to: email, subject: asunto, html, text });
    }
  }

  private async suspenderMorososPorMaxDias(): Promise<void> {
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);
    // Buscar tenants ACTIVOS con alguna factura VENCIDA con ≥ 30 días.
    const rows: Array<{ tenant_id: string; dias_max: number }> = await this.ds.query(
      `
      SELECT f.tenant_id AS tenant_id,
             MAX(CURRENT_DATE - f.fecha_vencimiento)::int AS dias_max
        FROM facturas_plataforma f
        JOIN tenants t ON t.id = f.tenant_id
       WHERE f.estado = 'VENCIDA'
         AND t.estado_suscripcion = 'ACTIVO'
       GROUP BY f.tenant_id
      HAVING MAX(CURRENT_DATE - f.fecha_vencimiento) >= $1
      `,
      [FacturacionPlataformaCron.DIAS_SUSPENSION],
    );

    for (const row of rows) {
      try {
        const t = await this.tenantRepo.findOne({ where: { id: row.tenant_id } });
        if (!t || t.estadoSuscripcion === 'SUSPENDIDO') continue;
        t.estadoSuscripcion = 'SUSPENDIDO';
        t.suspendidoAt = new Date();
        t.suspendidoMotivo = `Mora de ${row.dias_max} días en facturas plataforma`;
        t.isActive = false;
        await this.tenantRepo.save(t);
        this.log.warn(
          `[cron] Tenant ${t.slug} (${t.id}) SUSPENDIDO por ${row.dias_max} días de mora.`,
        );
      } catch (err) {
        this.log.error(
          `[cron] Error suspendiendo tenant=${row.tenant_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private diasDeMora(fechaVencimientoIso: string): number {
    const hoy = new Date();
    const venc = new Date(fechaVencimientoIso + 'T00:00:00Z');
    return Math.max(
      0,
      Math.floor((hoy.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  /**
   * Punto de extensión: estos métodos podrían dispararse manualmente
   * desde el super admin para forzar el ciclo (testing / soporte).
   */
  static readonly CRON_EXPRESSION_MENSUAL = '0 2 1 * *';
  static readonly CRON_EXPRESSION_DIARIO = '0 9 * * *';
}

// Suppress unused import warning if CronExpression default not used.
void CronExpression;
