import { z } from 'zod';

export const TENANT_TYPE = {
  LIGA: 'LIGA',
  RECINTO: 'RECINTO',
  FEDERACION: 'FEDERACION',
} as const;

export type TenantType = (typeof TENANT_TYPE)[keyof typeof TENANT_TYPE];
export const TenantTypeSchema = z.enum(['LIGA', 'RECINTO', 'FEDERACION']);

export const PLAN = {
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type Plan = (typeof PLAN)[keyof typeof PLAN];
export const PlanSchema = z.enum(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']);

export const TenantSchema = z.object({
  id: z.uuid(),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  nombre: z.string().min(2).max(200),
  tipo: TenantTypeSchema,
  plan: PlanSchema,
  customDomain: z.string().nullable(),
  brandingJson: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantRequestSchema = z.object({
  slug: TenantSchema.shape.slug,
  nombre: TenantSchema.shape.nombre,
  tipo: TenantTypeSchema,
  plan: PlanSchema.default('STARTER'),
});
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;
