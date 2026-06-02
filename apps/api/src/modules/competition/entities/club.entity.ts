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

/**
 * Sprint 26A (ADR-0004) — Club a nivel tenant.
 *
 * Reemplaza el modelo viejo de equipos por torneo. El club es la
 * entidad de primera clase: tiene identidad propia, directiva,
 * categorías en las que compite y un plantel global por categoría.
 *
 * NO se relaciona directamente con Torneo. La participación en un
 * torneo se modela vía la entidad InscripcionTorneo.
 *
 * La directiva se guarda como JSONB embebido — son contactos sin
 * login (ADR-0004), no vinculados a la tabla users.
 */
export interface ContactoDirectivaEmbedded {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
}

export type EstadoClub = 'ACTIVO' | 'INACTIVO';

@Entity({ name: 'clubes' })
@Index('idx_clubes_tenant', ['tenantId'])
@Index('idx_clubes_estado', ['estado'])
@Unique('uq_club_slug', ['tenantId', 'slug'])
export class Club {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ name: 'escudo_url', type: 'varchar', length: 500, nullable: true })
  escudoUrl!: string | null;

  @Column({ name: 'color_primario', type: 'varchar', length: 7, nullable: true })
  colorPrimario!: string | null;

  @Column({ name: 'color_secundario', type: 'varchar', length: 7, nullable: true })
  colorSecundario!: string | null;

  @Column({ name: 'pagina_web', type: 'varchar', length: 500, nullable: true })
  paginaWeb!: string | null;

  @Column({ type: 'text', nullable: true })
  resena!: string | null;

  @Column({ name: 'presidente_nombre', type: 'varchar', length: 150, nullable: true })
  presidenteNombre!: string | null;

  @Column({ name: 'presidente_email', type: 'varchar', length: 150, nullable: true })
  presidenteEmail!: string | null;

  @Column({ name: 'presidente_telefono', type: 'varchar', length: 50, nullable: true })
  presidenteTelefono!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  delegados!: ContactoDirectivaEmbedded[];

  @Column({ name: 'historial_manual', type: 'text', nullable: true })
  historialManual!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: EstadoClub;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
