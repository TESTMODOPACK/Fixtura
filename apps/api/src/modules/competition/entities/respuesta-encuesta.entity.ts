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

import { EnvioEncuesta } from './envio-encuesta.entity';
import { PreguntaEncuesta } from './pregunta-encuesta.entity';

/**
 * Respuesta a una pregunta dentro de un envío (ADR-0011). El campo de valor
 * usado depende del tipo de la pregunta: `valorNumero` (NPS/escala/sí-no),
 * `valorTexto` (texto libre) o `valorOpciones` (opción única/múltiple).
 */
@Entity({ name: 'respuestas_encuesta' })
@Index('idx_respuestas_encuesta_tenant', ['tenantId'])
@Index('idx_respuestas_encuesta_envio', ['envioId'])
@Unique('uq_respuesta_encuesta', ['envioId', 'preguntaId'])
export class RespuestaEncuesta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'envio_id', type: 'uuid' })
  envioId!: string;

  @ManyToOne(() => EnvioEncuesta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio?: EnvioEncuesta;

  @Column({ name: 'pregunta_id', type: 'uuid' })
  preguntaId!: string;

  @ManyToOne(() => PreguntaEncuesta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pregunta_id' })
  pregunta?: PreguntaEncuesta;

  @Column({ name: 'valor_numero', type: 'smallint', nullable: true })
  valorNumero!: number | null;

  @Column({ name: 'valor_texto', type: 'text', nullable: true })
  valorTexto!: string | null;

  @Column({ name: 'valor_opciones', type: 'jsonb', nullable: true })
  valorOpciones!: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
