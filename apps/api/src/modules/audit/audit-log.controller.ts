import { Controller, Get, Query } from '@nestjs/common';

import { ROLE, type UserContext } from '@fixtura/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';

/**
 * Sprint 20 — RF-07. UI admin para consultar el audit log.
 *
 * Solo LIGA_ADMIN+ y SUPER_ADMIN. RLS filtra automáticamente por tenant
 * (los LIGA_ADMIN solo ven su tenant; SUPER_ADMIN ve todos via bypass).
 */
@Controller('admin/audit-log')
@Roles(ROLE.LIGA_ADMIN, ROLE.SUPER_ADMIN)
export class AuditLogController {
  constructor(private readonly svc: AuditLogService) {}

  @Get()
  async list(
    @CurrentUser() user: UserContext,
    @Query('action') action?: string,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('ipAddress') ipAddress?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    items: Array<{
      id: string;
      tenantId: string | null;
      userId: string | null;
      action: string;
      entityType: string | null;
      entityId: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const result = await this.svc.search({
      // SUPER_ADMIN puede ver todos los tenants pasando tenantId vacío;
      // LIGA_ADMIN siempre filtra por su propio tenant (RLS lo refuerza).
      tenantId: user.tenantId ?? undefined,
      userId,
      action,
      actionPrefix,
      entityType,
      entityId,
      ipAddress,
      desde,
      hasta,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return {
      items: result.items.map(this.toDto),
      meta: result.meta,
    };
  }

  @Get('actions')
  async actions(): Promise<string[]> {
    return this.svc.distinctActions();
  }

  private toDto(a: AuditLog): {
    id: string;
    tenantId: string | null;
    userId: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  } {
    return {
      id: a.id,
      tenantId: a.tenantId,
      userId: a.userId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      metadata: a.metadata,
      createdAt: a.createdAt.toISOString(),
    };
  }
}

