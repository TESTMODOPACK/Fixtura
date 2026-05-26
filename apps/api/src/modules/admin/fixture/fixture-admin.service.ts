import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type { FixtureGenerationResult, GenerarFixtureRequest } from '@fixtura/types';
import { generarFixtureBerger } from '@fixtura/domain';

import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class FixtureAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
  ) {}

  /**
   * Genera el fixture completo del torneo usando el motor Berger.
   *
   * Reglas:
   *   - Solo permitido si el torneo no tiene fechas ya creadas.
   *   - Requiere al menos 2 equipos.
   *   - Crea todas las fechas + partidos en una sola transacción.
   *   - Asigna canchas y horarios round-robin sobre la lista provista.
   *   - Los equipos que descansan (BYE) no generan partido pero se
   *     reportan en el resultado para que el frontend los marque.
   */
  @Transactional()
  async generar(
    torneoId: string,
    tenantId: string,
    input: GenerarFixtureRequest,
  ): Promise<FixtureGenerationResult> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);

    const existingFechas = await this.fechaRepo.count({ where: { torneoId } });
    if (existingFechas > 0) {
      throw new ConflictException(
        `El torneo ya tiene ${existingFechas} fechas. Borralas antes de regenerar el fixture.`,
      );
    }

    const equipos = await this.equipoRepo.find({
      where: { torneoId },
      order: { nombre: 'ASC' },
    });
    if (equipos.length < 2) {
      throw new BadRequestException(`Se requieren al menos 2 equipos. Hay ${equipos.length}.`);
    }

    // Generar con Berger
    const fixture = generarFixtureBerger(
      equipos.map((e) => ({ id: e.id, nombre: e.nombre })),
      { ruedas: torneo.ruedas },
    );

    // Crear fechas
    const fechaInicioBase = new Date(input.fechaInicio);
    const fechaIdByNumero = new Map<number, string>();

    for (let n = 1; n <= fixture.fechas; n++) {
      const fechaInicio = new Date(fechaInicioBase);
      fechaInicio.setDate(fechaInicioBase.getDate() + (n - 1) * input.diasEntreFechas);
      const fechaFin = new Date(fechaInicio);
      fechaFin.setDate(fechaInicio.getDate() + 1);

      const etiqueta = `Fecha ${n} · ${fechaInicio.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
      })}`;

      const saved = await this.fechaRepo.save(
        this.fechaRepo.create({
          tenantId,
          torneoId,
          numero: n,
          etiqueta,
          fechaInicio: fechaInicio.toISOString().slice(0, 10),
          fechaFin: fechaFin.toISOString().slice(0, 10),
          estado: 'PROGRAMADA',
        }),
      );
      fechaIdByNumero.set(n, saved.id);
    }

    // Crear partidos
    const horarios = input.horariosPorFecha;
    const canchas = input.canchas;

    let partidosCreados = 0;
    const partidosPorFecha = new Map<number, number>();
    for (const p of fixture.partidos) {
      const fechaId = fechaIdByNumero.get(p.fechaNumero)!;
      const idxEnFecha = partidosPorFecha.get(p.fechaNumero) ?? 0;
      partidosPorFecha.set(p.fechaNumero, idxEnFecha + 1);

      const cancha = canchas[idxEnFecha % canchas.length]!;
      const horario = horarios[idxEnFecha % horarios.length]!;

      const baseFecha = new Date(fechaInicioBase);
      baseFecha.setDate(fechaInicioBase.getDate() + (p.fechaNumero - 1) * input.diasEntreFechas);
      const [h, m] = horario.split(':').map(Number);
      baseFecha.setHours(h!, m!, 0, 0);

      await this.partidoRepo.save(
        this.partidoRepo.create({
          tenantId,
          fechaId,
          equipoLocalId: p.equipoLocalId,
          equipoVisitaId: p.equipoVisitaId,
          canchaNombre: cancha,
          fechaHora: baseFecha,
          estado: 'PROGRAMADO',
        }),
      );
      partidosCreados++;
    }

    const equiposLibres = Object.entries(fixture.libresPorFecha)
      .filter(([, eqId]) => eqId !== null)
      .map(([fechaNumero, equipoId]) => ({
        fechaNumero: Number.parseInt(fechaNumero, 10),
        equipoId: equipoId as string,
      }));

    return {
      fechasCreadas: fixture.fechas,
      partidosCreados,
      equiposLibres,
    };
  }

  /**
   * Borra TODAS las fechas + partidos del torneo. Útil para regenerar.
   * Solo permitido si el torneo está en DRAFT.
   */
  @Transactional()
  async reset(torneoId: string, tenantId: string): Promise<{ deleted: number }> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    if (torneo.estado !== 'DRAFT') {
      throw new BadRequestException(
        `Solo se puede resetear fixture en estado DRAFT. Estado actual: ${torneo.estado}`,
      );
    }

    const fechas = await this.fechaRepo.find({ where: { torneoId } });
    if (fechas.length === 0) return { deleted: 0 };

    // ON DELETE CASCADE de partidos.fecha_id se encarga de los partidos
    await this.fechaRepo.delete({ torneoId });
    return { deleted: fechas.length };
  }
}
