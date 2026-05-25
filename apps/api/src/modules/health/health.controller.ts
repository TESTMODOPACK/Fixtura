import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Liveness check — no toca DB, no pesa event loop.
   * Para `docker healthcheck`. Si responde, el proceso está vivo.
   */
  @Get()
  root(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness check — valida DB. Para load balancer / readiness gate.
   */
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', db: 'down' });
    }
  }

  /**
   * Versión deployada. GIT_SHA viene del build de Docker. Útil para
   * verificar qué commit corre en cada ambiente.
   */
  @Get('version')
  version(): { gitSha: string; nodeEnv: string } {
    return {
      gitSha: process.env.GIT_SHA ?? 'unknown',
      nodeEnv: process.env.NODE_ENV ?? 'development',
    };
  }
}
