# ADR 0011 — Encuestas configurables (constructor de encuestas)

- **Fecha**: 2026-06-29
- **Estado**: Aceptado

## Contexto

El módulo NPS (M5, etapa 2) tiene un cuestionario **fijo**: las preguntas están
hardcodeadas como columnas de la tabla `encuestas_nps` (`nps`, `eval_arbitraje`,
`eval_recinto`, `eval_organizacion`, `comentario`), y el resumen las agrega con
SQL fijo. El admin de la liga no puede cambiar las preguntas.

El producto pide que las encuestas sean **100% editables**: el administrador
define sus propias preguntas, las modifica, reordena y elimina.

Decisiones de producto tomadas (jun 2026):
1. **Tipos de pregunta**: completo — `NPS_0_10`, `ESCALA_1_5`, `SI_NO`,
   `OPCION_UNICA`, `OPCION_MULTIPLE`, `TEXTO`.
2. **Plantillas reutilizables**: el admin crea encuestas guardadas, las edita, y
   las dispara en los torneos que quiera (no ad-hoc por envío).
3. **Score NPS preservado**: una pregunta `NPS_0_10` puede marcarse como "la
   pregunta NPS" (`esNps`); si existe, se calcula el score promotores−detractores.
4. **Destinatarios sin cambio**: por torneo, al presidente/delegado de cada club
   inscrito (mismo flujo de email + token que el NPS actual).

## Decisión

Reemplazar el NPS fijo por un **constructor de encuestas** con cuatro tablas
tenant-scoped (RLS + `tenant_id` + índice, vía `cleanup-orphans` aditivo):

- **`plantillas_encuesta`** — la encuesta reutilizable: `nombre`, `descripcion`,
  `estado` (`BORRADOR | ACTIVA | ARCHIVADA`).
- **`preguntas_encuesta`** — preguntas de una plantilla: `orden`, `texto`,
  `tipo`, `opciones` (jsonb, solo `OPCION_*`), `obligatoria`, `es_nps`.
- **`envios_encuesta`** — instancia enviada a un (plantilla, torneo, club):
  `email_destino`, `token`, `estado`, `enviada_at`, `respondida_at`. Reemplaza la
  parte "instancia" de `encuestas_nps`. UNIQUE (tenant, plantilla, torneo, club).
- **`respuestas_encuesta`** — una fila por pregunta respondida: `valor_numero`
  (NPS/escala/sí-no como 0|1), `valor_texto` (texto libre), `valor_opciones`
  (jsonb, opciones elegidas).

El **resumen** se calcula dinámicamente por pregunta según su tipo (promedio +
distribución para escalas/opciones; lista de textos para libres) más el score
NPS si la plantilla tiene una pregunta `esNps`.

Se seedea una **plantilla por defecto** "Satisfacción del torneo" con las
preguntas equivalentes al NPS actual (nota 0–10 marcada `esNps` + 3 estrellas +
comentario), para que el admin no parta de cero y el flujo histórico siga vivo.

## Alternativas consideradas

- **Encuesta ad-hoc por envío** (sin plantillas): descartado — el admin tendría
  que rearmar las preguntas cada vez; sin biblioteca reutilizable.
- **jsonb monolítico** (un blob de preguntas+respuestas en `encuestas_nps`):
  descartado — no se puede agregar/consultar por pregunta de forma eficiente ni
  versionar las respuestas.
- **Mantener NPS fijo + encuesta nueva aparte**: descartado — dos sistemas
  paralelos. El NPS pasa a ser una plantilla más (la default).

## Consecuencias

- El NPS deja de ser un caso especial: es una plantilla con una pregunta marcada
  `esNps`. El "score" se conserva solo cuando esa pregunta existe.
- `encuestas_nps` queda como **legacy** (historial de respuestas viejas); el
  sistema nuevo arranca limpio. No se migran datos (el módulo es reciente).
- Más flexibilidad a costa de más tablas y un resumen dinámico (no SQL fijo).
- La página pública `/nps/responder` pasa a renderizar las preguntas de la
  plantilla dinámicamente (se mantiene la ruta para no romper links vivos).
- Reusa el patrón de token firmado + re-set de RLS por `tenantId` del token, y el
  email de invitación existente.

Ver tipos en `packages/types/src/encuestas.ts`. Reemplaza/expande lo de
[nps.ts](../../packages/types/src/nps.ts) (que queda para el resumen legacy).
