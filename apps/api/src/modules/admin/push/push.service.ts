import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { Partido } from '../../competition/entities/partido.entity';
import { PushSubscription, PushScopeType } from './entities/push-subscription.entity';
import {
  PUSH_PROVIDER,
  PushPayload,
  PushProvider,
} from './push-provider';

/**
 * Servicio centralizado de notificaciones push.
 *
 *   - subscribe(): registra (o reactiva) un endpoint para un user/scope.
 *   - unsubscribe(): revoca un endpoint específico (logout, opt-out).
 *   - notifyPartidoCerrado(): dispatched desde PartidosAdminService.
 *     Envía push a todos los suscriptos al partido o a sus equipos.
 *
 * Best-effort: si un endpoint falla con "endpoint inválido" lo revoca
 * automáticamente. Otros errores se loggean y siguen con el resto.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
    @InjectRepository(Partido)
    private readonly partidoRepo: Repository<Partido>,
    @Inject(PUSH_PROVIDER)
    private readonly provider: PushProvider,
  ) {}

  async subscribe(args: {
    tenantId?: string | null;
    userId?: string | null;
    scopeType: PushScopeType;
    scopeId?: string | null;
    endpoint: string;
    p256dh?: string | null;
    auth?: string | null;
    userAgent?: string | null;
  }): Promise<{ id: string }> {
    // Si ya existe ese endpoint, reactivamos en lugar de duplicar.
    const existente = await this.repo.findOne({
      where: { endpoint: args.endpoint },
    });
    if (existente) {
      existente.revokedAt = null;
      existente.tenantId = args.tenantId ?? null;
      existente.userId = args.userId ?? null;
      existente.scopeType = args.scopeType;
      existente.scopeId = args.scopeId ?? null;
      existente.p256dh = args.p256dh ?? null;
      existente.auth = args.auth ?? null;
      existente.userAgent = args.userAgent ?? null;
      existente.lastUsedAt = new Date();
      await this.repo.save(existente);
      return { id: existente.id };
    }
    const sub = this.repo.create({
      tenantId: args.tenantId ?? null,
      userId: args.userId ?? null,
      scopeType: args.scopeType,
      scopeId: args.scopeId ?? null,
      provider: this.provider.nombre,
      endpoint: args.endpoint,
      p256dh: args.p256dh ?? null,
      auth: args.auth ?? null,
      userAgent: args.userAgent ?? null,
    });
    const saved = await this.repo.save(sub);
    return { id: saved.id };
  }

  async unsubscribe(endpoint: string): Promise<{ revoked: boolean }> {
    const r = await this.repo.update(
      { endpoint, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { revoked: (r.affected ?? 0) > 0 };
  }

  /**
   * Dispatch automático al cerrar un acta. Envía push a:
   *   - suscriptos al partido (PARTIDO + partido.id)
   *   - suscriptos a cualquiera de los dos equipos (EQUIPO + equipo.id)
   *   - suscriptos al torneo (TORNEO + torneo.id) si querés notificar
   *     a admins/observers — opcional.
   *
   * Idempotente vs reintentos: si lo llamás 2 veces, los push viajan
   * 2 veces. El acta de cierre solo llama una vez via @Transactional.
   */
  async notifyPartidoCerrado(partidoId: string): Promise<{ enviados: number; revocados: number }> {
    const partido = await this.partidoRepo.findOne({
      where: { id: partidoId },
      relations: {
        inscripcionLocal: { club: true },
        inscripcionVisita: { club: true },
        fecha: { torneo: true },
      },
    });
    if (!partido) return { enviados: 0, revocados: 0 };

    const subs = await this.repo.find({
      where: [
        { revokedAt: IsNull(), scopeType: 'PARTIDO', scopeId: partido.id },
        {
          revokedAt: IsNull(),
          scopeType: 'EQUIPO',
          scopeId: partido.inscripcionLocalId ?? undefined,
        },
        {
          revokedAt: IsNull(),
          scopeType: 'EQUIPO',
          scopeId: partido.inscripcionVisitaId ?? undefined,
        },
        {
          revokedAt: IsNull(),
          scopeType: 'TORNEO',
          scopeId: partido.fecha?.torneoId ?? undefined,
        },
      ],
    });

    if (subs.length === 0) {
      this.log.log(`Partido ${partidoId} cerrado, sin suscripciones activas.`);
      return { enviados: 0, revocados: 0 };
    }

    const golesL = partido.golesLocal ?? 0;
    const golesV = partido.golesVisita ?? 0;
    const local = partido.inscripcionLocal?.club?.nombre ?? '?';
    const visita = partido.inscripcionVisita?.club?.nombre ?? '?';
    const esWalkover = partido.estado === 'WALKOVER';
    const payload: PushPayload = {
      title: esWalkover
        ? `${local} ${golesL} – ${golesV} ${visita} (W.O.)`
        : `${local} ${golesL} – ${golesV} ${visita}`,
      body: esWalkover
        ? `Walkover declarado. Acta cerrada por inasistencia.`
        : `Final de partido. ${partido.fecha?.torneo?.nombre ?? 'LigaPlus'} — ${partido.fecha?.etiqueta ?? `Fecha ${partido.fecha?.numero ?? ''}`}`,
      url: `/torneos/${partido.fecha?.torneo?.slug ?? ''}/partidos/${partido.id}`,
      tag: `partido-${partido.id}`,
      data: {
        partidoId: partido.id,
        torneoId: partido.fecha?.torneoId,
        equipoLocalId: partido.inscripcionLocalId,
        equipoVisitaId: partido.inscripcionVisitaId,
      },
    };

    let enviados = 0;
    const aRevocar: string[] = [];
    for (const sub of subs) {
      try {
        const r = await this.provider.enviar(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
            provider: sub.provider,
          },
          payload,
        );
        if (r.enviado) {
          enviados++;
          sub.lastUsedAt = new Date();
          await this.repo.save(sub);
        }
        if (r.endpointInvalido) {
          aRevocar.push(sub.id);
        }
      } catch (err) {
        this.log.warn(
          `Push falló para sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    if (aRevocar.length > 0) {
      await this.repo.update(
        { id: In(aRevocar) },
        { revokedAt: new Date() },
      );
    }

    this.log.log(
      `Partido ${partidoId} cerrado: pushes enviados=${enviados} revocados=${aRevocar.length}`,
    );
    return { enviados, revocados: aRevocar.length };
  }
}
