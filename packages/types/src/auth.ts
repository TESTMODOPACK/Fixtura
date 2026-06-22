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
  // A5 — opcional: en el flujo normal el refresh token viaja en una cookie
  // HttpOnly (no en el body). Sigue en el tipo para uso interno del backend
  // (issueTokens lo devuelve para setear la cookie).
  refreshToken: z.string().optional(),
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
