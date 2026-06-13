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
 * Sprint 19 — Suspensión v2 de fechas completas.
 *
 * Cambio de modelo: cuando una fecha N se suspende, queda en estado
 * SUSPENDIDA con tipo_reprogramacion='ORIGINAL'. Si la estrategia no
 * es MANUAL, se crea una fecha nueva con el mismo `numero`=N pero
 * tipo_reprogramacion='REPROGRAMADA' que toma los partidos no
 * cerrados. El UNIQUE compuesto permite que ambas coexistan.
 *
 * Estrategias:
 *   AL_FINAL          → la REPROGRAMADA se ubica después de la última
 *                       fecha del torneo. Los partidos suspendidos se
 *                       CLONAN en estado PROGRAMADO (los originales
 *                       quedan en SUSPENDIDO_FUERZA_MAYOR como historial).
 *   TRASNOCHE_DOMINO  → la REPROGRAMADA se intercala entre la suspendida
 *                       y la siguiente. Las posteriores se corren N días
 *                       y quedan marcadas REPROGRAMADAS. Partidos
 *                       clonados igual que AL_FINAL.
 *   REUSAR_EXISTENTE  → no se crea fecha nueva. Los partidos se MUEVEN a
 *                       una fecha existente del torneo (fechaDestinoId)
 *                       que pasa a tipo REPROGRAMADA. (No clona — la
 *                       fecha destino puede tener partidos previos.)
 *   MANUAL            → solo marca SUSPENDIDA. Sin fecha nueva.
 *
 * Si la fecha original tenía acta cerrada en algún partido, esos partidos
 * NO se tocan (la suspensión es a futuro, no destruye historial).
 *
 * Reactivar (volver de SUSPENDIDA a PROGRAMADA) se bloquea si existe una
 * REPROGRAMADA con clones vivos — para evitar partidos duplicados. El
 * admin debe limpiar la REPROGRAMADA primero o dejar la original suspendida.
 */
@Injectable()
export class FechasAdminService {
  private readonly log = new Logger(FechasAdminService.name);

