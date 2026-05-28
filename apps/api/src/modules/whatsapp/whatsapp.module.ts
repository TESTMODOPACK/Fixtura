import { Global, Logger, Module } from '@nestjs/common';

import {
  WhatsAppMetaProvider,
  WhatsAppMockProvider,
  WhatsAppProvider,
  WhatsAppTwilioProvider,
} from './whatsapp-provider';
import { WhatsAppService } from './whatsapp.service';

/**
 * Sprint 17 — RF-04b extendido.
 *
 * Elige el provider real en runtime según WHATSAPP_PROVIDER:
 *   MOCK   → desarrollo y CI (default).
 *   TWILIO → Twilio WhatsApp Business API.
 *   META   → Meta Cloud API directo.
 *
 * @Global porque PersonalAdminService lo usa y queremos evitar importar
 * WhatsAppModule en cada feature que necesite WhatsApp en el futuro.
 */
@Global()
@Module({
  providers: [
    WhatsAppMockProvider,
    WhatsAppTwilioProvider,
    WhatsAppMetaProvider,
    {
      provide: WhatsAppProvider,
      useFactory: (
        mock: WhatsAppMockProvider,
        twilio: WhatsAppTwilioProvider,
        meta: WhatsAppMetaProvider,
      ): WhatsAppProvider => {
        const tipo = (process.env.WHATSAPP_PROVIDER ?? 'MOCK').toUpperCase();
        const log = new Logger('WhatsAppModule');
        switch (tipo) {
          case 'TWILIO':
            log.log('Usando WhatsAppTwilioProvider');
            return twilio;
          case 'META':
            log.log('Usando WhatsAppMetaProvider');
            return meta;
          case 'MOCK':
          default:
            log.log('Usando WhatsAppMockProvider (dev / sin credenciales)');
            return mock;
        }
      },
      inject: [WhatsAppMockProvider, WhatsAppTwilioProvider, WhatsAppMetaProvider],
    },
    WhatsAppService,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
