import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { ROLE, type DiaNoJugable, type FeriadoChile, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DiasNoJugablesService } from './dias-no-jugables.service';
import { BulkCreateDiasNoJugablesDto, CreateDiaNoJugableDto } from './dto';

@Controller('admin/dias-no-jugables')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class DiasNoJugablesController {
  constructor(private readonly svc: DiasNoJugablesService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('torneoId') torneoId?: string,
  ): Promise<DiaNoJugable[]> {
    return this.svc.list(ensureTenant(user), torneoId);
  }

  @Get('feriados-chile/:anio')
  feriadosChile(@Param('anio', ParseIntPipe) anio: number): FeriadoChile[] {
    return this.svc.getFeriadosChile(anio);
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateDiaNoJugableDto,
  ): Promise<DiaNoJugable> {
    return this.svc.create(ensureTenant(user), user.userId, dto);
  }

  @Post('bulk')
  bulkCreate(
    @CurrentUser() user: UserContext,
    @Body() dto: BulkCreateDiasNoJugablesDto,
  ): Promise<{ creados: number; saltados: number; items: DiaNoJugable[] }> {
    return this.svc.bulkCreate(ensureTenant(user), user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.eliminar(id, ensureTenant(user));
  }
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}
