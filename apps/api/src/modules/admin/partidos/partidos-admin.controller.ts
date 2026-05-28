import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type FixtureAdminFull,
  type IncidenciaAdmin,
  type PartidoAdmin,
  type PartidoDetalle,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import {
  CerrarActaDto,
  CreateIncidenciaDto,
  ReprogramarPartidoDto,
  SuspenderPartidoDto,
  UpdatePartidoDto,
} from './dto';
import { PartidosAdminService } from './partidos-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Fixture completo en admin — listado de fechas con sus partidos.
 * Ruta separada porque /admin/torneos/:torneoId/fixture POST genera y
 * DELETE resetea. El GET aquí devuelve el detalle visual.
 */
@Controller('admin/torneos/:torneoId/fixture-detail')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class FixtureDetailController {
  constructor(private readonly svc: PartidosAdminService) {}

  @Get()
  get(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<FixtureAdminFull> {
    return this.svc.getFixtureFull(torneoId, ensureTenant(user));
  }
}

/**
 * Partidos individuales — get, update, acta, incidencias.
 */
@Controller('admin/partidos')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.ARBITRO,
  ROLE.PLANILLERO,
  ROLE.SUPER_ADMIN,
)
export class PartidosAdminController {
  constructor(private readonly svc: PartidosAdminService) {}

  @Get(':id')
  getOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PartidoDetalle> {
    return this.svc.getDetalle(id, ensureTenant(user));
  }

  @Patch(':id')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePartidoDto,
  ): Promise<PartidoAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Post(':id/incidencias')
  addIncidencia(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateIncidenciaDto,
  ): Promise<IncidenciaAdmin> {
    return this.svc.addIncidencia(id, ensureTenant(user), {
      equipoId: dto.equipoId,
      jugadorInscritoId: dto.jugadorInscritoId ?? null,
      tipo: dto.tipo,
      minuto: dto.minuto ?? null,
    });
  }

  @Delete('incidencias/:incidenciaId')
  removeIncidencia(
    @CurrentUser() user: UserContext,
    @Param('incidenciaId', new ParseUUIDPipe()) incidenciaId: string,
  ): Promise<void> {
    return this.svc.removeIncidencia(incidenciaId, ensureTenant(user));
  }

  @Post(':id/cerrar-acta')
  cerrarActa(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CerrarActaDto,
  ): Promise<PartidoAdmin> {
    return this.svc.cerrarActa(id, ensureTenant(user), user.userId, {
      golesLocal: dto.golesLocal,
      golesVisita: dto.golesVisita,
      observaciones: dto.observaciones ?? null,
    });
  }

  @Post(':id/reabrir-acta')
  @Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
  reabrirActa(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PartidoAdmin> {
    return this.svc.reabrirActa(id, ensureTenant(user));
  }

  // ── Sprint 8: Suspensión / reprogramación / reactivación ───────────
  @Post(':id/suspender')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  suspender(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspenderPartidoDto,
  ): Promise<PartidoAdmin> {
    return this.svc.suspenderPartido(id, ensureTenant(user), user.userId, {
      motivo: dto.motivo,
      observaciones: dto.observaciones ?? null,
    });
  }

  @Post(':id/reprogramar')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  reprogramar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReprogramarPartidoDto,
  ): Promise<PartidoAdmin> {
    return this.svc.reprogramarPartido(id, ensureTenant(user), {
      fechaHora: dto.fechaHora,
      canchaId: dto.canchaId ?? null,
      canchaNombre: dto.canchaNombre ?? null,
      mantieneDesignaciones: dto.mantieneDesignaciones,
    });
  }

  @Post(':id/reactivar')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  reactivar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PartidoAdmin> {
    return this.svc.reactivarPartido(id, ensureTenant(user));
  }
}
