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
  type AutoAsignarResult,
  type DesignacionAdmin,
  type DesignacionesPorFecha,
  type DesignacionRecinto as DesignacionRecintoDto,
  type EstadoDesignacion,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DesignacionesAdminService } from './designaciones-admin.service';
import {
  AsignarDesignacionDto,
  AsignarRecintoDto,
  AutoAsignarDto,
  UpdateDesignacionEstadoDto,
} from './dto';
import { RecintoAdminService } from './recinto-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class DesignacionesAdminController {
  constructor(
    private readonly svc: DesignacionesAdminService,
    private readonly recintoSvc: RecintoAdminService,
  ) {}

  /** Vista por fecha — usada en /admin/torneos/[id]/designaciones */
  @Get('torneos/:torneoId/fechas/:fechaId/designaciones')
  listPorFecha(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
  ): Promise<DesignacionesPorFecha> {
    return this.svc.listPorFecha(torneoId, fechaId, ensureTenant(user));
  }

  /** Vista por partido individual — usada en detalle del acta */
  @Get('partidos/:partidoId/designaciones')
  listPorPartido(
    @CurrentUser() user: UserContext,
    @Param('partidoId', new ParseUUIDPipe()) partidoId: string,
  ): Promise<DesignacionAdmin[]> {
    return this.svc.listPorPartido(partidoId, ensureTenant(user));
  }

  @Post('designaciones')
  asignar(
    @CurrentUser() user: UserContext,
    @Body() dto: AsignarDesignacionDto,
  ): Promise<DesignacionAdmin> {
    return this.svc.asignar(ensureTenant(user), dto);
  }

  @Patch('designaciones/:id/estado')
  updateEstado(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDesignacionEstadoDto,
  ): Promise<DesignacionAdmin> {
    return this.svc.updateEstado(id, ensureTenant(user), dto);
  }

  @Delete('designaciones/:id')
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }

  /**
   * Asigna automáticamente personal a los partidos de una fecha.
   * Por default cubre solo ARBITRO_PRINCIPAL y no sobreescribe.
   */
  @Post('torneos/:torneoId/fechas/:fechaId/designaciones/auto')
  autoAsignar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
    @Body() dto: AutoAsignarDto,
  ): Promise<AutoAsignarResult> {
    return this.svc.autoAsignar(torneoId, fechaId, ensureTenant(user), dto);
  }

  // ─── Designaciones de RECINTO (paramédicos / otros por jornada) ───

  @Get('torneos/:torneoId/fechas/:fechaId/recinto')
  listRecintoPorFecha(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
  ): Promise<DesignacionRecintoDto[]> {
    return this.recintoSvc.listPorFecha(torneoId, fechaId, ensureTenant(user));
  }

  @Post('designaciones-recinto')
  asignarRecinto(
    @CurrentUser() user: UserContext,
    @Body() dto: AsignarRecintoDto,
  ): Promise<DesignacionRecintoDto> {
    return this.recintoSvc.asignar(ensureTenant(user), dto);
  }

  @Patch('designaciones-recinto/:id/estado')
  updateEstadoRecinto(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDesignacionEstadoDto,
  ): Promise<DesignacionRecintoDto> {
    return this.recintoSvc.updateEstado(
      id,
      ensureTenant(user),
      dto.estado as EstadoDesignacion,
    );
  }

  @Delete('designaciones-recinto/:id')
  removeRecinto(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.recintoSvc.remove(id, ensureTenant(user));
  }
}
