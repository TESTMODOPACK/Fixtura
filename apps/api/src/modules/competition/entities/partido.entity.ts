import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Cancha } from './cancha.entity';
import { Equipo } from './equipo.entity';
import { Fecha } from './fecha.entity';
import { InscripcionTorneo } from './inscripcion-torneo.entity';

export type EstadoPartido =
  | 'PROGRAMADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'SUSPENDIDO_FUERZA_MAYOR'
  | 'REPROGRAMADO'
  | 'WALKOVER';

export type MotivoSuspension =
  | 'LLUVIA'
  | 'CANCHA_NO_DISPONIBLE'
  | 'FUERZA_MAYOR'
  | 'DECISION_LIGA'
  | 'OTRO';

@Entity({ name: 'partidos' })
@Index('idx_partidos_tenant', ['tenantId'])
@Index('idx_partidos_fecha', ['fechaId'])
@Index('idx_partidos_estado', ['estado'])
@Check(`"equipo_local_id" <> "equipo_visita_id"`)
export class Partido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'fecha_id', type: 'uuid' })
  fechaId!: string;

  @ManyToOne(() => Fecha, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fecha_id' })
  fecha?: Fecha;

  // ADR-0005 Fase 1 — write-only-new: estas FK al modelo viejo dejan de
  // escribirse; quedan nullable y conservan valores históricos como backup.
  @Column({ name: 'equipo_local_id', type: 'uuid', nullable: true })
  equipoLocalId!: string | null;

  @ManyToOne(() => Equipo, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_local_id' })
  equipoLocal?: Equipo | null;

  @Column({ name: 'equipo_visita_id', type: 'uuid', nullable: true })
  equipoVisitaId!: string | null;

  @ManyToOne(() => Equipo, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_visita_id' })
  equipoVisita?: Equipo | null;

  // Sprint 26G.1 (ADR-0004) — referencias paralelas al modelo nuevo.
  // Pobladas por backfill (migrate-clubes) y por el shim (Sprint 26G.2).
  // El código de lectura sigue usando equipo_*_id hasta el refactor
  // incremental del Sprint 26G.3.
  @Column({ name: 'inscripcion_local_id', type: 'uuid', nullable: true })
  inscripcionLocalId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_local_id' })
  inscripcionLocal?: InscripcionTorneo | null;

  @Column({ name: 'inscripcion_visita_id', type: 'uuid', nullable: true })
  inscripcionVisitaId!: string | null;

  @ManyToOne(() => InscripcionTorneo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inscripcion_visita_id' })
  inscripcionVisita?: InscripcionTorneo | null;

  // Fase Grupos — grupo al que pertenece el partido (formato GROUPS/MIXTO).
  // null para round-robin y para partidos de playoffs.
  @Column({ name: 'grupo_id', type: 'uuid', nullable: true })
  grupoId!: string | null;

  // Fase Playoffs — llave (cruce) a la que pertenece el partido (formato
  // PLAYOFFS/MIXTO). null para round-robin y grupos. En ida/vuelta, 2 partidos
  // comparten la misma llave.
  @Column({ name: 'llave_id', type: 'uuid', nullable: true })
  llaveId!: string | null;

  @Column({ name: 'cancha_id', type: 'uuid', nullable: true })
  canchaId!: string | null;

  @ManyToOne(() => Cancha, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancha_id' })
  cancha?: Cancha | null;

  // Mantenido por backwards-compat. Cuando canchaId está poblado, este
  // campo se usa como cache para mostrar (admin pueden seguir editándolo
  // como texto libre si no hay cancha en el catálogo todavía).
  @Column({ name: 'cancha_nombre', type: 'varchar', length: 100, nullable: true })
  canchaNombre!: string | null;

  @Column({ name: 'fecha_hora', type: 'timestamptz', nullable: true })
  fechaHora!: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'PROGRAMADO' })
  estado!: EstadoPartido;

  @Column({ name: 'goles_local', type: 'smallint', nullable: true })
  golesLocal!: number | null;

  @Column({ name: 'goles_visita', type: 'smallint', nullable: true })
  golesVisita!: number | null;

  @Column({ name: 'acta_cerrada_at', type: 'timestamptz', nullable: true })
  actaCerradaAt!: Date | null;

  @Column({ name: 'acta_cerrada_by', type: 'uuid', nullable: true })
  actaCerradaBy!: string | null;

  // F46.4 — certificación de jugadores presentes (roster del acta).
  // Requisito para cerrar el acta. Se setea al certificar presentes.
  @Column({ name: 'presentes_certificados_at', type: 'timestamptz', nullable: true })
  presentesCertificadosAt!: Date | null;

  @Column({ name: 'presentes_certificados_por', type: 'uuid', nullable: true })
  presentesCertificadosPor!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acta_cerrada_by' })
  actaCerradaByUser?: User | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  // Sprint 8 — Trazabilidad de suspensión.
  @Column({ name: 'motivo_suspension', type: 'varchar', length: 30, nullable: true })
  motivoSuspension!: MotivoSuspension | null;

  @Column({ name: 'suspendido_at', type: 'timestamptz', nullable: true })
  suspendidoAt!: Date | null;

  @Column({ name: 'suspendido_by_user_id', type: 'uuid', nullable: true })
  suspendidoByUserId!: string | null;

  @Column({ name: 'observaciones_suspension', type: 'text', nullable: true })
  observacionesSuspension!: string | null;

  // Sprint 18 (RF-17): cronómetro Match Center en vivo. Persistido para
  // sobrevivir restarts del API. El gateway reanuda timers desde DB en boot.
  @Column({ name: 'centro_estado', type: 'varchar', length: 20, default: 'IDLE' })
  centroEstado!: 'IDLE' | 'EN_VIVO' | 'PAUSADO' | 'FINALIZADO_CENTRO';

  @Column({ name: 'centro_arrancado_at', type: 'timestamptz', nullable: true })
  centroArrancadoAt!: Date | null;

  @Column({ name: 'centro_pausado_at', type: 'timestamptz', nullable: true })
  centroPausadoAt!: Date | null;

  @Column({ name: 'centro_segundos_acumulados', type: 'int', default: 0 })
  centroSegundosAcumulados!: number;

  @Column({ name: 'centro_periodo', type: 'smallint', default: 0 })
  centroPeriodo!: number;

  @Column({ name: 'centro_minutos_por_periodo', type: 'smallint', default: 40 })
  centroMinutosPorPeriodo!: number;

  // Sprint 29A — descanso entre períodos (solo info para la UI; no se
  // usa para cálculo del cronómetro).
  @Column({ name: 'centro_minutos_entretiempo', type: 'smallint', default: 10 })
  centroMinutosEntretiempo!: number;

  // Tiempo agregado del período actual (lo ingresa el cronista en vivo).
  // Extiende el objetivo del período: (minutosPorPeriodo + agregados)·60.
  // Se reinicia a 0 al pasar al siguiente período.
  @Column({ name: 'centro_minutos_agregados', type: 'smallint', default: 0 })
  centroMinutosAgregados!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
