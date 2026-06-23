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
import { Torneo } from './torneo.entity';

/**
 * Fase 1 (Grupos) — un grupo de la fase de grupos de un torneo (formato
 * GROUPS/MIXTO). Cada grupo es un round-robin interno; los equipos del grupo
 * viven en `grupo_inscripcion`, y los partidos del grupo llevan
 * `partidos.grupo_id`. Las posiciones se calculan por grupo.
 */
@Entity({ name: 'grupos_torneo' })
@Index('idx_grupos_torneo_tenant', ['tenantId'])
@Index('idx_grupos_torneo_torneo', ['torneoId'])
@Unique('uq_grupo_torneo_numero', ['torneoId', 'numero'])
export class GrupoTorneo {
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

  /** Número del grupo (1, 2, 3…). Único por torneo. */
  @Column({ type: 'smallint' })
  numero!: number;

  /** Etiqueta visible ("Grupo A", "Zona Norte", …). */
  @Column({ type: 'varchar', length: 50 })
  nombre!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
