import { z } from 'zod';

/**
 * Validación de RUT chileno (formato y dígito verificador módulo 11).
 * Acepta "12345678-9", "12.345.678-9" o "12345678-K".
 */
export const RUT_REGEX = /^\d{1,8}-?[\dkK]$/;

export function validateRut(rut: string): boolean {
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
  if (cleaned.length < 2) return false;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return dv === expectedDv;
}

export const RutSchema = z
  .string()
  .regex(RUT_REGEX, 'RUT con formato inválido')
  .refine(validateRut, 'Dígito verificador inválido');

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  rut: RutSchema.nullable(),
  nombre: z.string().min(2).max(100),
  apellido: z.string().min(2).max(100),
  fotoUrl: z.url().nullable(),
  idiomaPref: z.enum(['es', 'en', 'pt']).default('es'),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserRequestSchema = z.object({
  email: z.email().toLowerCase(),
  rut: RutSchema.nullable().optional(),
  nombre: UserSchema.shape.nombre,
  apellido: UserSchema.shape.apellido,
  idiomaPref: UserSchema.shape.idiomaPref.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
