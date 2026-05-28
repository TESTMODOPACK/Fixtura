import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  EstrategiaSuspensionFecha,
  MotivoSuspension,
} from '@fixtura/types';

import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';

/**
 * Service de suspensión / reactivación de FECHAS completas.
 *
 * 3 estrategias:
 *   DOMINO    → corre N días todas las fechas siguientes en transacción.
 *   TRASNOCHE → crea una "fecha bis" intercalada (numero conserva, etiqueta "bis").
 *   MANUAL    → solo marca la fecha como SUSPENDIDA, sin tocar el resto.
 *
 * En todas las estrategias, los partidos de la fecha suspendida pasan
 * a estado SUSPENDIDO_FUERZA_MAYOR con el mismo motivo. Si tenían acta
 * cerrada, NO se suspenden (la suspensión es a futuro, no destruye
 * resultados pasados).
 */
@Injectable()
export class FechasAdminService {
  private readonly log = new Logger(FechasAdminService.name);

  constructor(
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
  ) {}

  /**
   * Suspende una fecha y aplica la estrategia elegida.
   */
  @Transactional()
  async suspenderFecha(
    fechaId: string,
    tenantId: string,
    actorUserId: string | null,
    input: {
      motivo: MotivoSuspension;
      observaciones?: string | null;
      estrategia: EstrategiaSuspensionFecha;
      diasCorrimiento?: number;
      fechaBisDespuesDeNumero?: number;
    },
  ): Promise<{ fechaSuspendida: Fecha; fechasAfectadas: number; nuevaFechaBisId: string | null }> {
    const fecha = await this.fechaRepo.findOne({
      where: { id: fechaId, tenantId },
    });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);

    if (fecha.estado === 'FINALIZADA') {
      throw new ConflictException(
        'No se puede suspender una fecha ya finalizada. Si querés revisar resultados, hacelo desde Tribunal.',
      );
    }
    if (fecha.estado === 'SUSPENDIDA') {
      throw new BadRequestException('La fecha ya está suspendida.');
    }

    // AUDIT-5: si hay partidos EN_CURSO, no suspender. El admin debe
    // cerrar/reabrir actas en curso primero. Sobrescribir EN_CURSO
    // con SUSPENDIDO perdería el progreso del partido.
    const enCurso = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.fecha_id = :fechaId', { fechaId })
      .andWhere(`p.estado = 'EN_CURSO'`)
      .getCount();
    if (enCurso > 0) {
      throw new ConflictException(
        `No se puede suspender la fecha: hay ${enCurso} partido(s) EN_CURSO. Cerrá o reabrí esos partidos primero.`,
      );
    }

    // Marcar la fecha como SUSPENDIDA + trazabilidad.
    fecha.estado = 'SUSPENDIDA';
    fecha.motivoSuspension = input.motivo;
    fecha.suspendidoAt = new Date();
    fecha.suspendidoByUserId = actorUserId;
    fecha.observacionesSuspension = input.observaciones?.trim() || null;
    await this.fechaRepo.save(fecha);

    // Marcar los partidos no cerrados como SUSPENDIDO_FUERZA_MAYOR.
    await this.partidoRepo
      .createQueryBuilder()
      .update()
      .set({
        estado: 'SUSPENDIDO_FUERZA_MAYOR',
        motivoSuspension: input.motivo,
        suspendidoAt: new Date(),
        suspendidoByUserId: actorUserId,
        observacionesSuspension: input.observaciones?.trim() || null,
      })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('fecha_id = :fechaId', { fechaId })
      .andWhere('acta_cerrada_at IS NULL')
      .andWhere(`estado NOT IN ('FINALIZADO','WALKOVER','SUSPENDIDO_FUERZA_MAYOR')`)
      .execute();

    let fechasAfectadas = 0;
    let nuevaFechaBisId: string | null = null;

    if (input.estrategia === 'DOMINO') {
      const dias = input.diasCorrimiento ?? 7;
      fechasAfectadas = await this.aplicarDomino(tenantId, fecha, dias);
    } else if (input.estrategia === 'TRASNOCHE') {
      nuevaFechaBisId = await this.aplicarTrasnoche(
        tenantId,
        fecha,
        input.fechaBisDespuesDeNumero,
      );
    }
    // MANUAL: no hace nada adicional.

    this.log.log(
      `Fecha ${fechaId} suspendida estrategia=${input.estrategia} motivo=${input.motivo} afectadas=${fechasAfectadas}`,
    );

