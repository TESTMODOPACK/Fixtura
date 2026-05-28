import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../../competition/competition.module';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushPublicController } from './push.controller';
import {
  PUSH_PROVIDER,
  PushFCMProvider,
  PushMockProvider,
} from './push-provider';
import { PushService } from './push.service';

/**
 * Módulo de notificaciones push. Selecciona provider según `PUSH_MODE`:
 *   mock (default) → PushMockProvider (log-only)
 *   fcm           → PushFCMProvider (stub, requiere credenciales)
 */
@Module({
  imports: [CompetitionModule, TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushPublicController],
  providers: [
    PushService,
    PushMockProvider,
    PushFCMProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [PushMockProvider, PushFCMProvider],
      useFactory: (mock: PushMockProvider, fcm: PushFCMProvider) => {
        const mode = (process.env.PUSH_MODE ?? 'mock').toLowerCase();
        if (mode === 'fcm') return fcm;
        return mock;
      },
    },
  ],
  exports: [PushService],
})
export class PushModule {}
