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
import type { MetodoPagoLiquidacion } from './liquidacion-personal.entity';

/**
 * F49 (ADR-0007) — Nómina de pago: lote de pago masivo a personal por un
 * período [periodo_desde, periodo_hasta]. Agrupa N LiquidacionPersonal (una
 * por persona) vía liquidaciones_personal.nomina_id. `total` y
 * `cantidad_personas` son snapshots del momento de emisión.
 *
 * Emitir una nómina = registrar el pago: crea las liquidaciones (las cuentas
 * por pagar del período quedan saldadas) y se exporta el Excel para el banco.
 * Revertir = eliminar la nómina → se borran sus liquidaciones y las
 * designaciones vuelven a quedar pendientes.
 */
@Entity({ name: 'nominas_pago' })
@Index('idx_nominas_pago_tenant', ['tenantId'])
export class NominaPago {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'periodo_desde', type: 'date' })
  periodoDesde!: string;

  @Column({ name: 'periodo_hasta', type: 'date' })
  periodoHasta!: string;

  @Column({ name: 'fecha_pago', type: 'date' })
  fechaPago!: string;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 20, default: 'TRANSFERENCIA' })
  metodoPago!: MetodoPagoLiquidacion;

  @Column({ type: 'int', default: 0 })
  total!: number;

  @Column({ name: 'cantidad_personas', type: 'int', default: 0 })
  cantidadPersonas!: number;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

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
