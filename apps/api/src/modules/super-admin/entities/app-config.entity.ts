import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Sprint 37 — Configuración global de plataforma (no tenant-scoped).
 *
 * Almacena key/value para opciones que no calzan en otra tabla:
 *   - `default_tenant_id` — tenant que se muestra cuando el hostname del
 *     request no matchea ningún `custom_domain`. Útil mientras los DNS
 *     todavía no están apuntados.
 *
 * Sin RLS: es metadata global. Acceso solo desde super admin.
 */
@Entity({ name: 'app_config' })
export class AppConfig {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
