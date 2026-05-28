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
import { Cobro } from './cobro.entity';
import { Transaccion } from './transaccion.entity';

export type TipoDocumentoTributario =
  | 'BOLETA'
  | 'FACTURA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO';

export type EstadoDocumentoTributario =
  | 'PENDIENTE_EMISION'
  | 'EMITIDO'
  | 'RECHAZADO_SII'
  | 'FALLIDO';

@Entity({ name: 'documentos_tributarios' })
@Index('idx_documentos_tributarios_tenant', ['tenantId'])
export class DocumentoTributario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ name: 'transaccion_id', type: 'uuid', nullable: true })
  transaccionId!: string | null;

  @ManyToOne(() => Transaccion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transaccion_id' })
  transaccion?: Transaccion | null;

  @Column({ name: 'cobro_id', type: 'uuid', nullable: true })
  cobroId!: string | null;

  @ManyToOne(() => Cobro, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cobro_id' })
  cobro?: Cobro | null;

  @Column({ type: 'varchar', length: 30, default: 'BOLETA' })
  tipo!: TipoDocumentoTributario;

  @Column({ type: 'int' })
  monto!: number;

  @Column({ name: 'rut_receptor', type: 'varchar', length: 20, nullable: true })
  rutReceptor!: string | null;

  @Column({ name: 'razon_social', type: 'varchar', length: 200, nullable: true })
  razonSocial!: string | null;

  // bigint en TypeORM se mapea a string (precisión de 64 bits) — el folio
  // del SII puede ser un número grande, lo casteamos en toDto.
  @Column({ name: 'folio_sii', type: 'bigint', nullable: true })
  folioSii!: string | null;

  @Column({ name: 'url_pdf', type: 'varchar', length: 500, nullable: true })
  urlPdf!: string | null;

  @Column({ name: 'url_xml', type: 'varchar', length: 500, nullable: true })
  urlXml!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE_EMISION' })
  estado!: EstadoDocumentoTributario;

  @Column({ type: 'smallint', default: 0 })
  intentos!: number;

  @Column({ name: 'respuesta_sii', type: 'jsonb', nullable: true })
  respuestaSii!: Record<string, unknown> | null;

  @Column({ name: 'emitido_at', type: 'timestamptz', nullable: true })
  emitidoAt!: Date | null;

  @Column({ name: 'ultimo_error', type: 'text', nullable: true })
  ultimoError!: string | null;

  @Column({ name: 'ultimo_intento_at', type: 'timestamptz', nullable: true })
  ultimoIntentoAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
