import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Sprint 20 — RF-07 Audit log inmutable.
 *
 * Append-only: jamás se actualiza ni se borra (salvo retention policy
 * a años de distancia). Cada acción crítica genera una entrada con:
 *   - quién (user_id + ip_address + user_agent)
 *   - cuándo (created_at)
 *   - qué (action)
 *   - sobre qué (entity_type + entity_id)
 *   - estado pre/post (before_data / after_data, opcionales)
 *   - contexto extra (metadata JSONB libre)
 *
 * tenant_id es nullable: las acciones de plataforma (super_admin
 * impersona, super_admin crea tenant, login global) no tienen tenant.
 */
@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_tenant_date', ['tenantId', 'createdAt'])
@Index('idx_audit_logs_action', ['action'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData!: Record<string, unknown> | null;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
