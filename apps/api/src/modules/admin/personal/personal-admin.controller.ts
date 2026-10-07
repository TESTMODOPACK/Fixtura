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
  type ActivarPersonalInfo,
  type AusenciaPersonal,
  type InvitarPersonalResponse,
  type MiPortalPersonal,
  type PersonalAdmin,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AusenciasAdminService } from './ausencias-admin.service';
import {
  ActivarPersonalDto,
  CrearAusenciaDto,
  CreatePersonalDto,
  InvitarPersonalDto,
  UpdatePersonalDto,
} from './dto';
import { PersonalAdminService } from './personal-admin.service';
import { PersonalPortalService } from './personal-portal.service';

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
  @Audited({ action: 'personal.creado', entityType: 'Personal', entityIdFrom: 'response.id' })
  create(
    @CurrentUser() user: UserContext,
    @Body() dto: CreatePersonalDto,
  ): Promise<PersonalAdmin> {
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  @Audited({ action: 'personal.actualizado', entityType: 'Personal', entityIdFrom: 'params.id' })
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePersonalDto,
  ): Promise<PersonalAdmin> {
    return this.svc.update(id, ensureTenant(user), dto, user.userId);
  }

  @Delete(':id')
  @Audited({ action: 'personal.desactivado', entityType: 'Personal', entityIdFrom: 'params.id' })
  deactivate(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.deactivate(id, ensureTenant(user));
  }

  // ── Sprint 10/17: Magic Link onboarding (email + WhatsApp) ───────
  @Post(':id/invitar')
  @Audited({ action: 'personal.invitado', entityType: 'Personal', entityIdFrom: 'params.id' })
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

  /** Deprecado T27 (token en query queda en logs/SW): usar POST. */
  @Get('activacion-info')
  infoActivacion(@Query('token') token?: string): Promise<ActivarPersonalInfo> {
    if (!token || token.length < 20) {
      throw new BadRequestException('Token inválido');
    }
    return this.svc.infoActivacion(token);
  }

  /** T27 — datos para la pantalla de activación; token en el body. */
  @Post('activacion-info')
  infoActivacionPost(@Body('token') token?: string): Promise<ActivarPersonalInfo> {
    if (!token || typeof token !== 'string' || token.length < 20) {
      throw new BadRequestException('Token inválido');
    }
    return this.svc.infoActivacion(token);
  }

  /** Activa la cuenta: el personal crea su contraseña. */
  @Post('activar')
  activar(
    @Body() body: ActivarPersonalDto,
  ): Promise<{ ok: boolean; cuentaExistente: boolean }> {
    if (!body.token || body.token.length < 20) {
      throw new BadRequestException('Token inválido');
    }
    if (!body.password || body.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    return this.svc.activarConPassword(body.token, body.password);
  }
}

/**
 * Portal del personal logueado (árbitros / planilleros). Auto-acotado al
 * personal del usuario por user_id.
 */
@Controller('personal')
@Roles(
  ROLE.ARBITRO,
  ROLE.PLANILLERO,
  ROLE.PARAMEDICO,
  ROLE.SEGURIDAD,
  ROLE.MANTENIMIENTO,
)
export class PersonalPortalController {
  constructor(private readonly portal: PersonalPortalService) {}

  @Get('mi-portal')
  miPortal(@CurrentUser() user: UserContext): Promise<MiPortalPersonal> {
    return this.portal.miPortal(user.userId, ensureTenant(user));
  }
}
