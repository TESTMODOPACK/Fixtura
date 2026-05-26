import { Module } from '@nestjs/common';

import { CompetitionModule } from '../competition/competition.module';
import { ActasAdminController } from './actas/actas-admin.controller';
import { ActasAdminService } from './actas/actas-admin.service';
import { DesignacionesAdminController } from './designaciones/designaciones-admin.controller';
import { DesignacionesAdminService } from './designaciones/designaciones-admin.service';
import { EquiposAdminController } from './equipos/equipos-admin.controller';
import { EquiposAdminService } from './equipos/equipos-admin.service';
import { FixtureAdminController } from './fixture/fixture-admin.controller';
import { FixtureAdminService } from './fixture/fixture-admin.service';
import { JugadoresAdminController } from './jugadores/jugadores-admin.controller';
import { JugadoresAdminService } from './jugadores/jugadores-admin.service';
import { JugadoresGlobalController } from './jugadores-global/jugadores-global.controller';
import { JugadoresGlobalService } from './jugadores-global/jugadores-global.service';
import {
  FixtureDetailController,
  PartidosAdminController,
} from './partidos/partidos-admin.controller';
import { PartidosAdminService } from './partidos/partidos-admin.service';
import { PersonalAdminController } from './personal/personal-admin.controller';
import { PersonalAdminService } from './personal/personal-admin.service';
import { TemporadasAdminController } from './temporadas/temporadas-admin.controller';
import { TemporadasAdminService } from './temporadas/temporadas-admin.service';
import { TorneosAdminController } from './torneos/torneos-admin.controller';
import { TorneosAdminService } from './torneos/torneos-admin.service';
import { TribunalAdminController } from './tribunal/tribunal-admin.controller';
import { TribunalAdminService } from './tribunal/tribunal-admin.service';

/**
 * Módulo admin — endpoints autenticados bajo /api/v1/admin/*.
 *
 * Cada sub-area (temporadas, torneos, equipos, jugadores, fixture) tiene
 * service + controller. Los controllers chequean roles con @Roles
 * (LIGA_ADMIN o LIGA_COORDINADOR según el caso). El TenantContextInterceptor
 * ya setea el tenant del JWT, así que las queries quedan automáticamente
 * filtradas por RLS.
 */
@Module({
  imports: [CompetitionModule],
  controllers: [
    TemporadasAdminController,
    TorneosAdminController,
    EquiposAdminController,
    JugadoresAdminController,
    JugadoresGlobalController,
    FixtureAdminController,
    FixtureDetailController,
    PartidosAdminController,
    TribunalAdminController,
    PersonalAdminController,
    DesignacionesAdminController,
    ActasAdminController,
  ],
  providers: [
    TemporadasAdminService,
    TorneosAdminService,
    EquiposAdminService,
    JugadoresAdminService,
    JugadoresGlobalService,
    FixtureAdminService,
    PartidosAdminService,
    TribunalAdminService,
    PersonalAdminService,
    DesignacionesAdminService,
    ActasAdminService,
  ],
})
export class AdminModule {}
