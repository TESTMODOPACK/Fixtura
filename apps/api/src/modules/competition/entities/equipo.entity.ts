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

import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Serie } from './serie.entity';
import { Torneo } from './torneo.entity';

export type EstadoEquipo = 'INSCRITO' | 'ACTIVO' | 'RETIRADO' | 'SUSPENDIDO';

@Entity({ name: 'equipos' })
@Index('idx_equipos_tenant', ['tenantId'])
@Index('idx_equipos_torneo', ['torneoId'])
@Unique(['torneoId', 'slug'])
export class Equipo {
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

  @Column({ name: 'serie_id', type: 'uuid', nullable: true })
  serieId!: string | null;

  @ManyToOne(() => Serie, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'serie_id' })
  serie?: Serie | null;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ name: 'escudo_url', type: 'varchar', length: 500, nullable: true })
  escudoUrl!: string | null;

  @Column({ name: 'color_primario', type: 'varchar', length: 7, nullable: true })
  colorPrimario!: string | null;

  @Column({ name: 'color_secundario', type: 'varchar', length: 7, nullable: true })
  colorSecundario!: string | null;

  @Column({ name: 'delegado_user_id', type: 'uuid', nullable: true })
  delegadoUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'delegado_user_id' })
  delegado?: User | null;

  @Column({ type: 'varchar', length: 20, default: 'INSCRITO' })
  estado!: EstadoEquipo;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
