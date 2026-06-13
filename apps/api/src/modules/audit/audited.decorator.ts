import { SetMetadata } from '@nestjs/common';

/**
 * Sprint 20 — RF-07.
 *
 * Marca un handler para que el `AuditedInterceptor` registre una
 * entrada en audit_logs después de su ejecución exitosa.
 *
 * Convención de nombres: dot-separated en lower_snake_case por nivel.
 *   - `auth.login`, `auth.logout`, `auth.refresh`
 *   - `partido.acta_cerrada`, `partido.suspendido`
 *   - `tenant.created`, `tenant.member_invited`
 *   - `admin.impersonate.start`, `admin.impersonate.end`
 *
 * Si necesitas controlar más (extraer entityId del body o response,
 * before/after data, metadata custom), usa AuditLogService.record()
 * directamente desde el service.
 */
export interface AuditedOptions {
  /** Acción a registrar. Si es string, atajo para { action: string }. */
  action: string;
  /** Nombre lógico de la entidad (Partido, Equipo, etc.). */
  entityType?: string;
  /**
   * Path en la response o request para extraer el entityId.
   *   - 'response.id' lee el id del retorno del handler.
   *   - 'params.partidoId' lee de @Param.
   *   - 'body.partidoId' lee del body.
   */
  entityIdFrom?: string;
  /**
   * Si true, no registra en error. Por defecto registramos solo en
   * éxito (status < 400) para que el log no se llene de intentos
   * fallidos — esos los captura el logger normal.
   * Para acciones críticas (login fallido, intento de impersonación
   * no autorizado), poner esto en false para registrarlos también.
   */
  onlyOnSuccess?: boolean;
}

export const AUDITED_METADATA_KEY = 'audited.options';

export function Audited(options: AuditedOptions | string): MethodDecorator {
  const opts: AuditedOptions =
    typeof options === 'string' ? { action: options } : options;
  return SetMetadata(AUDITED_METADATA_KEY, opts);
}
