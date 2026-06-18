import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  ROLE,
  type ActaRoster,
  type FixtureAdminFull,
  type IncidenciaAdmin,
  type PartidoAdmin,
  type PartidoDetalle,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import {
  AtribuirIncidenciaDto,
  CerrarActaDto,
  CertificarPresentesDto,
  CreateIncidenciaDto,
  DeclararWalkoverDto,
  ReprogramarPartidoDto,
  SuspenderPartidoDto,
  UpdatePartidoDto,
} from './dto';
import { PartidosAdminService } from './partidos-admin.service';
import { PlantillaPdfService } from './plantilla-pdf.service';

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
  constructor(
    private readonly svc: PartidosAdminService,
    private readonly plantillaPdf: PlantillaPdfService,
  ) {}

  // ── F46.5 — Plantilla física (PDF para imprimir y completar a mano) ──
  @Get(':id/plantilla.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="plantilla-partido.pdf"')
  async descargarPlantillaPdf(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.plantillaPdf.generar(id, ensureTenant(user));
    res.send(buffer);
  }

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

  /** Atribuir/reasignar el jugador de una incidencia (ej. goles del +GOL en vivo). */
  @Patch(':id/incidencias/:incidenciaId/jugador')
  atribuirJugadorIncidencia(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('incidenciaId', new ParseUUIDPipe()) incidenciaId: string,
    @Body() dto: AtribuirIncidenciaDto,
  ): Promise<IncidenciaAdmin> {
    return this.svc.atribuirJugadorIncidencia(
      id,
      incidenciaId,
      ensureTenant(user),
      dto.jugadorInscritoId,
    );
  }

  // ── F46.4 — Roster del acta + certificación de presentes ───────────
  @Get(':id/roster')
  getRoster(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ActaRoster> {
    return this.svc.getRosterActa(id, ensureTenant(user));
  }

  @Post(':id/certificar-presentes')
  @Audited({
    action: 'partido.presentes_certificados',
    entityType: 'Partido',
    entityIdFrom: 'params.id',
  })
  certificarPresentes(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CertificarPresentesDto,
  ): Promise<ActaRoster> {
    return this.svc.certificarPresentes(id, ensureTenant(user), user.userId, {
      jugadorIds: dto.jugadorIds,
    });
  }

  @Post(':id/cerrar-acta')
  @Audited({ action: 'partido.acta_cerrada', entityType: 'Partido', entityIdFrom: 'params.id' })
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
  @Audited({ action: 'partido.acta_reabierta', entityType: 'Partido', entityIdFrom: 'params.id' })
  reabrirActa(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PartidoAdmin> {
    return this.svc.reabrirActa(id, ensureTenant(user));
  }

  // ── Sprint 8: Suspensión / reprogramación / reactivación ───────────
  @Post(':id/suspender')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  @Audited({ action: 'partido.suspendido', entityType: 'Partido', entityIdFrom: 'params.id' })
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

  // ── Sprint 9: Walkover (3-0 automático por inasistencia) ───────────
  @Post(':id/walkover')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
  @Audited({ action: 'partido.walkover_declarado', entityType: 'Partido', entityIdFrom: 'params.id' })
  declararWalkover(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeclararWalkoverDto,
  ): Promise<PartidoAdmin> {
    return this.svc.declararWalkover(id, ensureTenant(user), user.userId, {
      equipoPerdedorId: dto.equipoPerdedorId,
      observaciones: dto.observaciones ?? null,
    });
  }
}
