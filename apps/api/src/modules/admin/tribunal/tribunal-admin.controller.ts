import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { ROLE, type SancionAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateSancionTribunalDto } from './dto';
import { TribunalAdminService } from './tribunal-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/torneos/:torneoId/sanciones')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.TRIBUNAL_DISCIPLINA,
  ROLE.SUPER_ADMIN,
)
export class TribunalAdminController {
  constructor(private readonly svc: TribunalAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
  ): Promise<SancionAdmin[]> {
    return this.svc.list(torneoId, ensureTenant(user));
  }

  /**
   * Listado de IDs de jugadores con sanción activa para una fecha.
   * Sirve al frontend para mostrar warning visual al cargar
   * incidencias en un partido de esa fecha.
   */
  @Get('bloqueados')
  bloqueados(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Query('fechaNumero', new ParseIntPipe()) fechaNumero: number,
  ): Promise<Array<{ jugadorInscritoId: string; rut: string | null; motivo: string }>> {
    return this.svc.jugadoresBloqueadosEnFecha(torneoId, ensureTenant(user), fechaNumero);
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) torneoId: string,
    @Body() dto: CreateSancionTribunalDto,
  ): Promise<SancionAdmin> {
    return this.svc.create(torneoId, ensureTenant(user), dto);
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: UserContext,
    @Param('torneoId', new ParseUUIDPipe()) _torneoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.revoke(id, ensureTenant(user));
  }
}
