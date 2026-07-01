import { z } from 'zod';

import { ROLE, type Role } from './roles';

/**
 * Configuración del tenant que el admin de liga puede editar desde
 * /admin/ajustes. NO incluye campos administrativos como plan/tipo —
 * esos los maneja el super admin de LigaPlus.
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

/**
 * Configuración de cobros de la liga (Etapa 1 de pagos). Cada liga elige
 * qué métodos ofrece a sus clubes:
 *   - transferencia: datos bancarios que se muestran al club (no secreto).
 *   - pasarela: pago online vía Flow/Khipu. Las llaves NO viven acá — se
 *     guardan cifradas aparte y nunca se devuelven (ver
 *     pasarelaCredencialesCargadas en TenantSettings).
 */
export const PagosTransferenciaSchema = z.object({
  habilitada: z.boolean(),
  banco: z.string().max(80).optional(),
  tipoCuenta: z.string().max(40).optional(),
  numeroCuenta: z.string().max(40).optional(),
  titular: z.string().max(120).optional(),
  rut: z.string().max(20).optional(),
  email: z.string().max(150).optional(),
  instrucciones: z.string().max(500).optional(),
});
export type PagosTransferencia = z.infer<typeof PagosTransferenciaSchema>;

export const PROVEEDOR_PASARELA = ['FLOW', 'KHIPU'] as const;
export type ProveedorPasarela = (typeof PROVEEDOR_PASARELA)[number];

export const PagosPasarelaSchema = z.object({
  habilitada: z.boolean(),
  proveedor: z.enum(PROVEEDOR_PASARELA).nullable(),
});
export type PagosPasarela = z.infer<typeof PagosPasarelaSchema>;

export const PagosConfigSchema = z.object({
  transferencia: PagosTransferenciaSchema,
  pasarela: PagosPasarelaSchema,
});
export type PagosConfig = z.infer<typeof PagosConfigSchema>;

/**
 * Config de WhatsApp de la liga (BYO — cada liga conecta su propio número de
 * Meta Cloud API). NO incluye el token: vive cifrado y nunca se devuelve (ver
 * whatsappTokenCargado en TenantSettings).
 */
export const WhatsAppConfigSchema = z.object({
  activo: z.boolean(),
  phoneNumberId: z.string().max(50).nullable(),
  apiVersion: z.string().max(10),
});
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

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
  /**
   * Regla de negocio: ¿la liga está afiliada a ANFA y exige carnet
   * vigente a sus árbitros? Cuando true, auto-asignación excluye
   * carnets vencidos y la UI muestra alertas. Default false.
   */
  requiereCarnetAnfa: z.boolean(),
  /**
   * ¿La liga envía a los delegados de club un flyer semanal (lunes) con el
   * fixture de la próxima fecha, la última jugada y la tabla del torneo?
   * Default false — el admin lo activa acá.
   */
  flyerSemanalDelegados: z.boolean(),
  // Métodos de cobro de la liga.
  pagos: PagosConfigSchema,
  // ¿Hay llaves de pasarela guardadas? El GET nunca devuelve las llaves
  // en sí (solo este booleano); se setean write-only desde el update.
  pasarelaCredencialesCargadas: z.boolean(),
  // WhatsApp BYO de la liga (config no-secreta).
  whatsapp: WhatsAppConfigSchema,
  // ¿Hay token de Meta guardado? El GET nunca devuelve el token.
  whatsappTokenCargado: z.boolean(),
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
  requiereCarnetAnfa: z.boolean().optional(),
  flyerSemanalDelegados: z.boolean().optional(),
  // Config de cobros (se envía el objeto completo desde la pestaña Pagos).
  pagos: PagosConfigSchema.optional(),
  // Llaves de pasarela — write-only. Se setean juntas (las dos) o no se
  // tocan. El GET nunca las devuelve. Para borrarlas: limpiarCredencialesPasarela.
  flowApiKey: z.string().max(200).optional(),
  flowSecretKey: z.string().max(400).optional(),
  limpiarCredencialesPasarela: z.boolean().optional(),
  // WhatsApp BYO. La config no-secreta (activo/phoneNumberId/apiVersion) se
  // envía en `whatsapp`; el token es write-only en `whatsappToken` (o se
  // borra con limpiarWhatsappToken).
  whatsapp: WhatsAppConfigSchema.partial().optional(),
  whatsappToken: z.string().max(500).optional(),
  limpiarWhatsappToken: z.boolean().optional(),
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
  // Sprint TRI — opcional: si no se envía, el miembro se invita por magic link
  // (crea su propia contraseña vía email). Se mantiene como fallback manual.
  passwordTemporal: z.string().min(8).max(128).optional(),
});
export type InvitarMiembroRequest = z.infer<typeof InvitarMiembroSchema>;

// ─── Usuarios del sistema (vista consolidada de quién puede conectarse) ──

/** Categoría para agrupar usuarios en la vista consolidada. */
export const CATEGORIA_USUARIO = ['ADMIN', 'DELEGADO', 'PERSONAL', 'OTRO'] as const;
export type CategoriaUsuario = (typeof CATEGORIA_USUARIO)[number];

/** Un rol del usuario con su contexto legible (ej. el club del delegado). */
export const RolUsuarioSistemaSchema = z.object({
  role: z.string(),
  contexto: z.string().nullable(),
});
export type RolUsuarioSistema = z.infer<typeof RolUsuarioSistemaSchema>;

/** Una cuenta con acceso al sistema (tabla users) y sus roles en el tenant. */
export const UsuarioSistemaSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  nombre: z.string(),
  apellido: z.string(),
  activo: z.boolean(),
  ultimoLoginAt: z.string().nullable(),
  categoria: z.enum(CATEGORIA_USUARIO),
  roles: z.array(RolUsuarioSistemaSchema),
});
export type UsuarioSistema = z.infer<typeof UsuarioSistemaSchema>;
