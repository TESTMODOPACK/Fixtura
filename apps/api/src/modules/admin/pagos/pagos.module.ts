import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../../competition/competition.module';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { SIIModule } from '../sii/sii.module';
import { FlowProvider } from './flow-provider';
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
 * Módulo de pagos.
 *
 * La pasarela activa se resuelve POR LIGA en runtime (PagosService lee
 * tenants.pagos_config + credenciales cifradas). Flow es la integración
 * real (FlowProvider, entorno global vía FLOW_MODE). El provider Webpay
 * (mock por default vía WEBPAY_MODE) queda como fallback "modo prueba"
 * para ligas sin pasarela configurada.
 */
@Module({
  imports: [CompetitionModule, SIIModule, TypeOrmModule.forFeature([Tenant, User])],
  controllers: [PagosAdminController, PagosPublicController],
  providers: [
    PagosService,
    FlowProvider,
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
