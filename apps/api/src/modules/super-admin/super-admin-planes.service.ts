import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  CreatePlanRequest,
  PlanSuscripcion as PlanSuscripcionDto,
  UpdatePlanRequest,
} from '@fixtura/types';

import { PlanSuscripcion } from '../tenants/entities/plan-suscripcion.entity';

@Injectable()
export class SuperAdminPlanesService {
  constructor(
    @InjectRepository(PlanSuscripcion) private readonly repo: Repository<PlanSuscripcion>,
  ) {}

  async list(): Promise<PlanSuscripcionDto[]> {
    const items = await this.repo.find({ order: { orden: 'ASC', nombre: 'ASC' } });
    return items.map((i) => this.toDto(i));
  }

  async findOne(id: string): Promise<PlanSuscripcionDto> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Plan ${id} no encontrado.`);
    return this.toDto(p);
  }

  async create(input: CreatePlanRequest): Promise<PlanSuscripcionDto> {
    const dup = await this.repo.findOne({ where: { slug: input.slug } });
    if (dup) throw new ConflictException(`El slug "${input.slug}" ya existe.`);
    const entity = this.repo.create({
      nombre: input.nombre,
      slug: input.slug,
      precioMensualClp: input.precioMensualClp,
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
      limites: input.limites ?? {},
      features: input.features ?? {},
      descripcion: input.descripcion ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(id: string, input: UpdatePlanRequest): Promise<PlanSuscripcionDto> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Plan ${id} no encontrado.`);
    if (input.slug && input.slug !== p.slug) {
      const dup = await this.repo.findOne({ where: { slug: input.slug } });
      if (dup) throw new ConflictException(`El slug "${input.slug}" ya existe.`);
      p.slug = input.slug;
    }
    if (input.nombre !== undefined) p.nombre = input.nombre;
    if (input.precioMensualClp !== undefined) p.precioMensualClp = input.precioMensualClp;
    if (input.orden !== undefined) p.orden = input.orden;
    if (input.activo !== undefined) p.activo = input.activo;
    if (input.limites !== undefined) p.limites = input.limites;
    if (input.features !== undefined) p.features = input.features;
    if (input.descripcion !== undefined) p.descripcion = input.descripcion ?? null;
    const saved = await this.repo.save(p);
    return this.toDto(saved);
  }

  /**
   * Soft delete: marcar activo=false. NO eliminamos el plan porque puede
   * tener tenants asociados (FK ON DELETE SET NULL los desasocia, lo
   * cual rompe pricing).
   */
  async deactivate(id: string): Promise<void> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Plan ${id} no encontrado.`);
    if (!p.activo) throw new BadRequestException('El plan ya está inactivo.');
    p.activo = false;
    await this.repo.save(p);
  }

  private toDto(p: PlanSuscripcion): PlanSuscripcionDto {
    return {
      id: p.id,
      nombre: p.nombre,
      slug: p.slug,
      precioMensualClp: p.precioMensualClp,
      orden: p.orden,
      activo: p.activo,
      limites: p.limites,
      features: p.features,
      descripcion: p.descripcion,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
