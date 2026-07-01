import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { JugadorGlobalDetalle, PartidoDelegado } from '@fixtura/types';

import { Jugador } from '../../competition/entities/jugador.entity';
import { DelegadoPortalService } from '../delegado/delegado-portal.service';
import { JugadoresGlobalService } from '../jugadores-global/jugadores-global.service';

/**
 * Portal del Jugador (MOV-2) — vistas de SOLO LECTURA de sus propios datos.
 * Reusa lógica ya probada: el perfil+stats sale de JugadoresGlobalService
 * (el mismo detalle de /admin/jugadores/[id]) y los partidos del club salen
 * de DelegadoPortalService. El jugadorId siempre viene resuelto del JWT.
 */
@Injectable()
export class JugadorPortalService {
  constructor(
    @InjectRepository(Jugador) private readonly jugadorRepo: Repository<Jugador>,
    private readonly jugadoresGlobal: JugadoresGlobalService,
    private readonly delegadoPortal: DelegadoPortalService,
  ) {}

  /** Perfil completo: ficha + stats por torneo + sanciones vigentes. */
  miPerfil(jugadorId: string, tenantId: string): Promise<JugadorGlobalDetalle> {
    return this.jugadoresGlobal.getDetalle(tenantId, jugadorId);
  }

  /** Partidos del club del jugador (próximos + resultados). */
  async misPartidos(
    jugadorId: string,
    tenantId: string,
  ): Promise<PartidoDelegado[]> {
    const jugador = await this.jugadorRepo.findOneOrFail({
      where: { id: jugadorId, tenantId },
    });
    return this.delegadoPortal.partidos(jugador.clubId, tenantId);
  }
}
