import { z } from 'zod';

/**
 * Sprint 20 — RF-07 Audit log.
 */

export const AuditLogEntrySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid().nullable(),
  userId: z.uuid().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.uuid().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogPageSchema = z.object({
  items: z.array(AuditLogEntrySchema),
  meta: z.object({
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type AuditLogPage = z.infer<typeof AuditLogPageSchema>;
