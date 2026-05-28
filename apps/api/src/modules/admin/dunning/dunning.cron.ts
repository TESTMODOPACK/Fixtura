import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TenantCronRunner } from '../../../common/rls/tenant-cron-runner';
import { DunningService } from './dunning.service';

/**
 * Cron diario de dunning.
 *
 * 1. Recalcula estado_dunning de todos los cobros del tenant.
 * 2. Envía avisos a los que cruzaron umbral (con throttle de 7 días).
 *
 * Corre a las 09:00 AM hora del servidor — momento prudente para que
 * los emails lleguen en horario de oficina, no a las 3 AM. Configurable
 * vía env DUNNING_CRON_HOUR.
 *
 * Para desactivar el cron en dev/staging: DUNNING_CRON_DISABLED=true.
 */
@Injectable()
export class DunningCron {
  private readonly log = new Logger(DunningCron.name);

  constructor(
    private readonly runner: TenantCronRunner,
    private readonly dunning: DunningService,
  ) {}

  // 09:00 AM todos los días — '0 0 9 * * *' es "0s 0m 9h *d *M *dow".
  @Cron('0 0 9 * * *')
  async run(): Promise<void> {
    if (process.env.DUNNING_CRON_DISABLED === 'true') {
      this.log.log('DUNNING_CRON_DISABLED=true — skip');
      return;
    }
    await this.runner.runForEachTenant('dunning', async (tenantId) => {
      const recalc = await this.dunning.recalcularEstados(tenantId);
      const avisos = await this.dunning.enviarAvisos(tenantId);
      return { recalculados: recalc.actualizados, ...avisos };
    });
  }

  /**
   * Endpoint de mantenimiento: cada hora chequea si el cron de las 9am
   * no corrió (puede pasar si el container se reinició). NO envía
   * emails — solo recalcula estados para que la UI no muestre datos
   * stale.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async recalcularHorario(): Promise<void> {
    if (process.env.DUNNING_CRON_DISABLED === 'true') return;
    await this.runner.runForEachTenant('dunning-recalc-horario', async (tenantId) => {
      return this.dunning.recalcularEstados(tenantId);
    });
  }
}
