import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { ROLE, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DunningService } from './dunning.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/dunning')
@Roles(ROLE.LIGA_ADMIN, ROLE.LIGA_CONTADOR, ROLE.SUPER_ADMIN)
export class DunningAdminController {
  constructor(private readonly svc: DunningService) {}

  /**
   * Recalcula estado_dunning de todos los cobros del tenant sin enviar
   * emails. Útil después de marcar pagos manuales para refrescar la UI.
   */
  @Post('recalcular')
  async recalcular(
    @CurrentUser() user: UserContext,
  ): Promise<{ actualizados: number }> {
    return this.svc.recalcularEstados(ensureTenant(user));
  }

  /**
   * Dispara avisos masivos ahora (sin esperar al cron). Útil para
   * pruebas o cuando el admin quiere mandar todo en bloque.
   */
  @Post('enviar-avisos')
  async enviarAvisos(
    @CurrentUser() user: UserContext,
  ): Promise<{ enviados: number; saltados: number }> {
    const tenantId = ensureTenant(user);
    await this.svc.recalcularEstados(tenantId);
    return this.svc.enviarAvisos(tenantId);
  }

  /**
   * Envía aviso manual para un cobro específico. Salta el throttle.
   */
  @Post('cobros/:cobroId/avisar')
  async avisarUno(
    @CurrentUser() user: UserContext,
    @Param('cobroId', new ParseUUIDPipe()) cobroId: string,
  ): Promise<{ enviado: boolean; razon?: string }> {
    return this.svc.enviarAvisoManual(cobroId, ensureTenant(user));
  }
}
