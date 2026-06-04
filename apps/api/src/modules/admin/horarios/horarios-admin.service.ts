import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  CreateHorarioTorneoRequest,
  HorarioTorneo as HorarioDto,
  UpdateHorarioTorneoRequest,
} from '@fixtura/types';

import { Cancha } from '../../competition/entities/cancha.entity';
import { HorarioTorneo } from '../../competition/entities/horario-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

/**
 * Sprint 39 — CRUD de la plantilla de horarios del torneo.
 */
@Injectable()
export class HorariosAdminService {
  constructor(
    @InjectRepository(HorarioTorneo)
    private readonly repo: Repository<HorarioTorneo>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
    @InjectRepository(Cancha) private readonly canchaRepo: Repository<Cancha>,
  ) {}

  async list(torneoId: string, tenantId: string): Promise<HorarioDto[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const rows = await this.repo.find({
      where: { torneoId, tenantId },
      relations: { cancha: true },
      order: { diaSemana: 'ASC', hora: 'ASC', orden: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    torneoId: string,
    tenantId: string,
    input: CreateHorarioTorneoRequest,
  ): Promise<HorarioDto> {
    await this.ensureTorneo(torneoId, tenantId);
    if (input.canchaId) await this.ensureCancha(input.canchaId, tenantId);

    const horaPg = this.normalizarHora(input.hora);
    const entity = this.repo.create({
      tenantId,
      torneoId,
      diaSemana: input.diaSemana,
      hora: horaPg,
      canchaId: input.canchaId,
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
    });
    try {
      const saved = await this.repo.save(entity);
      const conRel = await this.repo.findOne({
        where: { id: saved.id, tenantId },
        relations: { cancha: true },
      });
      return this.toDto(conRel!);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('uq_horario_slot') ||
          err.message.includes('duplicate key'))
      ) {
        throw new BadRequestException(
          'Ese slot (día + hora + cancha) ya está cargado en este torneo.',
        );
      }
      throw err;
    }
  }

  async update(
    horarioId: string,
    tenantId: string,
    input: UpdateHorarioTorneoRequest,
  ): Promise<HorarioDto> {
    const existing = await this.repo.findOne({
      where: { id: horarioId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException(`Horario ${horarioId} no encontrado.`);
    }
    if (input.canchaId !== undefined && input.canchaId !== null) {
      await this.ensureCancha(input.canchaId, tenantId);
    }
    if (input.diaSemana !== undefined) existing.diaSemana = input.diaSemana;
    if (input.hora !== undefined) existing.hora = this.normalizarHora(input.hora);
    if (input.canchaId !== undefined) existing.canchaId = input.canchaId;
    if (input.orden !== undefined) existing.orden = input.orden;
    if (input.activo !== undefined) existing.activo = input.activo;

    try {
      await this.repo.save(existing);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('uq_horario_slot') ||
          err.message.includes('duplicate key'))
      ) {
        throw new BadRequestException(
          'Ese slot (día + hora + cancha) ya está cargado en este torneo.',
        );
      }
      throw err;
    }
    const conRel = await this.repo.findOne({
      where: { id: horarioId, tenantId },
      relations: { cancha: true },
    });
    return this.toDto(conRel!);
  }

  async remove(horarioId: string, tenantId: string): Promise<void> {
    const r = await this.repo.delete({ id: horarioId, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Horario ${horarioId} no encontrado.`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async ensureTorneo(torneoId: string, tenantId: string): Promise<Torneo> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado.`);
    return t;
  }

  private async ensureCancha(canchaId: string, tenantId: string): Promise<void> {
    const c = await this.canchaRepo.findOne({ where: { id: canchaId, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${canchaId} no encontrada.`);
  }

  /** HH:MM → HH:MM:00 para Postgres TIME. */
  private normalizarHora(hora: string): string {
    return hora.length === 5 ? `${hora}:00` : hora;
  }

  private toDto(h: HorarioTorneo): HorarioDto {
    // Postgres TIME se serializa como "HH:MM:SS" — devolvemos HH:MM al cliente.
    const horaHHMM = h.hora.length >= 5 ? h.hora.slice(0, 5) : h.hora;
    return {
      id: h.id,
      tenantId: h.tenantId,
      torneoId: h.torneoId,
      diaSemana: h.diaSemana,
      hora: horaHHMM,
      canchaId: h.canchaId,
      canchaNombre: h.cancha?.nombre ?? null,
      orden: h.orden,
      activo: h.activo,
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    };
  }
}
