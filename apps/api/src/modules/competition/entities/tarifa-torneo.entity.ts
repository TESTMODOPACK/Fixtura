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
import { Torneo } from './torneo.entity';

/**
 * Sprint 34A — Tarifario configurable por torneo.
 *
 * Cada fila define el monto a cobrar por un concepto específico dentro
 * de un torneo. El service consulta la tarifa cuando necesita generar
 * cobros automáticos (matrícula al inscribir, cuota mensual del cron,
 * multas al cerrar acta, walkover, etc.).
 *
 * Reglas:
 *   - UNIQUE (torneo_id, tipo): solo una tarifa por concepto por torneo.
 *     Si la liga necesita varios "OTRO", se admite mediante el tipo OTRO
 *     pero hoy igual restringe a uno por torneo (release v0; relajamos
 *     después si surge necesidad real).
 *   - `frecuencia` aplica solo a tipo=CUOTA (UNICO para los demás).
 *   - `dia_vencimiento` 1..31 para frecuencias mensuales/anuales;
 *     interpretado como día-de-la-semana 1..7 para SEMANAL.
 *   - Si una tarifa se desactiva, los cobros previos generados con ella
 *     NO se tocan; el cron y los hooks dejan de generar nuevos.
 */

export type TipoTarifa =
  | 'MATRICULA'
  | 'CUOTA'
  | 'MULTA_AMARILLA'
  | 'MULTA_ROJA'
  | 'MULTA_WALKOVER'
  | 'OTRO';

export type FrecuenciaCuota = 'UNICO' | 'SEMANAL' | 'MENSUAL' | 'ANUAL';

@Entity({ name: 'tarifas_torneo' })
@Index('idx_tarifas_tenant', ['tenantId'])
@Index('idx_tarifas_torneo', ['torneoId'])
@Unique('uq_tarifa_torneo_tipo', ['torneoId', 'tipo'])
export class TarifaTorneo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'torneo_id', type: 'uuid' })
  torneoId!: string;

  @ManyToOne(() => Torneo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo;

  @Column({ type: 'varchar', length: 40 })
  tipo!: TipoTarifa;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion!: string | null;

  /** Monto en pesos enteros (CLP). Para MULTA_FECHA_SANCION es "por fecha". */
  @Column({ type: 'int' })
  monto!: number;

  @Column({ type: 'varchar', length: 20, default: 'UNICO' })
  frecuencia!: FrecuenciaCuota;

  /**
   * Para frecuencia MENSUAL/ANUAL: día del mes (1..31).
   * Para SEMANAL: día de la semana (1=lunes .. 7=domingo).
   * Nullable porque MATRICULA y MULTAs son UNICO y no usan este campo.
   */
  @Column({ name: 'dia_vencimiento', type: 'smallint', nullable: true })
  diaVencimiento!: number | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
