import { z } from 'zod';

/**
 * Sprint 17 — RF-04b extendido: canal de invitación al personal.
 *
 * EMAIL solo → email con magic link (compatible con v anterior).
 * WHATSAPP solo → WhatsApp template message con magic link.
 * AMBOS → email + WhatsApp, mismo token (el primero que use vale).
 */
export const CanalInvitacionSchema = z.enum(['EMAIL', 'WHATSAPP', 'AMBOS']);
export type CanalInvitacion = z.infer<typeof CanalInvitacionSchema>;

export const WhatsAppProviderTipoSchema = z.enum(['MOCK', 'TWILIO', 'META']);
export type WhatsAppProviderTipo = z.infer<typeof WhatsAppProviderTipoSchema>;

export const InvitarPersonalRequestSchema = z.object({
  canal: CanalInvitacionSchema.optional(),
});
export type InvitarPersonalRequest = z.infer<typeof InvitarPersonalRequestSchema>;

export const InvitarPersonalResponseSchema = z.object({
  enviado: z.boolean(),
  canal: CanalInvitacionSchema,
  emailDestino: z.string().nullable(),
  telefonoDestino: z.string().nullable(),
  expira: z.iso.datetime(),
  errores: z.array(z.string()).default([]),
});
export type InvitarPersonalResponse = z.infer<typeof InvitarPersonalResponseSchema>;
