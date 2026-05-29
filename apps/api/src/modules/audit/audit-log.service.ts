import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLog } from './audit-log.entity';

export interface AuditRecordInput {
  /** Acción dot-separated: 'auth.login', 'partido.acta_cerrada', etc. */
  action: string;
  tenantId?: string | null;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryInput {
  tenantId?: string;
  userId?: string;
  action?: string;
  /** Substring search en action: 'auth.' devuelve auth.login, auth.refresh. */
  actionPrefix?: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  desde?: string;
  hasta?: string;
  /** Paginación; default page=1, limit=50. Max limit=200. */
  page?: number;
  limit?: number;
}

/**
 * Sprint 20 — RF-07. Service de audit log.
 *
 * Filosofía:
 *   - record() jamás lanza excepción. Si la persistencia falla, se
 *     loggea pero el flujo principal continúa. Auditoría defensiva.
 *   - search() está pensado para consulta admin: paginado,
 *     scoped por tenant via RLS, filtros opcionales.
 *
 * NO incluye un método delete() — el log es append-only por diseño.
 * Retention policy (si se quiere) se hace con cron + DELETE WHERE
 * created_at < NOW() - INTERVAL 'X years' como migración manual.
 */
@Injectable()
export class AuditLogService {
  private readonly log = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Persiste una entrada. Nunca lanza excepción — solo loggea si falla.
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      const entity = this.repo.create({
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        beforeData: input.beforeData ?? null,
        afterData: input.afterData ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? {},
      });
      await this.repo.save(entity);
    } catch (err) {
      // Audit log que falla no debe romper el flujo del negocio.
      // Lo loggeamos al error stream para que el ops detecte si hay
      // un problema persistente con la tabla.
      this.log.error(
        `[audit] Falló record(action=${input.action}): ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Búsqueda paginada para la UI de admin. Devuelve { items, meta }.
   * RLS filtra automáticamente por tenant_id del contexto.
   */
  async search(query: AuditQueryInput): Promise<{
    items: AuditLog[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC');

    if (query.tenantId) {
      qb.andWhere('a.tenant_id = :tenantId', { tenantId: query.tenantId });
    }
    if (query.userId) {
      qb.andWhere('a.user_id = :userId', { userId: query.userId });
    }
    if (query.action) {
      qb.andWhere('a.action = :action', { action: query.action });
    }
    if (query.actionPrefix) {
      qb.andWhere('a.action LIKE :prefix', { prefix: `${query.actionPrefix}%` });
    }
    if (query.entityType) {
      qb.andWhere('a.entity_type = :entityType', { entityType: query.entityType });
    }
    if (query.entityId) {
      qb.andWhere('a.entity_id = :entityId', { entityId: query.entityId });
    }
    if (query.ipAddress) {
      qb.andWhere('a.ip_address = :ip', { ip: query.ipAddress });
    }
    if (query.desde) {
      qb.andWhere('a.created_at >= :desde', { desde: query.desde });
    }
    if (query.hasta) {
      qb.andWhere('a.created_at <= :hasta', { hasta: query.hasta });
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Lista las acciones únicas vistas — útil para poblar un dropdown de
   * filtro. Cacheable; por ahora lo dejamos uncached (set chico).
   */
  async distinctActions(): Promise<string[]> {
    const rows = (await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.action', 'action')
      .orderBy('action', 'ASC')
      .limit(500)
      .getRawMany()) as Array<{ action: string }>;
    return rows.map((r) => r.action);
  }
}
