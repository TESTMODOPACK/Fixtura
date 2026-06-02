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
import { User } from '../../users/entities/user.entity';

/**
 * Sprint 26A (ADR-0004) — Lista negra de jugadores por RUT.
 *
 * Identificación únicamente por RUT (ADR-0004). Si un RUT está en
 * esta tabla, el sistema bloquea cualquier intento de fichar a un
 * jugador con ese RUT en cualquier club del tenant.
 *
 * origen:
 *   - TRIBUNAL: insertado automáticamente al dictar una sanción
 *     permanente (sprint 26H se conecta al motor de sanciones).
 *   - MANUAL: insertado por admin de liga desde /admin/vetados.
 *
 * El veto es esencialmente inmutable: NO hay endpoint de "levantar
 * el veto". Si fuera necesario, requiere intervención del Super Admin
 * (operación de soporte fuera de la UI normal).
 */
export type OrigenVeto = 'TRIBUNAL' | 'MANUAL';

@Entity({ name: 'jugadores_vetados' })
@Index('idx_jugadores_vetados_tenant', ['tenantId'])
@Index('idx_jugadores_vetados_rut', ['rut'])
@Unique('uq_jugador_vetado_rut', ['tenantId', 'rut'])
export class JugadorVetado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 20 })
  rut!: string;

  @Column({ type: 'text', nullable: true })
  motivo!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  origen!: OrigenVeto;

  @Column({ name: 'creado_por_user_id', type: 'uuid', nullable: true })
  creadoPorUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'creado_por_user_id' })
  creadoPor?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
