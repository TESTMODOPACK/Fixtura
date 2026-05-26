import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  DesignacionAdmin,
  DesignacionesPorFecha,
  EstadoDesignacion,
  RolPersonal,
} from '@fixtura/types';

import { Designacion } from '../../competition/entities/designacion.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import type {
  AsignarDesignacionDto,
  UpdateDesignacionEstadoDto,
} from './dto';

const ROLES_ARBITRAJE: ReadonlyArray<RolPersonal> = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
];

/**
 * Margen en horas para considerar "mismo bloque" en doble booking.
 * Dos partidos con hora distinta pero a menos de 2h del personal asignado
 * se marca conflicto.
 */
const DOBLE_BOOKING_HORAS = 2;

@Injectable()
export class DesignacionesAdminService {
  constructor(
    @InjectRepository(Designacion) private readonly repo: Repository<Designacion>,
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
  ) {}

  /**
   * Vista por fecha: lista todos los partidos de la fecha con sus
   * designaciones agrupadas. Incluye análisis de conflictos.
   */
  async listPorFecha(
    torneoId: string,
    fechaId: string,
    tenantId: string,
  ): Promise<DesignacionesPorFecha> {
    await this.ensureTorneo(torneoId, tenantId);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.equipoLocal', 'local')
      .leftJoinAndSelect('p.equipoVisita', 'visita')
      .where('p.fecha_id = :fechaId', { fechaId })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.fecha_hora', 'ASC', 'NULLS LAST')
      .getMany();

    if (partidos.length === 0) {
      return {
        fechaId: fecha.id,
        fechaNumero: fecha.numero,
        fechaEtiqueta: fecha.etiqueta,
        partidos: [],
      };
    }

    const partidoIds = partidos.map((p) => p.id);
    const designaciones = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.personal', 'personal')
      .where('d.partido_id IN (:...partidoIds)', { partidoIds })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .getMany();

    // Index para detectar doble booking. Antes solo cruzábamos partidos
    // de ESTA fecha; ahora cargamos también las designaciones de los
    // mismos personal en OTROS partidos del tenant para detectar
    // solapamientos cross-fecha (ej. un árbitro asignado a fecha 3 a
    // las 18:00 y a un partido de la fecha 4 también a las 18:00 del
    // mismo día calendario).
    const personalIdsInvolucrados = Array.from(new Set(designaciones.map((d) => d.personalId)));
    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();

    if (personalIdsInvolucrados.length > 0) {
      const cruceRaw = await this.repo
        .createQueryBuilder('d2')
        .leftJoin('d2.partido', 'partido')
        .where('d2.personal_id IN (:...personalIds)', {
          personalIds: personalIdsInvolucrados,
        })
        .andWhere('d2.tenant_id = :tenantId', { tenantId })
        .select([
          'd2.personal_id AS "personalId"',
          'd2.partido_id AS "partidoId"',
          'partido.fecha_hora AS "fechaHora"',
        ])
        .getRawMany<{ personalId: string; partidoId: string; fechaHora: string | null }>();

      for (const row of cruceRaw) {
        const arr = porPersonal.get(row.personalId) ?? [];
        arr.push({
          partidoId: row.partidoId,
          fechaHora: row.fechaHora ? new Date(row.fechaHora) : null,
        });
        porPersonal.set(row.personalId, arr);
      }
    }

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;

    const partidosOut = partidos.map((p) => {
      const desigsDelPartido = designaciones
        .filter((d) => d.partidoId === p.id)
        .map((d) => this.toDto(d, p, porPersonal, hoy, treintaDias));

      return {
        partidoId: p.id,
        equipoLocalNombre: p.equipoLocal?.nombre ?? '',
        equipoVisitaNombre: p.equipoVisita?.nombre ?? '',
        fechaHora: p.fechaHora ? p.fechaHora.toISOString() : null,
        canchaNombre: p.canchaNombre,
        designaciones: desigsDelPartido,
      };
    });

    return {
      fechaId: fecha.id,
      fechaNumero: fecha.numero,
      fechaEtiqueta: fecha.etiqueta,
      partidos: partidosOut,
    };
  }

