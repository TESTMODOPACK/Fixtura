import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CanchaAdmin, OcupacionCancha } from '@fixtura/types';

import { Cancha } from '../../competition/entities/cancha.entity';
import { Partido } from '../../competition/entities/partido.entity';
import type { CreateCanchaDto, UpdateCanchaDto } from './dto';

@Injectable()
export class CanchasAdminService {
  constructor(
    @InjectRepository(Cancha) private readonly repo: Repository<Cancha>,
    @InjectRepository(Partido) private readonly partidoRepo: Repository<Partido>,
  ) {}

  /** Duración asumida de un partido en minutos. Futuro: configurable. */
  private static readonly DURACION_PARTIDO_MIN = 90;

  async list(tenantId: string, soloActivas = false): Promise<CanchaAdmin[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .orderBy(`(c.estado = 'DISPONIBLE')`, 'DESC')
      .addOrderBy('c.nombre', 'ASC');
    // Sprint 40 — la disponibilidad operativa la define `estado`
    // (DISPONIBLE/NO_DISPONIBLE), NO la columna legacy `activa` (soft-delete
    // viejo, ya no se expone en la UI). `activas=true` = canchas usables para
    // asignar slots / generar fixture → filtra por estado DISPONIBLE.
    if (soloActivas) qb.andWhere(`c.estado = 'DISPONIBLE'`);
    const items = await qb.getMany();
    return items.map(this.toDto);
  }

