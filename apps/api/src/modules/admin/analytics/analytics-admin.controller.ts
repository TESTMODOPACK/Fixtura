import { BadRequestException, Controller, Get } from '@nestjs/common';

import { ROLE, type AnalyticsAdmin, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AnalyticsAdminService } from './analytics-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/analytics')
// Analytics expone recaudación (datos financieros), así que lo restringimos
// igual que Finanzas: NO el coordinador (gestiona competición/arbitraje).
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_CONTADOR, ROLE.SUPER_ADMIN)
export class AnalyticsAdminController {
  constructor(private readonly svc: AnalyticsAdminService) {}

  @Get()
  get(@CurrentUser() user: UserContext): Promise<AnalyticsAdmin> {
    return this.svc.get(ensureTenant(user));
  }
}
