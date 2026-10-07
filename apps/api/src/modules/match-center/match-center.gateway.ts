import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { MatchCenterService } from './match-center.service';

/**
 * Sprint 18 — RF-17.
 *
 * Gateway WebSocket para el Match Center. Los clientes (panel cronista
 * + viewers públicos) se conectan al namespace `/match-center` y se
 * suscriben a la "room" del partido que les interesa.
 *
 * El gateway:
 *   1. Acepta evento `subscribe` con { partidoId }.
 *   2. Une al socket a la room `partido:<id>`.
 *   3. Envía snapshot inicial al socket que se suscribió.
 *   4. Cada segundo emite snapshot a todas las rooms ACTIVAS (las que
 *      tienen al menos un cliente conectado).
 *
 * Las mutaciones (arrancar/pausar/sumar gol) NO van por WS — van por
 * REST autenticado. Después del cambio, el controller llama a
 * `gateway.broadcast(partidoId)` para refrescar a todos los viewers.
 *
 * Esto separa concerns:
 *   - WS: solo lectura, sin auth (vista pública también la usa).
 *   - REST: mutaciones, con JWT + roles (LIGA_ADMIN / cronista).
 */
// Misma whitelist que el CORS HTTP (FRONTEND_URL, lista por comas).
// Permisivo solo si la env no está. Los dominios custom de liga no la
// necesitan: su página y el WS comparten origen vía nginx. Se evalúa por
// handshake (no al importar el módulo): en dev el .env lo carga
// ConfigModule DESPUÉS de este import, y una constante quedaba vacía.
function wsOriginPermitido(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  const lista = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Sin Origin = same-origin o cliente no-browser: CORS no aplica.
  cb(null, lista.length === 0 || !origin || lista.includes(origin));
}