  constructor(
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
  ) {}

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
      fechaDestinoId?: string;
      fechaInicioReprogramada?: string;
    },
  ): Promise<{
    fechaSuspendida: Fecha;
    fechasAfectadas: number;
    nuevaFechaBisId: string | null;
  }> {
    const fecha = await this.fechaRepo.findOne({
      where: { id: fechaId, tenantId },
    });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);

    if (fecha.estado === 'FINALIZADA') {
      throw new ConflictException(
        'No se puede suspender una fecha ya finalizada. Si quieres revisar resultados, hazlo desde Tribunal.',
      );
    }
    if (fecha.estado === 'SUSPENDIDA') {
      throw new BadRequestException('La fecha ya está suspendida.');
    }

    // AUDIT-5: si hay partidos EN_CURSO, no suspender.
    const enCurso = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.fecha_id = :fechaId', { fechaId })
      .andWhere(`p.estado = 'EN_CURSO'`)
      .getCount();
    if (enCurso > 0) {
      throw new ConflictException(
        `No se puede suspender la fecha: hay ${enCurso} partido(s) EN_CURSO. Cierra o reabre esos partidos primero.`,
      );
    }

    // Snapshot del tipo ANTES de tocar el estado (TS infiere literal
    // tras el assignment y rompe las validaciones que vienen abajo).
    const tipoAntes: 'ORIGINAL' | 'REPROGRAMADA' = fecha.tipoReprogramacion;

    // 1. Marcar la fecha original como SUSPENDIDA. NO tocamos
    // tipoReprogramacion — si era REPROGRAMADA queda REPROGRAMADA
    // suspendida (caso de cancelar la reprogramación misma).
    fecha.estado = 'SUSPENDIDA';
    fecha.motivoSuspension = input.motivo;
    fecha.suspendidoAt = new Date();
    fecha.suspendidoByUserId = actorUserId;
    fecha.observacionesSuspension = input.observaciones?.trim() || null;
    await this.fechaRepo.save(fecha);

    // 2. Marcar los partidos no cerrados como SUSPENDIDO_FUERZA_MAYOR
    // (después los movemos si la estrategia crea/reusa una fecha).
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

    // Sanear input: el frontend manda "" si el campo opcional está vacío
    // — eso pasa la validación de class-validator pero rompe los
    // cálculos de fecha más abajo. Convertir a undefined para que el
    // ?? funcione bien.
    const fechaInicioReprogramada =
      input.fechaInicioReprogramada && input.fechaInicioReprogramada.trim()
        ? input.fechaInicioReprogramada
        : undefined;

    // 3. Validar combinaciones que crearían colisiones UNIQUE.
    if (
      input.estrategia === 'AL_FINAL' ||
      input.estrategia === 'TRASNOCHE_DOMINO'
    ) {
      // Si la fecha que se suspende YA es REPROGRAMADA, no podemos
      // crear otra REPROGRAMADA con el mismo número (UNIQUE compuesto).
      // En ese caso obligar a REUSAR_EXISTENTE o MANUAL.
      if (tipoAntes === 'REPROGRAMADA') {
        throw new ConflictException(
          `La fecha ${fecha.numero} ya es una REPROGRAMADA. ` +
            'No se puede crear otra REPROGRAMADA encima. ' +
            'Usa la estrategia REUSAR_EXISTENTE apuntando a otra fecha, o MANUAL.',
        );
      }
      // Si ya existe una REPROGRAMADA paralela, idem.
      const existeRepro = await this.fechaRepo.findOne({
        where: {
          tenantId,
          torneoId: fecha.torneoId,
          numero: fecha.numero,
          tipoReprogramacion: 'REPROGRAMADA',
        },
      });
      if (existeRepro) {
        throw new ConflictException(
          `Ya existe una fecha ${fecha.numero} REPROGRAMADA. ` +
            'Elimínala o reactívala antes de crear otra (o usa la estrategia REUSAR_EXISTENTE apuntando a ella).',
        );
      }
    }

    let fechasAfectadas = 0;
    let nuevaFechaBisId: string | null = null;

    switch (input.estrategia) {
      case 'AL_FINAL':
        nuevaFechaBisId = await this.aplicarAlFinal(
          tenantId,
          fecha,
          fechaInicioReprogramada,
        );
        fechasAfectadas = 1;
        break;
      case 'TRASNOCHE_DOMINO':
        {
          const res = await this.aplicarTrasnocheDomino(
            tenantId,
            fecha,
            input.diasCorrimiento ?? 7,
            fechaInicioReprogramada,
          );
          nuevaFechaBisId = res.nuevaId;
          fechasAfectadas = res.fechasCorridas + 1;
        }
        break;
      case 'REUSAR_EXISTENTE':
        if (!input.fechaDestinoId) {
          throw new BadRequestException(
            'Estrategia REUSAR_EXISTENTE requiere fechaDestinoId.',
          );
        }
        nuevaFechaBisId = await this.aplicarReusarExistente(
          tenantId,
          fecha,
          input.fechaDestinoId,
        );
        fechasAfectadas = 1;
        break;
      case 'MANUAL':
      default:
        // Solo marca SUSPENDIDA. Los partidos quedan en SUSPENDIDO_FUERZA_MAYOR
        // y el admin los reprograma de a uno desde el detalle.
        break;
    }

    this.log.log(
      `Fecha ${fechaId} suspendida estrategia=${input.estrategia} motivo=${input.motivo} ` +
        `nueva=${nuevaFechaBisId ?? '—'} afectadas=${fechasAfectadas}`,
    );

    return { fechaSuspendida: fecha, fechasAfectadas, nuevaFechaBisId };
  }

  /**
   * Reactiva una fecha SUSPENDIDA. Vuelve a PROGRAMADA y los partidos
   * en SUSPENDIDO_FUERZA_MAYOR vuelven a PROGRAMADO.
   *
   * Si al suspender se creó una fecha REPROGRAMADA con partidos clonados,
   * BLOQUEAMOS la reactivación porque permitirla generaría partidos
   * duplicados jugando el mismo torneo (los originales reactivados + los
   * clones todavía vivos en la REPROGRAMADA). El admin debe eliminar
   * primero la fecha REPROGRAMADA, o aceptar que esa es el calendario
   * vigente y dejar la original suspendida.
   */
  @Transactional()
  async reactivarFecha(fechaId: string, tenantId: string): Promise<Fecha> {
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.estado !== 'SUSPENDIDA') {
      throw new BadRequestException(
        `La fecha no está suspendida (estado: ${fecha.estado}).`,
      );
    }

    // Detectar REPROGRAMADA asociada que ya tenga partidos clonados.
    // Si los partidos están en otra fecha y vivos, reactivar aquí generaría
    // duplicados.
    const reprogramadaAsociada = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.reemplaza_fecha_id = :fechaId', { fechaId })
      .andWhere(`f.tipo_reprogramacion = 'REPROGRAMADA'`)
      .andWhere(`f.estado <> 'SUSPENDIDA'`)
      .getOne();

    if (reprogramadaAsociada) {
      const partidosEnRepro = await this.partidoRepo.count({
        where: { tenantId, fechaId: reprogramadaAsociada.id },
      });
      if (partidosEnRepro > 0) {
        throw new ConflictException(
          `No se puede reactivar: existe una fecha REPROGRAMADA (id=${reprogramadaAsociada.id}) ` +
            `con ${partidosEnRepro} partido(s) clonados. ` +
            'Elimina primero la fecha reprogramada (o sus partidos), después puedes reactivar la original.',
        );
      }
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
   * AL_FINAL — crea una nueva fecha REPROGRAMADA al final del calendario
   * del torneo. Si no se pasó fechaInicioReprogramada, se calcula como
   * (fechaInicio de la última fecha + diasEntreFechas estimados).
   */
  private async aplicarAlFinal(
    tenantId: string,
    fechaSuspendida: Fecha,
    fechaInicioInput?: string,
  ): Promise<string> {
    const ultima = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', {
        torneoId: fechaSuspendida.torneoId,
      })
      .orderBy('f.numero', 'DESC')
      .addOrderBy(
        `CASE WHEN f.tipo_reprogramacion = 'REPROGRAMADA' THEN 0 ELSE 1 END`,
      )
      .getOne();

    const fechaInicio =
      fechaInicioInput ??
      (ultima?.fechaInicio ? this.sumarDias(ultima.fechaInicio, 7) : null);

    const nueva = this.fechaRepo.create({
      tenantId,
      torneoId: fechaSuspendida.torneoId,
      numero: fechaSuspendida.numero,
      etiqueta: `Fecha ${fechaSuspendida.numero} · Reprogramada`,
      fechaInicio,
      fechaFin: fechaInicio ? this.sumarDias(fechaInicio, 1) : null,
      estado: 'PROGRAMADA',
      tipoReprogramacion: 'REPROGRAMADA',
      reemplazaFechaId: fechaSuspendida.id,
    });
    const saved = await this.fechaRepo.save(nueva);

    // Clonar los partidos suspendidos a la nueva fecha (en PROGRAMADO).
    // Los originales quedan en la SUSPENDIDA como historial.
    await this.clonarPartidosA(tenantId, fechaSuspendida.id, saved.id, fechaInicio);
    return saved.id;
  }

  /**
   * TRASNOCHE_DOMINO — crea una REPROGRAMADA intercalada justo después
   * de la suspendida y corre las posteriores N días para hacer espacio.
   * Las posteriores corridas se marcan como REPROGRAMADAS también para
   * trazabilidad ("esta fecha se movió por una reprogramación").
   *
   * No renumeramos (a diferencia del flujo viejo): la nueva fecha N va
   * después de la suspendida N, pero conserva numero=N porque el
   * UNIQUE compuesto lo permite (la suspendida es ORIGINAL, la nueva es
   * REPROGRAMADA).
   */
  private async aplicarTrasnocheDomino(
    tenantId: string,
    fechaSuspendida: Fecha,
    dias: number,
    fechaInicioInput?: string,
  ): Promise<{ nuevaId: string; fechasCorridas: number }> {
    // Correr las posteriores (numero > N) en N días.
    const posteriores = await this.fechaRepo
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.torneo_id = :torneoId', {
        torneoId: fechaSuspendida.torneoId,
      })
      .andWhere('f.numero > :n', { n: fechaSuspendida.numero })
      .getMany();

    for (const f of posteriores) {
      if (f.fechaInicio) f.fechaInicio = this.sumarDias(f.fechaInicio, dias);
      if (f.fechaFin) f.fechaFin = this.sumarDias(f.fechaFin, dias);
      // Marcar como REPROGRAMADA para visibilidad (no se duplica el
      // registro — solo cambia el tipo).
      if (f.tipoReprogramacion === 'ORIGINAL') {
        f.tipoReprogramacion = 'REPROGRAMADA';
      }
    }
    if (posteriores.length > 0) await this.fechaRepo.save(posteriores);

    const fechaIds = posteriores.map((f) => f.id);
    if (fechaIds.length > 0) {
      await this.partidoRepo
        .createQueryBuilder()
        .update()
        .set({ fechaHora: () => `fecha_hora + INTERVAL '${dias} days'` })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('fecha_id IN (:...fechaIds)', { fechaIds })
        .andWhere('fecha_hora IS NOT NULL')
        .andWhere('acta_cerrada_at IS NULL')
        .execute();
    }

    // Crear nueva REPROGRAMADA con numero = N.
    const fechaInicio =
      fechaInicioInput ??
      (fechaSuspendida.fechaInicio
        ? this.sumarDias(fechaSuspendida.fechaInicio, dias)
        : null);

    const nueva = this.fechaRepo.create({
      tenantId,
      torneoId: fechaSuspendida.torneoId,
      numero: fechaSuspendida.numero,
      etiqueta: `Fecha ${fechaSuspendida.numero} · Reprogramada`,
      fechaInicio,
      fechaFin: fechaInicio ? this.sumarDias(fechaInicio, 1) : null,
      estado: 'PROGRAMADA',
      tipoReprogramacion: 'REPROGRAMADA',
      reemplazaFechaId: fechaSuspendida.id,
    });
    const saved = await this.fechaRepo.save(nueva);

    // Clonar partidos suspendidos a la nueva fecha — ver aplicarAlFinal.
    await this.clonarPartidosA(tenantId, fechaSuspendida.id, saved.id, fechaInicio);
    return { nuevaId: saved.id, fechasCorridas: posteriores.length };
  }

  /**
   * REUSAR_EXISTENTE — no crea fecha nueva. Mueve los partidos de la
   * suspendida a `fechaDestinoId`. Esa fecha destino se marca REPROGRAMADA
   * y referencia a la suspendida vía reemplaza_fecha_id (si no tenía
   * referencia previa).
   */
  private async aplicarReusarExistente(
    tenantId: string,
    fechaSuspendida: Fecha,
    fechaDestinoId: string,
  ): Promise<string> {
    if (fechaDestinoId === fechaSuspendida.id) {
      throw new BadRequestException(
        'La fecha destino no puede ser la misma que se está suspendiendo.',
      );
    }
    const destino = await this.fechaRepo.findOne({
      where: { id: fechaDestinoId, tenantId },
    });
    if (!destino) throw new NotFoundException('Fecha destino no encontrada.');
    if (destino.torneoId !== fechaSuspendida.torneoId) {
      throw new BadRequestException(
        'La fecha destino pertenece a otro torneo.',
      );
    }
    if (destino.estado === 'SUSPENDIDA' || destino.estado === 'FINALIZADA') {
      throw new BadRequestException(
        `La fecha destino está ${destino.estado}, no puede recibir partidos.`,
      );
    }

    destino.tipoReprogramacion = 'REPROGRAMADA';
    if (!destino.reemplazaFechaId) {
      destino.reemplazaFechaId = fechaSuspendida.id;
    }
    await this.fechaRepo.save(destino);

    await this.moverPartidosSuspendidosA(
      tenantId,
      fechaSuspendida.id,
      destino.id,
      destino.fechaInicio,
    );
    return destino.id;
  }

  /**
   * Clona los partidos suspendidos de la fecha origen a la fecha destino,
   * en estado PROGRAMADO. Los partidos originales quedan intactos en la
   * fecha SUSPENDIDA (historial preservado). Los clones nacen "limpios":
   *
   *   Hereda: equipos, cancha, hora del día (ajustada a fechaInicioDestino),
   *           observaciones libres (no las de suspensión).
   *   Resetea: goles, acta, motivo/observaciones de suspensión, cronómetro
   *            del Match Center, todo lo que sea historia del partido viejo.
   *
   * Por seguridad solo clona los partidos que quedaron como
   * SUSPENDIDO_FUERZA_MAYOR — los que ya tenían acta cerrada o estaban
   * en WALKOVER/FINALIZADO no se duplican (no se reprograman partidos
   * jugados o resueltos por escritorio).
   */
  private async clonarPartidosA(
    tenantId: string,
    origenId: string,
    destinoId: string,
    fechaInicioDestino: string | null,
  ): Promise<void> {
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.fecha_id = :origenId', { origenId })
      .andWhere(`p.estado = 'SUSPENDIDO_FUERZA_MAYOR'`)
      .andWhere('p.acta_cerrada_at IS NULL')
      .getMany();

    if (partidos.length === 0) return;

    // Calculamos las nuevas fecha_hora primero, después validamos choques
    // de cancha contra el resto del calendario ANTES de guardar nada
    // (atómico — si hay choque, no se guarda ningún clone).
    const candidatos = partidos.map((p) => {
      let fechaHora: Date | null = null;
      if (fechaInicioDestino && p.fechaHora) {
        const horaOrig = new Date(p.fechaHora);
        const base = new Date(`${fechaInicioDestino}T00:00:00Z`);
        base.setUTCHours(
          horaOrig.getUTCHours(),
          horaOrig.getUTCMinutes(),
          0,
          0,
        );
        fechaHora = base;
      } else if (p.fechaHora) {
        fechaHora = p.fechaHora;
      }
      return { original: p, fechaHora };
    });

    await this.validarSinChoqueDeCancha(tenantId, candidatos);

    const nuevos = candidatos.map(({ original: p, fechaHora }) =>
      this.partidoRepo.create({
        tenantId,
        fechaId: destinoId,
        // ADR-0005 — el clon hereda las inscripciones (fuente de verdad).
        inscripcionLocalId: p.inscripcionLocalId,
        inscripcionVisitaId: p.inscripcionVisitaId,
        equipoLocalId: p.equipoLocalId,
        equipoVisitaId: p.equipoVisitaId,
        canchaId: p.canchaId,
        canchaNombre: p.canchaNombre,
        fechaHora,
        estado: 'PROGRAMADO' as const,
        // Reset explícito de todo el historial del partido original.
        golesLocal: null,
        golesVisita: null,
        actaCerradaAt: null,
        actaCerradaBy: null,
        observaciones: null,
        motivoSuspension: null,
        suspendidoAt: null,
        suspendidoByUserId: null,
        observacionesSuspension: null,
        centroEstado: 'IDLE' as const,
        centroArrancadoAt: null,
        centroPausadoAt: null,
        centroSegundosAcumulados: 0,
        centroPeriodo: 0,
        centroMinutosPorPeriodo: p.centroMinutosPorPeriodo,
      }),
    );
    await this.partidoRepo.save(nuevos);

    // Aviso si los partidos originales tenían designaciones — el admin
    // las pierde y debe re-designar para el día nuevo. (Decisión:
    // NO clonamos designaciones porque el árbitro confirmó para el día
    // viejo; tiene que volver a aceptar el nuevo.)
    const cantDesignaciones: { c: string }[] = await this.partidoRepo.query(
      `SELECT COUNT(*)::text AS c FROM designaciones WHERE partido_id = ANY($1::uuid[])`,
      [partidos.map((p) => p.id)],
    );
    const total = parseInt(cantDesignaciones[0]?.c ?? '0', 10);
    if (total > 0) {
      this.log.warn(
        `Clonados ${nuevos.length} partidos a fecha=${destinoId}. ${total} designaciones quedaron ` +
          `en los partidos originales (estado SUSPENDIDO_FUERZA_MAYOR). El admin debe re-designar ` +
          `árbitros/personal en los clones nuevos.`,
      );
    } else {
      this.log.log(
        `Clonados ${nuevos.length} partidos de fecha=${origenId} a fecha=${destinoId}`,
      );
    }
  }

  /**
   * Pre-valida en BATCH que los partidos a clonar no choquen con otros
   * partidos del torneo en la misma cancha + ventana horaria. Replica la
   * lógica de PartidosAdminService.validarChoqueCancha pero permite
   * validar varios partidos juntos antes de guardarlos.
   *
   * Lanza ConflictException si hay choque. No guarda nada en ese caso —
   * la transacción de suspender se revierte y el admin recibe el error.
   */
  private async validarSinChoqueDeCancha(
    tenantId: string,
    candidatos: Array<{ original: Partido; fechaHora: Date | null }>,
  ): Promise<void> {
    const VENTANA_MIN = 120;
    const ventanaMs = VENTANA_MIN * 60 * 1000;

    for (const { original, fechaHora } of candidatos) {
      if (!original.canchaId || !fechaHora) continue;
      const desde = new Date(fechaHora.getTime() - ventanaMs);
      const hasta = new Date(fechaHora.getTime() + ventanaMs);
      const choque = await this.partidoRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.inscripcionLocal', 'il')
        .leftJoinAndSelect('il.club', 'ilc')
        .leftJoinAndSelect('p.inscripcionVisita', 'iv')
        .leftJoinAndSelect('iv.club', 'ivc')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.cancha_id = :canchaId', { canchaId: original.canchaId })
        .andWhere('p.fecha_hora IS NOT NULL')
        .andWhere('p.fecha_hora >= :desde', { desde })
        .andWhere('p.fecha_hora <= :hasta', { hasta })
        .andWhere(`p.estado NOT IN ('SUSPENDIDO_FUERZA_MAYOR','WALKOVER')`)
        .getOne();
      if (choque) {
        const hora = choque.fechaHora
          ? new Date(choque.fechaHora).toLocaleString('es-CL')
          : 'sin hora';
        const local = choque.inscripcionLocal?.club?.nombre ?? '—';
        const visita = choque.inscripcionVisita?.club?.nombre ?? '—';
        throw new ConflictException(
          `No se puede clonar el partido a la nueva fecha: la cancha ya tiene "${local} vs ${visita}" ` +
            `el ${hora}. Las citas deben separarse al menos ${VENTANA_MIN} min. ` +
            `Cambia el día de inicio de la fecha reprogramada o moveelo de cancha primero.`,
        );
      }
    }
  }

  /**
   * Mueve los partidos que quedaron en SUSPENDIDO_FUERZA_MAYOR de la
   * fecha origen a la fecha destino. Los vuelve a PROGRAMADO y ajusta
   * fecha_hora si la fecha destino tiene fechaInicio (mantiene la hora,
   * cambia el día).
   */
  private async moverPartidosSuspendidosA(
    tenantId: string,
    origenId: string,
    destinoId: string,
    fechaInicioDestino: string | null,
  ): Promise<void> {
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.fecha_id = :origenId', { origenId })
      .andWhere('p.acta_cerrada_at IS NULL')
      .getMany();

    for (const p of partidos) {
      p.fechaId = destinoId;
      p.estado = 'PROGRAMADO';
      p.motivoSuspension = null;
      if (fechaInicioDestino && p.fechaHora) {
        const horaOrig = new Date(p.fechaHora);
        const nuevo = new Date(`${fechaInicioDestino}T00:00:00Z`);
        nuevo.setUTCHours(
          horaOrig.getUTCHours(),
          horaOrig.getUTCMinutes(),
          0,
          0,
        );
        p.fechaHora = nuevo;
      }
    }
    if (partidos.length > 0) await this.partidoRepo.save(partidos);
  }

  private sumarDias(fechaIso: string, dias: number): string {
    const d = new Date(fechaIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}
