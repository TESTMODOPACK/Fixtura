import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { TipoPregunta } from '@fixtura/types';

import { PlantillaEncuesta } from './plantilla-encuesta.entity';

/**
 * Pregunta de una plantilla de encuesta (ADR-0011). `opciones` se usa solo
 * para OPCION_UNICA/OPCION_MULTIPLE; `esNps` marca la pregunta 0-10 que
 * alimenta el score NPS (máx una por plantilla).
 */
@Entity({ name: 'preguntas_encuesta' })
@Index('idx_preguntas_encuesta_tenant', ['tenantId'])
@Index('idx_preguntas_encuesta_plantilla', ['plantillaId'])
export class PreguntaEncuesta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'plantilla_id', type: 'uuid' })
  plantillaId!: string;

  @ManyToOne(() => PlantillaEncuesta, (p) => p.preguntas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla?: PlantillaEncuesta;

  @Column({ type: 'smallint', default: 0 })
  orden!: number;

  @Column({ type: 'varchar', length: 300 })
  texto!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TipoPregunta;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  opciones!: string[];

  @Column({ type: 'boolean', default: false })
  obligatoria!: boolean;

  @Column({ name: 'es_nps', type: 'boolean', default: false })
  esNps!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
