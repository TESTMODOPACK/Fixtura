import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { Plan, TenantType } from '@fixtura/types';

@Entity({ name: 'tenants' })
@Index('idx_tenants_slug', ['slug'])
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  /**
   * Dominio propio del cliente (ej. "liganunoa.cl"). El backend mapea
   * `req.headers.host` → tenant via este campo. Nullable porque en dev
   * y al provisionar un tenant aún no tiene dominio configurado.
   */
  @Column({ name: 'custom_domain', type: 'varchar', length: 255, nullable: true, unique: true })
  customDomain!: string | null;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TenantType;

  @Column({ type: 'varchar', length: 20, default: 'STARTER' })
  plan!: Plan;

  @Column({ name: 'branding_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  brandingJson!: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Flag de regla de negocio: ¿la liga está afiliada a ANFA y exige
   * carnet vigente a sus árbitros? Default false (la mayoría de las
   * ligas amateur son libres). Cuando true, la auto-asignación
   * excluye árbitros con carnet vencido y la UI muestra alertas.
   */
  @Column({ name: 'requiere_carnet_anfa', type: 'boolean', default: false })
  requiereCarnetAnfa!: boolean;

  /**
   * Config de métodos de cobro de la liga (transferencia + on/off pasarela
   * + proveedor). NO contiene secretos — las llaves de la pasarela viven
   * cifradas en `pagosSecretosEnc`.
   */
  @Column({ name: 'pagos_config', type: 'jsonb', default: () => "'{}'::jsonb" })
  pagosConfig!: Record<string, unknown>;

  /**
   * Credenciales de la pasarela (Flow/Khipu) cifradas con AES-256-GCM
   * (ver common/crypto/secret-box). Nunca se devuelven al cliente.
   */
  @Column({ name: 'pagos_secretos_enc', type: 'text', nullable: true })
  pagosSecretosEnc!: string | null;

  /**
   * Config de WhatsApp de la liga (BYO — cada liga conecta su propio número
   * de Meta Cloud API). NO contiene el token: { activo, phoneNumberId,
   * apiVersion }. El token vive cifrado en whatsapp_token_enc.
   */
  @Column({ name: 'whatsapp_config', type: 'jsonb', default: () => "'{}'::jsonb" })
  whatsappConfig!: Record<string, unknown>;

  /**
   * Token de Meta Cloud API (System User Token) cifrado con AES-256-GCM
   * (mismo secret-box que pagos). Nunca se devuelve al cliente.
   */
  @Column({ name: 'whatsapp_token_enc', type: 'text', nullable: true })
  whatsappTokenEnc!: string | null;

  // ── Sprint 23: Super Admin / planes ───────────────────────────────
  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId!: string | null;

  @Column({
    name: 'estado_suscripcion',
    type: 'varchar',
    length: 20,
    default: 'TRIAL',
  })
  estadoSuscripcion!: 'TRIAL' | 'ACTIVO' | 'SUSPENDIDO' | 'CANCELADO';

  @Column({ name: 'trial_expira_at', type: 'timestamptz', nullable: true })
  trialExpiraAt!: Date | null;

  @Column({ name: 'suspendido_at', type: 'timestamptz', nullable: true })
  suspendidoAt!: Date | null;

  @Column({ name: 'suspendido_motivo', type: 'text', nullable: true })
  suspendidoMotivo!: string | null;

  @Column({ name: 'feature_flags', type: 'jsonb', default: () => "'{}'::jsonb" })
  featureFlags!: Record<string, boolean>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
