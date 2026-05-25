import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { UserContext } from '@fixtura/types';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Inyecta el UserContext del request autenticado en el handler.
 *
 * Uso:
 *   @Get('me')
 *   getMe(@CurrentUser() user: UserContext) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);
