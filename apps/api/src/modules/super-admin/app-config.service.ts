import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from './entities/app-config.entity';

/**
 * Sprint 37 — Service genérico de configuración de plataforma.
 *
 * Keys conocidas:
 *   - `default_tenant_id` — UUID del tenant que se muestra cuando el
 *     hostname del request no matchea ningún `custom_domain`.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    @InjectRepository(AppConfig)
    private readonly repo: Repository<AppConfig>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string, updatedBy?: string, descripcion?: string): Promise<void> {
    await this.repo.upsert(
      {
        key,
        value,
        updatedBy: updatedBy ?? null,
        descripcion: descripcion ?? null,
      },
      ['key'],
    );
    this.logger.log(`app_config[${key}] actualizado`);
  }

  /** Borra una entrada (vuelve al comportamiento default sin override). */
  async delete(key: string): Promise<void> {
    await this.repo.delete({ key });
    this.logger.log(`app_config[${key}] borrado`);
  }

  // ─── Helpers tipados para keys conocidas ────────────────────────────

  async getDefaultTenantId(): Promise<string | null> {
    return this.get('default_tenant_id');
  }

  async setDefaultTenantId(tenantId: string | null, updatedBy?: string): Promise<void> {
    if (tenantId === null) {
      await this.delete('default_tenant_id');
      return;
    }
    await this.set(
      'default_tenant_id',
      tenantId,
      updatedBy,
      'Tenant que se muestra cuando el hostname no matchea ningun custom_domain',
    );
  }

  /**
   * Devuelve el registro completo (con metadata de auditoría) para mostrar
   * en el mantenedor del super admin.
   */
  async getRecord(key: string): Promise<AppConfig | null> {
    return this.repo.findOne({ where: { key } });
  }
}
