import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { TenantCronRunner } from '../../../common/rls/tenant-cron-runner';

import { TarifaAplicadorService } from './tarifa-aplicador.service';

/**
 * Sprint 34C — Cron diario de cuotas recurrentes.
 *
 * Para cada tenant, recorre todas las inscripciones activas y por cada
 * tarifa CUOTA con frecuencia recurrente genera los cobros faltantes
 * desde el período de inscripción hasta el actual (cap de 24 períodos).
 *
 * Idempotente:
 *   - Pre-check por (inscripcion, tarifa, periodo) antes del insert.
 *   - UNIQUE INDEX uq_cobro_cuota_periodo como red de seguridad.
 *
 * Hora: 02:00 CLT. Si el container se reinicia o el cron falla en un
 * día, el próximo run genera los períodos faltantes automáticamente
 * (precisamente por la lógica "desde inscripción hasta hoy").
 *
 * Desactivar en dev/staging: CUOTAS_CRON_DISABLED=true.
 */
@Injectable()
export class CuotasCron {
  private readonly log = new Logger(CuotasCron.name);

  constructor(
    private readonly runner: TenantCronRunner,
    private readonly aplicador: TarifaAplicadorService,
  ) {}

  // 02:00 todos los días — '0 0 2 * * *' es "0s 0m 2h *d *M *dow".
  @Cron('0 0 2 * * *')
  async run(): Promise<void> {
    if (process.env.CUOTAS_CRON_DISABLED === 'true') {
      this.log.log('CUOTAS_CRON_DISABLED=true — skip');
      return;
    }
    await this.runner.runForEachTenant('cuotas', async (tenantId) => {
      const r = await this.aplicador.generarCuotasDelTenant(tenantId);
      this.log.log(
        `tenant=${tenantId} inscripciones=${r.inscripcionesProcesadas} cuotas_nuevas=${r.cuotasCreadas}`,
      );
      return r;
    });
  }
}
