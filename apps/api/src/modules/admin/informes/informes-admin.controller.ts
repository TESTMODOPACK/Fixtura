import {
  BadRequestException,
  Controller,
  Get,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type EnRiesgoAmarilla,
  type ExpulsadoFecha,
  type SancionVigente,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { InformesAdminService } from './informes-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Informes de administración (solo lectura). Fase 1: Disciplina.
 */
@Controller('admin/informes')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.TRIBUNAL_DISCIPLINA,
  ROLE.LIGA_CONTADOR,
  ROLE.SUPER_ADMIN,
)
export class InformesAdminController {
  constructor(private readonly svc: InformesAdminService) {}

  /** Expulsados (rojas / dobles amarillas) de un torneo, opcional por fecha. */
  @Get('disciplina/expulsados')
  expulsados(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero') fechaNumero?: string,
  ): Promise<ExpulsadoFecha[]> {
    const fn = fechaNumero ? Number.parseInt(fechaNumero, 10) : undefined;
    return this.svc.expulsados(
      ensureTenant(user),
      torneoId,
      Number.isFinite(fn) ? fn : undefined,
    );
  }

  /** Sancionados vigentes (o todos) con fechas cumplidas/pendientes + multa. */
  @Get('disciplina/sancionados')
  sancionados(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
    @Query('clubId') clubId?: string,
    @Query('incluirCumplidas') incluirCumplidas?: string,
  ): Promise<SancionVigente[]> {
    return this.svc.sancionadosVigentes(
      ensureTenant(user),
      torneoId || undefined,
      clubId || undefined,
      incluirCumplidas === 'true',
    );
  }

  /** Jugadores a una amarilla de la suspensión por acumulación. */
  @Get('disciplina/en-riesgo')
  enRiesgo(
    @CurrentUser() user: UserContext,
    @Query('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<EnRiesgoAmarilla[]> {
    return this.svc.enRiesgo(ensureTenant(user), torneoId);
  }
}
