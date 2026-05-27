import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Cancha,
  Cobro,
  Designacion,
  DesignacionRecinto,
  Equipo,
  Fecha,
  IncidenciaPartido,
  JugadorInscrito,
  Partido,
  Personal,
  SancionActiva,
  Serie,
  Sponsor,
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
      Equipo,
      JugadorInscrito,
      Fecha,
      Partido,
      IncidenciaPartido,
      SancionActiva,
      Personal,
      Designacion,
      DesignacionRecinto,
      Sponsor,
      Cancha,
      Cobro,
      Transaccion,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CompetitionModule {}
