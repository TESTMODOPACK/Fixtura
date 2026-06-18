import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  MiDesignacion,
  MiPortalPersonal,
  RolPersonal,
} from '@fixtura/types';

import { Designacion } from '../../competition/entities/designacion.entity';
import { Personal } from '../../competition/entities/personal.entity';

/**
 * Portal del personal logueado (árbitros / planilleros). Resuelve la ficha
 * de personal por su user_id y devuelve su perfil + designaciones. Las
 * queries usan el repo transaccional (RLS) y se acotan al personal del
 * usuario, así un árbitro solo ve lo suyo.
 */
@Injectable()
export class PersonalPortalService {
  constructor(
    @InjectRepository(Personal) private readonly personalRepo: Repository<Personal>,
    @InjectRepository(Designacion) private readonly desigRepo: Repository<Designacion>,
  ) {}

  async miPortal(userId: string, tenantId: string): Promise<MiPortalPersonal> {
    const personal = await this.personalRepo.findOne({
      where: { userId, tenantId },
    });
    if (!personal) {
      throw new NotFoundException('No encontramos tu ficha de personal en esta liga.');
    }

    const rows = await this.desigRepo
      .createQueryBuilder('d')
      .innerJoin('partidos', 'p', 'p.id = d.partido_id')
      .innerJoin('fechas', 'f', 'f.id = p.fecha_id')
      .leftJoin('torneos', 't', 't.id = f.torneo_id')
      .leftJoin('inscripciones_torneo', 'il', 'il.id = p.inscripcion_local_id')
      .leftJoin('clubes', 'cl', 'cl.id = il.club_id')
      .leftJoin('inscripciones_torneo', 'iv', 'iv.id = p.inscripcion_visita_id')
      .leftJoin('clubes', 'cv', 'cv.id = iv.club_id')
      .leftJoin('canchas', 'ca', 'ca.id = p.cancha_id')
      .where('d.tenant_id = :tenantId', { tenantId })
      .andWhere('d.personal_id = :personalId', { personalId: personal.id })
      .select('d.id', 'designacionId')
      .addSelect('d.partido_id', 'partidoId')
      .addSelect('d.rol_asignado', 'rolAsignado')
      .addSelect('d.estado', 'estado')
      .addSelect('t.nombre', 'torneoNombre')
      .addSelect('f.numero', 'fechaNumero')
      .addSelect('p.fecha_hora', 'fechaHora')
      .addSelect('p.estado', 'partidoEstado')
      .addSelect('ca.nombre', 'canchaNombre')
      .addSelect('cl.nombre', 'localNombre')
      .addSelect('cv.nombre', 'visitaNombre')
      .orderBy('p.fecha_hora', 'DESC', 'NULLS LAST')
      .getRawMany<{
        designacionId: string;
        partidoId: string;
        rolAsignado: RolPersonal;
        estado: MiDesignacion['estado'];
        torneoNombre: string | null;
        fechaNumero: number | null;
        fechaHora: Date | null;
        partidoEstado: string;
        canchaNombre: string | null;
        localNombre: string | null;
        visitaNombre: string | null;
      }>();

    const designaciones: MiDesignacion[] = rows.map((r) => ({
      designacionId: r.designacionId,
      partidoId: r.partidoId,
      torneoNombre: r.torneoNombre ?? 'Torneo',
      fechaNumero: r.fechaNumero == null ? null : Number(r.fechaNumero),
      fechaHora: r.fechaHora ? r.fechaHora.toISOString() : null,
      canchaNombre: r.canchaNombre,
      rolAsignado: r.rolAsignado,
      estado: r.estado,
      localNombre: r.localNombre ?? '—',
      visitaNombre: r.visitaNombre ?? '—',
      partidoEstado: r.partidoEstado,
    }));

    return {
      perfil: {
        nombre: personal.nombre,
        apellido: personal.apellido,
        rol: personal.rol,
        roles: personal.roles?.length ? personal.roles : [personal.rol],
        carnetAnfaNumero: personal.carnetAnfaNumero,
        carnetAnfaVence: personal.carnetAnfaVence,
      },
      designaciones,
    };
  }
}
