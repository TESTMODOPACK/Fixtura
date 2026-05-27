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

import { ROLE, type SponsorAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateSponsorDto, UpdateSponsorDto } from './dto';
import { SponsorsAdminService } from './sponsors-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/sponsors')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COMERCIAL, ROLE.SUPER_ADMIN)
export class SponsorsAdminController {
  constructor(private readonly svc: SponsorsAdminService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('posicion') posicion?: string,
  ): Promise<SponsorAdmin[]> {
    return this.svc.list(ensureTenant(user), posicion);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SponsorAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreateSponsorDto,
  ): Promise<SponsorAdmin> {
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSponsorDto,
  ): Promise<SponsorAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}
