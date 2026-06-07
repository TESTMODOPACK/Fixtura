import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CobroAdmin } from '@fixtura/types';

import { AuditLogService } from '../../audit';
import { Cobro } from '../../competition/entities/cobro.entity';
import { Equipo } from '../../competition/entities/equipo.entity';
import { DunningService } from '../dunning/dunning.service';
import type { CreateCobroDto, MarcarPagadoDto, UpdateCobroDto } from './dto';

@Injectable()
export class CobrosAdminService {
  constructor(
    @InjectRepository(Cobro) private readonly repo: Repository<Cobro>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
    private readonly dunning: DunningService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Sincroniza estado_dunning después de cualquier cambio que afecte el
   * estado pagado/cancelado/vencimiento. No-throw: si falla, log-only.
   */
  private async syncDunning(cobroId: string, tenantId: string): Promise<void> {
    try {
      await this.dunning.actualizarEstadoCobro(cobroId, tenantId);
    } catch {
      // best-effort: el cron diario va a corregirlo si esto falla.
    }
  }

  async list(
    tenantId: string,
    filtro?: 'pendientes' | 'vencidos' | 'pagados' | 'cancelados' | 'todos',
    equipoId?: string,
    // Sprint 34E — filtros nuevos para la vista mejorada de /admin/finanzas.
    torneoId?: string,
    clubId?: string,
    soloAuto?: boolean,
  ): Promise<CobroAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.equipo', 'equipo')
      .leftJoinAndSelect('c.torneo', 'torneo')
      .leftJoinAndSelect('c.inscripcion', 'inscripcion')
      .leftJoinAndSelect('inscripcion.club', 'club')
      .leftJoinAndSelect('c.tarifa', 'tarifa')
      .where('c.tenant_id = :tenantId', { tenantId });

    if (equipoId) {
      qb.andWhere('c.equipo_id = :equipoId', { equipoId });
    }
    if (torneoId) {
      qb.andWhere('c.torneo_id = :torneoId', { torneoId });
    }
    if (clubId) {
      qb.andWhere('inscripcion.club_id = :clubId', { clubId });
    }
    if (soloAuto === true) {
      qb.andWhere('c.generado_auto = TRUE');
    } else if (soloAuto === false) {
      qb.andWhere('c.generado_auto = FALSE');
    }

    if (filtro === 'pendientes') {
      qb.andWhere('c.pagado_at IS NULL')
        .andWhere('c.cancelado = false')
        .andWhere('(c.vencimiento IS NULL OR c.vencimiento >= CURRENT_DATE)');
    } else if (filtro === 'vencidos') {
      qb.andWhere('c.pagado_at IS NULL')
        .andWhere('c.cancelado = false')
        .andWhere('c.vencimiento < CURRENT_DATE');
    } else if (filtro === 'pagados') {
      qb.andWhere('c.pagado_at IS NOT NULL');
    } else if (filtro === 'cancelados') {
      qb.andWhere('c.cancelado = true');
    }

    qb.orderBy('c.created_at', 'DESC');
    const items = await qb.getMany();
    return items.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<CobroAdmin> {
    const c = await this.repo.findOne({
      where: { id, tenantId },
      relations: {
        equipo: true,
        torneo: true,
        inscripcion: { club: true },
        tarifa: true,
      },
    });
    if (!c) throw new NotFoundException(`Cobro ${id} no encontrado`);
    return this.toDto(c);
  }

  async create(tenantId: string, input: CreateCobroDto): Promise<CobroAdmin> {
    // Validar que el equipo pertenece al tenant (si se especifica)
    if (input.equipoId) {
      const equipo = await this.equipoRepo.findOne({
        where: { id: input.equipoId, tenantId },
      });
      if (!equipo) {
        throw new BadRequestException('El equipo no existe o no pertenece a esta liga');
      }
    }

    const entity = this.repo.create({
      tenantId,
      equipoId: input.equipoId ?? null,
      concepto: input.concepto,
      categoria: input.categoria,
      monto: input.monto,
      vencimiento: input.vencimiento ?? null,
      notas: input.notas?.trim() || null,
      cancelado: false,
    });
    const saved = await this.repo.save(entity);
    return this.findOne(saved.id, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateCobroDto,
  ): Promise<CobroAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cobro ${id} no encontrado`);

    if (input.equipoId !== undefined) {
      if (input.equipoId) {
        const equipo = await this.equipoRepo.findOne({
          where: { id: input.equipoId, tenantId },
        });
        if (!equipo) {
          throw new BadRequestException('El equipo no existe o no pertenece a esta liga');
        }
      }
      c.equipoId = input.equipoId ?? null;
    }
    if (input.concepto !== undefined) c.concepto = input.concepto;
    if (input.categoria !== undefined) c.categoria = input.categoria;
    if (input.monto !== undefined) c.monto = input.monto;
    if (input.vencimiento !== undefined) c.vencimiento = input.vencimiento ?? null;
    if (input.notas !== undefined) c.notas = input.notas?.trim() || null;
    if (input.cancelado !== undefined) c.cancelado = input.cancelado;

    await this.repo.save(c);
    await this.syncDunning(c.id, tenantId);
    return this.findOne(c.id, tenantId);
  }

  async marcarPagado(
    id: string,
    tenantId: string,
    input: MarcarPagadoDto,
  ): Promise<CobroAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cobro ${id} no encontrado`);
    if (c.pagadoAt) {
      throw new BadRequestException('Este cobro ya está marcado como pagado');
    }
    if (c.cancelado) {
      throw new BadRequestException('Este cobro está cancelado — reactivá primero');
    }
    c.pagadoAt = input.pagadoAt ? new Date(input.pagadoAt) : new Date();
    c.pagadoMetodo = input.metodo;
    c.pagadoReferencia = input.referencia?.trim() || null;
    await this.repo.save(c);
    await this.syncDunning(c.id, tenantId);
    return this.findOne(c.id, tenantId);
  }

