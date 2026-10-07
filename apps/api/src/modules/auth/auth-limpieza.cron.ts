import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { TenantCronRunner } from '../../common/rls/tenant-cron-runner';

/**
 * T23 — purga nocturna de credenciales muertas. Va en cron (no en
 * cleanup-orphans, que por regla no borra datos):
 *
 *   - refresh_tokens expirados o revocados hace > RETENCION_DIAS. Se
 *     conservan ese tiempo a propósito: la detección de reuso necesita
 *     VER la fila revocada para reconocer el replay de un token robado.
 *   - magic_links vencidos hace > RETENCION_DIAS (usados o no).
 */
@Injectable()
export class AuthLimpiezaCron {
  private readonly log = new Logger(AuthLimpiezaCron.name);

  private static readonly RETENCION_DIAS = 30;

  constructor(
    private readonly runner: TenantCronRunner,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // 04:30 — fuera del horario de partidos y de los crons de facturación.
  @Cron('0 30 4 * * *')
  async purgar(): Promise<void> {
    await this.runner.runAsSystem('auth-purga', async () => {
      const dias = AuthLimpiezaCron.RETENCION_DIAS;

      const refresh = await this.ds
        .createQueryBuilder()
        .delete()
        .from('refresh_tokens')
        .where('expires_at < NOW() - make_interval(days => :dias)', { dias })
        .orWhere('revoked_at < NOW() - make_interval(days => :dias)', { dias })
        .execute();

      const links = await this.ds
        .createQueryBuilder()
        .delete()
        .from('magic_links')
        .where('expires_at < NOW() - make_interval(days => :dias)', { dias })
        .execute();

      const borrados = (refresh.affected ?? 0) + (links.affected ?? 0);
      if (borrados > 0) {
        this.log.log(
          `[auth-purga] refresh_tokens=${refresh.affected ?? 0}, magic_links=${links.affected ?? 0} eliminados (retención ${dias} días).`,
        );
      }
    });
  }
}
