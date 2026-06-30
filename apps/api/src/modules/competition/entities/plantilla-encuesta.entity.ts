import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { EstadoPlantilla } from '@fixtura/types';

import { PreguntaEncuesta } from './pregunta-encuesta.entity';

/**
 * Plantilla de encuesta configurable (ADR-0011). El admin arma sus preguntas
 * acá y dispara la plantilla por torneo. Reemplaza el NPS fijo.
 */
@Entity({ name: 'plantillas_encuesta' })
@Index('idx_plantillas_encuesta_tenant', ['tenantId'])
export class PlantillaEncuesta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoPlantilla;

  @OneToMany(() => PreguntaEncuesta, (p) => p.plantilla)
  preguntas?: PreguntaEncuesta[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
