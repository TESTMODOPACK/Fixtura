import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cobro } from '../../competition/entities/cobro.entity';
import { Designacion } from '../../competition/entities/designacion.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { InformesAdminController } from './informes-admin.controller';
import { InformesAdminService } from './informes-admin.service';
import { InformesPdfService } from './informes-pdf.service';

/**
 * Informes de administración (solo lectura). Fase 1: Disciplina.
 * Exporta InformesAdminService para que el portal del delegado lo reuse
 * acotado a su club.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SancionActiva,
      IncidenciaPartido,
      Tenant,
      Cobro,
      Torneo,
      InscripcionTorneo,
      Partido,
      Designacion,
    ]),
  ],
  controllers: [InformesAdminController],
  providers: [InformesAdminService, InformesPdfService],
  exports: [InformesAdminService],
})
export class InformesModule {}
