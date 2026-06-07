import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { Jugador } from './jugador.entity';
import { Partido } from './partido.entity';

/**
 * F46.4 — Roster del acta: jugadores certificados como presentes en un
 * partido, por equipo (inscripción). La certificación bloquea jugadores no
 * habilitados (sancionados esta fecha / vetados) y es requisito para cerrar
 * el acta. `presente` permite, a futuro, registrar citados-no-presentes.
 */
@Entity({ name: 'partido_jugadores' })
@Index('idx_partido_jugadores_tenant', ['tenantId'])
@Index('idx_partido_jugadores_partido', ['partidoId'])
@Unique('uq_partido_jugador', ['partidoId', 'jugadorId'])
export class PartidoJugador {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'partido_id', type: 'uuid' })
  partidoId!: string;

  @ManyToOne(() => Partido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partido_id' })
  partido?: Partido;

  @Column({ name: 'inscripcion_id', type: 'uuid' })
  inscripcionId!: string;

  @Column({ name: 'jugador_id', type: 'uuid' })
  jugadorId!: string;

  @ManyToOne(() => Jugador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jugador_id' })
  jugador?: Jugador;

  @Column({ type: 'boolean', default: true })
  presente!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
