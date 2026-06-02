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
 * Categoría de jugadores por edad para una liga (tenant).
 *
 * Las series viven embebidas como JSONB porque son una lista corta de
 * etiquetas con orden — no necesitamos FK desde otras tablas a una
 * serie específica. Si en el futuro un torneo tiene que apuntar a una
 * serie de una categoría, lo modelamos como (categoria_id, serie_slug)
 * sin promover series a tabla propia.
 *
 * Por qué JSONB y no tabla `series`: ya existe otra tabla `series`
 * (modelo viejo torneo→serie) que está en uso por la entity Equipo.
 * Mantenerlas separadas evita ambigüedad y rompimiento.
 */
export interface SerieEmbedded {
  slug: string;
  nombre: string;
  orden: number;
  activa: boolean;
}

@Entity({ name: 'categorias_jugadores' })
@Index('idx_categorias_tenant', ['tenantId'])
@Unique('uq_categoria_slug', ['tenantId', 'slug'])
export class CategoriaJugadores {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'varchar', length: 50 })
  slug!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ name: 'edad_minima_general', type: 'smallint' })
  edadMinimaGeneral!: number;

  @Column({ name: 'cupo_excepciones_por_equipo', type: 'smallint', default: 0 })
  cupoExcepcionesPorEquipo!: number;

  @Column({ name: 'edad_minima_excepcion', type: 'smallint', nullable: true })
  edadMinimaExcepcion!: number | null;

  @Column({ type: 'smallint', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  /** Series como JSONB ordenado. Ver SerieEmbedded. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  series!: SerieEmbedded[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
