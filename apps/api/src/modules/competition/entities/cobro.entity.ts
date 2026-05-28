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
import { Equipo } from './equipo.entity';

export type CategoriaCobro =
  | 'INSCRIPCION'
  | 'CUOTA'
  | 'MULTA'
  | 'ALQUILER_CANCHA'
  | 'ARBITRAJE'
  | 'OTRO';

export type MetodoPago =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'WEBPAY'
  | 'MERCADOPAGO'
  | 'OTRO';

export type EstadoDunning = 'AL_DIA' | 'MOROSO' | 'SUSPENDIDO';

@Entity({ name: 'cobros' })
@Index('idx_cobros_tenant', ['tenantId'])
export class Cobro {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'equipo_id', type: 'uuid', nullable: true })
  equipoId!: string | null;

  @ManyToOne(() => Equipo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'equipo_id' })
  equipo?: Equipo | null;

  @Column({ type: 'varchar', length: 200 })
  concepto!: string;

  @Column({ type: 'varchar', length: 30, default: 'CUOTA' })
  categoria!: CategoriaCobro;

  // Monto en pesos enteros (CLP no usa decimales en transacciones diarias)
  @Column({ type: 'int' })
  monto!: number;

  @Column({ type: 'date', nullable: true })
  vencimiento!: string | null;

  @Column({ name: 'pagado_at', type: 'timestamptz', nullable: true })
  pagadoAt!: Date | null;

  @Column({ name: 'pagado_metodo', type: 'varchar', length: 30, nullable: true })
  pagadoMetodo!: MetodoPago | null;

  @Column({ name: 'pagado_referencia', type: 'varchar', length: 150, nullable: true })
  pagadoReferencia!: string | null;

  @Column({ type: 'boolean', default: false })
  cancelado!: boolean;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  // Sprint 7C — Dunning. Recalculado por el cron diario.
  @Column({ name: 'estado_dunning', type: 'varchar', length: 20, default: 'AL_DIA' })
  estadoDunning!: EstadoDunning;

  @Column({ name: 'dunning_avisos_enviados', type: 'smallint', default: 0 })
  dunningAvisosEnviados!: number;

  @Column({ name: 'dunning_ultimo_aviso_at', type: 'timestamptz', nullable: true })
  dunningUltimoAvisoAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
