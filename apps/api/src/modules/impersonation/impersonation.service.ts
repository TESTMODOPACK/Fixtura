import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { AuditLogService } from '../audit';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../users/entities/user-role.entity';
import { User } from '../users/entities/user.entity';

/**
 * Sprint 21 — RF-06. Impersonación super admin.
 *
 * Solo SUPER_ADMIN puede impersonar. Genera un nuevo par de tokens con
 * el UserContext del target pero `impersonatorId` = id del super admin
 * original. Toda acción durante la sesión queda registrada en audit_log
 * con `metadata.impersonatorId` (el AuditedInterceptor lo agrega).
 *
 * Acciones bloqueadas vía @NoImpersonation(): cambiar password,
 * eliminar cuenta, transferir titularidad. Otras acciones quedan
 * permitidas (esa es la utilidad: dar soporte viendo lo que ve el user).
 *
 * SUPER_ADMIN no puede impersonar a otro SUPER_ADMIN (privesc bloqueado).
 * Tampoco a sí mismo (no tiene sentido).
 */
@Injectable()
export class ImpersonationService {
  private readonly log = new Logger(ImpersonationService.name);

  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    private readonly audit: AuditLogService,
  ) {}

  async iniciar(
    superAdminId: string,
    targetUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens & { targetEmail: string; targetUserId: string }> {
    if (superAdminId === targetUserId) {
      throw new BadRequestException('No puedes impersonarte a ti mismo.');
    }

    const target = await this.users.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException(`Usuario ${targetUserId} no encontrado.`);
    }

    const roles = await this.userRoles.find({ where: { userId: targetUserId } });

    // Bloqueo de privesc: no impersonar a otro super admin.
    if (roles.some((r) => r.role === 'SUPER_ADMIN')) {
      throw new ForbiddenException(
        'No puedes impersonar a otro super admin (privilege escalation bloqueado).',
      );
    }

    // Tenant primario del target. Si tiene varios, tomamos el primero
    // con scope TENANT — el frontend luego puede pedir cambiar.
    const tenantRole = roles.find(
      (r) => r.scopeType === 'TENANT' && r.scopeId !== null,
    );

    const ctx: UserContext = {
      userId: target.id,
      email: target.email,
      tenantId: tenantRole?.scopeId ?? null,
      roles: roles.map((r) => ({
        role: r.role,
        scope: r.scopeType,
        scopeId: r.scopeId,
      })),
      impersonatorId: superAdminId,
    };

    const tokens = await this.auth.issueTokens(ctx, { ipAddress, userAgent });

    await this.audit.record({
      action: 'admin.impersonate.start',
      tenantId: ctx.tenantId,
      userId: superAdminId,
      entityType: 'User',
      entityId: targetUserId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      metadata: {
        targetEmail: target.email,
        targetRoles: roles.map((r) => r.role),
      },
    });

    this.log.warn(
      `[impersonation] super_admin=${superAdminId} → user=${targetUserId} (${target.email})`,
    );

    return {
      ...tokens,
      targetEmail: target.email,
      targetUserId: target.id,
    };
  }

  /**
   * Fin de la impersonación. El frontend descarta los tokens
   * impersonados y reanuda los originales (que el frontend guardó antes
   * de empezar la sesión impersonada). Nuestro backend solo loggea.
   */
  async finalizar(
    impersonatorId: string,
    targetUserId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ ok: boolean }> {
    await this.audit.record({
      action: 'admin.impersonate.end',
      userId: impersonatorId,
      entityType: 'User',
      entityId: targetUserId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
    this.log.log(
      `[impersonation] super_admin=${impersonatorId} salió de user=${targetUserId}`,
    );
    return { ok: true };
  }
}
