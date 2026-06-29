import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type CreateTorneoRequest,
  type TablaPosicionesAdmin,
  type TorneoAdmin,
  type UpdateTorneoRequest,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { CreateTorneoDto, UpdateTorneoDto } from './dto';
import { TorneosAdminService } from './torneos-admin.service';

@Controller('admin/torneos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class TorneosAdminController {
  constructor(private readonly svc: TorneosAdminService) {}

  // Lectura abierta al tribunal (override): las escrituras de abajo heredan
  // el @Roles de la clase (sin TRIBUNAL_DISCIPLINA) y quedan bloqueadas.
  @Get()
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.TRIBUNAL_DISCIPLINA, ROLE.SUPER_ADMIN)
  list(@CurrentUser() user: UserContext): Promise<TorneoAdmin[]> {
    return this.svc.list(ensureTenant(user));
  }

  @Get(':id')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.TRIBUNAL_DISCIPLINA, ROLE.SUPER_ADMIN)
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TorneoAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Get(':id/tabla')
  @Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.TRIBUNAL_DISCIPLINA, ROLE.SUPER_ADMIN)
  getTabla(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TablaPosicionesAdmin> {
    return this.svc.getTabla(id, ensureTenant(user));
  }

  @Post()
  @Audited({ action: 'torneo.creado', entityType: 'Torneo' })
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTorneoDto,
  ): Promise<TorneoAdmin> {
    // Sprint 31 fix — el cast bridge class-validator (defaults opcionales)
    // con Zod (defaults requeridos tras .default()). El service aplica
    // los defaults faltantes (tipoFormato, ruedas, etc.) internamente.
    return this.svc.create(
      ensureTenant(user),
      dto as unknown as CreateTorneoRequest,
    );
  }

  @Patch(':id')
  @Audited({
    action: 'torneo.actualizado',
    entityType: 'Torneo',
    entityIdFrom: 'params.id',
  })
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTorneoDto,
  ): Promise<TorneoAdmin> {
    return this.svc.update(
      id,
      ensureTenant(user),
      dto as unknown as UpdateTorneoRequest,
    );
  }

  /**
   * Recuperación manual: genera los cobros del tarifario para un torneo ya
   * activo (cuando el tarifario se configuró después de iniciarlo).
   * Idempotente.
   */
  @Post(':id/generar-cobros')
  @Audited({
    action: 'torneo.cobros.generados_manual',
    entityType: 'Torneo',
    entityIdFrom: 'params.id',
  })
  generarCobros(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{
    equiposProcesados: number;
    matriculasCreadas: number;
    cuotasCreadas: number;
  }> {
    return this.svc.generarCobros(id, ensureTenant(user));
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({
    action: 'torneo.eliminado',
    entityType: 'Torneo',
    entityIdFrom: 'params.id',
  })
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
