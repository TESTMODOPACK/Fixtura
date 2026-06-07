import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  AusenciaPersonal,
  Cancha,
  CategoriaJugadores,
  Club,
  ClubCategoria,
  Cobro,
  Designacion,
  DesignacionRecinto,
  DiaNoJugable,
  DocumentoTributario,
  Equipo,
  Fecha,
  HorarioTorneo,
  IncidenciaPartido,
  InscripcionTorneo,
  Jugador,
  JugadorInscrito,
  JugadorVetado,
  Partido,
  Personal,
  PlanillaTorneo,
  SancionActiva,
  Serie,
  Sponsor,
  TarifaTorneo,
  Temporada,
  Torneo,
  Transaccion,
} from './entities';

/**
 * Módulo del core deportivo — registra todas las entities competition
 * con TypeOrmModule.forFeature() para que estén disponibles en otros
 * módulos (PublicModule, futuros admin modules).
 *
 * En esta etapa NO expone controllers ni services propios — solo las
 * entities. En Sprint 2B agregamos TorneosService, EquiposService,
 * FixtureService, etc. con sus controllers admin correspondientes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Temporada,
      Torneo,
      Serie,
      CategoriaJugadores,
      Equipo,
      JugadorInscrito,
      Fecha,
      HorarioTorneo,
      Partido,
      IncidenciaPartido,
      SancionActiva,
      Personal,
      AusenciaPersonal,
      Designacion,
      DesignacionRecinto,
      Sponsor,
      Cancha,
      Cobro,
      Transaccion,
      DocumentoTributario,
      DiaNoJugable,
      // Sprint 34A — tarifario configurable por torneo.
      TarifaTorneo,
      // Sprint 26A — modelo nuevo de clubes/inscripciones/vetados.
      Club,
      ClubCategoria,
      Jugador,
      InscripcionTorneo,
      PlanillaTorneo,
      JugadorVetado,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CompetitionModule {}
