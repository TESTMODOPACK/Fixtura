import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../../competition/competition.module';
import { Tenant } from '../../tenants/entities/tenant.entity';
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
  imports: [CompetitionModule, TypeOrmModule.forFeature([Tenant])],
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
  // OpenFacturaProvider se exporta para el flujo BYO: Ajustes lo usa en
  // "Probar conexión" (GET organization con la key de la liga).
  exports: [SIIService, SII_PROVIDER, OpenFacturaProvider],
})
export class SIIModule {}
