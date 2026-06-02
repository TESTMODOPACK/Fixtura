import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  ROLE,
  type CreateJugadorVetadoRequest,
  type JugadorVetado,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Audited } from '../../audit';
import { CreateVetadoDto } from './dto';
import { VetadosAdminService } from './vetados-admin.service';

@Controller('admin/vetados')
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class VetadosAdminController {
  constructor(private readonly svc: VetadosAdminService) {}

  @Get()
  list(@CurrentUser() user: UserContext): Promise<JugadorVetado[]> {
    return this.svc.list(ensureTenant(user));
  }

  @Post()
  @Audited({ action: 'jugador.vetado.creado', entityType: 'JugadorVetado' })
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateVetadoDto,
  ): Promise<JugadorVetado> {
    return this.svc.create(
      ensureTenant(user),
      user.userId,
      dto as unknown as CreateJugadorVetadoRequest,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({
    action: 'jugador.vetado.eliminado',
    entityType: 'JugadorVetado',
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
