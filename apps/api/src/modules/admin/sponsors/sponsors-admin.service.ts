import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { SponsorAdmin } from '@fixtura/types';

import { Sponsor } from '../../competition/entities/sponsor.entity';
import type { CreateSponsorDto, UpdateSponsorDto } from './dto';

@Injectable()
export class SponsorsAdminService {
  constructor(
    @InjectRepository(Sponsor) private readonly repo: Repository<Sponsor>,
  ) {}

  async list(tenantId: string, posicion?: string): Promise<SponsorAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.prioridad', 'DESC')
      .addOrderBy('s.created_at', 'DESC');
    if (posicion) {
      qb.andWhere('s.posicion = :posicion', { posicion });
    }
    const items = await qb.getMany();
    return items.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<SponsorAdmin> {
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Sponsor ${id} no encontrado`);
    return this.toDto(s);
  }

  async create(tenantId: string, input: CreateSponsorDto): Promise<SponsorAdmin> {
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      imagenUrl: input.imagenUrl,
      linkUrl: input.linkUrl?.trim() || null,
      posicion: input.posicion,
      prioridad: input.prioridad ?? 0,
      vigenteDesde: input.vigenteDesde || null,
      vigenteHasta: input.vigenteHasta || null,
      notas: input.notas?.trim() || null,
      activo: true,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateSponsorDto,
  ): Promise<SponsorAdmin> {
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Sponsor ${id} no encontrado`);

    if (input.nombre !== undefined) s.nombre = input.nombre;
    if (input.imagenUrl !== undefined) s.imagenUrl = input.imagenUrl;
    if (input.linkUrl !== undefined) s.linkUrl = input.linkUrl?.trim() || null;
    if (input.posicion !== undefined) s.posicion = input.posicion;
    if (input.prioridad !== undefined) s.prioridad = input.prioridad;
    if (input.vigenteDesde !== undefined) s.vigenteDesde = input.vigenteDesde || null;
    if (input.vigenteHasta !== undefined) s.vigenteHasta = input.vigenteHasta || null;
    if (input.activo !== undefined) s.activo = input.activo;
    if (input.notas !== undefined) s.notas = input.notas?.trim() || null;

    const saved = await this.repo.save(s);
    return this.toDto(saved);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const s = await this.repo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Sponsor ${id} no encontrado`);
    await this.repo.remove(s);
  }

  private toDto(s: Sponsor): SponsorAdmin {
    return {
      id: s.id,
      nombre: s.nombre,
      imagenUrl: s.imagenUrl,
      linkUrl: s.linkUrl,
      posicion: s.posicion,
      prioridad: s.prioridad,
      vigenteDesde: s.vigenteDesde,
      vigenteHasta: s.vigenteHasta,
      activo: s.activo,
      impresionesCount: s.impresionesCount,
      clicksCount: s.clicksCount,
      notas: s.notas,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
