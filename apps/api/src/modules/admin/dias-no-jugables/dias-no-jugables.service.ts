import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { DiaNoJugable, FeriadoChile } from '@fixtura/types';

import { DiaNoJugable as DiaEntity } from '../../competition/entities/dia-no-jugable.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import type { BulkCreateDiasNoJugablesDto, CreateDiaNoJugableDto } from './dto';
import { getFeriadosFijosChile } from './feriados-chile';

@Injectable()
export class DiasNoJugablesService {
  constructor(
    @InjectRepository(DiaEntity) private readonly repo: Repository<DiaEntity>,
    @InjectRepository(Torneo) private readonly torneoRepo: Repository<Torneo>,
  ) {}

  /**
   * Lista días no jugables del tenant. Si se pasa torneoId, devuelve
   * los GLOBALES + los específicos de ese torneo. Sin filtro: solo
   * los GLOBALES + los de cualquier torneo del tenant.
   */
  async list(tenantId: string, torneoId?: string): Promise<DiaNoJugable[]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.torneo', 't')
      .where('d.tenant_id = :tenantId', { tenantId });

    if (torneoId) {
      qb.andWhere(`(d.scope = 'GLOBAL' OR d.torneo_id = :torneoId)`, { torneoId });
    }

    qb.orderBy('d.fecha', 'ASC');
    const rows = await qb.getMany();
    return rows.map((d) => this.toDto(d));
  }

  async create(
    tenantId: string,
    actorUserId: string | null,
    input: CreateDiaNoJugableDto,
  ): Promise<DiaNoJugable> {
    const scope = input.scope ?? 'GLOBAL';
    if (scope === 'TORNEO') {
      if (!input.torneoId) {
        throw new BadRequestException('Si scope=TORNEO, torneoId es obligatorio.');
      }
      const torneo = await this.torneoRepo.findOne({
        where: { id: input.torneoId, tenantId },
      });
      if (!torneo) throw new NotFoundException(`Torneo ${input.torneoId} no encontrado.`);
    }

    await this.validarNoDuplicado(tenantId, scope, input.torneoId ?? null, input.fecha);

    const entity = this.repo.create({
      tenantId,
      fecha: input.fecha,
      scope,
      torneoId: scope === 'TORNEO' ? input.torneoId! : null,
      motivo: input.motivo.trim(),
      origen: input.origen ?? 'MANUAL',
      createdBy: actorUserId,
    });
    const saved = await this.repo.save(entity);
    return this.findOne(saved.id, tenantId);
  }

  /**
   * Carga en lote. Útil para importar feriados del año entero de un
   * golpe. Salta los duplicados (no falla el batch). Devuelve cuántos
   * creó vs cuántos saltó.
   */
  async bulkCreate(
    tenantId: string,
    actorUserId: string | null,
    input: BulkCreateDiasNoJugablesDto,
  ): Promise<{ creados: number; saltados: number; items: DiaNoJugable[] }> {
    const creados: DiaNoJugable[] = [];
    let saltados = 0;

    for (const d of input.dias) {
      try {
        const item = await this.create(tenantId, actorUserId, d);
        creados.push(item);
      } catch (err) {
        if (err instanceof ConflictException) {
          saltados++;
          continue;
        }
        throw err;
      }
    }
    return { creados: creados.length, saltados, items: creados };
  }

  async findOne(id: string, tenantId: string): Promise<DiaNoJugable> {
    const d = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.torneo', 't')
      .where('d.id = :id AND d.tenant_id = :tenantId', { id, tenantId })
      .getOne();
    if (!d) throw new NotFoundException(`Día no jugable ${id} no encontrado.`);
    return this.toDto(d);
  }

  async eliminar(id: string, tenantId: string): Promise<void> {
    const d = await this.repo.findOne({ where: { id, tenantId } });
    if (!d) throw new NotFoundException(`Día no jugable ${id} no encontrado.`);
    await this.repo.delete(id);
  }

  /**
   * Helper para uso interno (fixture generator + validación update).
   * Devuelve `true` si la fecha (YYYY-MM-DD) está bloqueada para el
   * torneo indicado. Considera tanto GLOBAL como TORNEO específico.
   */
  async estaBloqueada(
    tenantId: string,
    fecha: string,
    torneoId: string,
  ): Promise<{ bloqueada: boolean; motivo: string | null }> {
    const row = await this.repo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.fecha = :fecha', { fecha })
      .andWhere(`(d.scope = 'GLOBAL' OR d.torneo_id = :torneoId)`, { torneoId })
      .orderBy(`CASE WHEN d.scope = 'TORNEO' THEN 0 ELSE 1 END`)
      .getOne();
    return { bloqueada: !!row, motivo: row?.motivo ?? null };
  }

  /**
   * Devuelve el set de fechas (YYYY-MM-DD) bloqueadas para el torneo
   * en un rango. Útil para que el fixture generator consulte una sola
   * vez y resuelva en memoria.
   */
  async fechasBloqueadasEnRango(
    tenantId: string,
    torneoId: string,
    desde: string,
    hasta: string,
  ): Promise<Map<string, string>> {
    const rows = await this.repo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.fecha >= :desde AND d.fecha <= :hasta', { desde, hasta })
      .andWhere(`(d.scope = 'GLOBAL' OR d.torneo_id = :torneoId)`, { torneoId })
      .getMany();
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!m.has(r.fecha)) m.set(r.fecha, r.motivo);
    }
    return m;
  }

  /**
   * Endpoint utilitario: devuelve los feriados con fecha fija del año.
   * El admin los puede importar al calendario con un POST /bulk.
   */
  getFeriadosChile(anio: number): FeriadoChile[] {
    if (anio < 2000 || anio > 2100) {
      throw new BadRequestException('Año fuera de rango (2000-2100).');
    }
    return getFeriadosFijosChile(anio);
  }

  private async validarNoDuplicado(
    tenantId: string,
    scope: 'GLOBAL' | 'TORNEO',
    torneoId: string | null,
    fecha: string,
  ): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.fecha = :fecha', { fecha })
      .andWhere('d.scope = :scope', { scope });
    if (scope === 'TORNEO') {
      qb.andWhere('d.torneo_id = :torneoId', { torneoId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe un día no jugable para ${fecha} (${scope}). Elimínalo primero si quieres cambiar el motivo.`,
      );
    }
  }

  private toDto(d: DiaEntity): DiaNoJugable {
    return {
      id: d.id,
      tenantId: d.tenantId,
      fecha: d.fecha,
      scope: d.scope,
      torneoId: d.torneoId,
      torneoNombre: d.torneo?.nombre ?? null,
      motivo: d.motivo,
      origen: d.origen,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
