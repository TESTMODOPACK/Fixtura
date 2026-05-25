import { SetMetadata } from '@nestjs/common';

import type { Role } from '@fixtura/types';

export const ROLES_KEY = 'roles';

/**
 * Restringe el endpoint a usuarios que tengan AL MENOS uno de los roles
 * indicados (OR). Combinable con @Public() — si está @Public, @Roles no
 * tiene efecto.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
