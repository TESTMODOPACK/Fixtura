import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { ROLE, type FixtureGenerationResult, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SuspenderFechaDto } from '../partidos/dto';
import { GenerarFixtureDto } from './dto';
import { FechasAdminService } from './fechas-admin.service';
import { FixtureAdminService } from './fixture-admin.service';

@Controller('admin/torneos/:torneoId/fixture')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class FixtureAdminController {
  constructor(private readonly svc: FixtureAdminService) {}

  @Post('generar')
  generar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: GenerarFixtureDto,
  ): Promise<FixtureGenerationResult> {
    return this.svc.generar(torneoId, ensureTenant(user), {
      fechaInicio: dto.fechaInicio,
      diasEntreFechas: dto.diasEntreFechas ?? 7,
      horariosPorFecha: dto.horariosPorFecha ?? ['10:00', '12:00', '14:00', '16:00'],
      canchas: dto.canchas ?? ['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4'],
    });
  }

  @Delete()
  reset(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<{ deleted: number }> {
    return this.svc.reset(torneoId, ensureTenant(user));
  }
}

/**
 * Sprint 8 — Suspensión / reactivación de FECHAS completas.
 */
@Controller('admin/fechas')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class FechasAdminController {
  constructor(private readonly svc: FechasAdminService) {}

  @Post(':fechaId/suspender')
  suspender(
    @CurrentUser() user: UserContext,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
    @Body() dto: SuspenderFechaDto,
  ): Promise<{ fechasAfectadas: number; nuevaFechaBisId: string | null }> {
    return this.svc
      .suspenderFecha(fechaId, ensureTenant(user), user.userId, {
        motivo: dto.motivo,
        observaciones: dto.observaciones ?? null,
        estrategia: dto.estrategia,
        diasCorrimiento: dto.diasCorrimiento,
        fechaDestinoId: dto.fechaDestinoId,
        fechaInicioReprogramada: dto.fechaInicioReprogramada,
      })
      .then((r) => ({
        fechasAfectadas: r.fechasAfectadas,
        nuevaFechaBisId: r.nuevaFechaBisId,
      }));
  }

  @Post(':fechaId/reactivar')
  async reactivar(
    @CurrentUser() user: UserContext,
    @Param('fechaId', new ParseUUIDPipe()) fechaId: string,
  ): Promise<{ ok: boolean }> {
    await this.svc.reactivarFecha(fechaId, ensureTenant(user));
    return { ok: true };
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
