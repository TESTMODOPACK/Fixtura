import { SetMetadata } from '@nestjs/common';

/**
 * Sprint 21 — RF-06.
 *
 * Bloquea el acceso al handler cuando la request viene de una sesión
 * impersonada (JWT con impersonatorId). El super admin "ve" como otro
 * usuario para dar soporte, pero NO debería poder:
 *   - cambiar contraseñas
 *   - eliminar cuentas
 *   - transferir titularidad del tenant
 *   - emitir nuevos refresh tokens en nombre del impersonado
 *   - cualquier acción que destruya su propio acceso al volver.
 *
 * Aplicar a esos handlers para que tiren 403 si vienen impersonados.
 */
export const NO_IMPERSONATION_KEY = 'security.no_impersonation';

export const NoImpersonation = (): MethodDecorator =>
  SetMetadata(NO_IMPERSONATION_KEY, true);
