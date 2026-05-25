import type { UserContext } from '@fixtura/types';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: UserContext;
}
