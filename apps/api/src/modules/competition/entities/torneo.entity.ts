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
import { Temporada } from './temporada.entity';

export type TipoFormato = 'ROUND_ROBIN' | 'PLAYOFFS' | 'GROUPS' | 'MIXTO';
export type EstadoTorneo = 'DRAFT' | 'ACTIVO' | 'CERRADO';

@Entity({ name: 'torneos' })
@Index('idx_torneos_tenant', ['tenantId'])
@Index('idx_torneos_temporada', ['temporadaId'])
@Index('idx_torneos_estado', ['estado'])
@Unique(['tenantId', 'slug'])
export class Torneo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'temporada_id', type: 'uuid' })
  temporadaId!: string;

  @ManyToOne(() => Temporada, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'temporada_id' })
  temporada?: Temporada;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ name: 'tipo_formato', type: 'varchar', length: 20, default: 'ROUND_ROBIN' })
  tipoFormato!: TipoFormato;

  @Column({ type: 'smallint', default: 1 })
  ruedas!: 1 | 2;

  @Column({ name: 'puntos_victoria', type: 'smallint', default: 3 })
  puntosVictoria!: number;

  @Column({ name: 'puntos_empate', type: 'smallint', default: 1 })
  puntosEmpate!: number;

  @Column({ name: 'puntos_derrota', type: 'smallint', default: 0 })
  puntosDerrota!: number;

  // Sprint 12 — orden de tiebreakers configurable por torneo.
  // Default: ["pts","dg","gf","nombre"]. Otras keys: gc, pg, ed.
  @Column({ name: 'tabla_tiebreakers', type: 'jsonb', default: () => `'["pts","dg","gf","nombre"]'::jsonb` })
  tablaTiebreakers!: string[];

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  estado!: EstadoTorneo;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio!: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin!: string | null;

  @Column({ name: 'reglamento_url', type: 'varchar', length: 500, nullable: true })
  reglamentoUrl!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
