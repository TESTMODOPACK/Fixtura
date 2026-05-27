import { z } from 'zod';

import { ROLE, type Role } from './roles';

/**
 * Configuración del tenant que el admin de liga puede editar desde
 * /admin/ajustes. NO incluye campos administrativos como plan/tipo —
 * esos los maneja el super admin de Fixtura.
 */

/**
 * Branding configurable por el cliente. Vive como JSONB en
 * tenants.branding_json. Todos los campos son opcionales — la UI
 * cae a defaults si faltan.
 */
export const BrandingSchema = z.object({
  // Nombre comercial visible en el portal público. Si vacío, usa Tenant.nombre.
  nombreComercial: z.string().max(150).optional(),
  // Slogan / lema corto bajo el nombre en la home pública.
  lemaCorto: z.string().max(200).optional(),
  // Hex de los 2 colores principales (#RRGGBB). El portal aplica el primario
  // como acento y el secundario como contraste.
  colorPrimario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser #RRGGBB')
    .optional(),
  colorSecundario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser #RRGGBB')
    .optional(),
  // URL pública al escudo / logo de la liga.
  escudoUrl: z.string().url().max(500).optional().or(z.literal('')),
  // Email de contacto público para la liga.
  emailContacto: z.string().email().max(150).optional().or(z.literal('')),
  // Teléfono de contacto público (WhatsApp incluido).
  telefonoContacto: z.string().max(50).optional(),
  // Texto libre para el footer.
  footerTexto: z.string().max(500).optional(),
});
export type Branding = z.infer<typeof BrandingSchema>;

export const TenantSettingsSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  nombre: z.string(),
  // Dominio propio del cliente (ej. "liganunoa.cl"). Nullable.
  customDomain: z.string().nullable(),
  branding: BrandingSchema,
  plan: z.string(),
  tipo: z.string(),
  isActive: z.boolean(),
});
export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

export const UpdateTenantSettingsSchema = z.object({
  nombre: z.string().min(2).max(200).optional(),
  customDomain: z
    .union([
      z.literal(''),
      z
        .string()
        .min(4)
        .max(255)
        .regex(
          /^([a-z0-9-]+\.)+[a-z]{2,}$/i,
          'Debe ser un dominio válido (ej. liganunoa.cl)',
        ),
    ])
    .optional(),
  branding: BrandingSchema.optional(),
});
export type UpdateTenantSettingsRequest = z.infer<typeof UpdateTenantSettingsSchema>;

/**
 * Miembro del equipo admin del tenant. Listamos solo a los que tienen
 * roles con scope TENANT (no jugadores ni delegados de club).
 */
export const MiembroAdminSchema = z.object({
  userRoleId: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  nombre: z.string(),
  apellido: z.string(),
  rol: z.enum([
    ROLE.LIGA_ADMIN,
    ROLE.LIGA_COORDINADOR,
    ROLE.LIGA_COORDINADOR_ARBITROS,
    ROLE.LIGA_CONTADOR,
    ROLE.LIGA_COMERCIAL,
    ROLE.TRIBUNAL_DISCIPLINA,
  ]),
  ultimoLoginAt: z.iso.datetime().nullable(),
  grantedAt: z.iso.datetime(),
});
export type MiembroAdmin = z.infer<typeof MiembroAdminSchema>;

export const ROLES_ADMIN_INVITABLES = [
  ROLE.LIGA_ADMIN,
  ROLE.LIGA_COORDINADOR,
  ROLE.LIGA_COORDINADOR_ARBITROS,
  ROLE.LIGA_CONTADOR,
  ROLE.LIGA_COMERCIAL,
  ROLE.TRIBUNAL_DISCIPLINA,
] as const;
export type RolAdminInvitable = (typeof ROLES_ADMIN_INVITABLES)[number];

export const InvitarMiembroSchema = z.object({
  email: z.string().email().max(150),
  nombre: z.string().min(2).max(100),
  apellido: z.string().min(2).max(100),
  rol: z.enum(ROLES_ADMIN_INVITABLES),
  // Password temporal — el invitado debería cambiarla en el primer
  // login. Por ahora MVP sin magic link.
  passwordTemporal: z.string().min(8).max(128),
});
export type InvitarMiembroRequest = z.infer<typeof InvitarMiembroSchema>;
