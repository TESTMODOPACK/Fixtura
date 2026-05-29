import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { ROLE, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ImpersonationService } from './impersonation.service';

interface FindImpersonableQuery {
  email?: string;
  limit?: string;
}

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';

@Controller('admin/impersonate')
@Roles(ROLE.SUPER_ADMIN)
export class ImpersonationController {
  constructor(
    private readonly svc: ImpersonationService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
  ) {}

  /**
   * Lista candidatos para impersonar. Filtros: email substring, limit
   * (max 50). Excluye SUPER_ADMINs.
   */
  @Get()
  async list(
    @Query() query: FindImpersonableQuery,
  ): Promise<Array<{ id: string; email: string; roles: string[] }>> {
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)));
    const qb = this.users
      .createQueryBuilder('u')
      .orderBy('u.email', 'ASC')
      .take(limit);
    if (query.email) {
      qb.andWhere('u.email ILIKE :email', { email: `%${query.email}%` });
    }
    const candidatos = await qb.getMany();

    // Excluir super admins.
    const superAdminIds = (
      await this.userRoles.find({ where: { role: 'SUPER_ADMIN' } })
    ).map((r) => r.userId);
    const candidatosLimpios = candidatos.filter(
      (u) => !superAdminIds.includes(u.id),
    );

    // Cargar roles para mostrar en UI.
    const rolesByUser = new Map<string, string[]>();
    if (candidatosLimpios.length > 0) {
      const rows = await this.userRoles.find({
        where: candidatosLimpios.map((u) => ({ userId: u.id })),
      });
      for (const r of rows) {
        const list = rolesByUser.get(r.userId) ?? [];
        list.push(r.role);
        rolesByUser.set(r.userId, list);
      }
    }

    return candidatosLimpios.map((u) => ({
      id: u.id,
      email: u.email,
      roles: rolesByUser.get(u.id) ?? [],
    }));
  }

  @Post(':userId/start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: UserContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: Request,
  ) {
    return this.svc.iniciar(user.userId, userId, req.ip, req.headers['user-agent']);
  }

  @Post(':userId/end')
  @HttpCode(200)
  async end(
    @CurrentUser() user: UserContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    return this.svc.finalizar(
      user.impersonatorId ?? user.userId,
      userId,
      req.ip,
      req.headers['user-agent'],
    );
  }
}

