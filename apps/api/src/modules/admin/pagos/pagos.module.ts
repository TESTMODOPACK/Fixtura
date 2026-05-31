import { Module } from '@nestjs/common';

import { CompetitionModule } from '../../competition/competition.module';
import { SIIModule } from '../sii/sii.module';
import {
  PagosAdminController,
  PagosPublicController,
} from './pagos.controller';
import { PagosService } from './pagos.service';
import {
  WEBPAY_PROVIDER,
  WebpayMockProvider,
  WebpayPlusProvider,
} from './webpay-provider';

/**
 * Módulo de pagos. Selecciona el provider Webpay según `WEBPAY_MODE`:
 *
 *   - mock (default)  → WebpayMockProvider (simula la pasarela)
 *   - sandbox|production → WebpayPlusProvider (Transbank SDK, no implementado)
 *
 * En cualquier modo, el `PagosService` orquesta el flujo Cobro →
 * Transacción → pasarela y mantiene la idempotencia.
 */
@Module({
  imports: [CompetitionModule, SIIModule],
  controllers: [PagosAdminController, PagosPublicController],
  providers: [
    PagosService,
    WebpayMockProvider,
    WebpayPlusProvider,
    {
      provide: WEBPAY_PROVIDER,
      inject: [WebpayMockProvider, WebpayPlusProvider],
      useFactory: (mock: WebpayMockProvider, real: WebpayPlusProvider) => {
        const mode = (process.env.WEBPAY_MODE ?? 'mock').toLowerCase();
        if (mode === 'sandbox' || mode === 'production') {
          return real;
        }
        return mock;
      },
    },
  ],
  exports: [PagosService, WEBPAY_PROVIDER],
})
export class PagosModule {}
