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

export type MotivoSuspensionFecha =
  | 'LLUVIA'
  | 'CANCHA_NO_DISPONIBLE'
  | 'FUERZA_MAYOR'
  | 'DECISION_LIGA'
  | 'OTRO';

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

  // Sprint 8 — Trazabilidad de suspensión.
  @Column({ name: 'motivo_suspension', type: 'varchar', length: 30, nullable: true })
  motivoSuspension!: MotivoSuspensionFecha | null;

  @Column({ name: 'suspendido_at', type: 'timestamptz', nullable: true })
  suspendidoAt!: Date | null;

  @Column({ name: 'suspendido_by_user_id', type: 'uuid', nullable: true })
  suspendidoByUserId!: string | null;

  @Column({ name: 'observaciones_suspension', type: 'text', nullable: true })
  observacionesSuspension!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
