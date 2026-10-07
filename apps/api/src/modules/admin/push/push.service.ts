import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';

import { runComoSistema } from '../../../common/rls/rls-context';
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
   *   - suscriptos al torneo (TORNEO + torneo.id) si quieres notificar
   *     a admins/observers — opcional.
   *
   * Idempotente vs reintentos: si lo llamas 2 veces, los push viajan
   * 2 veces. El acta de cierre solo llama una vez via @Transactional.
   */
  async notifyPartidoCerrado(partidoId: string): Promise<{ enviados: number; revocados: number }> {
    // Fire-and-forget desde el cierre del acta: la tx del request ya no
    // existe cuando esto corre — el contexto RLS se abre acá. Los envíos
    // HTTP quedan FUERA de transacción: una tx abierta a través de N
    // llamadas al provider retiene la conexión y puede morir por timeout.
    const datos = await runComoSistema(this.dataSource, () =>
      this.cargarDestinatarios(partidoId),
    );
    if (!datos) return { enviados: 0, revocados: 0 };
    const { subs, payload } = datos;
    if (subs.length === 0) {
      this.log.log(`Partido ${partidoId} cerrado, sin suscripciones activas.`);
      return { enviados: 0, revocados: 0 };
    }

    const usados: string[] = [];
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
        if (r.enviado) usados.push(sub.id);
        if (r.endpointInvalido) aRevocar.push(sub.id);
      } catch (err) {
        this.log.warn(
          `Push falló para sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    if (usados.length > 0 || aRevocar.length > 0) {
      await runComoSistema(this.dataSource, async () => {
        if (usados.length > 0) {
          await this.repo.update({ id: In(usados) }, { lastUsedAt: new Date() });
        }
        if (aRevocar.length > 0) {
          await this.repo.update({ id: In(aRevocar) }, { revokedAt: new Date() });
        }
      });
    }

    this.log.log(
      `Partido ${partidoId} cerrado: pushes enviados=${usados.length} revocados=${aRevocar.length}`,
    );
    return { enviados: usados.length, revocados: aRevocar.length };
  }

  private async cargarDestinatarios(
    partidoId: string,
  ): Promise<{ subs: PushSubscription[]; payload: PushPayload } | null> {
    const partido = await this.partidoRepo.findOne({
      where: { id: partidoId },
      relations: {
        inscripcionLocal: { club: true },
        inscripcionVisita: { club: true },
        fecha: { torneo: true },
      },
    });
    if (!partido) return null;

    // OJO: TypeORM ELIMINA del WHERE las claves undefined — una rama con
    // scopeId undefined se convertía en "todas las suscripciones EQUIPO,
    // de todas las ligas". Las ramas sin id no se agregan.
    const alcances: Array<{ scopeType: PushScopeType; scopeId: string }> = [
      { scopeType: 'PARTIDO', scopeId: partido.id },
    ];
    if (partido.inscripcionLocalId) {
      alcances.push({ scopeType: 'EQUIPO', scopeId: partido.inscripcionLocalId });
    }
    if (partido.inscripcionVisitaId) {
      alcances.push({ scopeType: 'EQUIPO', scopeId: partido.inscripcionVisitaId });
    }
    if (partido.fecha?.torneoId) {
      alcances.push({ scopeType: 'TORNEO', scopeId: partido.fecha.torneoId });
    }

    const subs = await this.repo.find({
      where: alcances.map((a) => ({ revokedAt: IsNull(), ...a })),
    });

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

    return { subs, payload };
  }
}
