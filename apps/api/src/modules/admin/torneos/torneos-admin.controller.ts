import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';

import { ROLE, type TorneoAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateTorneoDto, UpdateTorneoDto } from './dto';
import { TorneosAdminService } from './torneos-admin.service';

@Controller('admin/torneos')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class TorneosAdminController {
  constructor(private readonly svc: TorneosAdminService) {}

  @Get()
  list(@CurrentUser() user: UserContext): Promise<TorneoAdmin[]> {
    return this.svc.list(ensureTenant(user));
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TorneoAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  create(@CurrentUser() user: UserContext, @Body() dto: CreateTorneoDto): Promise<TorneoAdmin> {
    return this.svc.create(ensureTenant(user), {
      temporadaId: dto.temporadaId,
      nombre: dto.nombre,
      slug: dto.slug,
      tipoFormato: dto.tipoFormato ?? 'ROUND_ROBIN',
      ruedas: dto.ruedas ?? 1,
      puntosVictoria: dto.puntosVictoria ?? 3,
      puntosEmpate: dto.puntosEmpate ?? 1,
      puntosDerrota: dto.puntosDerrota ?? 0,
      fechaInicio: dto.fechaInicio,
      fechaFin: dto.fechaFin,
      reglamentoUrl: dto.reglamentoUrl,
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTorneoDto,
  ): Promise<TorneoAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