  async listPorPartido(
    partidoId: string,
    tenantId: string,
  ): Promise<DesignacionAdmin[]> {
    const partido = await this.partidoRepo.findOne({
      where: { id: partidoId, tenantId },
    });
    if (!partido) throw new NotFoundException(`Partido ${partidoId} no encontrado`);

    const designaciones = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.personal', 'personal')
      .where('d.partido_id = :partidoId', { partidoId })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .getMany();

    // Para análisis de doble booking necesitamos el resto de designaciones
    // del personal en partidos a la misma fecha/hora cercana.
    const personalIds = designaciones.map((d) => d.personalId);
    const otras = personalIds.length
      ? await this.repo
          .createQueryBuilder('d')
          .leftJoin('d.partido', 'partido')
          .where('d.personal_id IN (:...personalIds)', { personalIds })
          .andWhere('d.tenant_id = :tenantId', { tenantId })
          .andWhere('d.partido_id <> :partidoId', { partidoId })
          .select(['d.id', 'd.personalId', 'd.partidoId', 'partido.fechaHora'])
          .getRawMany()
      : [];

    // Map: personalId → lista de { partidoId, fechaHora }. Combina las
    // designaciones del personal en OTROS partidos + las de este partido
    // (toDto compara cada designación contra el resto excluyendo la propia).
    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();
    for (const row of otras) {
      const pid = row.d_personalId as string;
      const arr = porPersonal.get(pid) ?? [];
      arr.push({
        partidoId: row.d_partidoId as string,
        fechaHora: row.partido_fechaHora ? new Date(row.partido_fechaHora as string) : null,
      });
      porPersonal.set(pid, arr);
    }
    for (const d of designaciones) {
      const arr = porPersonal.get(d.personalId) ?? [];
      arr.push({ partidoId: partido.id, fechaHora: partido.fechaHora });
      porPersonal.set(d.personalId, arr);
    }

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;

    return designaciones.map((d) => this.toDto(d, partido, porPersonal, hoy, treintaDias));
  }

