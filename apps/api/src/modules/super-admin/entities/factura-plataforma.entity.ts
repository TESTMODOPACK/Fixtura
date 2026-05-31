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
import { PlanSuscripcion } from '../../tenants/entities/plan-suscripcion.entity';

export type EstadoFacturaPlataforma =
  | 'PENDIENTE'
  | 'PAGADA'
  | 'VENCIDA'
  | 'ANULADA';

export type MetodoPagoPlataforma =
  | 'WEBPAY'
  | 'MERCADOPAGO'
  | 'TRANSFERENCIA'
  | 'MANUAL'
  | 'ONECLICK';

@Entity({ name: 'facturas_plataforma' })
@Index('idx_facturas_plataforma_tenant_estado', ['tenantId', 'estado'])
@Unique('uq_factura_tenant_periodo', ['tenantId', 'periodoMes', 'periodoAnio'])
export class FacturaPlataforma {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId!: string | null;

  @ManyToOne(() => PlanSuscripcion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plan_id' })
  plan?: PlanSuscripcion | null;

  @Column({ name: 'periodo_mes', type: 'smallint' })
  periodoMes!: number;

  @Column({ name: 'periodo_anio', type: 'smallint' })
  periodoAnio!: number;

  @Column({ type: 'int' })
  monto!: number;

  @Column({ name: 'fecha_emision', type: 'date' })
  fechaEmision!: string;

  @Column({ name: 'fecha_vencimiento', type: 'date' })
  fechaVencimiento!: string;

  @Column({ name: 'fecha_pago', type: 'timestamptz', nullable: true })
  fechaPago!: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado!: EstadoFacturaPlataforma;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 20, nullable: true })
  metodoPago!: MetodoPagoPlataforma | null;

  @Column({ name: 'transaccion_id', type: 'uuid', nullable: true })
  transaccionId!: string | null;

  @Column({ name: 'doc_tributario_id', type: 'uuid', nullable: true })
  docTributarioId!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ name: 'anulada_motivo', type: 'text', nullable: true })
  anuladaMotivo!: string | null;

  @Column({ name: 'anulada_at', type: 'timestamptz', nullable: true })
  anuladaAt!: Date | null;

  @Column({ name: 'anulada_by_user_id', type: 'uuid', nullable: true })
  anuladaByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
