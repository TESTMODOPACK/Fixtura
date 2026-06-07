import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Designacion } from '../competition/entities/designacion.entity';
import { Fecha } from '../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../competition/entities/incidencia-partido.entity';
import { Partido } from '../competition/entities/partido.entity';
import { PlanillaTorneo } from '../competition/entities/planilla-torneo.entity';
import { Torneo } from '../competition/entities/torneo.entity';
import {
  MatchCenterAdminController,
  MatchCenterPublicController,
} from './match-center.controller';
import { MatchCenterGateway } from './match-center.gateway';
import { MatchCenterService } from './match-center.service';

/**
 * Sprint 18 — RF-17 Match Center en vivo.
 *
 * Es el primer componente real-time del sistema. Combina:
 *   - REST controller (mutaciones autenticadas + snapshot público SSR).
 *   - WebSocket gateway (broadcast a viewers, tick cada 1s).
 *   - Service con el cálculo del cronómetro persistente.
 *
 * El gateway usa Socket.io adapter (configurado por default por
 * @nestjs/platform-socket.io). nginx debe pasar el upgrade WebSocket
 * para que `wss://fixtura.cl/socket.io/` funcione en prod.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Partido,
      Designacion,
      PlanillaTorneo,
      Fecha,
      Torneo,
      IncidenciaPartido,
    ]),
  ],
  controllers: [MatchCenterAdminController, MatchCenterPublicController],
  providers: [MatchCenterService, MatchCenterGateway],
  exports: [MatchCenterService, MatchCenterGateway],
})
export class MatchCenterModule {}
