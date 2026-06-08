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

export type RolPersonal =
  | 'ARBITRO_PRINCIPAL'
  | 'ARBITRO_ASISTENTE'
  | 'PLANILLERO'
  | 'PARAMEDICO'
  | 'OTRO';

export type TipoCuentaBancaria =
  | 'CORRIENTE'
  | 'VISTA'
  | 'AHORRO'
  | 'CUENTA_RUT';

/**
 * Catálogo de personal operativo de la liga. user_id es opcional
 * porque muchas personas son sólo registros administrativos sin cuenta.
 */
@Entity({ name: 'personal' })
@Index('idx_personal_tenant', ['tenantId'])
@Index('idx_personal_rol', ['rol'])
export class Personal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  apellido!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rut!: string | null;

  @Column({ type: 'varchar', length: 30 })
  rol!: RolPersonal;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ name: 'tarifa_base', type: 'int', nullable: true })
  tarifaBase!: number | null;

  @Column({ name: 'carnet_anfa_numero', type: 'varchar', length: 50, nullable: true })
  carnetAnfaNumero!: string | null;

  @Column({ name: 'carnet_anfa_vence', type: 'date', nullable: true })
  carnetAnfaVence!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // F49 (ADR-0007) — datos bancarios para nómina de pago / transferencia.
  @Column({ type: 'varchar', length: 60, nullable: true })
  banco!: string | null;

  @Column({ name: 'tipo_cuenta', type: 'varchar', length: 20, nullable: true })
  tipoCuenta!: TipoCuentaBancaria | null;

  @Column({ name: 'numero_cuenta', type: 'varchar', length: 40, nullable: true })
  numeroCuenta!: string | null;

  // Titular distinto al personal (cuenta de un tercero). NULL = el titular
  // es la propia persona.
  @Column({ name: 'titular_nombre', type: 'varchar', length: 150, nullable: true })
  titularNombre!: string | null;

  @Column({ name: 'titular_rut', type: 'varchar', length: 20, nullable: true })
  titularRut!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
