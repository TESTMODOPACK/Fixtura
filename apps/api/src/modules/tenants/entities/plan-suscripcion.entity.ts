import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Sprint 23 — Catálogo de planes que un tenant puede tener.
 * Sin RLS — es data de plataforma. Mutaciones solo por SUPER_ADMIN.
 */
@Entity({ name: 'planes_suscripcion' })
export class PlanSuscripcion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug!: string;

  @Column({ name: 'precio_mensual_clp', type: 'int', default: 0 })
  precioMensualClp!: number;

  @Column({ type: 'smallint', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  limites!: {
    maxTorneos?: number | null;
    maxEquipos?: number | null;
    maxPartidosMes?: number | null;
    [k: string]: unknown;
  };

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  features!: Record<string, boolean>;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
