# 0009 — Portal del Delegado de club (F55)

Fecha: 2026-06-08
Estado: Aceptado

## Contexto

Los delegados de club necesitan acceso autoservicio al sistema para ver la
información de su club (plantel, resultados, tarjetas, incidencias, sanciones)
y sus deudas, además de pagar en línea — sin depender del admin de la liga.

El rol `DELEGADO_EQUIPO` (scope `TEAM`) ya existía en el catálogo (ADR-0003) y
`resolveLandingByRole` ya ruteaba a `/club`, pero el área no estaba construida.

## Decisión

1. **Alcance por club.** Un delegado se acota a un **club** (no a una
   categoría): `user_role` = `DELEGADO_EQUIPO`, `scope_type=TEAM`,
   `scope_id=clubId`, `tenant_id` = tenant del club. Ve todas las categorías,
   inscripciones, partidos y deudas de su club. Una cuenta por club.

2. **Onboarding por magic link.** El admin invita desde la ficha del club; se
   genera un magic link (`purpose=INVITE_USER`, `metadata.clubId/role/nombre`).
   El delegado activa en `/club/activar`, fija contraseña y recién ahí se crea
   el `user` y se le asigna el rol. El email es el identificador de login
   (obligatorio); WhatsApp es canal de entrega opcional.

3. **v1 de solo lectura + pago.** El portal `/delegado/*` expone solo lecturas
   (mi-club, plantel, partidos, estadísticas, finanzas) y el pago online de
   deudas propias. No edita datos del torneo ni el plantel.

## Seguridad

- **El clubId nunca llega por parámetro.** Sale del JWT (`resolveClubId`), así
  un delegado no puede mirar otro club.
- **Doble candado.** Además del filtro explícito por `clubId`, RLS aísla por
  tenant. Para que RLS funcione con un rol scope `TEAM` (sin rol `TENANT`), se
  arregló el login/refresh para resolver el `tenantId` desde el tenant único de
  los `user_roles` del usuario (antes quedaba `null` → RLS en bypass). Esto
  también corrige un bug latente del personal/árbitros.
- **Pago con validación de ownership.** `POST /delegado/cobros/:id/pagar`
  verifica que el cobro pertenezca a una inscripción del club del delegado
  antes de reusar `PagosService.iniciarPago` (el endpoint admin de pagos no
  validaba ownership por club).

## Consecuencias

- Reutiliza infra existente: magic links, `EmailService`/`WhatsAppService`,
  `CobrosAdminService`, `PagosService`, flujo de retorno `/pago/retorno`.
- Pendiente para v2 (si se decide): autogestión del plantel por el delegado
  (con aprobación del admin) y alcance por categoría si alguna liga lo requiere.

## Limitaciones conocidas (v1)

- **Delegado multi-tenant**: si una misma persona (mismo email) es delegado en
  clubes de DOS ligas distintas, `getSoleTenantId` devuelve null (>1 tenant) y
  el portal responde 403 (fail-closed, no hay leak). Falta un selector de
  tenant para el rol TEAM. Poco común; se aborda en v2 si aparece.
- **Sanciones legacy** sin `jugador_id` se matchean por `rut` (UNIQUE por
  tenant). Las que no tengan ni `jugador_id` ni `rut` no se atribuyen al club.
- **Puntaje** de estadísticas usa 3/1/0 estándar (no lee la config de puntos
  del torneo). Es un resumen del delegado, no la tabla oficial.
