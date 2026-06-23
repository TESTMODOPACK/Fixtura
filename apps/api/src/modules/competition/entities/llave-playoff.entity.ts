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
import { InscripcionTorneo } from './inscripcion-torneo.entity';
import { Torneo } from './torneo.entity';

/**
 * Fase Playoffs (P1) — una llave (cruce) del bracket de eliminación directa.
 *
 * Topología implícita: la llave (ronda R, orden O) alimenta la (ronda R+1,
 * orden floor(O/2)); el ganador entra como local si O es par, visita si impar.
 * No hace falta FK explícita entre llaves. Los partidos del cruce llevan
 * `partidos.llave_id` (1 partido, o 2 en ida/vuelta).
 */
@Entity({ name: 'llaves_playoff' })
@Index('idx_llaves_playoff_tenant', ['tenantId'])
@Index('idx_llaves_playoff_torneo', ['torneoId'])
@Unique('uq_llave_playoff', ['torneoId', 'ronda', 'orden'])
export class LlavePlayoff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'torneo_id', type: 'uuid' })
  torneoId!: string;

  @ManyToOne(() => Torneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo;

  /** Ronda del bracket (1 = primera ronda jugada; la mayor es la final). */
  @Column({ type: 'smallint' })
  ronda!: number;

  /** Posición de la llave dentro de la ronda (0-based). */
  @Column({ type: 'smallint' })
  orden!: number;

  /** Etiqueta visible ("Cuartos 1", "Semifinal 2", "Final", "3er puesto"). */
  @Column({ type: 'varchar', length: 50 })
  nombre!: string;

  @Column({ name: 'inscripcion_local_id', type: 'uuid', nullable: true })
  inscripcionLocalId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_local_id' })
  inscripcionLocal?: InscripcionTorneo | null;

  @Column({ name: 'inscripcion_visita_id', type: 'uuid', nullable: true })
  inscripcionVisitaId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_visita_id' })
  inscripcionVisita?: InscripcionTorneo | null;

  @Column({ name: 'ganador_inscripcion_id', type: 'uuid', nullable: true })
  ganadorInscripcionId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ganador_inscripcion_id' })
  ganadorInscripcion?: InscripcionTorneo | null;

  @Column({ name: 'es_tercer_puesto', type: 'boolean', default: false })
  esTercerPuesto!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
