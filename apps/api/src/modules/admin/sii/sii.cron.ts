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
    // Dentro del runner (tx por tenant) SOLO se listan ids: emitir() hace
    // HTTP de hasta 30s por documento, y con la tx del tenant abierta la
    // conexión quedaba idle-in-transaction hasta que el server la mataba
    // (120s) y el tenant entero se reportaba como fallido.
    const aReintentar: Array<{ tenantId: string; docId: string }> = [];
    await this.runner.runForEachTenant('sii-retry', async (tenantId) => {
      // Un quinto intento huérfano (proceso muerto entre reclamo y
      // persistencia) quedaba PENDIENTE_EMISION para siempre: intentos>=MAX
      // lo excluye del reintento y nadie lo pasaba a FALLIDO.
      await this.sii.marcarFallidosAgotados(tenantId);

      const pendientes = await this.sii.listarPendientesParaReintento(tenantId, 20);
      if (pendientes.length === 0) return { reintentados: 0 };
      this.log.log(
        `Tenant ${tenantId}: ${pendientes.length} documentos pendientes a reintentar`,
      );
      for (const doc of pendientes) {
        aReintentar.push({ tenantId, docId: doc.id });
      }
      return { reintentados: pendientes.length };
    });

    let emitidos = 0;
    let fallidos = 0;
    for (const { docId } of aReintentar) {
      try {
        // emitir() abre sus propias transacciones cortas (reclamo y
        // persistencia); el HTTP corre sin ninguna tx abierta.
        const result = await this.sii.emitir(docId);
        if (result.estado === 'EMITIDO') emitidos++;
        else if (result.estado === 'FALLIDO') fallidos++;
      } catch (err) {
        fallidos++;
        this.log.warn(`Reintento documento ${docId} falló: ${(err as Error).message}`);
      }
    }
    if (aReintentar.length > 0) {
      this.log.log(
        `[sii-retry] total: ${aReintentar.length} reintentados, emitidos=${emitidos} fallidos=${fallidos}`,
      );
    }
  }
}
