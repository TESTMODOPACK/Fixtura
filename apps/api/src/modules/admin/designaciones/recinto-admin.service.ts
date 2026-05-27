import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import type {
  DesignacionRecinto as DesignacionRecintoDto,
  EstadoDesignacion,
} from '@fixtura/types';

import { DesignacionRecinto } from '../../competition/entities/designacion-recinto.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import type { AsignarRecintoDto } from './dto';

/**
 * Servicio para designaciones de RECINTO: paramédicos y personal de
 * servicio que cubren toda una jornada (no un partido individual).
 *
 * El catálogo de personal sigue siendo el mismo (tabla `personal`), pero
 * estas designaciones se asocian a una `fecha` en vez de un `partido`.
 */
@Injectable()
export class RecintoAdminService {
  constructor(
    @InjectRepository(DesignacionRecinto)
    private readonly repo: Repository<DesignacionRecinto>,
    @InjectRepository(Personal)
    private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Fecha) private readonly fechaRepo: Repository<Fecha>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
  ) {}

  async listPorFecha(
    torneoId: string,
    fechaId: string,
    tenantId: string,
  ): Promise<DesignacionRecintoDto[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    const items = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.personal', 'personal')
      .where('d.fecha_id = :fechaId', { fechaId })
      .andWhere('d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.rol_asignado', 'ASC')
      .addOrderBy('d.cancha_nombre', 'ASC', 'NULLS FIRST')
      .addOrderBy('d.created_at', 'ASC')
      .getMany();

    return items.map((d) => this.toDto(d, fecha.numero));
  }

  async asignar(
    tenantId: string,
    input: AsignarRecintoDto,
  ): Promise<DesignacionRecintoDto> {
    const fecha = await this.fechaRepo.findOne({
      where: { id: input.fechaId, tenantId },
    });
    if (!fecha) throw new NotFoundException(`Fecha ${input.fechaId} no encontrada`);

    const personal = await this.personalRepo.findOne({
      where: { id: input.personalId, tenantId },
    });
    if (!personal) throw new NotFoundException(`Personal ${input.personalId} no encontrado`);
    if (!personal.activo) {
      throw new BadRequestException('No se puede designar personal inactivo');
    }
    // El rol del personal debe ser PARAMEDICO o OTRO para recinto.
    // Si la liga quiere usar uno con otro rol base, lo asignamos igual
    // (la designación específica es la que manda) — solo advertimos en
    // el frontend.

    // UNIQUE (fecha_id, personal_id, rol_asignado, cancha_nombre).
    // TypeORM no acepta null directo en where; usamos IsNull() o el string.
    const canchaQuery = input.canchaNombre?.trim() || null;
    const existente = await this.repo.findOne({
      where: {
        fechaId: input.fechaId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
        canchaNombre: canchaQuery === null ? IsNull() : canchaQuery,
      },
    });
    if (existente) {
      throw new ConflictException(
        'Esa persona ya está designada al recinto en esa fecha y cancha con el mismo rol',
      );
    }

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        fechaId: input.fechaId,
        personalId: input.personalId,
        rolAsignado: input.rolAsignado,
        canchaNombre: input.canchaNombre?.trim() || null,
        estado: 'PROPUESTA',
        montoPago: input.montoPago ?? personal.tarifaBase ?? null,
        notas: input.notas ?? null,
      }),
    );

    return this.findOne(created.id, tenantId, fecha.numero);
  }

  async updateEstado(
    id: string,
    tenantId: string,
    estado: EstadoDesignacion,
  ): Promise<DesignacionRecintoDto> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación recinto ${id} no encontrada`);
    d.estado = estado;
    if (estado === 'CONFIRMADA' && !d.confirmadoAt) {
      d.confirmadoAt = new Date();
    }
    await this.repo.save(d);
    const fecha = await this.fechaRepo.findOne({ where: { id: d.fechaId } });
    return this.findOne(d.id, tenantId, fecha?.numero ?? 0);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Designación recinto ${id} no encontrada`);
    await this.repo.remove(d);
  }

  // ─── Helpers ────────────────────────────────────────────────────────
  private async ensureTorneo(torneoId: string, tenantId: string): Promise<void> {
    const t = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
  }

  private async findOne(
    id: string,
    tenantId: string,
    fechaNumero: number,
  ): Promise<DesignacionRecintoDto> {
    const d = await this.repo.findOne({
      where: { id, tenantId },
      relations: { personal: true },
    });
    if (!d) throw new NotFoundException(`Designación ${id} no encontrada`);
    return this.toDto(d, fechaNumero);
  }

  private toDto(d: DesignacionRecinto, fechaNumero: number): DesignacionRecintoDto {
    return {
      id: d.id,
      fechaId: d.fechaId,
      fechaNumero,
      personalId: d.personalId,
      personalNombre: d.personal?.nombre ?? '',
      personalApellido: d.personal?.apellido ?? '',
      personalRolBase: d.personal?.rol ?? d.rolAsignado,
      rolAsignado: d.rolAsignado,
      canchaNombre: d.canchaNombre,
      estado: d.estado,
      montoPago: d.montoPago,
      confirmadoAt: d.confirmadoAt ? d.confirmadoAt.toISOString() : null,
      notas: d.notas,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
