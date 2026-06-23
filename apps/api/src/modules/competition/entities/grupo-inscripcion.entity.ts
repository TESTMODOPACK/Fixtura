import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { GrupoTorneo } from './grupo-torneo.entity';
import { InscripcionTorneo } from './inscripcion-torneo.entity';
import { Torneo } from './torneo.entity';

/**
 * Fase 1 (Grupos) — pivote grupo ↔ inscripción: a qué grupo pertenece cada
 * equipo (InscripcionTorneo) del torneo. UNIQUE(torneo_id, inscripcion_id):
 * un equipo está en un solo grupo.
 */
@Entity({ name: 'grupo_inscripcion' })
@Index('idx_grupo_inscripcion_tenant', ['tenantId'])
@Index('idx_grupo_inscripcion_grupo', ['grupoId'])
@Unique('uq_grupo_inscripcion', ['torneoId', 'inscripcionId'])
export class GrupoInscripcion {
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

  @Column({ name: 'grupo_id', type: 'uuid' })
  grupoId!: string;

  @ManyToOne(() => GrupoTorneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grupo_id' })
  grupo?: GrupoTorneo;

  @Column({ name: 'inscripcion_id', type: 'uuid' })
  inscripcionId!: string;

  @ManyToOne(() => InscripcionTorneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inscripcion_id' })
  inscripcion?: InscripcionTorneo;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
