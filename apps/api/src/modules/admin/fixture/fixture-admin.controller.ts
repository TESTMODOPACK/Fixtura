import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type FixtureGenerationResult,
  type FixturePrevalidacion,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../../audit';
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
  @Audited({ action: 'fixture.generado', entityType: 'Torneo', entityIdFrom: 'params.torneoId' })
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

  /**
   * Sprint 43 — Pre-validación del fixture. Llamar antes de generar
   * para detectar problemas con horarios/equipos/canchas/feriados sin
   * crear nada. La UI muestra las advertencias en el form.
   *
   * Query params opcionales: fechaInicio, diasEntreFechas (se usan
   * solo para evaluar feriados en el rango estimado).
   */
  @Get('prevalidacion')
  prevalidar(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('diasEntreFechas') diasEntreFechas?: string,
  ): Promise<FixturePrevalidacion> {
    return this.svc.prevalidar(torneoId, ensureTenant(user), {
      fechaInicio,
      diasEntreFechas: diasEntreFechas ? Number(diasEntreFechas) : undefined,
    });
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
  @Audited({ action: 'fecha.suspendida', entityType: 'Fecha', entityIdFrom: 'params.fechaId' })
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
  @Audited({ action: 'fecha.reactivada', entityType: 'Fecha', entityIdFrom: 'params.fechaId' })
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
