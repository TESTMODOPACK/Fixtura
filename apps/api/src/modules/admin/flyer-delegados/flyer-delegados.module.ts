import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Club } from '../../competition/entities/club.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { InscripcionTorneo } from '../../competition/entities/inscripcion-torneo.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { UserRole } from '../../users/entities/user-role.entity';
import { FlyerDelegadosController } from './flyer-delegados.controller';
import { FlyerDelegadosCron } from './flyer-delegados.cron';
import { FlyerDelegadosService } from './flyer-delegados.service';
import { FlyerPdfService } from './flyer-pdf.service';

/**
 * FLY — Flyer semanal a delegados. EmailService y TenantCronRunner son
 * globales (no se importan). Los repos se registran acá con forFeature.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Torneo,
      InscripcionTorneo,
      Fecha,
      Partido,
      Club,
      Tenant,
      UserRole,
    ]),
  ],
  controllers: [FlyerDelegadosController],
  providers: [FlyerPdfService, FlyerDelegadosService, FlyerDelegadosCron],
})
export class FlyerDelegadosModule {}
