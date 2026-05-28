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
import { aplicarConstraintsFixture, generarFixtureBerger } from '@fixtura/domain';

import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import { DiasNoJugablesService } from '../dias-no-jugables/dias-no-jugables.service';

@Injectable()
export class FixtureAdminService {
  /**
   * Sprint 16 — RF-13: si una fecha calculada cae en un día no jugable,
   * intentamos correrla. Este es el máximo de saltos consecutivos antes
   * de rendirnos y dejar la fecha en su día original (con warning).
   * Cubre feriados que se concatenan (18-19 sept) sin entrar en loop.
   */
  private static readonly MAX_SALTOS_DIA_NO_JUGABLE = 14;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    private readonly diasNoJugables: DiasNoJugablesService,
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
    const fixtureBruto = generarFixtureBerger(
      equipos.map((e) => ({ id: e.id, nombre: e.nombre })),
      { ruedas: torneo.ruedas },
    );

    // Sprint 15: aplicar constraints (no 3 locales seguidos +
    // canchas compartidas). canchaPorEquipo se omite aquí porque
    // todavía no hay relación equipo↔cancha persistida (el campo
    // sigue siendo asignación manual por partido).
    const ajustado = aplicarConstraintsFixture({
      fixture: fixtureBruto,
      equipos: equipos.map((e) => ({ id: e.id, nombre: e.nombre })),
      maxLocalesSeguidos: 2,
    });
    const fixture = ajustado.fixture;
    if (ajustado.warnings.length > 0) {
      // Loguear warnings — el caller los puede ver en logs.
      // Futuro: devolverlos en la respuesta para que el admin los vea
      // en la UI.
      console.warn(
        `[fixture-gen] tenant=${tenantId} torneo=${torneoId}: ${ajustado.warnings.length} advertencias`,
        ajustado.warnings,
      );
    }

    // Crear fechas
    const fechaInicioBase = new Date(input.fechaInicio);
    const fechaIdByNumero = new Map<number, string>();
    // Sprint 16 — RF-13: las fechas calculadas se pueden correr si caen
    // en día no jugable. Guardamos el corrimiento por fecha (numero →
    // díasOffset extra) para que los horarios de partidos también lo
    // tomen en cuenta.
    const offsetExtraPorFecha = new Map<number, number>();
    const diasNoJugablesAjustados: FixtureGenerationResult['diasNoJugablesAjustados'] = [];

    // Precalcular ventana de fechas bloqueadas en el rango que vamos a usar.
    // Pedimos +60d de margen sobre el cálculo natural para cubrir
    // corrimientos por feriados encadenados sin tener que reconsultar.
    const ultimaFechaNatural = new Date(fechaInicioBase);
    ultimaFechaNatural.setDate(
      fechaInicioBase.getDate() + (fixture.fechas - 1) * input.diasEntreFechas + 60,
    );
    const bloqueadas = await this.diasNoJugables.fechasBloqueadasEnRango(
      tenantId,
      torneoId,
      fechaInicioBase.toISOString().slice(0, 10),
      ultimaFechaNatural.toISOString().slice(0, 10),
    );

    for (let n = 1; n <= fixture.fechas; n++) {
      const fechaNatural = new Date(fechaInicioBase);
      fechaNatural.setDate(fechaInicioBase.getDate() + (n - 1) * input.diasEntreFechas);
      const fechaNaturalIso = fechaNatural.toISOString().slice(0, 10);

      // Buscar el próximo día válido dentro del límite máximo.
      let candidato = new Date(fechaNatural);
      let saltos = 0;
      while (
        bloqueadas.has(candidato.toISOString().slice(0, 10)) &&
        saltos < FixtureAdminService.MAX_SALTOS_DIA_NO_JUGABLE
      ) {
        candidato.setDate(candidato.getDate() + 1);
        saltos++;
      }
      // Si tras N saltos seguimos en día bloqueado, dejamos la natural.
      // El operador podrá moverla manualmente. Es defensa anti-loop.
      const sigueBloqueada = bloqueadas.has(candidato.toISOString().slice(0, 10));
      if (sigueBloqueada) {
        console.warn(
          `[fixture-gen] tenant=${tenantId} torneo=${torneoId} fecha=${n}: ` +
            `${FixtureAdminService.MAX_SALTOS_DIA_NO_JUGABLE} días consecutivos bloqueados ` +
            `desde ${fechaNaturalIso}. Dejando la fecha original — el admin la moverá a mano.`,
        );
      }
      const fechaInicio = sigueBloqueada ? fechaNatural : candidato;
      const fechaInicioIso = fechaInicio.toISOString().slice(0, 10);

      if (fechaInicioIso !== fechaNaturalIso) {
        const motivo = bloqueadas.get(fechaNaturalIso) ?? 'Día no jugable';
        diasNoJugablesAjustados.push({
          fechaNumero: n,
          fechaOriginal: fechaNaturalIso,
          fechaAjustada: fechaInicioIso,
          motivo,
        });
        const offsetDias = Math.round(
          (fechaInicio.getTime() - fechaNatural.getTime()) / (24 * 60 * 60 * 1000),
        );
        offsetExtraPorFecha.set(n, offsetDias);
      }

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
          fechaInicio: fechaInicioIso,
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
      // Sprint 16 — RF-13: si la fecha fue corrida por día no jugable,
      // los partidos heredan el offset para que fecha_hora coincida.
      const offsetExtra = offsetExtraPorFecha.get(p.fechaNumero) ?? 0;
      if (offsetExtra > 0) {
        baseFecha.setDate(baseFecha.getDate() + offsetExtra);
      }
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
      diasNoJugablesAjustados,
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
