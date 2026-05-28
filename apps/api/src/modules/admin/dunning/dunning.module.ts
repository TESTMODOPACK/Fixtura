import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompetitionModule } from '../../competition/competition.module';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { DunningAdminController } from './dunning.controller';
import { DunningCron } from './dunning.cron';
import { DunningService } from './dunning.service';

/**
 * Módulo Dunning (cobranza automática).
 *
 * Provee DunningService al cron diario y al controller admin. Necesita
 * acceso a la entity Tenant para resolver nombres en los emails.
 *
 * EmailService es global (RlsModule también) — no hay que importarlos.
 */
@Module({
  imports: [CompetitionModule, TypeOrmModule.forFeature([Tenant])],
  controllers: [DunningAdminController],
  providers: [DunningService, DunningCron],
  exports: [DunningService],
})
export class DunningModule {}
