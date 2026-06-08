import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { NominaPago } from './nomina-pago.entity';
import { Personal } from './personal.entity';

export type MetodoPagoLiquidacion = 'TRANSFERENCIA' | 'EFECTIVO' | 'OTRO';

/**
 * F47 (ADR-0006) — Liquidación de pago al personal: un pago agrupado a una
 * persona que salda varias designaciones ASISTIO pendientes. `total` es un
 * snapshot de la suma de montos al momento de liquidar. Las designaciones
 * incluidas referencian esta liquidación vía designaciones.liquidacion_id.
 */
@Entity({ name: 'liquidaciones_personal' })
@Index('idx_liquidaciones_personal_tenant', ['tenantId'])
@Index('idx_liquidaciones_personal_personal', ['personalId'])
export class LiquidacionPersonal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'personal_id', type: 'uuid' })
  personalId!: string;

  @ManyToOne(() => Personal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'personal_id' })
  personal?: Personal;

  @Column({ type: 'int', default: 0 })
  total!: number;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 20, default: 'TRANSFERENCIA' })
  metodoPago!: MetodoPagoLiquidacion;

  @Column({ type: 'text', nullable: true })
  comprobante!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ name: 'fecha_pago', type: 'date' })
  fechaPago!: string;

  // F49 (ADR-0007) — nómina (lote de pago masivo) a la que pertenece esta
  // liquidación. NULL = liquidación individual (F47).
  @Column({ name: 'nomina_id', type: 'uuid', nullable: true })
  nominaId!: string | null;

  @ManyToOne(() => NominaPago, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'nomina_id' })
  nomina?: NominaPago | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
