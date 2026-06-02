import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  limpiarRut,
  validarRut,
  type CreateJugadorVetadoRequest,
  type JugadorVetado as JugadorVetadoDto,
} from '@fixtura/types';

import { JugadorVetado } from '../../competition/entities/jugador-vetado.entity';

/**
 * Sprint 26B/26H — Mantenedor de lista negra de jugadores.
 *
 * Permite agregar/borrar vetados MANUALES por admin. La integración
 * con Tribunal (origen=TRIBUNAL automático) se enchufa en sprint 26H
 * desde el motor de sanciones (al dictar sanción permanente).
 *
 * El veto se identifica únicamente por RUT (ADR-0004). UNIQUE
 * (tenant_id, rut) en DB garantiza que no haya duplicados.
 */
@Injectable()
export class VetadosAdminService {
  constructor(
    @InjectRepository(JugadorVetado)
    private readonly repo: Repository<JugadorVetado>,
  ) {}

  async list(tenantId: string): Promise<JugadorVetadoDto[]> {
    const vetados = await this.repo.find({
      where: { tenantId },
      relations: { creadoPor: true },
      order: { createdAt: 'DESC' },
    });
    return vetados.map((v) => this.toDto(v));
  }

  async create(
    tenantId: string,
    userId: string,
    input: CreateJugadorVetadoRequest,
  ): Promise<JugadorVetadoDto> {
    if (!validarRut(input.rut)) {
      throw new BadRequestException(
        'RUT inválido: chequeá el dígito verificador.',
      );
    }
    const rut = limpiarRut(input.rut);

    const dup = await this.repo.findOne({ where: { tenantId, rut } });
    if (dup) {
      throw new ConflictException(
        `El RUT ${rut} ya está vetado (motivo: ${dup.motivo ?? 'sin motivo'}).`,
      );
    }

    const veto = this.repo.create({
      tenantId,
      rut,
      motivo: input.motivo?.trim() || null,
      origen: 'MANUAL',
      creadoPorUserId: userId,
    });

    try {
      const saved = await this.repo.save(veto);
      return this.findOne(saved.id, tenantId);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('uq_jugador_vetado_rut') ||
          err.message.includes('duplicate key'))
      ) {
        throw new ConflictException(`El RUT ${rut} ya está vetado.`);
      }
      throw err;
    }
  }

  /**
   * Inserción automática desde el Tribunal (Sprint 26H). Idempotente:
   * si ya existe el veto para este RUT, no falla (un mismo jugador
   * podría recibir múltiples sanciones permanentes; solo la primera
   * crea el registro).
   */
  async addFromTribunal(
    tenantId: string,
    rut: string,
    motivo: string,
  ): Promise<void> {
    const limpio = limpiarRut(rut);
    if (!validarRut(limpio)) {
      // El motor de sanciones puede llamar con un RUT inválido si el
      // jugador fue cargado sin RUT chileno (es opcional). En ese caso
      // no podemos vetarlo por RUT — loggeamos warning y seguimos.
      // eslint-disable-next-line no-console
      console.warn(
        `[VetadosService] RUT inválido recibido del Tribunal: ${rut}. Se ignora.`,
      );
      return;
    }
    const existing = await this.repo.findOne({
      where: { tenantId, rut: limpio },
    });
    if (existing) return;

    const veto = this.repo.create({
      tenantId,
      rut: limpio,
      motivo,
      origen: 'TRIBUNAL',
      creadoPorUserId: null,
    });
    try {
      await this.repo.save(veto);
    } catch (err) {
      // Race: dos tribunales al mismo tiempo. No es problema, el RUT
      // ya quedó vetado.
      if (
        err instanceof Error &&
        err.message.includes('uq_jugador_vetado_rut')
      ) {
        return;
      }
      throw err;
    }
  }

  async findOne(id: string, tenantId: string): Promise<JugadorVetadoDto> {
    const v = await this.repo.findOne({
      where: { id, tenantId },
      relations: { creadoPor: true },
    });
    if (!v) throw new NotFoundException(`Veto ${id} no encontrado.`);
    return this.toDto(v);
  }

  /**
   * Eliminar un veto. El ADR-0004 dice que el veto es esencialmente
   * inmutable, pero permitimos eliminar por dos casos:
   *   - Error del admin (vetó un RUT por equivocación).
   *   - Operación excepcional del Super Admin (rehabilitación).
   *
   * En cualquier caso queda audit log con quién lo hizo.
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const r = await this.repo.delete({ id, tenantId });
    if (r.affected === 0) {
      throw new NotFoundException(`Veto ${id} no encontrado.`);
    }
  }

  private toDto(v: JugadorVetado): JugadorVetadoDto {
    return {
      id: v.id,
      tenantId: v.tenantId,
      rut: v.rut,
      motivo: v.motivo,
      origen: v.origen,
      creadoPorUserId: v.creadoPorUserId,
      creadoPorNombre: v.creadoPor?.nombre ?? null,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
