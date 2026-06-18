import { z } from 'zod';

/**
 * Sprint 23 — Tipos del módulo Super Admin (plataforma).
 * Estos tipos solo aplican a usuarios con rol SUPER_ADMIN.
 */

// ─── Planes de suscripción ───────────────────────────────────────────
export const PlanLimitesSchema = z.object({
  maxTorneos: z.number().int().nullable().optional(),
  maxEquipos: z.number().int().nullable().optional(),
  maxPartidosMes: z.number().int().nullable().optional(),
});
export type PlanLimites = z.infer<typeof PlanLimitesSchema>;

export const PlanSuscripcionSchema = z.object({
  id: z.uuid(),
  nombre: z.string(),
  slug: z.string(),
  precioMensualClp: z.number().int(),
  orden: z.number().int(),
  activo: z.boolean(),
  limites: PlanLimitesSchema,
  features: z.record(z.string(), z.boolean()),
  descripcion: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PlanSuscripcion = z.infer<typeof PlanSuscripcionSchema>;

export const CreatePlanSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  precioMensualClp: z.number().int().min(0),
  orden: z.number().int().min(0).default(0),
  activo: z.boolean().default(true),
  limites: PlanLimitesSchema.default({}),
  features: z.record(z.string(), z.boolean()).default({}),
  descripcion: z.string().max(500).nullable().optional(),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanSchema>;

export const UpdatePlanSchema = CreatePlanSchema.partial();
export type UpdatePlanRequest = z.infer<typeof UpdatePlanSchema>;

// ─── Tenants (vista plataforma) ──────────────────────────────────────
export const EstadoSuscripcionSchema = z.enum([
  'TRIAL',
  'ACTIVO',
  'SUSPENDIDO',
  'CANCELADO',
]);
export type EstadoSuscripcion = z.infer<typeof EstadoSuscripcionSchema>;

export const TenantPlatformSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  customDomain: z.string().nullable(),
  isActive: z.boolean(),
  estadoSuscripcion: EstadoSuscripcionSchema,
  trialExpiraAt: z.iso.datetime().nullable(),
  suspendidoAt: z.iso.datetime().nullable(),
  suspendidoMotivo: z.string().nullable(),
  planId: z.uuid().nullable(),
  planNombre: z.string().nullable(),
  featureFlags: z.record(z.string(), z.boolean()),
  // Métricas resumidas para la lista
  torneos: z.number().int(),
  equipos: z.number().int(),
  miembros: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type TenantPlatform = z.infer<typeof TenantPlatformSchema>;

export const CreateTenantPlatformSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  nombre: z.string().min(2).max(200),
  tipo: z.enum(['LIGA', 'RECINTO', 'FEDERACION']).default('LIGA'),
  planSlug: z.string().min(2).max(50).optional(),
  // Admin inicial: si se pasa, se crea el user + user_role LIGA_ADMIN.
  adminEmail: z.email().max(150).optional(),
  adminNombre: z.string().min(2).max(100).optional(),
  adminApellido: z.string().min(2).max(100).optional(),
  adminPassword: z.string().min(10).max(128).optional(),
  trialDias: z.number().int().min(0).max(365).default(30),
});
export type CreateTenantPlatformRequest = z.infer<typeof CreateTenantPlatformSchema>;

export const UpdateTenantPlatformSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  customDomain: z.string().max(255).nullable().optional(),
  planId: z.uuid().nullable().optional(),
  estadoSuscripcion: EstadoSuscripcionSchema.optional(),
  trialExpiraAt: z.iso.datetime().nullable().optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTenantPlatformRequest = z.infer<
  typeof UpdateTenantPlatformSchema
>;

export const SuspenderTenantSchema = z.object({
  motivo: z.string().min(2).max(500),
});
export type SuspenderTenantRequest = z.infer<typeof SuspenderTenantSchema>;

// ─── Métricas de plataforma ──────────────────────────────────────────
export const MetricasPlataformaSchema = z.object({
  tenants: z.object({
    total: z.number().int(),
    activos: z.number().int(),
    trial: z.number().int(),
    suspendidos: z.number().int(),
    cancelados: z.number().int(),
  }),
  usuarios: z.object({
    total: z.number().int(),
    activosUltimoMes: z.number().int(),
  }),
  competicion: z.object({
    torneosActivos: z.number().int(),
    partidosUltimo30d: z.number().int(),
    actasCerradasUltimo30d: z.number().int(),
  }),
  ingresos: z.object({
    mrr: z.number().int(),
    arr: z.number().int(),
  }),
  ultimaActualizacion: z.iso.datetime(),
});
export type MetricasPlataforma = z.infer<typeof MetricasPlataformaSchema>;

// ─── Health & Status ─────────────────────────────────────────────────
export const SystemHealthSchema = z.object({
  db: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nullable(),
    error: z.string().nullable(),
  }),
  redis: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nullable(),
    error: z.string().nullable(),
  }),
  uptimeSec: z.number(),
  nodeVersion: z.string(),
  gitSha: z.string().nullable(),
  timestamp: z.iso.datetime(),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// ─── Sprint 37 — Portal config (tenant por defecto) ─────────────────
export const PortalConfigSchema = z.object({
  /**
   * UUID del tenant que se muestra cuando el hostname del request no
   * matchea ningun `tenants.custom_domain`. Si es null, el sistema usa
   * los fallbacks heredados (FALLBACK_TENANT_SLUG o `liga-demo` en dev).
   */
  defaultTenantId: z.uuid().nullable(),
  /** Cuándo se actualizó por última vez. */
  updatedAt: z.iso.datetime().nullable(),
  /** UUID del super admin que lo cambió. */
  updatedBy: z.uuid().nullable(),
});
export type PortalConfig = z.infer<typeof PortalConfigSchema>;

export const UpdatePortalConfigSchema = z.object({
  defaultTenantId: z.uuid().nullable(),
});
export type UpdatePortalConfigRequest = z.infer<typeof UpdatePortalConfigSchema>;
