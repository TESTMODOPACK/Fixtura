import { Controller, Get, Param } from '@nestjs/common';

import type { FixturePublico, Ranking, ResumenLiga, TablaPosiciones } from '@fixtura/types';

import { Public } from '../../common/decorators/public.decorator';
import { PublicService } from './public.service';

@Controller('public/:ligaSlug')
@Public()
export class PublicController {
  constructor(private readonly svc: PublicService) {}

  @Get()
  resumen(@Param('ligaSlug') slug: string): Promise<ResumenLiga> {
    return this.svc.getResumen(slug);
  }

  @Get('tabla')
  tabla(@Param('ligaSlug') slug: string): Promise<TablaPosiciones> {
    return this.svc.getTabla(slug);
  }

  @Get('fixture')
  fixture(@Param('ligaSlug') slug: string): Promise<FixturePublico> {
    return this.svc.getFixture(slug);
  }

  @Get('goleadores')
  goleadores(@Param('ligaSlug') slug: string): Promise<Ranking> {
    return this.svc.getRanking(slug, 'GOLEADORES');
  }

  @Get('asistencias')
  asistencias(@Param('ligaSlug') slug: string): Promise<Ranking> {
    return this.svc.getRanking(slug, 'ASISTENCIAS');
  }

  @Get('mvp')
  mvp(@Param('ligaSlug') slug: string): Promise<Ranking> {
    return this.svc.getRanking(slug, 'MVP');
  }
}
