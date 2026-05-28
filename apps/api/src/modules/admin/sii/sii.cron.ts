import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TenantCronRunner } from '../../../common/rls/tenant-cron-runner';
import { SIIService } from './sii.service';

/**
 * Cron de reintento de emisión SII.
 *
 * Cada 30 minutos recorre todos los tenants activos y busca documentos
 * PENDIENTE_EMISION o RECHAZADO_SII para reintentar. El throttling de
 * 5 minutos entre intentos lo hace `listarPendientesParaReintento`.
 *
 * Si después de MAX_INTENTOS (5) sigue fallando, el documento queda
 * FALLIDO y requiere intervención manual.
 */
@Injectable()
export class SiiCron {
  private readonly log = new Logger(SiiCron.name);

  constructor(
    private readonly runner: TenantCronRunner,
    private readonly sii: SIIService,
  ) {}

  // Cada 30 minutos. CronExpression.EVERY_30_MINUTES = '0 */30 * * * *'.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reintentarEmisiones(): Promise<void> {
    if (process.env.SII_CRON_DISABLED === 'true') {
      this.log.log('SII_CRON_DISABLED=true — skip');
      return;
    }
    await this.runner.runForEachTenant('sii-retry', async (tenantId) => {
      const pendientes = await this.sii.listarPendientesParaReintento(tenantId, 20);
      if (pendientes.length === 0) return { reintentados: 0 };
      this.log.log(
        `Tenant ${tenantId}: ${pendientes.length} documentos pendientes a reintentar`,
      );
      let emitidos = 0;
      let fallidos = 0;
      for (const doc of pendientes) {
        try {
          const result = await this.sii.emitir(doc.id);
          if (result.estado === 'EMITIDO') emitidos++;
          else if (result.estado === 'FALLIDO') fallidos++;
        } catch (err) {
          fallidos++;
          this.log.warn(
            `Reintento documento ${doc.id} falló: ${(err as Error).message}`,
          );
        }
      }
      this.log.log(
        `Tenant ${tenantId}: emitidos=${emitidos} fallidos=${fallidos}`,
      );
      return { reintentados: pendientes.length, emitidos, fallidos };
    });
  }
}
