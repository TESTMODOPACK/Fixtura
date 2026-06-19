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

import { AusenciaPersonal } from '../../competition/entities/ausencia-personal.entity';
import { DesignacionRecinto } from '../../competition/entities/designacion-recinto.entity';
import { Fecha } from '../../competition/entities/fecha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import { Personal } from '../../competition/entities/personal.entity';
import { Torneo } from '../../competition/entities/torneo.entity';
import type { AsignarRecintoDto } from './dto';

type RolRecinto = 'PARAMEDICO' | 'OTRO';

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
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
    @InjectRepository(AusenciaPersonal)
    private readonly ausenciaRepo: Repository<AusenciaPersonal>,
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

  /**
   * Auto-asigna la cobertura del recinto (paramédicos + "otros") de una
   * fecha según la config del torneo (paramedicosPorJornada / otrosPorJornada).
   *
   * Es por JORNADA (día completo), no por partido. Si la misma persona ya
   * cubre el recinto ese MISMO DÍA en otro torneo, se la prefiere (una sola
   * persona cubre todos los torneos del día) y su pago se cuenta UNA vez
   * (montoPago = 0 en las designaciones extra del día). No re-asigna lo ya
   * cubierto ni a personal ausente ese día.
   */
  async autoAsignarRecinto(
    torneoId: string,
    fechaId: string,
    tenantId: string,
  ): Promise<{ creadas: number }> {
    const torneo = await this.torneoRepo.findOne({ where: { id: torneoId, tenantId } });
    if (!torneo) throw new NotFoundException(`Torneo ${torneoId} no encontrado`);
    const fecha = await this.fechaRepo.findOne({ where: { id: fechaId, tenantId } });
    if (!fecha) throw new NotFoundException(`Fecha ${fechaId} no encontrada`);
    if (fecha.torneoId !== torneoId) {
      throw new BadRequestException('La fecha no pertenece al torneo indicado');
    }

    const objetivos: Array<{ rol: RolRecinto; cantidad: number }> = [
      { rol: 'PARAMEDICO', cantidad: torneo.paramedicosPorJornada ?? 0 },
      { rol: 'OTRO', cantidad: torneo.otrosPorJornada ?? 0 },
    ];
    if (objetivos.every((o) => o.cantidad <= 0)) return { creadas: 0 };

    const dia = await this.diaDeLaJornada(fecha, tenantId);

    const existentes = await this.repo.find({ where: { fechaId, tenantId } });
    const activasFecha = existentes.filter((e) => e.estado !== 'RECHAZADA');

    // Cobertura del MISMO DÍA en otras fechas/torneos (compartir + pago único).
    const recintoDia = dia ? await this.recintoDelDia(tenantId, dia) : [];
    const pagaEseDia = new Set(
      recintoDia.filter((r) => (r.montoPago ?? 0) > 0).map((r) => r.personalId),
    );
    const cubrenPorRol = new Map<RolRecinto, Set<string>>();
    for (const r of recintoDia) {
      const set = cubrenPorRol.get(r.rolAsignado) ?? new Set<string>();
      set.add(r.personalId);
      cubrenPorRol.set(r.rolAsignado, set);
    }

    const personalActivo = await this.personalRepo.find({
      where: { tenantId, activo: true },
    });
    const ausentes = dia
      ? await this.personalAusenteEnDia(tenantId, dia)
      : new Set<string>();

    let creadas = 0;
    for (const { rol, cantidad } of objetivos) {
      if (cantidad <= 0) continue;
      const yaEnFecha = new Set(
        activasFecha.filter((e) => e.rolAsignado === rol).map((e) => e.personalId),
      );
      const faltan = cantidad - yaEnFecha.size;
      if (faltan <= 0) continue;

      const preferidos = cubrenPorRol.get(rol) ?? new Set<string>();
      const candidatos = personalActivo
        .filter((p) => p.roles?.includes(rol) || p.rol === rol)
        .filter((p) => !yaEnFecha.has(p.id))
        .filter((p) => !ausentes.has(p.id))
        .sort((a, b) => {
          // Preferir a quien ya cubre el recinto ese día con ese rol.
          const pa = preferidos.has(a.id) ? 0 : 1;
          const pb = preferidos.has(b.id) ? 0 : 1;
          if (pa !== pb) return pa - pb;
          return `${a.apellido} ${a.nombre}`.localeCompare(
            `${b.apellido} ${b.nombre}`,
            'es',
          );
        });

      for (const cand of candidatos.slice(0, faltan)) {
        const monto = pagaEseDia.has(cand.id) ? 0 : (cand.tarifaBase ?? null);
        await this.repo.save(
          this.repo.create({
            tenantId,
            fechaId,
            personalId: cand.id,
            rolAsignado: rol,
            canchaNombre: null,
            estado: 'PROPUESTA',
            montoPago: monto,
            notas: null,
          }),
        );
        if ((monto ?? 0) > 0) pagaEseDia.add(cand.id);
        creadas++;
      }
    }
    return { creadas };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /** Día calendario (YYYY-MM-DD) de la jornada: fecha_inicio o el día del primer partido. */
  private async diaDeLaJornada(fecha: Fecha, tenantId: string): Promise<string | null> {
    if (fecha.fechaInicio) return fecha.fechaInicio;
    // TO_CHAR fuerza string 'YYYY-MM-DD': en el camino raw (getRawOne) el
    // parser de pg devolvería las columnas DATE como objeto Date, y ese
    // valor se compara luego como :dia contra columnas DATE (mismo patrón
    // que cargarAusenciasMap en designaciones-admin.service).
    const row = await this.partidoRepo
      .createQueryBuilder('p')
      .select(
        `TO_CHAR(MIN((p.fecha_hora AT TIME ZONE 'America/Santiago')::date), 'YYYY-MM-DD')`,
        'dia',
      )
      .where('p.fecha_id = :fechaId', { fechaId: fecha.id })
      .andWhere('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.fecha_hora IS NOT NULL')
      .getRawOne<{ dia: string | null }>();
    return row?.dia ?? null;
  }

  /** Designaciones de recinto (no rechazadas) de TODAS las fechas que caen ese día. */
  private async recintoDelDia(
    tenantId: string,
    dia: string,
  ): Promise<Array<{ personalId: string; rolAsignado: RolRecinto; montoPago: number | null }>> {
    const fechaRows = await this.fechaRepo
      .createQueryBuilder('f')
      .leftJoin('partidos', 'p', 'p.fecha_id = f.id AND p.tenant_id = f.tenant_id')
      .select('DISTINCT f.id', 'id')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `(f.fecha_inicio = :dia OR (p.fecha_hora AT TIME ZONE 'America/Santiago')::date = :dia)`,
        { dia },
      )
      .getRawMany<{ id: string }>();
    const fechaIds = fechaRows.map((r) => r.id);
    if (fechaIds.length === 0) return [];
    const rows = await this.repo
      .createQueryBuilder('d')
      .select([
        'd.personal_id AS "personalId"',
        'd.rol_asignado AS "rolAsignado"',
        'd.monto_pago AS "montoPago"',
      ])
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.fecha_id IN (:...fechaIds)', { fechaIds })
      .andWhere(`d.estado != 'RECHAZADA'`)
      .getRawMany<{ personalId: string; rolAsignado: RolRecinto; montoPago: number | null }>();
    return rows.map((r) => ({
      personalId: r.personalId,
      rolAsignado: r.rolAsignado,
      montoPago: r.montoPago == null ? null : Number(r.montoPago),
    }));
  }

  /** Personal con una ausencia que cubre ese día. */
  private async personalAusenteEnDia(tenantId: string, dia: string): Promise<Set<string>> {
    const rows = await this.ausenciaRepo
      .createQueryBuilder('a')
      .select('a.personal_id', 'personalId')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.desde <= :dia', { dia })
      .andWhere('a.hasta >= :dia', { dia })
      .getRawMany<{ personalId: string }>();
    return new Set(rows.map((r) => r.personalId));
  }
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
