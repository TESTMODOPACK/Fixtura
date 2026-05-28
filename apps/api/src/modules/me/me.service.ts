import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';

import { Designacion } from '../competition/entities/designacion.entity';
import { JugadorInscrito } from '../competition/entities/jugador-inscrito.entity';
import { Personal } from '../competition/entities/personal.entity';
import { SancionActiva } from '../competition/entities/sancion-activa.entity';
import { PushSubscription } from '../admin/push/entities/push-subscription.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { User } from '../users/entities/user.entity';

/**
 * AUDIT-11 — Ley 19.628 (Protección de la vida privada, Chile).
 *
 * Implementa los derechos ARCO de usuarios autenticados:
 *   - Acceso: GET /me/data → exporta JSON con todos los datos asociados.
 *   - Cancelación: POST /me/delete-request → programa eliminación
 *     en 30 días (ventana de gracia).
 *   - Cancelar pedido: DELETE /me/delete-request → desprograma.
 *
 * Las acciones quedan registradas en audit_logs con `action='me.data_export'`
 * y `action='me.delete_requested'` para trazabilidad regulatoria.
 */
@Injectable()
export class MeService {
  /** Ventana de gracia: el user puede revertir el pedido durante este lapso. */
  static readonly GRACE_PERIOD_DAYS = 30;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole) private readonly roleRepo: Repository<UserRole>,
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
    @InjectRepository(Designacion)
    private readonly designacionRepo: Repository<Designacion>,
    @InjectRepository(SancionActiva)
    private readonly sancionRepo: Repository<SancionActiva>,
    @InjectRepository(PushSubscription)
    private readonly pushRepo: Repository<PushSubscription>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * Exporta todos los datos del user en un JSON estructurado.
   *
   * Devuelve un snapshot de lo que vive en la DB asociado al user. NO
   * incluye datos de otros tenants ni de la plataforma. Si el user es
   * `tenant_admin` de varias ligas, solo aparecen sus propios registros
   * (no la liga entera — eso sería una violación inversa).
   */
  async exportData(
    userId: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): Promise<Record<string, unknown>> {
    // El TenantContextInterceptor ya seteó app.current_tenant_id al
    // tenant del JWT. Pero un user puede ser admin/jugador/personal
    // de varios tenants. Ley 19.628 exige acceso completo, así que
    // limpiamos el contexto para esta operación (modo sistema).
    // SET LOCAL aplica sólo a la transacción del request — al cerrar
    // se descarta. No filtra a otros requests.
    await this.ds.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const roles = await this.roleRepo.find({
      where: { userId, revokedAt: IsNull() },
    });

    // personal está vinculado por user_id; las designaciones cuelgan de personal.
    const personalRecords = await this.personalRepo.find({ where: { userId } });
    const personalIds = personalRecords.map((p) => p.id);
    const designaciones =
      personalIds.length > 0
        ? await this.designacionRepo
            .createQueryBuilder('d')
            .where('d.personal_id IN (:...ids)', { ids: personalIds })
            .getMany()
        : [];

    // jugador inscrito: puede haber 0..N (un user delegado puede no estar
    // inscrito como jugador; un jugador puede estar en N torneos).
    const jugadores = await this.jugadorRepo.find({ where: { userId } });

    // sanciones por RUT (sancion_activa.rut). Si el user no tiene rut,
    // no hay sanciones para reportar.
    const sanciones = user.rut
      ? await this.sancionRepo.find({ where: { rut: user.rut } })
      : [];

    const pushSubs = await this.pushRepo.find({ where: { userId } });

    const payload = {
      generadoEn: new Date().toISOString(),
      ley: 'Ley 19.628 / Ley 21.719 (Chile) — Derecho de acceso',
      titular: {
        id: user.id,
        email: user.email,
        rut: user.rut,
        nombre: user.nombre,
        apellido: user.apellido,
        idiomaPref: user.idiomaPref,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        scheduledDeletionAt: user.scheduledDeletionAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      roles: roles.map((r) => ({
        role: r.role,
        scope: r.scopeType,
        scopeId: r.scopeId,
        tenantId: r.tenantId,
        grantedAt: r.grantedAt.toISOString(),
      })),
      personal: personalRecords.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        rol: p.rol,
        nombre: p.nombre,
        apellido: p.apellido,
        rut: p.rut,
        telefono: p.telefono,
        email: p.email,
        tarifaBase: p.tarifaBase,
        carnetAnfaNumero: p.carnetAnfaNumero,
        carnetAnfaVence: p.carnetAnfaVence,
        activo: p.activo,
        createdAt: p.createdAt.toISOString(),
      })),
      designaciones: designaciones.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        partidoId: d.partidoId,
        personalId: d.personalId,
        rolAsignado: d.rolAsignado,
        estado: d.estado,
        montoPago: d.montoPago,
        confirmadoAt: d.confirmadoAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      jugadoresInscritos: jugadores.map((j) => ({
        id: j.id,
        tenantId: j.tenantId,
        equipoId: j.equipoId,
        torneoId: j.torneoId,
        nombre: j.nombre,
        apellido: j.apellido,
        rut: j.rut,
        numeroCamiseta: j.numeroCamiseta,
        posicion: j.posicion,
        capitan: j.capitan,
        activo: j.activo,
        createdAt: j.createdAt.toISOString(),
      })),
      sanciones: sanciones.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        torneoId: s.torneoId,
        rut: s.rut,
        motivo: s.motivo,
        fechasPendientes: s.fechasPendientes,
        cumplida: s.cumplida,
        descripcion: s.descripcion,
        createdAt: s.createdAt.toISOString(),
      })),
      pushSubscriptions: pushSubs.map((p) => ({
        id: p.id,
        provider: p.provider,
        scopeType: p.scopeType,
        scopeId: p.scopeId,
        endpoint: p.endpoint.slice(0, 60) + '…',
        userAgent: p.userAgent,
        createdAt: p.createdAt.toISOString(),
        revokedAt: p.revokedAt?.toISOString() ?? null,
      })),
    };

    await this.logAccion('me.data_export', user, ipAddress, userAgent, {
      registros: {
        roles: roles.length,
        personal: personalRecords.length,
        designaciones: designaciones.length,
        jugadores: jugadores.length,
        sanciones: sanciones.length,
        pushSubscriptions: pushSubs.length,
      },
    });

    return payload;
  }

  /**
   * Solicita la eliminación de cuenta. Marca `scheduled_deletion_at` 30
   * días en el futuro; el cron `users-deletion` (a implementar) hace la
   * baja definitiva. Durante la ventana, el user puede revertir.
   *
   * No borramos inmediatamente porque:
   *   - El usuario puede arrepentirse.
   *   - Hay registros legales (boletas, sanciones) que pueden requerir
   *     retención por años — esos quedan con `user_id = NULL` (ON DELETE
   *     SET NULL ya lo garantiza por FK).
   */
  async requestDeletion(
    userId: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): Promise<{ scheduledFor: string; graceDays: number }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.scheduledDeletionAt) {
      throw new ConflictException(
        `Ya tenés un pedido de eliminación programado para ${user.scheduledDeletionAt.toISOString()}.`,
      );
    }

    // AUDIT-11: si el user es el único LIGA_ADMIN de algún tenant,
    // no puede eliminarse sin transferir antes — bloquearía la liga.
    await this.validarPuedeEliminarse(userId);

    const scheduledFor = new Date(
      Date.now() + MeService.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
    user.scheduledDeletionAt = scheduledFor;
    await this.userRepo.save(user);

    await this.logAccion('me.delete_requested', user, ipAddress, userAgent, {
      scheduledFor: scheduledFor.toISOString(),
      graceDays: MeService.GRACE_PERIOD_DAYS,
    });

    return {
      scheduledFor: scheduledFor.toISOString(),
      graceDays: MeService.GRACE_PERIOD_DAYS,
    };
  }

  async cancelDeletion(
    userId: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): Promise<{ cancelado: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.scheduledDeletionAt) {
      throw new BadRequestException('No hay pedido de eliminación activo.');
    }
    user.scheduledDeletionAt = null;
    await this.userRepo.save(user);

    await this.logAccion('me.delete_cancelled', user, ipAddress, userAgent, {});

    return { cancelado: true };
  }

  /**
   * Bloquea la auto-eliminación si dejaría una liga sin administrador.
   * Por cada tenant donde el user tiene rol `LIGA_ADMIN`, contamos cuántos
   * admins activos hay. Si en alguno es el último → ConflictException.
   */
  private async validarPuedeEliminarse(userId: string): Promise<void> {
    const adminRoles = await this.roleRepo.find({
      where: {
        userId,
        role: 'LIGA_ADMIN',
        revokedAt: IsNull(),
        tenantId: Not(IsNull()),
      },
    });

    for (const r of adminRoles) {
      if (!r.tenantId) continue;
      const otros = await this.roleRepo.count({
        where: {
          tenantId: r.tenantId,
          role: 'LIGA_ADMIN',
          revokedAt: IsNull(),
          userId: Not(userId),
        },
      });
      if (otros === 0) {
        throw new ConflictException(
          `No podés eliminar tu cuenta porque sos el único administrador de una liga. Designá otro admin primero.`,
        );
      }
    }
  }

  /**
   * Helper para registrar acciones ARCO en audit_logs. Usa raw query
   * porque audit_logs no tiene Entity TypeORM (es append-only).
   */
  private async logAccion(
    action: string,
    user: User,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES (NULL, $1, $2, 'user', $1, $3, $4, $5::jsonb)`,
      [user.id, action, ipAddress ?? null, userAgent ?? null, JSON.stringify(metadata)],
    );
  }
}
