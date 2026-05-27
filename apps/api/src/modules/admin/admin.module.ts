import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../competition/competition.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { ActasAdminController } from './actas/actas-admin.controller';
import { ActasAdminService } from './actas/actas-admin.service';
import { AjustesAdminController } from './ajustes/ajustes-admin.controller';
import { AjustesAdminService } from './ajustes/ajustes-admin.service';
import { CanchasAdminController } from './canchas/canchas-admin.controller';
import { CanchasAdminService } from './canchas/canchas-admin.service';
import { CobrosAdminController } from './cobros/cobros-admin.controller';
import { CobrosAdminService } from './cobros/cobros-admin.service';
import { DashboardAdminController } from './dashboard/dashboard-admin.controller';
import { DashboardAdminService } from './dashboard/dashboard-admin.service';
import { DesignacionesAdminController } from './designaciones/designaciones-admin.controller';
import { DesignacionesAdminService } from './designaciones/designaciones-admin.service';
import { DesignacionesEmailService } from './designaciones/designaciones-email.service';
import { DesignacionesRespuestaController } from './designaciones/designaciones-respuesta.controller';
import { RecintoAdminService } from './designaciones/recinto-admin.service';
import { EquiposAdminController } from './equipos/equipos-admin.controller';
import { EquiposAdminService } from './equipos/equipos-admin.service';
import { FixtureAdminController } from './fixture/fixture-admin.controller';
import { FixtureAdminService } from './fixture/fixture-admin.service';
import { JugadoresAdminController } from './jugadores/jugadores-admin.controller';
import { JugadoresAdminService } from './jugadores/jugadores-admin.service';
import { JugadoresGlobalController } from './jugadores-global/jugadores-global.controller';
import { JugadoresGlobalService } from './jugadores-global/jugadores-global.service';
import { PagosModule } from './pagos/pagos.module';
import {
  FixtureDetailController,
  PartidosAdminController,
} from './partidos/partidos-admin.controller';
import { PartidosAdminService } from './partidos/partidos-admin.service';
import { PersonalAdminController } from './personal/personal-admin.controller';
import { PersonalAdminService } from './personal/personal-admin.service';
import { SponsorsAdminController } from './sponsors/sponsors-admin.controller';
import { SponsorsAdminService } from './sponsors/sponsors-admin.service';
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
  imports: [
    CompetitionModule,
    PagosModule,
    // Ajustes necesita Tenant + User + UserRole — los registramos
    // localmente (no se duplican: TypeORM resuelve la metadata).
    TypeOrmModule.forFeature([Tenant, User, UserRole]),
  ],
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
    DesignacionesRespuestaController,
    ActasAdminController,
    DashboardAdminController,
    AjustesAdminController,
    SponsorsAdminController,
    CanchasAdminController,
    CobrosAdminController,
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
    DesignacionesEmailService,
    RecintoAdminService,
    ActasAdminService,
    DashboardAdminService,
    AjustesAdminService,
    SponsorsAdminService,
    CanchasAdminService,
    CobrosAdminService,
  ],
})
export class AdminModule {}
