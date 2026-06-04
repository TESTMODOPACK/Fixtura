import { Controller, Get, NotFoundException, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type {
  FixturePublico,
  Ranking,
  ResumenLiga,
  SponsorPublico,
  TablaPosiciones,
  TorneoListaPublico,
} from '@fixtura/types';

import { Public } from '../../common/decorators/public.decorator';
import { TenantsService } from '../tenants/tenants.service';
import { PublicService } from './public.service';

/**
 * Endpoints públicos del portal de una liga.
 *
 * El tenant se identifica por el header `Host` (multi-tenant por dominio):
 *   - liganunoa.cl       → tenant cuyo custom_domain = 'liganunoa.cl'
 *   - en dev sin dominio → fallback al tenant DEV_DEFAULT_TENANT_SLUG
 *
 * El slug ya NO aparece en la URL — el routing puro mira el host.
 */
@Controller('public')
@Public()
export class PublicController {
  constructor(
    private readonly svc: PublicService,
    private readonly tenants: TenantsService,
  ) {}

  private async resolveSlug(req: Request): Promise<string> {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? '';
    const tenant = await this.tenants.findByHost(host);
    if (!tenant) {
      throw new NotFoundException(`No hay liga asociada al dominio "${host}"`);
    }
    return tenant.slug;
  }

  @Get()
  async resumen(@Req() req: Request): Promise<ResumenLiga> {
    const slug = await this.resolveSlug(req);
    return this.svc.getResumen(slug);
  }

  /**
   * Sprint 36A — Lista de todos los torneos publicos de la liga
   * (ACTIVO + CERRADO, los DRAFT se omiten). El portal lo usa para el
   * hub principal donde el hincha elige torneo.
   */
  @Get('torneos')
  async torneos(@Req() req: Request): Promise<TorneoListaPublico[]> {
    const slug = await this.resolveSlug(req);
    return this.svc.getTorneos(slug);
  }

  @Get('tabla')
  async tabla(@Req() req: Request): Promise<TablaPosiciones> {
    const slug = await this.resolveSlug(req);
    return this.svc.getTabla(slug);
  }

  @Get('fixture')
  async fixture(@Req() req: Request): Promise<FixturePublico> {
    const slug = await this.resolveSlug(req);
    return this.svc.getFixture(slug);
  }

  @Get('goleadores')
  async goleadores(@Req() req: Request): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'GOLEADORES');
  }

  @Get('asistencias')
  async asistencias(@Req() req: Request): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'ASISTENCIAS');
  }

  @Get('mvp')
  async mvp(@Req() req: Request): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'MVP');
  }

  /**
   * Lista de sponsors activos y vigentes del tenant, ordenados por
   * prioridad. Opcionalmente filtrá por posición.
   */
  @Get('sponsors')
  async sponsors(
    @Req() req: Request,
    @Query('posicion') posicion?: string,
  ): Promise<SponsorPublico[]> {
    const slug = await this.resolveSlug(req);
    return this.svc.getSponsors(slug, posicion);
  }
}
