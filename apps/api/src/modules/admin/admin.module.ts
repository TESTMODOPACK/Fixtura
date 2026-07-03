import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../competition/competition.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { ActasAdminController } from './actas/actas-admin.controller';
import { ActasAdminService } from './actas/actas-admin.service';
import { AnalyticsAdminController } from './analytics/analytics-admin.controller';
import { AnalyticsAdminService } from './analytics/analytics-admin.service';
import { AjustesAdminController } from './ajustes/ajustes-admin.controller';
import { AjustesAdminService } from './ajustes/ajustes-admin.service';
import { CanchasAdminController } from './canchas/canchas-admin.controller';
import { CanchasAdminService } from './canchas/canchas-admin.service';
import { CategoriasAdminController } from './categorias/categorias-admin.controller';
import { CategoriasAdminService } from './categorias/categorias-admin.service';
import { ClubesAdminController } from './clubes/clubes-admin.controller';
import { ClubesAdminService } from './clubes/clubes-admin.service';
import { PlantelImportController } from './clubes/plantel-import.controller';
import { PlantelImportService } from './clubes/plantel-import.service';
import {
  InscripcionesItemController,
  InscripcionesTorneoController,
} from './inscripciones/inscripciones-admin.controller';
import { InscripcionesAdminService } from './inscripciones/inscripciones-admin.service';
import { CobrosAdminController } from './cobros/cobros-admin.controller';
import { CobrosAdminService } from './cobros/cobros-admin.service';
import { DashboardAdminController } from './dashboard/dashboard-admin.controller';
import { DashboardAdminService } from './dashboard/dashboard-admin.service';
import { DesignacionesAdminController } from './designaciones/designaciones-admin.controller';
import { DesignacionesAdminService } from './designaciones/designaciones-admin.service';
import { DesignacionesEmailService } from './designaciones/designaciones-email.service';
import { DesignacionesRespuestaController } from './designaciones/designaciones-respuesta.controller';
import { RecintoAdminService } from './designaciones/recinto-admin.service';
import { DiasNoJugablesController } from './dias-no-jugables/dias-no-jugables.controller';
import { DiasNoJugablesService } from './dias-no-jugables/dias-no-jugables.service';
import { EquiposAdminController, EquiposItemController } from './equipos/equipos-admin.controller';
import { EquiposAdminService } from './equipos/equipos-admin.service';
import { FechasAdminService } from './fixture/fechas-admin.service';
import { HorariosAdminController } from './horarios/horarios-admin.controller';
import { HorariosAdminService } from './horarios/horarios-admin.service';
import {
  FechasAdminController,
  FixtureAdminController,
} from './fixture/fixture-admin.controller';
import { FixtureAdminService } from './fixture/fixture-admin.service';
import { JugadoresAdminController } from './jugadores/jugadores-admin.controller';
import { JugadoresAdminService } from './jugadores/jugadores-admin.service';
import { JugadoresGlobalController } from './jugadores-global/jugadores-global.controller';
import { JugadoresGlobalService } from './jugadores-global/jugadores-global.service';
import { DunningModule } from './dunning/dunning.module';
import { FlyerDelegadosModule } from './flyer-delegados/flyer-delegados.module';
import { InformesModule } from './informes/informes.module';
import { PagosModule } from './pagos/pagos.module';
import { SIIModule } from './sii/sii.module';
import { PagosPersonalController } from './pagos-personal/pagos-personal.controller';
import { PagosPersonalService } from './pagos-personal/pagos-personal.service';
import { PushModule } from './push/push.module';
import { MatchCenterModule } from '../match-center/match-center.module';
import {
  FixtureDetailController,
  PartidosAdminController,
} from './partidos/partidos-admin.controller';
import { PartidosAdminService } from './partidos/partidos-admin.service';
import { PlantillaPdfService } from './partidos/plantilla-pdf.service';
import { ObservacionesPartidoService } from './partidos/observaciones-partido.service';
import { ObservacionesTorneoController } from './partidos/observaciones-torneo.controller';
import {
  PersonalAdminController,
  PersonalPortalController,
  PersonalPublicController,
} from './personal/personal-admin.controller';
import { PersonalAdminService } from './personal/personal-admin.service';
import { PersonalPortalService } from './personal/personal-portal.service';
import { AusenciasAdminService } from './personal/ausencias-admin.service';
import { SponsorsAdminController } from './sponsors/sponsors-admin.controller';
import { SponsorsAdminService } from './sponsors/sponsors-admin.service';
import { CuotasCron } from './tarifas/cuotas.cron';
import { TarifaAplicadorService } from './tarifas/tarifa-aplicador.service';
import { TarifasAdminController } from './tarifas/tarifas-admin.controller';
import { TarifasAdminService } from './tarifas/tarifas-admin.service';
import { TemporadasAdminController } from './temporadas/temporadas-admin.controller';
import { TemporadasAdminService } from './temporadas/temporadas-admin.service';
import { TorneosAdminController } from './torneos/torneos-admin.controller';
import { TorneosAdminService } from './torneos/torneos-admin.service';
import { GruposAdminController } from './torneos/grupos-admin.controller';
import { GruposAdminService } from './torneos/grupos-admin.service';
import { PlayoffsAdminController } from './torneos/playoffs-admin.controller';
import { PlayoffsAdminService } from './torneos/playoffs-admin.service';
import { TribunalAdminController } from './tribunal/tribunal-admin.controller';
import { TribunalAdminService } from './tribunal/tribunal-admin.service';
import { VetadosAdminController } from './vetados/vetados-admin.controller';
import { VetadosAdminService } from './vetados/vetados-admin.service';
import { MagicLink } from '../auth/entities/magic-link.entity';
import { UsersModule } from '../users/users.module';
import {
  DelegadoAdminController,
  DelegadoController,
  DelegadoPublicController,
} from './delegado/delegado.controller';
import { DelegadoInviteService } from './delegado/delegado-invite.service';
import { DelegadoPortalService } from './delegado/delegado-portal.service';
import {
  CarnetVerificacionController,
  JugadorController,
  JugadorCuentaAdminController,
  JugadorPublicController,
} from './jugador-portal/jugador.controller';
import { CarnetService } from './jugador-portal/carnet.service';
import { JugadorInviteService } from './jugador-portal/jugador-invite.service';
import { JugadorPortalService } from './jugador-portal/jugador-portal.service';
import { EncuestaNps } from '../competition/entities/encuesta-nps.entity';
import { Club } from '../competition/entities/club.entity';
import { InscripcionTorneo } from '../competition/entities/inscripcion-torneo.entity';
import { Torneo } from '../competition/entities/torneo.entity';
import { NpsAdminController } from './nps/nps-admin.controller';
import { NpsPublicoController } from './nps/nps-publico.controller';
import { NpsService } from './nps/nps.service';
import { PlantillaEncuesta } from '../competition/entities/plantilla-encuesta.entity';
import { PreguntaEncuesta } from '../competition/entities/pregunta-encuesta.entity';
import { EnvioEncuesta } from '../competition/entities/envio-encuesta.entity';
import { RespuestaEncuesta } from '../competition/entities/respuesta-encuesta.entity';
import { EncuestasAdminController } from './encuestas/encuestas-admin.controller';
import { EncuestasPublicoController } from './encuestas/encuestas-publico.controller';
import { EncuestasService } from './encuestas/encuestas.service';

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
    DunningModule,
    FlyerDelegadosModule,
    InformesModule,
    PushModule,
    MatchCenterModule,
    UsersModule,
    // SII BYO: Ajustes usa OpenFacturaProvider para "Probar conexión".
    SIIModule,
    // Ajustes necesita Tenant + User + UserRole — los registramos
    // localmente (no se duplican: TypeORM resuelve la metadata).
    // F55: MagicLink para el estado de invitación del delegado.
    // M5 etapa 2 (NPS): EncuestaNps + Torneo/InscripcionTorneo para el disparo.
    TypeOrmModule.forFeature([
      Tenant,
      User,
      UserRole,
      MagicLink,
      EncuestaNps,
      InscripcionTorneo,
      Torneo,
      Club,
      PlantillaEncuesta,
      PreguntaEncuesta,
      EnvioEncuesta,
      RespuestaEncuesta,
    ]),
  ],
  controllers: [
    TemporadasAdminController,
    TorneosAdminController,
    GruposAdminController,
    PlayoffsAdminController,
    EquiposAdminController,
    EquiposItemController,
    JugadoresAdminController,
    JugadoresGlobalController,
    FechasAdminController,
    FixtureAdminController,
    FixtureDetailController,
    PartidosAdminController,
    ObservacionesTorneoController,
    TribunalAdminController,
    PersonalAdminController,
    PersonalPublicController,
    PersonalPortalController,
    DesignacionesAdminController,
    DesignacionesRespuestaController,
    ActasAdminController,
    DashboardAdminController,
    AnalyticsAdminController,
    AjustesAdminController,
    SponsorsAdminController,
    TarifasAdminController,
    CanchasAdminController,
    CategoriasAdminController,
    ClubesAdminController,
    PlantelImportController,
    CobrosAdminController,
    DiasNoJugablesController,
    InscripcionesTorneoController,
    InscripcionesItemController,
    VetadosAdminController,
    HorariosAdminController,
    PagosPersonalController,
    DelegadoController,
    DelegadoAdminController,
    DelegadoPublicController,
    JugadorController,
    JugadorCuentaAdminController,
    JugadorPublicController,
    CarnetVerificacionController,
    NpsAdminController,
    NpsPublicoController,
    EncuestasAdminController,
    EncuestasPublicoController,
  ],
  providers: [
    TemporadasAdminService,
    TorneosAdminService,
    GruposAdminService,
    PlayoffsAdminService,
    EquiposAdminService,
    JugadoresAdminService,
    JugadoresGlobalService,
    FechasAdminService,
    FixtureAdminService,
    PartidosAdminService,
    PlantillaPdfService,
    ObservacionesPartidoService,
    TribunalAdminService,
    PersonalAdminService,
    PersonalPortalService,
    AusenciasAdminService,
    DesignacionesAdminService,
    DesignacionesEmailService,
    RecintoAdminService,
    ActasAdminService,
    DashboardAdminService,
    AnalyticsAdminService,
    AjustesAdminService,
    SponsorsAdminService,
    TarifasAdminService,
    // Sprint 34C — aplicador compartido + cron de cuotas recurrentes.
    TarifaAplicadorService,
    CuotasCron,
    CanchasAdminService,
    CategoriasAdminService,
    ClubesAdminService,
    PlantelImportService,
    CobrosAdminService,
    DiasNoJugablesService,
    InscripcionesAdminService,
    VetadosAdminService,
    HorariosAdminService,
    PagosPersonalService,
    DelegadoInviteService,
    DelegadoPortalService,
    JugadorInviteService,
    JugadorPortalService,
    CarnetService,
    NpsService,
    EncuestasService,
  ],
  exports: [DiasNoJugablesService, VetadosAdminService],
})
export class AdminModule {}
