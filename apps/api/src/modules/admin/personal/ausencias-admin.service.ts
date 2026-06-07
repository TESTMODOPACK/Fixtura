import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AusenciaPersonal as AusenciaPersonalDto } from '@fixtura/types';

import { AusenciaPersonal } from '../../competition/entities/ausencia-personal.entity';
import { Personal } from '../../competition/entities/personal.entity';
import type { CrearAusenciaDto } from './dto';

/**
 * F48 — Gestión de ausencias del personal (rangos de fechas calendario en
 * las que la persona NO está disponible para designaciones). Se administra
 * desde el perfil del personal. La auto-asignación y el análisis de
 * cobertura cruzan estas ausencias contra la fecha de cada partido.
 */
@Injectable()
export class AusenciasAdminService {
  constructor(
    @InjectRepository(AusenciaPersonal)
    private readonly repo: Repository<AusenciaPersonal>,
    @InjectRepository(Personal)
    private readonly personalRepo: Repository<Personal>,
  ) {}

  async list(personalId: string, tenantId: string): Promise<AusenciaPersonalDto[]> {
    await this.ensurePersonal(personalId, tenantId);
    const rows = await this.repo.find({
      where: { personalId, tenantId },
      order: { desde: 'DESC' },
    });
    return rows.map(this.toDto);
  }

  async create(
    personalId: string,
    tenantId: string,
    input: CrearAusenciaDto,
  ): Promise<AusenciaPersonalDto> {
    await this.ensurePersonal(personalId, tenantId);

    const desde = input.desde.slice(0, 10);
    const hasta = input.hasta.slice(0, 10);
    if (hasta < desde) {
      throw new BadRequestException(
        'La fecha "hasta" no puede ser anterior a "desde".',
      );
    }

    const created = await this.repo.save(
      this.repo.create({
        tenantId,
        personalId,
        desde,
        hasta,
        motivo: input.motivo?.trim() || null,
      }),
    );
    return this.toDto(created);
  }

  async remove(personalId: string, ausenciaId: string, tenantId: string): Promise<void> {
    const a = await this.repo.findOne({ where: { id: ausenciaId, tenantId } });
    if (!a) throw new NotFoundException(`Ausencia ${ausenciaId} no encontrada`);
    if (a.personalId !== personalId) {
      throw new BadRequestException('La ausencia no pertenece a ese personal');
    }
    await this.repo.remove(a);
  }

  private async ensurePersonal(personalId: string, tenantId: string): Promise<void> {
    const p = await this.personalRepo.findOne({ where: { id: personalId, tenantId } });
    if (!p) throw new NotFoundException(`Personal ${personalId} no encontrado`);
  }

  private toDto(a: AusenciaPersonal): AusenciaPersonalDto {
    return {
      id: a.id,
      personalId: a.personalId,
      desde: a.desde,
      hasta: a.hasta,
      motivo: a.motivo,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
