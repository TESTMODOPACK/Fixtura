import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  ROLE,
  type DocumentoTributarioAdmin,
  type UserContext,
} from '@fixtura/types';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SIIService } from './sii.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/documentos-tributarios')
@Roles(
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_CONTADOR,
  ROLE.SUPER_ADMIN,
)
export class SiiAdminController {
  constructor(private readonly svc: SIIService) {}

  @Get()
  list(
    @CurrentUser() user: UserContext,
    @Query('estado') estado?: string,
  ): Promise<DocumentoTributarioAdmin[]> {
    const estadoValid =
      estado === 'PENDIENTE_EMISION' ||
      estado === 'EMITIDO' ||
      estado === 'RECHAZADO_SII' ||
      estado === 'FALLIDO'
        ? estado
        : undefined;
    return this.svc.list(ensureTenant(user), estadoValid);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DocumentoTributarioAdmin> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  /**
   * Reintenta manualmente la emisión de un documento PENDIENTE/RECHAZADO/FALLIDO.
   * Útil cuando el cron no llegó o el admin sabe que el SII ya está OK.
   */
  @Post(':id/reintentar')
  async reintentar(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DocumentoTributarioAdmin> {
    const tenantId = ensureTenant(user);
    // Defensa en profundidad: confirmamos pertenencia al tenant primero
    await this.svc.findOne(id, tenantId);
    // Si está en FALLIDO, lo reseteamos a PENDIENTE para que el emitir
    // funcione (sino tira error).
    const doc = await this.svc.findOne(id, tenantId);
    if (doc.estado === 'FALLIDO') {
      throw new BadRequestException(
        `Documento ${id} está FALLIDO tras ${doc.intentos} intentos. Reseteá manualmente en DB si querés reintentar.`,
      );
    }
    await this.svc.emitir(id);
    return this.svc.findOne(id, tenantId);
  }
}
