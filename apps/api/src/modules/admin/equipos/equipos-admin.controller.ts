import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type EquipoAdmin,
  type SuspenderEquipoResult,
  type UserContext,
  type ValidarPlantelResult,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateEquipoDto, SuspenderEquipoDto } from './dto';
import { EquiposAdminService } from './equipos-admin.service';

@Controller('admin/torneos/:torneoId/equipos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class EquiposAdminController {
  constructor(private readonly svc: EquiposAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<EquipoAdmin[]> {
    return this.svc.listByTorneo(torneoId, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: CreateEquipoDto,
  ): Promise<EquipoAdmin> {
    return this.svc.create(torneoId, ensureTenant(user), dto);
  }
}

// Endpoints sobre un equipo concreto (sin torneo en el path). El equipoId
// es unique global (RLS lo restringe por tenant). Lo separamos del
// controller anterior para no anidar :torneoId/:equipoId — el equipo ya
// sabe a qué torneo pertenece.
@Controller('admin/equipos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class EquiposItemController {
  constructor(private readonly svc: EquiposAdminService) {}

  @Get(':id/validar-plantel')
  validarPlantel(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ValidarPlantelResult> {
    return this.svc.validarPlantel(id, ensureTenant(user));
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({ action: 'equipo.eliminado', entityType: 'Equipo', entityIdFrom: 'params.id' })
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.delete(id, ensureTenant(user));
  }

  /**
   * Sprint 44 — Suspender un equipo del torneo (conducta antideportiva,
   * deuda económica, otros). Dispara walkover 3-0 automático en partidos
   * PROGRAMADO/EN_CURSO. Devuelve resumen de cuántos partidos pasaron a
   * walkover vs cuántos quedaron cancelados (rival también suspendido).
   */
  @Post(':id/suspender')
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'equipo.suspendido', entityType: 'Equipo', entityIdFrom: 'params.id' })
  suspender(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspenderEquipoDto,
  ): Promise<SuspenderEquipoResult> {
    return this.svc.suspender(id, ensureTenant(user), user.userId, {
      motivo: dto.motivo,
      observaciones: dto.observaciones ?? null,
      aplicarMultaWalkover: dto.aplicarMultaWalkover === true,
    });
  }

  /**
   * Sprint 44 — Reactivar un equipo suspendido. Vuelve a INSCRITO. Los
   * walkovers ya disparados se mantienen como historia (no se revierten
   * automáticamente — si necesitas corregir partidos puntuales, hazlo
   * desde el fixture).
   */
  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  @Audited({ action: 'equipo.reactivado', entityType: 'Equipo', entityIdFrom: 'params.id' })
  reactivar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EquipoAdmin> {
    return this.svc.reactivar(id, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
