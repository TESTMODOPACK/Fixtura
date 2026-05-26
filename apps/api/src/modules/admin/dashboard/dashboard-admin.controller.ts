import { BadRequestException, Controller, Get } from '@nestjs/common';

import { ROLE, type DashboardAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DashboardAdminService } from './dashboard-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/dashboard')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_COORDINADOR, ROLE.SUPER_ADMIN)
export class DashboardAdminController {
  constructor(private readonly svc: DashboardAdminService) {}

  @Get()
  get(@CurrentUser() user: UserContext): Promise<DashboardAdmin> {
    return this.svc.get(ensureTenant(user));
  }
}
