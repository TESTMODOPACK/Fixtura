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

import { ROLE, type CanchaAdmin, type UserContext } from '@fixtura/types';

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
}
