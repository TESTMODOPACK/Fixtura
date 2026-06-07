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
  ROLE,
  type AusenciaPersonal,
  type InvitarPersonalResponse,
  type PersonalAdmin,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AusenciasAdminService } from './ausencias-admin.service';
import { CrearAusenciaDto, CreatePersonalDto, InvitarPersonalDto, UpdatePersonalDto } from './dto';
import { PersonalAdminService } from './personal-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/personal')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class PersonalAdminController {
  constructor(
    private readonly svc: PersonalAdminService,
    private readonly ausenciasSvc: AusenciasAdminService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('activos') soloActivos?: string,
  ): Promise<PersonalAdmin[]> {
    return this.svc.list(ensureTenant(user), soloActivos === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PersonalAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreatePersonalDto,
  ): Promise<PersonalAdmin> {
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePersonalDto,
  ): Promise<PersonalAdmin> {
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Delete(':id')
  deactivate(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.deactivate(id, ensureTenant(user));
  }

  // ── Sprint 10/17: Magic Link onboarding (email + WhatsApp) ───────
  @Post(':id/invitar')
  invitar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InvitarPersonalDto,
  ): Promise<InvitarPersonalResponse> {
    return this.svc.invitar(id, ensureTenant(user), user.userId, dto.canal ?? 'EMAIL');
  }

  // ── F48: ausencias del personal por rango de fechas ──────────────
  @Get(':id/ausencias')
  listAusencias(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AusenciaPersonal[]> {
    return this.ausenciasSvc.list(id, ensureTenant(user));
  }

  @Post(':id/ausencias')
  crearAusencia(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CrearAusenciaDto,
  ): Promise<AusenciaPersonal> {
    return this.ausenciasSvc.create(id, ensureTenant(user), dto);
  }

  @Delete(':id/ausencias/:ausenciaId')
  eliminarAusencia(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ausenciaId', new ParseUUIDPipe()) ausenciaId: string,
  ): Promise<void> {
    return this.ausenciasSvc.remove(id, ausenciaId, ensureTenant(user));
  }
}

/**
 * Endpoint público para activar la cuenta vía magic link. Sin auth —
 * el token es la credencial (no enumerable, 32 bytes random).
 */
@Controller('public/personal')
@Public()
export class PersonalPublicController {
  constructor(private readonly svc: PersonalAdminService) {}

  @Post('activar')
  activar(
    @Body() body: { token: string },
  ): Promise<{ personalId: string; tenantId: string | null; nombre: string; rol: string }> {
    if (!body.token || typeof body.token !== 'string' || body.token.length < 20) {
      throw new BadRequestException('Token inválido');
    }
    return this.svc.activarPorToken(body.token);
  }
}
