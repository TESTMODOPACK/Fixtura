# ADR-0003 — Roles del sistema: catálogo completo desde Fase 1

- **Estado**: Aceptada
- **Fecha**: 2026-05-24
- **Decisores**: Equipo Fixtura

## Contexto

Hay tensión entre dos vistas del modelo de roles:

1. **CLAUDE.md** (heredado de Eva360, simplificado a 5 roles principales): `SUPER_ADMIN`, `TENANT_ADMIN`, `DELEGADO`, `ARBITRO`, `JUGADOR`, `HINCHA`.
2. **Documento maestro de Fixtura** (16 roles operativos): añade `LIGA_COORDINADOR`, `LIGA_COORDINADOR_ARBITROS`, `LIGA_CONTADOR`, `LIGA_COMERCIAL`, `RECINTO_ADMIN`, `TRIBUNAL_DISCIPLINA`, `PLANILLERO`, `PARAMEDICO`, `SEGURIDAD`, `MANTENIMIENTO`.

La separación más fina del maestro responde a realidades operativas:
- En una liga real, el coordinador de árbitros no debería ver ni tocar finanzas.
- El contador no toca designaciones ni resultados.
- El comercial (sponsors) no toca el módulo deportivo.
- El paramédico solo registra incidentes médicos.
- El mantenimiento solo ejecuta órdenes de trabajo.

Si arrancamos con 5 roles agrupados y refactorizamos a 16 después:
- Cada endpoint requiere revisión de `@Roles()`.
- El audit log de "quién hizo qué" pierde granularidad histórica.
- Las invitaciones de personal (RF-04b) requieren ya un rol específico para Magic Link.

Si arrancamos con 16:
- Más complejidad inicial en el catálogo y el `RolesGuard`.
- Tests de permisos más extensos.

## Decisión

**Implementar el catálogo completo de 16 roles desde Fase 1, con scope explícito por rol.**

### Modelo de tabla

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) NOT NULL,
  scope_type VARCHAR(20) NOT NULL,  -- PLATFORM | TENANT | TEAM | PERSONAL
  scope_id UUID,                     -- NULL si scope_type = PLATFORM
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, role, scope_type, scope_id)
);
```

Un usuario puede tener múltiples roles activos a la vez. Ejemplo: un dirigente puede ser `LIGA_ADMIN` de la liga A y `DELEGADO_EQUIPO` del equipo X simultáneamente.

### Catálogo de roles

| Código | Scope | Permisos principales |
|---|---|---|
| `SUPER_ADMIN` | PLATFORM | Cualquier cosa en cualquier tenant (modo impersonación) |
| `LIGA_ADMIN` | TENANT | Todo dentro del tenant: usuarios, finanzas, configuración |
| `LIGA_COORDINADOR` | TENANT | Operación deportiva (torneos, fixture, actas) — NO finanzas |
| `LIGA_COORDINADOR_ARBITROS` | TENANT | Designaciones y catálogo de personal — NO finanzas |
| `LIGA_CONTADOR` | TENANT | Solo módulo financiero, boletas SII, dunning, reportes |
| `LIGA_COMERCIAL` | TENANT | Solo módulo de patrocinadores y métricas publicitarias |
| `RECINTO_ADMIN` | TENANT (tipo RECINTO) | Canchas, reservas, ocupación, precios dinámicos |
| `TRIBUNAL_DISCIPLINA` | TENANT | Solo casos disciplinarios y fallos |
| `DELEGADO_EQUIPO` | TEAM | Roster, pagos de su equipo, comunicación |
| `ARBITRO` | PERSONAL | Sus designaciones, planillas digitales |
| `PLANILLERO` | PERSONAL | Cargar planillas en cancha |
| `PARAMEDICO` | PERSONAL | Registrar incidentes médicos |
| `SEGURIDAD` | PERSONAL | Bitácora de incidentes de seguridad |
| `MANTENIMIENTO` | PERSONAL | Órdenes de trabajo asignadas |
| `JUGADOR` | PERSONAL | Su perfil, stats, próximos partidos |
| `HINCHA` | PERSONAL | Solo lectura del portal público + Fantasy/Polla |

### Implementación

- `@Roles('LIGA_ADMIN', 'LIGA_COORDINADOR')` decorador acepta múltiples roles (OR).
- `@RoleScope('TENANT')` decorador adicional para forzar scope check.
- `RolesGuard` global que:
  1. Lee el JWT → `userId`, `tenantId` (si aplica).
  2. Carga `user_roles` activos del usuario.
  3. Confirma que tiene al menos un rol decorado **dentro del scope correcto**.
- `@Public()` para endpoints sin auth (login, portal público, webhooks).
- `@NoImpersonation()` para endpoints que un super admin impersonando NO debe poder ejecutar (cambiar password del tenant admin, eliminar cuenta).

### Bibliotecas de permisos (helpers)

Para evitar lógica dispersa de permisos en controllers:

```ts
// apps/api/src/common/permissions/permissions.helper.ts
export class PermissionsHelper {
  canManageFinances(actor: UserContext): boolean { ... }
  canDesignReferees(actor: UserContext): boolean { ... }
  canCloseActa(actor: UserContext, partidoId: string): boolean { ... }
  // etc.
}
```

Esto permite testear la lógica de permisos como código puro y reusar entre endpoints + UI (mostrar/ocultar botones).

## Consecuencias

**Positivas**:
- Modelado correcto desde el día 1, sin refactor a mitad de camino.
- Audit log con granularidad real ("LIGA_CONTADOR Pedro emitió boleta X" vs "TENANT_ADMIN Pedro hizo algo").
- UX permite invitar a alguien con el rol exacto que necesita (no "admin completo").
- Cumplimiento de principio de mínimo privilegio.

**Negativas**:
- Más complejidad inicial en el guard y los tests.
- UI de gestión de usuarios más rica (matriz de roles vs usuario).

## Consideraciones de futuro

- **Permisos custom**: si una liga pide "este usuario es coordinador pero quiero que vea las boletas también", agregar tabla `user_permission_overrides` (no en MVP).
- **Roles compuestos**: podríamos soportar "perfiles" predefinidos (ej.: "Coordinador completo" = COORDINADOR + COORDINADOR_ARBITROS). No en MVP.
- **Sub-roles dentro de un equipo**: capitán, vice-capitán, tesorero. No en MVP — un solo `DELEGADO_EQUIPO`.
