import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

/**
 * Sprint 37 — Módulo de configuración de plataforma (key/value).
 *
 * Separado del SuperAdminModule porque otros módulos (TenantsModule) lo
 * necesitan para resolver el tenant por defecto y eso causaría
 * dependencia circular si vivía en super-admin.module.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppConfig])],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
