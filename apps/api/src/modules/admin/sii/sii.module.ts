import { Module } from '@nestjs/common';

import { CompetitionModule } from '../../competition/competition.module';
import { SiiAdminController } from './sii.controller';
import { SiiCron } from './sii.cron';
import { SIIService } from './sii.service';
import {
  OpenFacturaProvider,
  SII_PROVIDER,
  SIIMockProvider,
  SIIProvider,
} from './sii-provider';

/**
 * Módulo SII (documentos tributarios electrónicos).
 *
 * Selecciona el provider según `SII_MODE`:
 *   - mock (default)      → SIIMockProvider
 *   - sandbox|production  → OpenFacturaProvider (stub)
 *
 * Expone SIIService al PagosModule para que `confirmarPago` dispare la
 * emisión asíncrona al aprobar una transacción.
 */
@Module({
  imports: [CompetitionModule],
  controllers: [SiiAdminController],
  providers: [
    SIIService,
    SIIMockProvider,
    OpenFacturaProvider,
    SiiCron,
    {
      provide: SII_PROVIDER,
      inject: [SIIMockProvider, OpenFacturaProvider],
      useFactory: (mock: SIIMockProvider, real: OpenFacturaProvider): SIIProvider => {
        const mode = (process.env.SII_MODE ?? 'mock').toLowerCase();
        if (mode === 'sandbox' || mode === 'production') return real;
        return mock;
      },
    },
  ],
  exports: [SIIService],
})
export class SIIModule {}
