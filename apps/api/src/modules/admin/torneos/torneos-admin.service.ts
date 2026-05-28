import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateTorneoRequest, TorneoAdmin, UpdateTorneoRequest } from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Temporada } from '../../competition/entities/temporada.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

@Injectable()
export class TorneosAdminService {
  constructor(
    @InjectRepository(Torneo) private readonly repo: Repository<Torneo>,
    @InjectRepository(Temporada) private readonly temporadaRepo: Repository<Temporada>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
  ) {}

  async list(tenantId: string): Promise<TorneoAdmin[]> {
    const torneos = await this.repo.find({
      where: { tenantId },
      relations: { temporada: true },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(torneos.map((t) => this.toDto(t)));
  }

  async findOne(id: string, tenantId: string): Promise<TorneoAdmin> {
    const t = await this.repo.findOne({
      where: { id, tenantId },
      relations: { temporada: true },
    });
    if (!t) throw new NotFoundException(`Torneo ${id} no encontrado`);
    return this.toDto(t);
  }

  async create(tenantId: string, input: CreateTorneoRequest): Promise<TorneoAdmin> {
    // Validar que la temporada existe en este tenant (RLS lo respalda
    // pero damos error claro al cliente).
    const temporada = await this.temporadaRepo.findOne({
      where: { id: input.temporadaId, tenantId },
    });
    if (!temporada) {
      throw new NotFoundException(`Temporada ${input.temporadaId} no encontrada`);
    }

    // Unique (tenant, slug)
    const dup = await this.repo.findOne({ where: { tenantId, slug: input.slug } });
    if (dup) {
      throw new ConflictException(`Ya existe un torneo con slug "${input.slug}"`);
    }

    const t = this.repo.create({
      tenantId,
      temporadaId: input.temporadaId,
      nombre: input.nombre,
      slug: input.slug,
      tipoFormato: input.tipoFormato,
      ruedas: input.ruedas,
      puntosVictoria: input.puntosVictoria,
      puntosEmpate: input.puntosEmpate,
      puntosDerrota: input.puntosDerrota,
      tablaTiebreakers: input.tablaTiebreakers ?? ['pts', 'dg', 'gf', 'nombre'],
      estado: 'DRAFT',
      fechaInicio: input.fechaInicio ?? null,
      fechaFin: input.fechaFin ?? null,
      reglamentoUrl: input.reglamentoUrl ?? null,
    });
    const saved = await this.repo.save(t);
    return this.findOne(saved.id, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateTorneoRequest,
  ): Promise<TorneoAdmin> {
    const existing = await this.repo.findOne({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Torneo ${id} no encontrado`);

    if (input.slug && input.slug !== existing.slug) {
      const dup = await this.repo.findOne({ where: { tenantId, slug: input.slug } });
      if (dup) throw new ConflictException(`Slug "${input.slug}" ya está en uso`);
    }

    Object.assign(existing, {
      ...(input.nombre !== undefined && { nombre: input.nombre }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.tipoFormato !== undefined && { tipoFormato: input.tipoFormato }),
      ...(input.ruedas !== undefined && { ruedas: input.ruedas }),
      ...(input.puntosVictoria !== undefined && { puntosVictoria: input.puntosVictoria }),
      ...(input.puntosEmpate !== undefined && { puntosEmpate: input.puntosEmpate }),
      ...(input.puntosDerrota !== undefined && { puntosDerrota: input.puntosDerrota }),
      ...(input.estado !== undefined && { estado: input.estado }),
      ...(input.fechaInicio !== undefined && { fechaInicio: input.fechaInicio }),
      ...(input.fechaFin !== undefined && { fechaFin: input.fechaFin }),
      ...(input.reglamentoUrl !== undefined && { reglamentoUrl: input.reglamentoUrl }),
      ...(input.tablaTiebreakers !== undefined && {
        tablaTiebreakers: input.tablaTiebreakers,
      }),
    });
    await this.repo.save(existing);
    return this.findOne(id, tenantId);
  }

  private async toDto(t: Torneo): Promise<TorneoAdmin> {
    const [equiposCount, fechasCount] = await Promise.all([
      this.equipoRepo.count({ where: { torneoId: t.id } }),
      this.fechaRepo.count({ where: { torneoId: t.id } }),
    ]);

    return {
      id: t.id,
      temporadaId: t.temporadaId,
      temporadaNombre: t.temporada?.nombre ?? '',
      nombre: t.nombre,
      slug: t.slug,
      tipoFormato: t.tipoFormato,
      ruedas: t.ruedas,
      puntosVictoria: t.puntosVictoria,
      puntosEmpate: t.puntosEmpate,
      puntosDerrota: t.puntosDerrota,
      tablaTiebreakers:
        Array.isArray(t.tablaTiebreakers) && t.tablaTiebreakers.length > 0
          ? t.tablaTiebreakers
          : ['pts', 'dg', 'gf', 'nombre'],
      estado: t.estado,
      fechaInicio: t.fechaInicio,
      fechaFin: t.fechaFin,
      reglamentoUrl: t.reglamentoUrl,
      equiposCount,
      fechasCount,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
