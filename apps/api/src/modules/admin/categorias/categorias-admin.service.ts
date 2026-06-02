import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  CategoriaJugadores as CategoriaJugadoresDto,
  CreateCategoriaRequest,
  SerieEmbedded,
  UpdateCategoriaRequest,
} from '@fixtura/types';

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';

/**
 * CRUD de categorías de jugadores (Sprint 25).
 * Las series viven embebidas como JSONB en la propia categoría.
 */
@Injectable()
export class CategoriasAdminService {
  constructor(
    @InjectRepository(CategoriaJugadores)
    private readonly repo: Repository<CategoriaJugadores>,
  ) {}

  async list(tenantId: string): Promise<CategoriaJugadoresDto[]> {
    const items = await this.repo.find({
      where: { tenantId },
      order: { orden: 'ASC', nombre: 'ASC' },
    });
    return items.map((c) => this.toDto(c));
  }

  async findOne(id: string, tenantId: string): Promise<CategoriaJugadoresDto> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Categoría ${id} no encontrada.`);
    return this.toDto(c);
  }

  async create(
    tenantId: string,
    input: CreateCategoriaRequest,
  ): Promise<CategoriaJugadoresDto> {
    const slug = input.slug.toLowerCase().trim();
    const dup = await this.repo.findOne({ where: { tenantId, slug } });
    if (dup) {
      throw new ConflictException(
        `Ya existe una categoría con slug '${slug}'.`,
      );
    }
    if (
      input.cupoExcepcionesPorEquipo > 0 &&
      (input.edadMinimaExcepcion == null ||
        input.edadMinimaExcepcion >= input.edadMinimaGeneral)
    ) {
      throw new BadRequestException(
        'La edad mínima de excepción debe ser menor a la general cuando el cupo es > 0.',
      );
    }

    const c = this.repo.create({
      tenantId,
      slug,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      edadMinimaGeneral: input.edadMinimaGeneral,
      cupoExcepcionesPorEquipo: input.cupoExcepcionesPorEquipo,
      edadMinimaExcepcion:
        input.cupoExcepcionesPorEquipo > 0
          ? (input.edadMinimaExcepcion ?? null)
          : null,
      orden: input.orden,
      activa: input.activa,
      series: this.normalizarSeries(input.series),
    });
    try {
      const saved = await this.repo.save(c);
      return this.toDto(saved);
    } catch (err) {
      // Race condition: dos requests con mismo slug que pasaron el check
      // anterior. El UNIQUE de DB las atrapa — devolvemos 409 limpio.
      if (
        err instanceof Error &&
        (err.message.includes('uq_categoria_slug') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(
          `Ya existe una categoría con slug '${slug}'.`,
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateCategoriaRequest,
  ): Promise<CategoriaJugadoresDto> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Categoría ${id} no encontrada.`);

    if (input.nombre !== undefined) c.nombre = input.nombre.trim();
    if (input.descripcion !== undefined) {
      c.descripcion = input.descripcion?.trim() || null;
    }
    if (input.edadMinimaGeneral !== undefined) {
      c.edadMinimaGeneral = input.edadMinimaGeneral;
    }
    if (input.cupoExcepcionesPorEquipo !== undefined) {
      c.cupoExcepcionesPorEquipo = input.cupoExcepcionesPorEquipo;
    }
    if (input.edadMinimaExcepcion !== undefined) {
      c.edadMinimaExcepcion = input.edadMinimaExcepcion;
    }
    if (input.orden !== undefined) c.orden = input.orden;
    if (input.activa !== undefined) c.activa = input.activa;
    if (input.series !== undefined) {
      c.series = this.normalizarSeries(input.series);
    }

    // Validar coherencia cupo ↔ edadMinimaExcepcion DESPUÉS del merge.
    if (c.cupoExcepcionesPorEquipo > 0) {
      if (
        c.edadMinimaExcepcion == null ||
        c.edadMinimaExcepcion >= c.edadMinimaGeneral
      ) {
        throw new BadRequestException(
          'La edad mínima de excepción debe ser menor a la general cuando el cupo es > 0.',
        );
      }
    } else {
      // Si cupo = 0, normalizamos edadMinimaExcepcion a null (limpia).
      c.edadMinimaExcepcion = null;
    }

    const saved = await this.repo.save(c);
    return this.toDto(saved);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const r = await this.repo.delete({ id, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Categoría ${id} no encontrada.`);
    }
  }

  private normalizarSeries(series: SerieEmbedded[] | undefined): SerieEmbedded[] {
    if (!series) return [];
    // Sort por orden y validar slugs únicos.
    const slugs = new Set<string>();
    const out: SerieEmbedded[] = [];
    for (const s of [...series].sort((a, b) => a.orden - b.orden)) {
      const slug = s.slug.toLowerCase().trim();
      if (slugs.has(slug)) {
        throw new BadRequestException(`Serie con slug duplicado: ${slug}`);
      }
      slugs.add(slug);
      out.push({
        slug,
        nombre: s.nombre.trim(),
        orden: s.orden,
        activa: s.activa,
      });
    }
    return out;
  }

  private toDto(c: CategoriaJugadores): CategoriaJugadoresDto {
    return {
      id: c.id,
      tenantId: c.tenantId,
      slug: c.slug,
      nombre: c.nombre,
      descripcion: c.descripcion,
      edadMinimaGeneral: c.edadMinimaGeneral,
      cupoExcepcionesPorEquipo: c.cupoExcepcionesPorEquipo,
      edadMinimaExcepcion: c.edadMinimaExcepcion,
      orden: c.orden,
      activa: c.activa,
      series: Array.isArray(c.series) ? c.series : [],
      createdAt: c.createdAt.toISOString(),
    };
  }
}
