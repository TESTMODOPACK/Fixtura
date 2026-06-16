import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
import { InformesAdminController } from './informes-admin.controller';
import { InformesAdminService } from './informes-admin.service';

/**
 * Informes de administración (solo lectura). Fase 1: Disciplina.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SancionActiva, IncidenciaPartido])],
  controllers: [InformesAdminController],
  providers: [InformesAdminService],
  exports: [InformesAdminService],
})
export class InformesModule {}
