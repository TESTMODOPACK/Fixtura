import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type CreateInscripcionTorneoRequest,
  type InscripcionTorneo,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { AddJugadorPlanillaDto, CreateInscripcionDto } from './dto';
import { InscripcionesAdminService } from './inscripciones-admin.service';

/**
 * Endpoints de inscripción de clubes a torneos + planilla del torneo.
 *
 * Rutas:
 *   GET    /admin/torneos/:torneoId/inscripciones
 *   POST   /admin/torneos/:torneoId/inscripciones
 *   DELETE /admin/inscripciones/:id
 *   GET    /admin/inscripciones/:id/planilla
 *   POST   /admin/inscripciones/:id/planilla
 *   DELETE /admin/inscripciones/:id/planilla/:jugadorId
 */
@Controller('admin/torneos/:torneoId/inscripciones')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class InscripcionesTorneoController {
  constructor(private readonly svc: InscripcionesAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<InscripcionTorneo[]> {
    return this.svc.listByTorneo(torneoId, ensureTenant(user));
  }

  @Post()
  @Audited({
    action: 'torneo.inscripcion.creada',
    entityType: 'InscripcionTorneo',
    entityIdFrom: 'params.torneoId',
  })
  inscribir(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: CreateInscripcionDto,
  ): Promise<InscripcionTorneo> {
    return this.svc.inscribir(
      torneoId,
      ensureTenant(user),
      dto as unknown as CreateInscripcionTorneoRequest,
    );
  }

  /**
   * Re-sincroniza los planteles del torneo desde los clubes. Útil cuando
   * se cargaron jugadores al club DESPUÉS de inscribirlo (la planilla del
   * torneo y el equipo sombra quedaron en 0). Idempotente.
   */
  @Post('resync-planteles')
  @Audited({
    action: 'torneo.planteles.resincronizados',
    entityType: 'Torneo',
    entityIdFrom: 'params.torneoId',
  })
  resyncPlanteles(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<{ inscripcionesProcesadas: number; jugadoresSincronizados: number }> {
    return this.svc.resyncPlantelesTorneo(torneoId, ensureTenant(user));
  }
}

@Controller('admin/inscripciones')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class InscripcionesItemController {
  constructor(private readonly svc: InscripcionesAdminService) {}

  @Delete(':id')
  @HttpCode(204)
  @Audited({
    action: 'torneo.inscripcion.eliminada',
    entityType: 'InscripcionTorneo',
    entityIdFrom: 'params.id',
  })
  desinscribir(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.desinscribir(id, ensureTenant(user));
  }

  @Get(':id/planilla')
  planilla(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.listPlanilla(id, ensureTenant(user));
  }

  @Post(':id/planilla')
  @HttpCode(204)
  @Audited({
    action: 'torneo.planilla.jugador.agregado',
    entityType: 'PlanillaTorneo',
    entityIdFrom: 'params.id',
  })
  async addJugador(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddJugadorPlanillaDto,
  ): Promise<void> {
    await this.svc.addJugadorPlanilla(id, ensureTenant(user), dto.jugadorId);
  }

  @Delete(':id/planilla/:jugadorId')
  @HttpCode(204)
  @Audited({
    action: 'torneo.planilla.jugador.eliminado',
    entityType: 'PlanillaTorneo',
    entityIdFrom: 'params.id',
  })
  removeJugador(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('jugadorId', new ParseUUIDPipe()) jugadorId: string,
  ): Promise<void> {
    return this.svc.removeJugadorPlanilla(id, ensureTenant(user), jugadorId);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
