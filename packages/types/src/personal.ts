import { z } from 'zod';

/**
 * Personal operativo de la liga: árbitros, planilleros, paramédicos.
 * El catálogo es por tenant (cada liga tiene los suyos).
 */

export const ROL_PERSONAL = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
  'PLANILLERO',
  'PARAMEDICO',
  'OTRO',
] as const;
export type RolPersonal = (typeof ROL_PERSONAL)[number];

/**
 * Roles que se asignan a un partido específico. Paramédico y "otro"
 * son personal del RECINTO (cubre toda la jornada de la cancha, no un
 * partido individual) — quedan fuera de las designaciones por partido.
 */
export const ROLES_DESIGNABLES_PARTIDO = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
  'PLANILLERO',
] as const;
export type RolDesignablePartido = (typeof ROLES_DESIGNABLES_PARTIDO)[number];

/**
 * Cuántos slots de cada rol se necesitan por partido. Estándar ANFA:
 *   - 1 árbitro principal
 *   - 2 árbitros asistentes (uno por línea)
 *   - 1 planillero
 *
 * La auto-asignación itera estos slots. La UI muestra exactamente esta
 * cantidad de filas por partido y rol.
 */
export const SLOTS_POR_ROL: Record<RolDesignablePartido, number> = {
  ARBITRO_PRINCIPAL: 1,
  ARBITRO_ASISTENTE: 2,
  PLANILLERO: 1,
};

/**
 * Roles asignables al RECINTO (toda la jornada de una cancha, no por
 * partido). Típicamente: paramédico y personal de servicio.
 */
export const ROLES_DESIGNABLES_RECINTO = [
  'PARAMEDICO',
  'OTRO',
] as const;
export type RolDesignableRecinto = (typeof ROLES_DESIGNABLES_RECINTO)[number];

/**
 * Roles arbitrales que requieren carnet ANFA vigente. Usado para
 * computar warnings en designaciones.
 */
export const ROLES_ARBITRAJE = [
  'ARBITRO_PRINCIPAL',
  'ARBITRO_ASISTENTE',
] as const;
export type RolArbitraje = (typeof ROLES_ARBITRAJE)[number];

/**
 * F49 — Tipos de cuenta bancaria chilenos para nómina de pago.
 */
export const TIPO_CUENTA_BANCARIA = [
  'CORRIENTE',
  'VISTA',
  'AHORRO',
  'CUENTA_RUT',
] as const;
export type TipoCuentaBancaria = (typeof TIPO_CUENTA_BANCARIA)[number];

export const TIPO_CUENTA_BANCARIA_LABEL: Record<TipoCuentaBancaria, string> = {
  CORRIENTE: 'Cuenta corriente',
  VISTA: 'Cuenta vista',
  AHORRO: 'Cuenta de ahorro',
  CUENTA_RUT: 'CuentaRUT',
};

export const PersonalAdminSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  nombre: z.string(),
  apellido: z.string(),
  rut: z.string().nullable(),
  rol: z.enum(ROL_PERSONAL),
  telefono: z.string().nullable(),
  email: z.string().nullable(),
  tarifaBase: z.number().int().nullable(),
  // F51 — tarifas por rol arbitral (fallback a tarifaBase si null).
  tarifaArbitroPrincipal: z.number().int().nullable(),
  tarifaArbitroAsistente: z.number().int().nullable(),
  carnetAnfaNumero: z.string().nullable(),
  // ISO date YYYY-MM-DD o null
  carnetAnfaVence: z.string().nullable(),
  activo: z.boolean(),
  // F49 — datos bancarios para nómina de pago.
  banco: z.string().nullable(),
  tipoCuenta: z.enum(TIPO_CUENTA_BANCARIA).nullable(),
  numeroCuenta: z.string().nullable(),
  titularNombre: z.string().nullable(),
  titularRut: z.string().nullable(),
  notas: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type PersonalAdmin = z.infer<typeof PersonalAdminSchema>;

export const CreatePersonalSchema = z.object({
  nombre: z.string().min(2).max(100),
  apellido: z.string().min(2).max(100),
  rut: z.string().max(20).optional().nullable(),
  rol: z.enum(ROL_PERSONAL),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),
  tarifaBase: z.number().int().min(0).optional().nullable(),
  tarifaArbitroPrincipal: z.number().int().min(0).optional().nullable(),
  tarifaArbitroAsistente: z.number().int().min(0).optional().nullable(),
  carnetAnfaNumero: z.string().max(50).optional().nullable(),
  carnetAnfaVence: z.string().optional().nullable(),
  // F49 — datos bancarios (opcionales).
  banco: z.string().max(60).optional().nullable(),
  tipoCuenta: z.enum(TIPO_CUENTA_BANCARIA).optional().nullable(),
  numeroCuenta: z.string().max(40).optional().nullable(),
  titularNombre: z.string().max(150).optional().nullable(),
  titularRut: z.string().max(20).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
});
export type CreatePersonalRequest = z.infer<typeof CreatePersonalSchema>;

export const UpdatePersonalSchema = CreatePersonalSchema.partial().extend({
  activo: z.boolean().optional(),
});
export type UpdatePersonalRequest = z.infer<typeof UpdatePersonalSchema>;

/**
 * F48 — Ausencias del personal por rango de fechas calendario.
 * `desde`/`hasta` son fechas YYYY-MM-DD inclusivas. Una persona está NO
 * disponible para un partido si la fecha del partido cae en [desde, hasta].
 */
export const AusenciaPersonalSchema = z.object({
  id: z.uuid(),
  personalId: z.uuid(),
  desde: z.string(), // YYYY-MM-DD
  hasta: z.string(), // YYYY-MM-DD
  motivo: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AusenciaPersonal = z.infer<typeof AusenciaPersonalSchema>;

export const CrearAusenciaSchema = z
  .object({
    desde: z.string().min(10).max(10), // YYYY-MM-DD
    hasta: z.string().min(10).max(10),
    motivo: z.string().max(200).optional().nullable(),
  })
  .refine((v) => v.hasta >= v.desde, {
    message: 'La fecha "hasta" no puede ser anterior a "desde".',
    path: ['hasta'],
  });
export type CrearAusenciaRequest = z.infer<typeof CrearAusenciaSchema>;
