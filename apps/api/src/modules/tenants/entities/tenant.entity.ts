import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { Plan, TenantType } from '@fixtura/types';

@Entity({ name: 'tenants' })
@Index('idx_tenants_slug', ['slug'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  /**
   * Dominio propio del cliente (ej. "liganunoa.cl"). El backend mapea
   * `req.headers.host` → tenant via este campo. Nullable porque en dev
   * y al provisionar un tenant aún no tiene dominio configurado.
   */
  @Column({ name: 'custom_domain', type: 'varchar', length: 255, nullable: true, unique: true })
  customDomain!: string | null;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TenantType;

  @Column({ type: 'varchar', length: 20, default: 'STARTER' })
  plan!: Plan;

  @Column({ name: 'branding_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  brandingJson!: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Flag de regla de negocio: ¿la liga está afiliada a ANFA y exige
   * carnet vigente a sus árbitros? Default false (la mayoría de las
   * ligas amateur son libres). Cuando true, la auto-asignación
   * excluye árbitros con carnet vencido y la UI muestra alertas.
   */
  @Column({ name: 'requiere_carnet_anfa', type: 'boolean', default: false })
  requiereCarnetAnfa!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
