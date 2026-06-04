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
  Query,
} from '@nestjs/common';

import {
  CambiarEstadoCanchaSchema,
  ROLE,
  type CambiarEstadoCanchaRequest,
  type CanchaAdmin,
  type OcupacionCancha,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CanchasAdminService } from './canchas-admin.service';
import { CreateCanchaDto, UpdateCanchaDto } from './dto';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/canchas')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class CanchasAdminController {
  constructor(private readonly svc: CanchasAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('activas') soloActivas?: string,
  ): Promise<CanchaAdmin[]> {
    return this.svc.list(ensureTenant(user), soloActivas === 'true');
  }

  // OJO: este endpoint debe ir ANTES de `@Get(':id')` para que NestJS no
  // intente parsear "ocupacion" como un UUID.
  @Get('ocupacion')
  ocupacion(
    @CurrentUser() user: UserContext,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ): Promise<OcupacionCancha[]> {
    return this.svc.ocupacion(ensureTenant(user), desde, hasta);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CanchaAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateCanchaDto,
  ): Promise<CanchaAdmin> {
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCanchaDto,
  ): Promise<CanchaAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Delete(':id')
  deactivate(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.deactivate(id, ensureTenant(user));
  }

  /**
   * Sprint 40 — Cambiar estado operativo de la cancha.
   * PATCH /admin/canchas/:id/estado  body { estado, motivo? }
   */
  @Patch(':id/estado')
  cambiarEstado(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<CanchaAdmin> {
    const parsed: CambiarEstadoCanchaRequest =
      CambiarEstadoCanchaSchema.parse(body);
    return this.svc.cambiarEstado(
      id,
      ensureTenant(user),
      parsed.estado,
      parsed.motivo,
    );
  }
}
