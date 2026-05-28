import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateJugadorRequest, JugadorAdmin } from '@fixtura/types';

import { Equipo } from '../../competition/entities/equipo.entity';
import { JugadorInscrito } from '../../competition/entities/jugador-inscrito.entity';

@Injectable()
export class JugadoresAdminService {
  constructor(
    @InjectRepository(JugadorInscrito) private readonly repo: Repository<JugadorInscrito>,
    @InjectRepository(Equipo) private readonly equipoRepo: Repository<Equipo>,
  ) {}

  async listByEquipo(equipoId: string, tenantId: string): Promise<JugadorAdmin[]> {
    await this.ensureEquipo(equipoId, tenantId);
    const items = await this.repo.find({
      where: { equipoId, tenantId },
      order: { capitan: 'DESC', numeroCamiseta: 'ASC', apellido: 'ASC' },
    });
    return items.map(toDto);
  }

  async create(
    equipoId: string,
    tenantId: string,
    input: CreateJugadorRequest,
  ): Promise<JugadorAdmin> {
    const equipo = await this.ensureEquipo(equipoId, tenantId);

    // AUDIT-8: capitán requiere RUT. El zod schema lo valida en
    // frontend, pero el DTO class-validator del API no soporta cross-field
    // refines fácilmente — duplicamos la regla acá para defensa.
    if (input.capitan && (!input.rut || input.rut.trim().length === 0)) {
      throw new BadRequestException(
        'El RUT es obligatorio para capitanes (firmante del acta).',
      );
    }

    // AUDIT-3: pre-check de RUT duplicado en el mismo torneo. Si pasa,
    // el UNIQUE INDEX uq_jugador_rut_torneo es la defensa en profundidad.
    if (input.rut) {
      await this.validarRutNoDuplicado(tenantId, equipo.torneoId, input.rut);
    }

    const j = this.repo.create({
      tenantId,
      equipoId,
      torneoId: equipo.torneoId,
      nombre: input.nombre,
      apellido: input.apellido,
      apodo: input.apodo ?? null,
      rut: input.rut ?? null,
      numeroCamiseta: input.numeroCamiseta ?? null,
      posicion: input.posicion ?? null,
      pieHabil: input.pieHabil ?? null,
      fechaNac: input.fechaNac ?? null,
      capitan: input.capitan ?? false,
      activo: true,
    });
    const saved = await this.repo.save(j);
    return toDto(saved);
  }

  async bulkCreate(
    equipoId: string,
    tenantId: string,
    inputs: CreateJugadorRequest[],
  ): Promise<JugadorAdmin[]> {
    const equipo = await this.ensureEquipo(equipoId, tenantId);

    // AUDIT-3 / Observación #10: detectar duplicados internos del CSV
    // antes de tocar la DB. Si el archivo tiene el mismo RUT dos veces,
    // fallamos temprano con mensaje claro.
    const rutsInput = inputs.map((i) => i.rut).filter((r): r is string => !!r);
    const setRuts = new Set<string>();
    const duplicadosInternos: string[] = [];
    for (const rut of rutsInput) {
      if (setRuts.has(rut)) duplicadosInternos.push(rut);
      else setRuts.add(rut);
    }
    if (duplicadosInternos.length > 0) {
      throw new BadRequestException(
        `El CSV contiene RUTs duplicados: ${duplicadosInternos.join(', ')}. Revisá y reintentá.`,
      );
    }

    // AUDIT-8: capitanes sin RUT — bloquear el batch entero, mensaje claro.
    const capitanesSinRut = inputs.filter(
      (i) => i.capitan && (!i.rut || i.rut.trim().length === 0),
    );
    if (capitanesSinRut.length > 0) {
      const nombres = capitanesSinRut
        .map((c) => `${c.nombre} ${c.apellido}`)
        .join(', ');
      throw new BadRequestException(
        `Capitán requiere RUT (firmante del acta). Faltan en: ${nombres}.`,
      );
    }

    // AUDIT-3: validar contra el resto del torneo en una sola query.
    if (rutsInput.length > 0) {
      const ocupados = await this.repo
        .createQueryBuilder('j')
        .leftJoinAndSelect('j.equipo', 'e')
        .where('j.tenant_id = :tenantId', { tenantId })
        .andWhere('j.torneo_id = :torneoId', { torneoId: equipo.torneoId })
        .andWhere('j.activo = TRUE')
        .andWhere('j.rut IN (:...ruts)', { ruts: rutsInput })
        .getMany();
      if (ocupados.length > 0) {
        const detalle = ocupados
          .map((o) => `${o.rut} (${o.equipo?.nombre ?? '?'})`)
          .join(', ');
        throw new ConflictException(
          `Los siguientes RUTs ya están inscritos en otro equipo del torneo: ${detalle}.`,
        );
      }
    }

    const entities = inputs.map((input) =>
      this.repo.create({
        tenantId,
        equipoId,
        torneoId: equipo.torneoId,
        nombre: input.nombre,
        apellido: input.apellido,
        apodo: input.apodo ?? null,
        rut: input.rut ?? null,
        numeroCamiseta: input.numeroCamiseta ?? null,
        posicion: input.posicion ?? null,
        pieHabil: input.pieHabil ?? null,
        fechaNac: input.fechaNac ?? null,
        capitan: input.capitan ?? false,
        activo: true,
      }),
    );
    const saved = await this.repo.save(entities);
    return saved.map(toDto);
  }

  /**
   * AUDIT-3: helper. Lanza ConflictException si el RUT ya tiene una
   * inscripción activa en otro equipo del mismo torneo.
   */
  private async validarRutNoDuplicado(
    tenantId: string,
    torneoId: string,
    rut: string,
  ): Promise<void> {
    const existente = await this.repo
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.equipo', 'e')
      .where('j.tenant_id = :tenantId', { tenantId })
      .andWhere('j.torneo_id = :torneoId', { torneoId })
      .andWhere('j.rut = :rut', { rut })
      .andWhere('j.activo = TRUE')
      .getOne();
    if (existente) {
      throw new ConflictException(
        `El RUT ${rut} ya está inscrito en el equipo "${existente.equipo?.nombre ?? '?'}" del mismo torneo. Un jugador no puede estar en dos equipos del mismo torneo (Plan §4.2).`,
      );
    }
  }

  private async ensureEquipo(equipoId: string, tenantId: string): Promise<Equipo> {
    const exists = await this.equipoRepo.findOne({ where: { id: equipoId, tenantId } });
    if (!exists) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
    return exists;
  }
}

function toDto(j: JugadorInscrito): JugadorAdmin {
  return {
    id: j.id,
    equipoId: j.equipoId,
    nombre: j.nombre,
    apellido: j.apellido,
    apodo: j.apodo,
    rut: j.rut,
    numeroCamiseta: j.numeroCamiseta,
    posicion: j.posicion,
    pieHabil: j.pieHabil,
    fechaNac: j.fechaNac,
    capitan: j.capitan,
    activo: j.activo,
  };
}
