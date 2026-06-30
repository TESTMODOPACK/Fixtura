import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type DispararEncuestaResultado,
  type PlantillaEncuesta,
  type ResumenEncuesta,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { EncuestasService } from './encuestas.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) throw new BadRequestException('No hay tenant en el contexto del usuario.');
  return user.tenantId;
}

/**
 * Encuestas configurables (ADR-0011). El admin de la liga arma plantillas, las
 * dispara por torneo y ve los resultados.
 */
@Controller('admin/encuestas')
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class EncuestasAdminController {
  constructor(private readonly svc: EncuestasService) {}

  @Get()
  listar(@CurrentUser() user: UserContext): Promise<PlantillaEncuesta[]> {
    return this.svc.listar(ensureTenant(user));
  }

  @Post()
  crear(@CurrentUser() user: UserContext, @Body() body: unknown): Promise<PlantillaEncuesta> {
    return this.svc.crear(ensureTenant(user), body);
  }

  @Post('ejemplo')
  crearEjemplo(@CurrentUser() user: UserContext): Promise<PlantillaEncuesta> {
    return this.svc.crearEjemplo(ensureTenant(user));
  }

  @Post('disparar')
  disparar(
    @CurrentUser() user: UserContext,
    @Body() body: unknown,
  ): Promise<DispararEncuestaResultado> {
    return this.svc.disparar(ensureTenant(user), body);
  }

  @Patch('preguntas/:preguntaId')
  actualizarPregunta(
    @CurrentUser() user: UserContext,
    @Param('preguntaId') preguntaId: string,
    @Body() body: unknown,
  ): Promise<PlantillaEncuesta> {
    return this.svc.actualizarPregunta(ensureTenant(user), preguntaId, body);
  }

  @Delete('preguntas/:preguntaId')
  eliminarPregunta(
    @CurrentUser() user: UserContext,
    @Param('preguntaId') preguntaId: string,
  ): Promise<PlantillaEncuesta> {
    return this.svc.eliminarPregunta(ensureTenant(user), preguntaId);
  }

  @Get(':id/resumen')
  resumen(
    @CurrentUser() user: UserContext,
    @Param('id') id: string,
  ): Promise<ResumenEncuesta> {
    return this.svc.resumen(ensureTenant(user), id);
  }

  @Post(':id/preguntas')
  agregarPregunta(
    @CurrentUser() user: UserContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PlantillaEncuesta> {
    return this.svc.agregarPregunta(ensureTenant(user), id, body);
  }

  @Post(':id/reordenar')
  reordenar(
    @CurrentUser() user: UserContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PlantillaEncuesta> {
    return this.svc.reordenar(ensureTenant(user), id, body);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: UserContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PlantillaEncuesta> {
    return this.svc.actualizar(ensureTenant(user), id, body);
  }

  @Delete(':id')
  eliminar(
    @CurrentUser() user: UserContext,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    return this.svc.eliminar(ensureTenant(user), id);
  }
}
