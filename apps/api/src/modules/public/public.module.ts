import { Module } from '@nestjs/common';

import { TenantsModule } from '../tenants/tenants.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * Módulo público — endpoints sin auth para el portal de hinchas.
 *
 * Todos los endpoints viven bajo /api/v1/public/:ligaSlug/...
 *
 * Por ahora retornan data MOCKEADA en memoria. Cuando agreguemos las
 * tablas de torneos / equipos / partidos (Sprint 2+), reemplazamos los
 * mocks por queries reales.
 */
@Module({
  imports: [TenantsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