    return { fechaSuspendida: fecha, fechasAfectadas, nuevaFechaBisId };
  }

  /**
   * Reactiva una fecha SUSPENDIDA. Sus partidos vuelven a PROGRAMADO si
   * estaban SUSPENDIDO_FUERZA_MAYOR. No revierte el corrimiento de
   * Dominó ni borra la fecha bis del Trasnoche — eso sería complejo y
   * el admin puede hacerlo manualmente si lo necesita.
   */
  async reactivarFecha(fechaId: string, tenantId: string): Promise<Fecha> {
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.estado !== 'SUSPENDIDA') {
      throw new BadRequestException(
        `La fecha no está suspendida (estado: ${fecha.estado}).`,
      );
    }
    fecha.estado = 'PROGRAMADA';
    fecha.motivoSuspension = null;
    fecha.suspendidoAt = null;
    fecha.suspendidoByUserId = null;
    fecha.observacionesSuspension = null;
    await this.fechaRepo.save(fecha);

    await this.partidoRepo
      .createQueryBuilder()
      .update()
      .set({
        estado: 'PROGRAMADO',
        motivoSuspension: null,
        suspendidoAt: null,
        suspendidoByUserId: null,
        observacionesSuspension: null,
      })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('fecha_id = :fechaId', { fechaId })
      .andWhere(`estado = 'SUSPENDIDO_FUERZA_MAYOR'`)
      .andWhere('acta_cerrada_at IS NULL')
      .execute();

    return fecha;
  }

  /**
   * DOMINO: suma `dias` a fecha_inicio/fin de la fecha suspendida y de
   * todas las fechas posteriores del mismo torneo. También suma a
   * `fecha_hora` de los partidos no finalizados de esas fechas.
   */
  private async aplicarDomino(
    tenantId: string,
    fechaSuspendida: Fecha,
    dias: number,
  ): Promise<number> {
    const fechasDesdeAqui = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId: fechaSuspendida.torneoId })
      .andWhere('f.numero >= :n', { n: fechaSuspendida.numero })
      .getMany();

    for (const f of fechasDesdeAqui) {
      if (f.fechaInicio) {
        f.fechaInicio = this.sumarDias(f.fechaInicio, dias);
      }
      if (f.fechaFin) {
        f.fechaFin = this.sumarDias(f.fechaFin, dias);
      }
    }
    await this.fechaRepo.save(fechasDesdeAqui);

    const fechaIds = fechasDesdeAqui.map((f) => f.id);
    if (fechaIds.length > 0) {
      await this.partidoRepo
        .createQueryBuilder()
        .update()
        .set({
          fechaHora: () => `fecha_hora + INTERVAL '${dias} days'`,
        })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('fecha_id IN (:...fechaIds)', { fechaIds })
        .andWhere('fecha_hora IS NOT NULL')
        .andWhere('acta_cerrada_at IS NULL')
        .execute();
    }

    return fechasDesdeAqui.length;
  }

  /**
   * TRASNOCHE: crea una nueva fecha "bis" inmediatamente después de la
   * suspendida. Mueve los partidos de la fecha suspendida a esa fecha
   * bis. El resto del calendario NO se altera.
   *
   * Si la liga ya tenía una fecha N+1, la nueva se inserta entre N y
   * N+1 con numero = N (manteniendo el unique constraint torneoId/numero
   * no es posible — usamos numero = N pero etiqueta "bis"). En la
   * práctica esto va a fallar el UNIQUE en torneoId+numero, así que:
   *
   *   1. Renumeramos las fechas N+1 en adelante a N+2, N+3, ...
   *   2. La nueva fecha bis toma numero = N+1.
   *
   * Esto preserva el orden visual sin romper constraints.
   */
  private async aplicarTrasnoche(
    tenantId: string,
    fechaSuspendida: Fecha,
    _despuesDeNumero?: number,
  ): Promise<string> {
    const nuevoNumero = fechaSuspendida.numero + 1;

    // Renumerar fechas posteriores hacia adelante para hacer espacio.
    // OJO: debemos ir de la última a la primera para no chocar con el
    // UNIQUE constraint mientras avanzamos.
    const posteriores = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', { torneoId: fechaSuspendida.torneoId })
      .andWhere('f.numero >= :n', { n: nuevoNumero })
      .orderBy('f.numero', 'DESC')
      .getMany();

    for (const f of posteriores) {
      f.numero = f.numero + 1;
      await this.fechaRepo.save(f);
    }

    // Crear la fecha bis.
    const fechaBis = this.fechaRepo.create({
      tenantId,
      torneoId: fechaSuspendida.torneoId,
      numero: nuevoNumero,
      etiqueta: `${fechaSuspendida.etiqueta ?? `Fecha ${fechaSuspendida.numero}`} (bis)`,
      estado: 'PROGRAMADA',
      // No copiamos fechaInicio/fin — el admin las edita después según
      // cuándo se pueda jugar.
    });
    const saved = await this.fechaRepo.save(fechaBis);

    // Mover los partidos no cerrados de la fecha suspendida a la bis.
    // Vuelven a PROGRAMADO porque pasaron a una fecha nueva.
    await this.partidoRepo
      .createQueryBuilder()
      .update()
      .set({
        fechaId: saved.id,
        estado: 'PROGRAMADO',
        motivoSuspension: null,
        // Conservamos suspendidoAt como historial — el partido recuerda
        // que fue suspendido aunque ahora esté re-programado.
      })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('fecha_id = :fechaId', { fechaId: fechaSuspendida.id })
      .andWhere('acta_cerrada_at IS NULL')
      .execute();

    // La fecha original queda SUSPENDIDA pero sin partidos activos. Es
    // el "registro histórico" de que esa fecha no se jugó.
    return saved.id;
  }

  private sumarDias(fechaIso: string, dias: number): string {
    const d = new Date(fechaIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}
