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
import { Cobro } from './cobro.entity';

export type PasarelaPago =
  | 'WEBPAY'
  | 'MERCADOPAGO'
  | 'MACH'
  | 'FLOW'
  | 'KHIPU'
  | 'MOCK';

export type EstadoTransaccion =
  | 'PENDIENTE'
  | 'PAGO_EN_TRANSITO'
  | 'APROBADO'
  | 'EXPIRADO'
  | 'REVERSADO'
  | 'RECHAZADO';

@Entity({ name: 'transacciones' })
@Index('idx_transacciones_tenant', ['tenantId'])
export class Transaccion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'cobro_id', type: 'uuid', nullable: true })
  cobroId!: string | null;

  @ManyToOne(() => Cobro, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cobro_id' })
  cobro?: Cobro | null;

  /**
   * Sprint 24A — vínculo opcional con factura plataforma cuando la
   * transacción corresponde al pago de la liga a LigaPlus (no a un
   * cobro equipo→liga). Mutuamente excluyente con cobroId en la
   * práctica, pero no lo enforcamos a nivel DB para mantener flexibilidad.
   */
  @Column({ name: 'factura_plataforma_id', type: 'uuid', nullable: true })
  facturaPlataformaId!: string | null;

  @Column({ type: 'int' })
  monto!: number;

  @Column({ type: 'varchar', length: 30 })
  pasarela!: PasarelaPago;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' })
  estado!: EstadoTransaccion;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 150 })
  idempotencyKey!: string;

  @Column({ name: 'token_pasarela', type: 'varchar', length: 200, nullable: true })
  tokenPasarela!: string | null;

  @Column({ name: 'url_redireccion', type: 'varchar', length: 500, nullable: true })
  urlRedireccion!: string | null;

  @Column({ name: 'respuesta_pasarela', type: 'jsonb', nullable: true })
  respuestaPasarela!: Record<string, unknown> | null;

  @Column({ name: 'user_pagador_id', type: 'uuid', nullable: true })
  userPagadorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_pagador_id' })
  userPagador?: User | null;

  @Column({ name: 'pagado_at', type: 'timestamptz', nullable: true })
  pagadoAt!: Date | null;

  @Column({ name: 'expira_at', type: 'timestamptz' })
  expiraAt!: Date;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
