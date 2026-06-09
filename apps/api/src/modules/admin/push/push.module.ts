import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../../competition/competition.module';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushPublicController } from './push.controller';
import {
  PUSH_PROVIDER,
  PushFCMProvider,
  PushMockProvider,
  PushWebPushProvider,
} from './push-provider';
import { PushService } from './push.service';

/**
 * Módulo de notificaciones push. Selecciona provider según `PUSH_MODE`:
 *   mock (default) → PushMockProvider (log-only)
 *   webpush        → PushWebPushProvider (VAPID, requiere claves en env)
 *   fcm            → PushFCMProvider (stub, requiere credenciales)
 */
@Module({
  imports: [CompetitionModule, TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushPublicController],
  providers: [
    PushService,
    PushMockProvider,
    PushFCMProvider,
    PushWebPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [PushMockProvider, PushFCMProvider, PushWebPushProvider],
      useFactory: (
        mock: PushMockProvider,
        fcm: PushFCMProvider,
        webpush: PushWebPushProvider,
      ) => {
        const mode = (process.env.PUSH_MODE ?? 'mock').toLowerCase();
        if (mode === 'webpush') return webpush;
        if (mode === 'fcm') return fcm;
        return mock;
      },
    },
  ],
  exports: [PushService],
})
export class PushModule {}
