import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { TarifaTorneo as TarifaTorneoDto } from '@fixtura/types';

import { TarifaTorneo } from '../../competition/entities/tarifa-torneo.entity';
import { Torneo } from '../../competition/entities/torneo.entity';

import type { CreateTarifaDto, UpdateTarifaDto } from './dto';

/**
 * Sprint 34B — CRUD del tarifario configurable por torneo.
 *
 * Reglas de negocio:
 *   - Solo una tarifa por (torneo, tipo) — la DB lo enforza con UNIQUE.
 *   - CUOTA recurrente (frecuencia ≠ UNICO) requiere `diaVencimiento`.
 *     SEMANAL: 1=lunes..7=domingo. MENSUAL/ANUAL: 1..31.
 *   - Cualquier tipo distinto de CUOTA debe quedar con frecuencia=UNICO.
 *   - Eliminar una tarifa NO toca los cobros previos generados con ella
 *     (cobros.tarifa_id queda SET NULL por la FK).
 */
@Injectable()
export class TarifasAdminService {
  constructor(
    @InjectRepository(TarifaTorneo)
    private readonly tarifaRepo: Repository<TarifaTorneo>,
    @InjectRepository(Torneo)
    private readonly torneoRepo: Repository<Torneo>,
  ) {}

  async list(torneoId: string, tenantId: string): Promise<TarifaTorneoDto[]> {
    await this.ensureTorneo(torneoId, tenantId);
    const items = await this.tarifaRepo.find({
      where: { torneoId, tenantId },
      order: { tipo: 'ASC' },
    });
    return items.map(this.toDto);
  }

  async create(
    torneoId: string,
    tenantId: string,
    input: CreateTarifaDto,
  ): Promise<TarifaTorneoDto> {
    await this.ensureTorneo(torneoId, tenantId);

    const frecuencia = input.frecuencia ?? 'UNICO';
    this.validarReglas(input.tipo, frecuencia, input.diaVencimiento ?? null);

    // Check explícito de duplicado para devolver mensaje claro en vez
    // de un 500 por la UNIQUE constraint.
    const yaExiste = await this.tarifaRepo.findOne({
      where: { torneoId, tipo: input.tipo },
    });
    if (yaExiste) {
      throw new ConflictException(
        `Ya hay una tarifa de tipo "${input.tipo}" en este torneo. ` +
          `Editala en lugar de crear otra.`,
      );
    }

    const saved = await this.tarifaRepo.save(
      this.tarifaRepo.create({
        tenantId,
        torneoId,
        tipo: input.tipo,
        descripcion: input.descripcion?.trim() || null,
        monto: input.monto,
        frecuencia,
        diaVencimiento: input.diaVencimiento ?? null,
        activo: input.activo ?? true,
      }),
    );
    return this.toDto(saved);
  }

  async update(
    id: string,
    torneoId: string,
    tenantId: string,
    input: UpdateTarifaDto,
  ): Promise<TarifaTorneoDto> {
    await this.ensureTorneo(torneoId, tenantId);
    const t = await this.tarifaRepo.findOne({
      where: { id, torneoId, tenantId },
    });
    if (!t) throw new NotFoundException(`Tarifa ${id} no encontrada.`);

    if (input.descripcion !== undefined) {
      t.descripcion = input.descripcion?.trim() || null;
    }
    if (input.monto !== undefined) t.monto = input.monto;
    if (input.frecuencia !== undefined) t.frecuencia = input.frecuencia;
    if (input.diaVencimiento !== undefined) {
      t.diaVencimiento = input.diaVencimiento;
    }
    if (input.activo !== undefined) t.activo = input.activo;

    this.validarReglas(t.tipo, t.frecuencia, t.diaVencimiento);

    const saved = await this.tarifaRepo.save(t);
    return this.toDto(saved);
  }

  async remove(
    id: string,
    torneoId: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureTorneo(torneoId, tenantId);
    const r = await this.tarifaRepo.delete({ id, torneoId, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Tarifa ${id} no encontrada.`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async ensureTorneo(
    torneoId: string,
    tenantId: string,
  ): Promise<Torneo> {
    const t = await this.torneoRepo.findOne({
      where: { id: torneoId, tenantId },
    });
    if (!t) throw new NotFoundException(`Torneo ${torneoId} no encontrado.`);
    return t;
  }

  /**
   * Reglas cruzadas: si esto falla devolvemos 400 con detalle, NO 500
   * por el CHECK de la DB.
   */
  private validarReglas(
    tipo: string,
    frecuencia: string,
    diaVencimiento: number | null,
  ): void {
    if (tipo !== 'CUOTA' && frecuencia !== 'UNICO') {
      throw new BadRequestException(
        `La frecuencia "${frecuencia}" solo es válida para tipo CUOTA. ` +
          `Para "${tipo}" usá UNICO.`,
      );
    }
    if (tipo === 'CUOTA' && frecuencia !== 'UNICO') {
      if (diaVencimiento == null) {
        throw new BadRequestException(
          'Indicá el día de vencimiento. Para frecuencia mensual o anual ' +
            'es el día del mes (1-31). Para semanal es el día de la semana ' +
            '(1=lunes, 7=domingo).',
        );
      }
      if (frecuencia === 'SEMANAL' && (diaVencimiento < 1 || diaVencimiento > 7)) {
        throw new BadRequestException(
          'Para frecuencia semanal el día debe ser 1 (lunes) a 7 (domingo).',
        );
      }
    }
  }

  private toDto(t: TarifaTorneo): TarifaTorneoDto {
    return {
      id: t.id,
      tenantId: t.tenantId,
      torneoId: t.torneoId,
      tipo: t.tipo,
      descripcion: t.descripcion,
      monto: t.monto,
      frecuencia: t.frecuencia,
      diaVencimiento: t.diaVencimiento,
      activo: t.activo,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
