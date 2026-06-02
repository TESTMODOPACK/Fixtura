import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  CategoriaJugadoresSchema,
  CreateCategoriaSchema,
  ROLE,
  UpdateCategoriaSchema,
  type CategoriaJugadores,
  type CreateCategoriaRequest,
  type UpdateCategoriaRequest,
  type UserContext,
} from '@fixtura/types';

import { Audited } from '../../audit';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CategoriasAdminService } from './categorias-admin.service';

function ensureTenant(user: UserContext): string {
  if (!user.tenantId) {
    throw new BadRequestException('No hay tenant en el contexto del usuario.');
  }
  return user.tenantId;
}

@Controller('admin/categorias')
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class CategoriasAdminController {
  constructor(private readonly svc: CategoriasAdminService) {}

  @Get()
  list(@CurrentUser() user: UserContext): Promise<CategoriaJugadores[]> {
    return this.svc.list(ensureTenant(user));
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CategoriaJugadores> {
    return this.svc.findOne(id, ensureTenant(user));
  }

  @Post()
  @Audited({ action: 'categoria.created', entityType: 'CategoriaJugadores', entityIdFrom: 'response.id' })
  create(
    @CurrentUser() user: UserContext,
    @Body() body: unknown,
  ): Promise<CategoriaJugadores> {
    const dto: CreateCategoriaRequest = CreateCategoriaSchema.parse(body);
    return this.svc.create(ensureTenant(user), dto);
  }

  @Patch(':id')
  @Audited({ action: 'categoria.updated', entityType: 'CategoriaJugadores', entityIdFrom: 'params.id' })
  update(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<CategoriaJugadores> {
    const dto: UpdateCategoriaRequest = UpdateCategoriaSchema.parse(body);
    return this.svc.update(id, ensureTenant(user), dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audited({ action: 'categoria.deleted', entityType: 'CategoriaJugadores', entityIdFrom: 'params.id' })
  remove(
    @CurrentUser() user: UserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.remove(id, ensureTenant(user));
  }
}

// El schema importado se usa solo para mantener referencia y evitar lint.
void CategoriaJugadoresSchema;
