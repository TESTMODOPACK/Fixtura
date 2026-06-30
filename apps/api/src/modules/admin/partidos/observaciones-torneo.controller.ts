import { BadRequestException, Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { ROLE, type ObservacionTribunalItem, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ObservacionesPartidoService } from './observaciones-partido.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Informe del partido a nivel torneo — el tribunal lee todas las observaciones
 * de los partidos del torneo (con su contexto) para fundamentar sanciones a
 * equipos. Solo lectura; la carga/borrado vive en /admin/partidos/:id.
 */
@Controller('admin/torneos/:torneoId/observaciones')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.TRIBUNAL_DISCIPLINA,
  ROLE.SUPER_ADMIN,
)
export class ObservacionesTorneoController {
  constructor(private readonly svc: ObservacionesPartidoService) {}

  @Get()
  listar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<ObservacionTribunalItem[]> {
    return this.svc.observacionesDelTorneo(torneoId, ensureTenant(user));
  }
}
