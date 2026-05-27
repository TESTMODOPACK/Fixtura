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

import { ROLE, type CobroAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CobrosAdminService } from './cobros-admin.service';
import { CreateCobroDto, MarcarPagadoDto, UpdateCobroDto } from './dto';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/cobros')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_CONTADOR,
  ROLE.SUPER_ADMIN,
)
export class CobrosAdminController {
  constructor(private readonly svc: CobrosAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('filtro') filtro?: string,
    @Query('equipoId') equipoId?: string,
  ): Promise<CobroAdmin[]> {
    const filtroValid =
      filtro === 'pendientes' ||
      filtro === 'vencidos' ||
      filtro === 'pagados' ||
      filtro === 'cancelados' ||
      filtro === 'todos'
        ? filtro
        : undefined;
    return this.svc.list(ensureTenant(user), filtroValid, equipoId || undefined);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CobroAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateCobroDto,
  ): Promise<CobroAdmin> {
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCobroDto,
  ): Promise<CobroAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Post(':id/pagar')
  marcarPagado(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarcarPagadoDto,
  ): Promise<CobroAdmin> {
    return this.svc.marcarPagado(id, ensureTenant(user), dto);
  }

  @Post(':id/revertir-pago')
  revertirPago(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CobroAdmin> {
    return this.svc.revertirPago(id, ensureTenant(user));
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}
