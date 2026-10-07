/**
 * Texto canónico de la policy RLS v2 (fail-closed). Vive acá — y no dentro
 * de cleanup-orphans — para que el spec de conexión tibia pruebe EXACTAMENTE
 * la cláusula que se instala en producción.
 *
 * Diseño:
 *   - NULLIF(..., '') hace que el residuo '' de una conexión reciclada del
 *     pool sea NULL → `tenant_id = NULL` → 0 filas. En la v1, '' era el
 *     bypass de super admin: una conexión tibia veía TODOS los tenants.
 *   - El bypass ahora es un GUC aparte (app.rls_bypass = 'on'), que solo
 *     fijan los helpers de rls-context.ts; su residuo '' no es 'on'.
 *   - Los (SELECT ...) fuerzan un InitPlan: Postgres evalúa el GUC una vez
 *     por query en vez de una vez por fila (40-100x medido).
 */
export const RLS_V2_USING = `
  tenant_id = (SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR (SELECT current_setting('app.rls_bypass', true) = 'on')
`;

/**
 * Variante para tablas con filas "globales" (tenant_id NULL): user_roles
 * (roles de plataforma), audit_logs, magic_links (resets), push_subscriptions
 * (suscripciones públicas). El endurecimiento del WITH CHECK sobre el NULL
 * es R-3 y queda fuera de este cambio.
 */
export const RLS_V2_USING_GLOBAL_NULL = `
  tenant_id IS NULL
  OR tenant_id = (SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR (SELECT current_setting('app.rls_bypass', true) = 'on')
`;
