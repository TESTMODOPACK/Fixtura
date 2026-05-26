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
import { Torneo } from './torneo.entity';

export type EstadoFecha = 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'SUSPENDIDA' | 'REPROGRAMADA';

@Entity({ name: 'fechas' })
@Index('idx_fechas_tenant', ['tenantId'])
@Index('idx_fechas_torneo', ['torneoId'])
@Unique(['torneoId', 'numero'])
export class Fecha {
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

  @Column({ type: 'smallint' })
  numero!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  etiqueta!: string | null;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio!: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PROGRAMADA' })
  estado!: EstadoFecha;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
