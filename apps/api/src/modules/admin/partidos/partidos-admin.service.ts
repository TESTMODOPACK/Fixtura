import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type {
  CerrarActaRequest,
  CreateIncidenciaRequest,
  FixtureAdminFull,
  IncidenciaAdmin,
  PartidoAdmin,
  PartidoDetalle,
  UpdatePartidoRequest,
} from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { IncidenciaPartido } from '../../competition/entities/incidencia-partido.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class PartidosAdminService {
  constructor(
    @InjectRepository(Partido) private readonly repo: Repository<Partido>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(IncidenciaPartido)
    private readonly incidenciaRepo: Repository<IncidenciaPartido>,
    @InjectRepository(JugadorInscrito)
    private readonly jugadorRepo: Repository<JugadorInscrito>,
  ) {}

  // ─── Fixture completo de un torneo (admin) ─────────────────────────
  async getFixtureFull(torneoId: string, tenantId: string): Promise<FixtureAdminFull> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);

    const fechas = await this.fechaRepo.find({
      where: { torneoId },
      order: { numero: 'ASC' },
    });

    const partidos = await this.repo.find({
      where: fechas.map((f) => ({ fechaId: f.id })),
      relations: { equipoLocal: true, equipoVisita: true },
      order: { fechaHora: 'ASC' },
    });

    const partidosPorFecha = new Map<string, Partido[]>();
    for (const p of partidos) {
      const arr = partidosPorFecha.get(p.fechaId) ?? [];
      arr.push(p);
      partidosPorFecha.set(p.fechaId, arr);
    }

    return {
      torneoId: torneo.id,
      torneoNombre: torneo.nombre,
      fechas: fechas.map((f) => ({
        id: f.id,
        numero: f.numero,
        etiqueta: f.etiqueta,
        estado: f.estado,
        partidos: (partidosPorFecha.get(f.id) ?? []).map((p) => this.toDto(p, f.numero, f.etiqueta)),
      })),
    };
  }

  // ─── Detalle de un partido ──────────────────────────────────────────
  async getDetalle(partidoId: string, tenantId: string): Promise<PartidoDetalle> {
    const partido = await this.findPartido(partidoId, tenantId);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    const incidencias = await this.listIncidencias(partidoId);

    return {
      ...this.toDto(partido, fecha.numero, fecha.etiqueta),
      incidencias,
    };
  }

  // ─── Update partido (cancha, hora, estado, observaciones) ──────────
  async update(
    partidoId: string,
    tenantId: string,
    input: UpdatePartidoRequest,
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);

    if (input.canchaNombre !== undefined) partido.canchaNombre = input.canchaNombre;
    if (input.fechaHora !== undefined) {
      partido.fechaHora = input.fechaHora ? new Date(input.fechaHora) : null;
    }
    if (input.estado !== undefined) partido.estado = input.estado;
    if (input.observaciones !== undefined) partido.observaciones = input.observaciones;

    await this.repo.save(partido);
    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  // ─── Incidencias ────────────────────────────────────────────────────
  async addIncidencia(
    partidoId: string,
    tenantId: string,
    input: CreateIncidenciaRequest,
  ): Promise<IncidenciaAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException(
        'No se pueden agregar incidencias a un acta cerrada. Reabrir primero (Sprint 2C+).',
      );
    }

    // Validar que el equipo pertenece a este partido
    if (input.equipoId !== partido.equipoLocalId && input.equipoId !== partido.equipoVisitaId) {
      throw new BadRequestException('El equipo no pertenece a este partido');
    }

    // Validar que el jugador pertenece al equipo si se proporciona
    if (input.jugadorInscritoId) {
      const jugador = await this.jugadorRepo.findOne({
        where: { id: input.jugadorInscritoId, equipoId: input.equipoId },
      });
      if (!jugador) {
        throw new BadRequestException('El jugador no pertenece al equipo indicado');
      }
    }

    const created = await this.incidenciaRepo.save(
      this.incidenciaRepo.create({
        tenantId,
        partidoId,
        equipoId: input.equipoId,
        jugadorInscritoId: input.jugadorInscritoId,
        tipo: input.tipo,
        minuto: input.minuto ?? null,
        detalle: {},
      }),
    );

    const incidencias = await this.listIncidencias(partidoId);
    return incidencias.find((i) => i.id === created.id)!;
  }

  async removeIncidencia(incidenciaId: string, tenantId: string): Promise<void> {
    const inc = await this.incidenciaRepo.findOne({
      where: { id: incidenciaId, tenantId },
      relations: { partido: true },
    });
    if (!inc) throw new NotFoundException(`Incidencia ${incidenciaId} no encontrada`);
    if (inc.partido?.actaCerradaAt) {
      throw new ConflictException('No se pueden borrar incidencias de un acta cerrada');
    }
    await this.incidenciaRepo.delete(incidenciaId);
  }

  // ─── Cierre de acta ─────────────────────────────────────────────────
  @Transactional()
  async cerrarActa(
    partidoId: string,
    tenantId: string,
    actorUserId: string,
    input: CerrarActaRequest,
  ): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (partido.actaCerradaAt) {
      throw new ConflictException('El acta ya está cerrada');
    }

    // Sanity check: los goles del acta deberían coincidir con la cantidad
    // de incidencias tipo GOL/AUTOGOL en la DB. Si no, devolvemos warning
    // pero igual cerramos (caller puede haber elegido cargar sólo el
    // marcador sin tracking por jugador).
    const incidencias = await this.incidenciaRepo.find({ where: { partidoId } });
    const golesLocalIncidencias = incidencias.filter(
      (i) => i.equipoId === partido.equipoLocalId && (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;
    const golesVisitaIncidencias = incidencias.filter(
      (i) => i.equipoId === partido.equipoVisitaId && (i.tipo === 'GOL' || i.tipo === 'AUTOGOL'),
    ).length;

    if (
      (golesLocalIncidencias > 0 || golesVisitaIncidencias > 0) &&
      (golesLocalIncidencias !== input.golesLocal ||
        golesVisitaIncidencias !== input.golesVisita)
    ) {
      throw new BadRequestException(
        `El marcador (${input.golesLocal}-${input.golesVisita}) no coincide con las incidencias cargadas (${golesLocalIncidencias}-${golesVisitaIncidencias}). Ajustá el detalle o el marcador.`,
      );
    }

    partido.golesLocal = input.golesLocal;
    partido.golesVisita = input.golesVisita;
    partido.estado = 'FINALIZADO';
    partido.actaCerradaAt = new Date();
    partido.actaCerradaBy = actorUserId;
    if (input.observaciones !== undefined) partido.observaciones = input.observaciones;

    await this.repo.save(partido);

    // Si todos los partidos de la fecha están finalizados, marcar la fecha
    // como FINALIZADA. Idempotente.
    const partidosDeFecha = await this.repo.find({ where: { fechaId: partido.fechaId } });
    const todosFinalizados = partidosDeFecha.every(
      (p) => p.estado === 'FINALIZADO' || p.estado === 'WALKOVER',
    );
    if (todosFinalizados) {
      await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'FINALIZADA' });
    }

    // TODO Sprint 2C+: disparar BullMQ event acta.cerrada para:
    //   - Recalcular sanciones (por acumulación de amarillas, rojas)
    //   - Notificar pospartido (FCM)
    //   - Enviar NPS (delay 30 min)
    // Por ahora la tabla, ranking de goles, etc. se recalculan al vuelo
    // en cada GET /api/v1/public/* — no necesitamos cache invalidation.

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  /** Reabrir acta (sólo para corrección manual, requiere LIGA_ADMIN). */
  async reabrirActa(partidoId: string, tenantId: string): Promise<PartidoAdmin> {
    const partido = await this.findPartido(partidoId, tenantId);
    if (!partido.actaCerradaAt) {
      throw new BadRequestException('El acta no está cerrada');
    }
    partido.actaCerradaAt = null;
    partido.actaCerradaBy = null;
    partido.estado = 'EN_CURSO';
    await this.repo.save(partido);

    // Re-abrir también la fecha si estaba FINALIZADA
    await this.fechaRepo.update({ id: partido.fechaId }, { estado: 'EN_CURSO' });

    const fecha = await this.fechaRepo.findOneOrFail({ where: { id: partido.fechaId } });
    return this.toDto(partido, fecha.numero, fecha.etiqueta);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async findPartido(id: string, tenantId: string): Promise<Partido> {
    const p = await this.repo.findOne({
      where: { id, tenantId },
      relations: { equipoLocal: true, equipoVisita: true },
    });
    if (!p) throw new NotFoundException(`Partido ${id} no encontrado`);
    return p;
  }

  private async listIncidencias(partidoId: string): Promise<IncidenciaAdmin[]> {
    const incidencias = await this.incidenciaRepo.find({
      where: { partidoId },
      relations: { equipo: true, jugadorInscrito: true },
      order: { minuto: 'ASC', createdAt: 'ASC' },
    });
    return incidencias.map((i) => ({
      id: i.id,
      equipoId: i.equipoId,
      equipoNombre: i.equipo?.nombre ?? '',
      jugadorInscritoId: i.jugadorInscritoId,
      jugadorNombre: i.jugadorInscrito
        ? `${i.jugadorInscrito.nombre} ${i.jugadorInscrito.apellido}`
        : null,
      tipo: i.tipo,
      minuto: i.minuto,
    }));
  }

  private toDto(p: Partido, fechaNumero: number, fechaEtiqueta: string | null): PartidoAdmin {
    return {
      id: p.id,
      fechaId: p.fechaId,
      fechaNumero,
      fechaEtiqueta,
      equipoLocalId: p.equipoLocalId,
      equipoLocalNombre: p.equipoLocal?.nombre ?? '',
      equipoVisitaId: p.equipoVisitaId,
      equipoVisitaNombre: p.equipoVisita?.nombre ?? '',
      canchaNombre: p.canchaNombre,
      fechaHora: p.fechaHora?.toISOString() ?? null,
      estado: p.estado,
      golesLocal: p.golesLocal,
      golesVisita: p.golesVisita,
      actaCerradaAt: p.actaCerradaAt?.toISOString() ?? null,
      observaciones: p.observaciones,
    };
  }
}