  async revertirPago(id: string, tenantId: string): Promise<CobroAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cobro ${id} no encontrado`);
    if (!c.pagadoAt) {
      throw new BadRequestException('Este cobro no está pagado — nada que revertir');
    }
    c.pagadoAt = null;
    c.pagadoMetodo = null;
    c.pagadoReferencia = null;
    await this.repo.save(c);
    await this.syncDunning(c.id, tenantId);
    return this.findOne(c.id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cobro ${id} no encontrado`);
    // Eliminar un cobro es destructivo y financiero — dejamos traza de qué
    // se borró, a quién y cuánto, antes del hard delete. Best-effort: si el
    // audit falla, no bloqueamos la operación del operador.
    try {
      await this.audit.record({
        action: 'cobro.eliminado',
        tenantId,
        entityType: 'Cobro',
        entityId: c.id,
        metadata: {
          concepto: c.concepto,
          categoria: c.categoria,
          monto: c.monto,
          equipoId: c.equipoId,
          inscripcionId: c.inscripcionId,
          torneoId: c.torneoId,
          pagado: c.pagadoAt != null,
          generadoAuto: c.generadoAuto,
        },
      });
    } catch {
      // best-effort
    }
    await this.repo.remove(c);
  }

  private toDto(c: Cobro): CobroAdmin {
    // Estado derivado: pagado > cancelado > vencido > pendiente.
    // VENCIDO requiere que la fecha sea ESTRICTAMENTE anterior a hoy
    // (mismo criterio que el SQL: `c.vencimiento < CURRENT_DATE`).
    let estado: CobroAdmin['estado'] = 'PENDIENTE';
    let diasMorosidad = 0;
    if (c.pagadoAt) {
      estado = 'PAGADO';
    } else if (c.cancelado) {
      estado = 'CANCELADO';
    } else if (c.vencimiento) {
      const hoy = new Date();
      const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      if (c.vencimiento < hoyStr) {
        estado = 'VENCIDO';
        // Calcular días de mora — diferencia en días calendario.
        const venc = new Date(c.vencimiento + 'T00:00:00Z');
        const hoyMidUTC = new Date(`${hoyStr}T00:00:00Z`);
        diasMorosidad = Math.max(
          0,
          Math.floor((hoyMidUTC.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000)),
        );
      }
    }
    return {
      id: c.id,
      equipoId: c.equipoId,
      equipoNombre: c.equipo?.nombre ?? null,
      concepto: c.concepto,
      categoria: c.categoria,
      monto: c.monto,
      vencimiento: c.vencimiento,
      pagadoAt: c.pagadoAt ? c.pagadoAt.toISOString() : null,
      pagadoMetodo: c.pagadoMetodo,
      pagadoReferencia: c.pagadoReferencia,
      cancelado: c.cancelado,
      notas: c.notas,
      estado,
      estadoDunning: c.estadoDunning ?? 'AL_DIA',
      diasMorosidad,
      dunningAvisosEnviados: c.dunningAvisosEnviados ?? 0,
      dunningUltimoAvisoAt: c.dunningUltimoAvisoAt
        ? c.dunningUltimoAvisoAt.toISOString()
        : null,
      // Sprint 34A — campos de origen y trazabilidad. Los joins reales
      // (torneoNombre, clubNombre) los hace 34E cuando exponemos los
      // filtros. Aca pasamos null por default y solo el FK si la query
      // ya lo trae.
      torneoId: c.torneoId ?? null,
      torneoNombre: c.torneo?.nombre ?? null,
      inscripcionId: c.inscripcionId ?? null,
      clubId: c.inscripcion?.clubId ?? null,
      clubNombre: c.inscripcion?.club?.nombre ?? null,
      partidoId: c.partidoId ?? null,
      sancionId: c.sancionId ?? null,
      tarifaId: c.tarifaId ?? null,
      tarifaTipo: c.tarifa?.tipo ?? null,
      generadoAuto: c.generadoAuto ?? false,
      periodoAnio: c.periodoAnio ?? null,
      periodoMes: c.periodoMes ?? null,
      periodoSemana: c.periodoSemana ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
