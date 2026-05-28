import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PushSubscription } from '../admin/push/entities/push-subscription.entity';
import { Designacion } from '../competition/entities/designacion.entity';
import { JugadorInscrito } from '../competition/entities/jugador-inscrito.entity';
import { Personal } from '../competition/entities/personal.entity';
import { SancionActiva } from '../competition/entities/sancion-activa.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { User } from '../users/entities/user.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRole,
      Personal,
      Designacion,
      JugadorInscrito,
      SancionActiva,
      PushSubscription,
    ]),
  ],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
