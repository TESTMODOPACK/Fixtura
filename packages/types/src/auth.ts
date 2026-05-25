import { z } from 'zod';

import { RoleSchema, ScopeSchema } from './roles';

export const LoginRequestSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const UserContextSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  tenantId: z.uuid().nullable(),
  roles: z.array(
    z.object({
      role: RoleSchema,
      scope: ScopeSchema,
      scopeId: z.uuid().nullable(),
    }),
  ),
  impersonatorId: z.uuid().nullable().optional(),
});
export type UserContext = z.infer<typeof UserContextSchema>;
