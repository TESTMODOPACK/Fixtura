import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { SancionActiva } from '../../competition/entities/sancion-activa.entity';
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
  imports: [TypeOrmModule.forFeature([SancionActiva, IncidenciaPartido, Tenant])],
  controllers: [InformesAdminController],
  providers: [InformesAdminService, InformesPdfService],
  exports: [InformesAdminService],
})
export class InformesModule {}