  async findOne(id: string, tenantId: string): Promise<CanchaAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);
    return this.toDto(c);
  }

  async create(tenantId: string, input: CreateCanchaDto): Promise<CanchaAdmin> {
    const entity = this.repo.create({
      tenantId,
      nombre: input.nombre,
      direccion: input.direccion?.trim() || null,
      lat: input.lat != null ? String(input.lat) : null,
      lng: input.lng != null ? String(input.lng) : null,
      capacidad: input.capacidad ?? null,
      superficie: input.superficie ?? 'PASTO_NATURAL',
      iluminacion: input.iluminacion ?? false,
      tieneCamarines: input.tieneCamarines ?? false,
      observaciones: input.observaciones?.trim() || null,
      activa: true,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateCanchaDto,
  ): Promise<CanchaAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);

    if (input.nombre !== undefined) c.nombre = input.nombre;
    if (input.direccion !== undefined) c.direccion = input.direccion?.trim() || null;
    if (input.lat !== undefined) c.lat = input.lat != null ? String(input.lat) : null;
    if (input.lng !== undefined) c.lng = input.lng != null ? String(input.lng) : null;
    if (input.capacidad !== undefined) c.capacidad = input.capacidad ?? null;
    if (input.superficie !== undefined) c.superficie = input.superficie;
    if (input.iluminacion !== undefined) c.iluminacion = input.iluminacion;
    if (input.tieneCamarines !== undefined) c.tieneCamarines = input.tieneCamarines;
    if (input.observaciones !== undefined) c.observaciones = input.observaciones?.trim() || null;
    if (input.activa !== undefined) c.activa = input.activa;

    const saved = await this.repo.save(c);
    return this.toDto(saved);
  }

  /**
   * Ocupación: lista partidos por cancha DISPONIBLE en un rango. Si no se
   * pasa rango, devuelve la semana actual (lunes a domingo Chile).
   * Filtra por `estado` (modelo operativo Sprint 40), no por la columna
   * legacy `activa`.
   */
  async ocupacion(
    tenantId: string,
    desde?: string,
    hasta?: string,
  ): Promise<OcupacionCancha[]> {
    const { desdeDt, hastaDt } = this.resolverRango(desde, hasta);

    const canchas = await this.repo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere(`c.estado = 'DISPONIBLE'`)
      .orderBy('c.nombre', 'ASC')
      .getMany();

    if (canchas.length === 0) return [];

    const canchaIds = canchas.map((c) => c.id);
    const partidos = await this.partidoRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.inscripcionLocal', 'il')
      .leftJoinAndSelect('il.club', 'ilc')
      .leftJoinAndSelect('p.inscripcionVisita', 'iv')
      .leftJoinAndSelect('iv.club', 'ivc')
      .leftJoinAndSelect('p.fecha', 'f')
      .leftJoinAndSelect('f.torneo', 't')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.cancha_id IN (:...canchaIds)', { canchaIds })
      .andWhere('p.fecha_hora IS NOT NULL')
      .andWhere('p.fecha_hora >= :desde', { desde: desdeDt })
      .andWhere('p.fecha_hora < :hasta', { hasta: hastaDt })
      .orderBy('p.fecha_hora', 'ASC')
      .getMany();

    const porCancha = new Map<string, OcupacionCancha>();
    for (const c of canchas) {
      porCancha.set(c.id, {
        canchaId: c.id,
        canchaNombre: c.nombre,
        partidos: [],
      });
    }
    for (const p of partidos) {
      if (!p.canchaId || !p.fechaHora) continue;
      const bucket = porCancha.get(p.canchaId);
      if (!bucket) continue;
      bucket.partidos.push({
        partidoId: p.id,
        torneoId: p.fecha?.torneoId ?? '',
        fechaHora: p.fechaHora.toISOString(),
        duracionMin: CanchasAdminService.DURACION_PARTIDO_MIN,
        equipoLocal: p.inscripcionLocal?.club?.nombre ?? '?',
        equipoVisita: p.inscripcionVisita?.club?.nombre ?? '?',
        torneoNombre: p.fecha?.torneo?.nombre ?? '?',
        estado: p.estado,
      });
    }
    return Array.from(porCancha.values());
  }

  private resolverRango(
    desde?: string,
    hasta?: string,
  ): { desdeDt: Date; hastaDt: Date } {
    if (desde && hasta) {
      return { desdeDt: new Date(desde), hastaDt: new Date(hasta) };
    }
    // Default: semana actual lunes 00:00 a lunes siguiente 00:00 (UTC).
    const ahora = new Date();
    const day = ahora.getUTCDay(); // 0=Dom, 1=Lun ... 6=Sab
    const diffLunes = day === 0 ? -6 : 1 - day;
    const lunes = new Date(ahora);
    lunes.setUTCDate(ahora.getUTCDate() + diffLunes);
    lunes.setUTCHours(0, 0, 0, 0);
    const lunesSiguiente = new Date(lunes);
    lunesSiguiente.setUTCDate(lunes.getUTCDate() + 7);
    return { desdeDt: lunes, hastaDt: lunesSiguiente };
  }

  /**
   * Soft delete (botón "Eliminar"). Marca la cancha como NO_DISPONIBLE
   * (modelo operativo Sprint 40) además del legacy `activa=false`. Sin
   * tocar `estado`, una cancha "eliminada" seguía figurando DISPONIBLE y,
   * tras pasar el filtro a `estado`, reaparecía en los dropdowns. Preserva
   * historial: no borra la fila ni los partidos que la referencian.
   */
  async deactivate(id: string, tenantId: string): Promise<void> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);
    c.activa = false;
    c.estado = 'NO_DISPONIBLE';
    if (!c.motivoNoDisponible) c.motivoNoDisponible = 'Eliminada del catálogo';
    await this.repo.save(c);
  }

  /**
   * Sprint 40 — Cambiar estado operativo (DISPONIBLE/NO_DISPONIBLE).
   * Con motivo opcional para auditoría. NO afecta `activa` (que es el
   * soft-delete histórico). El generador del fixture chequea ESTE estado.
   */
  async cambiarEstado(
    id: string,
    tenantId: string,
    estado: 'DISPONIBLE' | 'NO_DISPONIBLE',
    motivo?: string | null,
  ): Promise<CanchaAdmin> {
    const c = await this.repo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Cancha ${id} no encontrada`);
    c.estado = estado;
    c.motivoNoDisponible = estado === 'NO_DISPONIBLE' ? (motivo ?? null) : null;
    // Mantener consistente el flag legacy `activa`: una cancha marcada
    // DISPONIBLE no puede quedar inactiva (si no, el backfill de arranque o
    // cualquier chequeo por `activa` la contradice). NO_DISPONIBLE no toca
    // `activa` — es indisponibilidad temporal, no una baja del catálogo.
    if (estado === 'DISPONIBLE') c.activa = true;
    const saved = await this.repo.save(c);
    return this.toDto(saved);
  }

  private toDto(c: Cancha): CanchaAdmin {
    return {
      id: c.id,
      nombre: c.nombre,
      direccion: c.direccion,
      // numeric viene como string desde PG — casteamos a number
      lat: c.lat != null ? Number(c.lat) : null,
      lng: c.lng != null ? Number(c.lng) : null,
      capacidad: c.capacidad,
      superficie: c.superficie,
      iluminacion: c.iluminacion,
      tieneCamarines: c.tieneCamarines,
      observaciones: c.observaciones,
      activa: c.activa,
      estado: c.estado,
      motivoNoDisponible: c.motivoNoDisponible,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
