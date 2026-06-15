import { Controller, Get, NotFoundException, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type {
  EnVivoPublico,
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
 * El tenant se identifica por el header `Host` (multi-tenant por dominio).
 * El torneo se identifica por `?torneo=<slug>` (opcional). Si no se pasa,
 * el backend devuelve el torneo más activo/reciente (compat).
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
  async resumen(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<ResumenLiga> {
    const slug = await this.resolveSlug(req);
    return this.svc.getResumen(slug, torneo || undefined);
  }

  /**
   * Sprint 36A — Hub publico: lista de torneos ACTIVO + CERRADO.
   */
  @Get('torneos')
  async torneos(@Req() req: Request): Promise<TorneoListaPublico[]> {
    const slug = await this.resolveSlug(req);
    return this.svc.getTorneos(slug);
  }

  /** Partidos EN VIVO de la liga (pestaña "En vivo" del portal). */
  @Get('en-vivo')
  async enVivo(@Req() req: Request): Promise<EnVivoPublico> {
    const slug = await this.resolveSlug(req);
    return this.svc.getEnVivo(slug);
  }

  @Get('tabla')
  async tabla(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<TablaPosiciones> {
    const slug = await this.resolveSlug(req);
    return this.svc.getTabla(slug, torneo || undefined);
  }

  @Get('fixture')
  async fixture(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<FixturePublico> {
    const slug = await this.resolveSlug(req);
    return this.svc.getFixture(slug, torneo || undefined);
  }

  @Get('goleadores')
  async goleadores(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'GOLEADORES', torneo || undefined);
  }

  @Get('asistencias')
  async asistencias(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'ASISTENCIAS', torneo || undefined);
  }

  @Get('mvp')
  async mvp(
    @Req() req: Request,
    @Query('torneo') torneo?: string,
  ): Promise<Ranking> {
    const slug = await this.resolveSlug(req);
    return this.svc.getRanking(slug, 'MVP', torneo || undefined);
  }

  @Get('sponsors')
  async sponsors(
    @Req() req: Request,
    @Query('posicion') posicion?: string,
  ): Promise<SponsorPublico[]> {
    const slug = await this.resolveSlug(req);
    return this.svc.getSponsors(slug, posicion);
  }
}
