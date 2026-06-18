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

import {
  ROLE,
  type MiembroAdmin,
  type TenantSettings,
  type UserContext,
  type UsuarioSistema,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AjustesAdminService } from './ajustes-admin.service';
import {
  InvitarMiembroDto,
  UpdateTenantSettingsDto,
} from './dto';

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
  ): Promise<MiembroAdmin> {
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
