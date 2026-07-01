import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantCronRunner } from '../../../common/rls/tenant-cron-runner';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { FlyerDelegadosService } from './flyer-delegados.service';

/**
 * FLY — Cron semanal del flyer a delegados. Corre los LUNES a las 08:00
 * (America/Santiago) y, por cada tenant que tenga activado
 * `flyerSemanalDelegados`, arma y envía el flyer a sus delegados.
 *
 * Se puede desactivar en dev/staging con FLYER_CRON_DISABLED=true.
 */
@Injectable()
export class FlyerDelegadosCron {
  private readonly log = new Logger(FlyerDelegadosCron.name);

  constructor(
    private readonly runner: TenantCronRunner,
    private readonly flyer: FlyerDelegadosService,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // Lunes 08:00 — '0 0 8 * * 1' (seg min hora * * dow=lunes).
  @Cron('0 0 8 * * 1', { timeZone: 'America/Santiago' })
  async run(): Promise<void> {
    if (process.env.FLYER_CRON_DISABLED === 'true') {
      this.log.log('FLYER_CRON_DISABLED=true — skip');
      return;
    }
    await this.runner.runForEachTenant('flyer-semanal', async (tenantId) => {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      // Solo las ligas que activaron el flyer en Ajustes.
      if (!tenant?.flyerSemanalDelegados) return { skipped: true };
      return this.flyer.enviarSemanal(tenantId);
    });
  }
}