  async asignar(
    tenantId: string,
    input: AsignarDesignacionDto,
  ): Promise<DesignacionAdmin> {
    const partido = await this.partidoRepo.findOne({
      where: { id: input.partidoId, tenantId },
    });
    if (!partido) throw new NotFoundException(`Partido ${input.partidoId} no encontrado`);

    const personal = await this.personalRepo.findOne({
      where: { id: input.personalId, tenantId },
    });
    if (!personal) throw new NotFoundException(`Personal ${input.personalId} no encontrado`);
    if (!personal.activo) {
      throw new BadRequestException('No se puede designar personal inactivo');
    }

    // UNIQUE (partido_id, personal_id, rol_asignado) — chequeo previo
    const existente = await this.repo.findOne({
      where: {
        partidoId: input.partidoId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
      },
    });
    if (existente) {
      throw new ConflictException(
        'Esa persona ya está designada en ese partido con el mismo rol',
      );
    }

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        partidoId: input.partidoId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
        estado: 'PROPUESTA',
        montoPago: input.montoPago ?? personal.tarifaBase ?? null,
        notas: input.notas ?? null,
      }),
    );

    return this.findOne(created.id, tenantId);
  }

  async findOne(id: string, tenantId: string): Promise<DesignacionAdmin> {
    const d = await this.repo.findOne({
      where: { id, tenantId },
      relations: { personal: true, partido: true },
    });
    if (!d || !d.partido) throw new NotFoundException(`Designación ${id} no encontrada`);

    // Para una sola designación, computamos sus warnings comparando con el
    // resto de designaciones de ese personal.
    const otras = await this.repo
      .createQueryBuilder('d2')
      .leftJoin('d2.partido', 'partido')
      .where('d2.personal_id = :personalId', { personalId: d.personalId })
      .andWhere('d2.tenant_id = :tenantId', { tenantId })
      .select(['d2.id', 'd2.partidoId', 'partido.fechaHora'])
      .getRawMany();

    const porPersonal = new Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>();
    porPersonal.set(
      d.personalId,
      otras.map((r) => ({
        partidoId: r.d2_partidoId as string,
        fechaHora: r.partido_fechaHora ? new Date(r.partido_fechaHora as string) : null,
      })),
    );

    const hoy = new Date();
    const treintaDias = 30 * 24 * 60 * 60 * 1000;
    return this.toDto(d, d.partido, porPersonal, hoy, treintaDias);
  }

  async updateEstado(
    id: string,
    tenantId: string,
    input: UpdateDesignacionEstadoDto,
  ): Promise<DesignacionAdmin> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación ${id} no encontrada`);
    d.estado = input.estado;
    if (input.estado === 'CONFIRMADA' && !d.confirmadoAt) {
      d.confirmadoAt = new Date();
    }
    await this.repo.save(d);
    return this.findOne(d.id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación ${id} no encontrada`);
    await this.repo.remove(d);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<void> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
  }

  private toDto(
    d: Designacion,
    partido: Partido,
    porPersonal: Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>,
    hoy: Date,
    treintaDiasMs: number,
  ): DesignacionAdmin {
    const conflictoDobleBooking = this.checkDobleBooking(
      d.personalId,
      partido.id,
      partido.fechaHora,
      porPersonal,
    );

    const carnetAnfaWarning = this.checkCarnetWarning(
      d.rolAsignado,
      d.personal?.carnetAnfaVence ?? null,
      hoy,
      treintaDiasMs,
    );

    return {
      id: d.id,
      partidoId: d.partidoId,
      personalId: d.personalId,
      personalNombre: d.personal?.nombre ?? '',
      personalApellido: d.personal?.apellido ?? '',
      personalRolBase: d.personal?.rol ?? d.rolAsignado,
      carnetAnfaVence: d.personal?.carnetAnfaVence ?? null,
      rolAsignado: d.rolAsignado,
      estado: d.estado as EstadoDesignacion,
      montoPago: d.montoPago,
      confirmadoAt: d.confirmadoAt ? d.confirmadoAt.toISOString() : null,
      notas: d.notas,
      conflictoDobleBooking,
      carnetAnfaWarning,
      createdAt: d.createdAt.toISOString(),
    };
  }

  /**
   * Doble booking: el mismo personal asignado a >1 partido cuya
   * fecha_hora está dentro de DOBLE_BOOKING_HORAS de diferencia.
   * Si alguno no tiene fecha_hora, no podemos decidir → no marcamos.
   */
  private checkDobleBooking(
    personalId: string,
    partidoId: string,
    fechaHora: Date | null,
    porPersonal: Map<string, Array<{ partidoId: string; fechaHora: Date | null }>>,
  ): boolean {
    if (!fechaHora) return false;
    const lista = porPersonal.get(personalId) ?? [];
    const margenMs = DOBLE_BOOKING_HORAS * 60 * 60 * 1000;
    for (const otro of lista) {
      if (otro.partidoId === partidoId) continue;
      if (!otro.fechaHora) continue;
      const diff = Math.abs(otro.fechaHora.getTime() - fechaHora.getTime());
      if (diff < margenMs) return true;
    }
    return false;
  }

  private checkCarnetWarning(
    rol: RolPersonal,
    vence: string | null,
    hoy: Date,
    treintaDiasMs: number,
  ): 'VENCIDO' | 'POR_VENCER' | 'OK' | 'NO_APLICA' {
    if (!ROLES_ARBITRAJE.includes(rol)) return 'NO_APLICA';
    if (!vence) return 'NO_APLICA';
    const venceDate = new Date(vence);
    if (Number.isNaN(venceDate.getTime())) return 'NO_APLICA';
    const diff = venceDate.getTime() - hoy.getTime();
    if (diff < 0) return 'VENCIDO';
    if (diff < treintaDiasMs) return 'POR_VENCER';
    return 'OK';
  }
}