@WebSocketGateway({
  namespace: '/match-center',
  cors: {
    origin: wsOriginPermitido,
    credentials: true,
  },
})
export class MatchCenterGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly log = new Logger(MatchCenterGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Intervalo del tick (ms). 1s coincide con la resolución del cronómetro. */
  private static readonly TICK_INTERVAL_MS = 1000;

  /** T7: un socket anónimo no puede inflar el set de rooms sin límite. */
  private static readonly MAX_ROOMS_POR_SOCKET = 20;

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private tickHandle: NodeJS.Timeout | null = null;

  /** T7: si un tick tarda >1s, el siguiente no se apila encima. */
  private tickEnCurso = false;

  /**
   * Set de partidoIds que tienen al menos un socket suscripto.
   * Mantenido en memoria — se reconstruye al boot a partir de las rooms
   * actuales (vacío inicialmente).
   */
  private partidosActivos = new Set<string>();

  constructor(private readonly svc: MatchCenterService) {}

  afterInit(_server: Server): void {
    this.iniciarTick();
    // MOV-5 — repoblar el set de partidos a tickear desde la DB. Sin esto,
    // tras un restart a mitad de partido el auto-pausa server-side no corría
    // hasta que algún viewer se suscribía.
    void this.seedPartidosActivos();
    this.log.log('[ws] Match Center gateway iniciado — tick cada 1s');
  }

  private async seedPartidosActivos(): Promise<void> {
    try {
      const ids = await this.svc.listarPartidosActivosSistema();
      for (const id of ids) this.partidosActivos.add(id);
      if (ids.length > 0) {
        this.log.log(`[ws] MOV-5: ${ids.length} partido(s) en vivo repoblados al boot`);
      }
    } catch (err) {
      this.log.warn(`[ws] MOV-5 seed falló: ${(err as Error).message}`);
    }
  }

  handleConnection(client: Socket): void {
    this.log.debug(`[ws] cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.log.debug(`[ws] cliente desconectado: ${client.id}`);
    // MOV-5 — NO depuramos por "sin viewers": un partido EN_VIVO/PAUSADO debe
    // seguir tickeando (auto-pausa server-side) aunque nadie lo mire. El tick
    // ya saca del set los partidos que llegan a IDLE / FINALIZADO_CENTRO.
  }

  onModuleDestroy(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @MessageBody() data: { partidoId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const partidoId = data?.partidoId;
    // T7: sin validar, cualquier string entraba al set y el tick abría
    // transacciones por basura; y el catch filtraba errores internos
    // (hasta de Postgres) al cliente anónimo.
    if (typeof partidoId !== 'string' || !MatchCenterGateway.UUID_RE.test(partidoId)) {
      client.emit('error', { message: 'partidoId inválido.' });
      return;
    }
    const room = this.roomKey(partidoId);
    // El cupo se RESERVA antes del await: sin esto, una ráfaga de
    // subscribes entraba completa porque todos pasaban el chequeo antes
    // de que el primero hiciera join.
    const socketData = client.data as { subsPendientes?: Set<string> };
    const pendientes = (socketData.subsPendientes ??= new Set<string>());
    const ocupadas = client.rooms.size - 1 + pendientes.size;
    const yaSuscrito = client.rooms.has(room) || pendientes.has(room);
    if (!yaSuscrito && ocupadas >= MatchCenterGateway.MAX_ROOMS_POR_SOCKET) {
      client.emit('error', { message: 'Demasiadas suscripciones en esta conexión.' });
      return;
    }
    pendientes.add(room);

    // Snapshot primero (vía sistema: el gateway no pasa por el
    // TenantContextInterceptor): si el partido no existe, el socket NO se
    // une a la room y el id NO entra al set del tick.
    try {
      const snap = await this.svc.snapshotPublicoSistema(partidoId);
      await client.join(room);
      this.partidosActivos.add(partidoId);
      this.log.debug(`[ws] socket ${client.id} suscripto a ${partidoId}`);
      client.emit('snapshot', snap);
    } catch (err) {
      // Respuesta genérica al cliente; el motivo real (404 vs pool/DB)
      // queda en el log del servidor.
      this.log.warn(
        `[ws] subscribe ${partidoId} rechazado: ${(err as Error).message}`,
      );
      client.emit('error', { message: 'Partido no encontrado.' });
    } finally {
      pendientes.delete(room);
    }
  }

  @SubscribeMessage('unsubscribe')
  async onUnsubscribe(
    @MessageBody() data: { partidoId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!data?.partidoId) return;
    await client.leave(this.roomKey(data.partidoId));
    // MOV-5 — no se saca del set al desuscribirse: si sigue EN_VIVO/PAUSADO
    // debe seguir tickeando. El tick lo remueve al llegar a IDLE/FINALIZADO.
  }

  /**
   * Llamado por el controller REST después de una mutación
   * (arrancar/pausar/sumar gol) para empujar snapshot inmediato sin
   * esperar al próximo tick.
   */
  async broadcast(partidoId: string): Promise<void> {
    try {
      const snap = await this.svc.snapshotPublicoSistema(partidoId);
      this.server.to(this.roomKey(partidoId)).emit('snapshot', snap);
    } catch (err) {
      this.log.warn(`[ws] broadcast failed para ${partidoId}: ${(err as Error).message}`);
    }
  }

  private iniciarTick(): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => {
      void this.tick();
    }, MatchCenterGateway.TICK_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    if (this.tickEnCurso) return;
    this.tickEnCurso = true;
    try {
      await this.tickInterno();
    } finally {
      this.tickEnCurso = false;
    }
  }

  private async tickInterno(): Promise<void> {
    if (this.partidosActivos.size === 0) return;
    // Snapshot por partido activo. Lo hacemos en paralelo — son N
    // queries baratas (un partido por iter). Con > 50 partidos activos
    // conviene mover a una sola query y splitear.
    const ids = Array.from(this.partidosActivos);
    await Promise.all(
      ids.map(async (id) => {
        try {
          // Auto-pausa el partido si el período ya cumplió su tiempo objetivo
          // (duración + agregado). Es la autoridad server-side del cronómetro.
          await this.svc.verificarYAutoPausar(id);
          const snap = await this.svc.snapshotPublicoSistema(id);
          this.server.to(this.roomKey(id)).emit('snapshot', snap);
          // Si el partido ya finalizó el centro, podemos sacarlo del set.
          if (snap.estado === 'FINALIZADO_CENTRO' || snap.estado === 'IDLE') {
            this.partidosActivos.delete(id);
          }
        } catch (err) {
          this.log.warn(
            `[ws] tick partido=${id} error: ${(err as Error).message}. Removiendo del set.`,
          );
          this.partidosActivos.delete(id);
        }
      }),
    );
  }

  private roomKey(partidoId: string): string {
    return `partido:${partidoId}`;
  }
}
