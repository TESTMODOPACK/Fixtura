import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { InscripcionTorneo } from './inscripcion-torneo.entity';
import { Partido } from './partido.entity';
import { SancionActiva } from './sancion-activa.entity';
import { TarifaTorneo } from './tarifa-torneo.entity';
import { Torneo } from './torneo.entity';

export type CategoriaCobro =
  | 'INSCRIPCION'
  | 'CUOTA'
  | 'MULTA'
  | 'ALQUILER_CANCHA'
  | 'ARBITRAJE'
  | 'OTRO';

export type MetodoPago =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'WEBPAY'
  | 'MERCADOPAGO'
  | 'OTRO';

export type EstadoDunning = 'AL_DIA' | 'MOROSO' | 'SUSPENDIDO';

@Entity({ name: 'cobros' })
@Index('idx_cobros_tenant', ['tenantId'])
export class Cobro {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  // ADR-0005 — el cobro se ancla a la inscripción del club en el torneo.
  @Column({ name: 'inscripcion_id', type: 'uuid', nullable: true })
  inscripcionId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_id' })
  inscripcion?: InscripcionTorneo | null;

  // Sprint 34A — vinculos para automatizacion y trazabilidad.
  @Column({ name: 'torneo_id', type: 'uuid', nullable: true })
  torneoId!: string | null;

  @ManyToOne(() => Torneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'torneo_id' })
  torneo?: Torneo | null;

  @Column({ name: 'partido_id', type: 'uuid', nullable: true })
  partidoId!: string | null;

  @ManyToOne(() => Partido, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partido_id' })
  partido?: Partido | null;

  @Column({ name: 'sancion_id', type: 'uuid', nullable: true })
  sancionId!: string | null;

  @ManyToOne(() => SancionActiva, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sancion_id' })
  sancion?: SancionActiva | null;

  @Column({ name: 'tarifa_id', type: 'uuid', nullable: true })
  tarifaId!: string | null;

  @ManyToOne(() => TarifaTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tarifa_id' })
  tarifa?: TarifaTorneo | null;

  /** True si lo creo un hook/cron automatico, false si lo cargo a mano el admin. */
  @Column({ name: 'generado_auto', type: 'boolean', default: false })
  generadoAuto!: boolean;

  // Identificacion del periodo cubierto por una cuota recurrente. Solo
  // tienen valor cuando la tarifa es CUOTA SEMANAL/MENSUAL/ANUAL. El
  // anti-duplicado del cron usa (inscripcion, tarifa, anio, mes/semana).
  @Column({ name: 'periodo_anio', type: 'smallint', nullable: true })
  periodoAnio!: number | null;

  @Column({ name: 'periodo_mes', type: 'smallint', nullable: true })
  periodoMes!: number | null;

  @Column({ name: 'periodo_semana', type: 'smallint', nullable: true })
  periodoSemana!: number | null;

  @Column({ type: 'varchar', length: 200 })
  concepto!: string;

  @Column({ type: 'varchar', length: 30, default: 'CUOTA' })
  categoria!: CategoriaCobro;

  // Monto en pesos enteros (CLP no usa decimales en transacciones diarias)
  @Column({ type: 'int' })
  monto!: number;

  @Column({ type: 'date', nullable: true })
  vencimiento!: string | null;

  @Column({ name: 'pagado_at', type: 'timestamptz', nullable: true })
  pagadoAt!: Date | null;

  @Column({ name: 'pagado_metodo', type: 'varchar', length: 30, nullable: true })
  pagadoMetodo!: MetodoPago | null;

  @Column({ name: 'pagado_referencia', type: 'varchar', length: 150, nullable: true })
  pagadoReferencia!: string | null;

  @Column({ type: 'boolean', default: false })
  cancelado!: boolean;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  // Sprint 7C — Dunning. Recalculado por el cron diario.
  @Column({ name: 'estado_dunning', type: 'varchar', length: 20, default: 'AL_DIA' })
  estadoDunning!: EstadoDunning;

  @Column({ name: 'dunning_avisos_enviados', type: 'smallint', default: 0 })
  dunningAvisosEnviados!: number;

  @Column({ name: 'dunning_ultimo_aviso_at', type: 'timestamptz', nullable: true })
  dunningUltimoAvisoAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
