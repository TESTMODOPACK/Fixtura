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
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  ROLE,
  type InvitarMiembroResultado,
  type MiembroAdmin,
  type SiiVerificacionResult,
  type TenantSettings,
  type UserContext,
  type UsuarioSistema,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AjustesAdminService } from './ajustes-admin.service';
import {
  InvitarMiembroDto,
  UpdateTenantSettingsDto,
  VerificarSiiDto,
} from './dto';

class InvitacionTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

/**
 * Ajustes del tenant — solo LIGA_ADMIN puede tocarlos. El coordinador
 * tiene acceso de solo lectura (no incluido aquí; si se necesita
 * después, agregamos un endpoint /admin/ajustes/lectura con roles más
 * laxos).
 */
@Controller('admin/ajustes')
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class AjustesAdminController {
  constructor(private readonly svc: AjustesAdminService) {}

  @Get()
  get(@CurrentUser() user: UserContext): Promise<TenantSettings> {
    return this.svc.getSettings(ensureTenant(user));
  }

  @Patch()
  @Audited({ action: 'tenant.settings_updated', entityType: 'Tenant' })
  update(
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateTenantSettingsDto,
  ): Promise<TenantSettings> {
    return this.svc.updateSettings(ensureTenant(user), dto);
  }

  /**
   * "Probar conexión" con OpenFactura: valida la API key, autocompleta el
   * snapshot del emisor (RUT, razón social, giro...) y lo persiste.
   */
  @Post('sii/verificar')
  @Audited({ action: 'tenant.sii_verificado', entityType: 'Tenant' })
  verificarSii(
    @CurrentUser() user: UserContext,
    @Body() dto: VerificarSiiDto,
  ): Promise<SiiVerificacionResult> {
    return this.svc.verificarSii(ensureTenant(user), dto);
  }

  @Get('miembros')
  listMiembros(@CurrentUser() user: UserContext): Promise<MiembroAdmin[]> {
    return this.svc.listMiembros(ensureTenant(user));
  }

  /** Vista consolidada: todas las cuentas con acceso (admin + delegados + personal). */
  @Get('usuarios')
  listUsuarios(@CurrentUser() user: UserContext): Promise<UsuarioSistema[]> {
    return this.svc.listUsuariosSistema(ensureTenant(user));
  }

  @Post('miembros')
  @Audited({ action: 'tenant.member_invited', entityType: 'User' })
  invitarMiembro(
    @CurrentUser() user: UserContext,
    @Body() dto: InvitarMiembroDto,
  ): Promise<InvitarMiembroResultado> {
    return this.svc.invitarMiembro(ensureTenant(user), user.userId, dto);
  }

  @Delete('miembros/:userRoleId')
  @Audited({ action: 'tenant.member_removed', entityType: 'UserRole', entityIdFrom: 'params.userRoleId' })
  removeMiembro(
    @CurrentUser() user: UserContext,
    @Param('userRoleId', new ParseUUIDPipe()) userRoleId: string,
  ): Promise<void> {
    return this.svc.removeMiembro(ensureTenant(user), userRoleId, user.userId);
  }
}

/**
 * T25 (M-9) — aceptación pública de la invitación a miembro admin cuando el
 * email ya tenía cuenta: el rol se otorga recién cuando el dueño consume el
 * link. El token viaja en el BODY (no en query) para que no quede en logs
 * de acceso ni en el cache del service worker (T27).
 */
@Controller('public/ajustes/invitacion')
@Public()
export class AjustesInvitacionPublicController {
  constructor(private readonly svc: AjustesAdminService) {}

  @Post('info')
  info(
    @Body() dto: InvitacionTokenDto,
  ): Promise<{ liga: string; rol: string; email: string }> {
    return this.svc.infoInvitacionMiembro(dto.token);
  }

  @Post('aceptar')
  aceptar(@Body() dto: InvitacionTokenDto): Promise<{ ok: boolean; liga: string }> {
    return this.svc.aceptarInvitacionMiembro(dto.token);
  }
}
