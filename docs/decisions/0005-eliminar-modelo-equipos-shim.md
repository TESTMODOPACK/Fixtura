# ADR-0005 — Eliminar el modelo viejo de equipos (shim) y promover el modelo Clubes a fuente de verdad

**Estado**: Aceptado · 2026-06-07
**Autor**: Equipo Fixtura
**Reemplaza el mecanismo de**: ADR-0004 (shim "equipo sombra", Sprint 26G.2)

---

## Contexto

El ADR-0004 definió el modelo **Club → Inscripción → Planilla → Jugador** y dijo que actas,
sanciones, fixture y designaciones debían apuntar a `inscripcion_id` (refactor cascada,
Sprint 26G). En la práctica, 26G se implementó como un **shim** ("equipo sombra"): por cada
`InscripcionTorneo` se mantiene sincronizado un `Equipo` viejo + filas en `jugadores_inscritos`,
y el código de competición (fixture, actas, incidencias, sanciones, cobros, match-center) siguió
leyendo el **modelo viejo**.

Resultado: hay dos modelos en paralelo. El nuevo se usa para inscribir y cargar planteles; el
viejo (sombra) es el que realmente maneja la competencia. Esto genera:

- Doble fuente de verdad y bugs de sincronización (ej.: jugadores cargados al club después de
  inscribir no aparecían en el torneo hasta correr un resync manual).
- Las columnas paralelas del modelo nuevo (`partidos.inscripcion_local_id/visita_id`,
  `cobros.inscripcion_id`, `incidencias_partido.inscripcion_id`) existen pero están vacías o no
  se leen.
- Complejidad cognitiva: cada feature nueva debe recordar mantener el sombra.

## Decisión

Eliminar por completo el modelo viejo y el shim. El modelo Clubes pasa a ser la **única** fuente
de verdad:

- "Equipo en un torneo" = `InscripcionTorneo` (su `id` es el identificador del equipo en el fixture).
- "Jugador" = `Jugador` (tabla `jugadores`, a nivel club+categoría).
- "Jugador en un torneo" = fila de `planilla_torneo` (inscripción + jugador).

Se eliminan:
- Tablas `equipos` y `jugadores_inscritos` (y `series`, ya muerta).
- Columnas FK al modelo viejo: `partidos.equipo_local_id/visita_id`,
  `incidencias_partido.equipo_id` + `jugador_inscrito_id`, `sanciones_activas.jugador_inscrito_id`,
  `cobros.equipo_id`, `inscripciones_torneo.equipo_sombra_id`.
- Entidades `Equipo`, `JugadorInscrito`; helpers `ensureEquipoSombra`,
  `sincronizarJugadorAModeloViejo`, `precargarPlanillaDesdeClub`/`resync` del shim.

**`packages/domain` no cambia**: el motor de fixture (Berger), la tabla de posiciones y el motor
de sanciones ya son **agnósticos al id** (reciben `string`). Solo cambia de dónde salen los ids.

### Mapeo de columnas (viejo → nuevo)

| Tabla | Columna vieja (drop) | Columna nueva (fuente de verdad) |
|---|---|---|
| `partidos` | `equipo_local_id`, `equipo_visita_id` | `inscripcion_local_id`, `inscripcion_visita_id` |
| `incidencias_partido` | `equipo_id` | `inscripcion_id` |
| `incidencias_partido` | `jugador_inscrito_id` | `jugador_id` (FK a `jugadores`, NUEVA) |
| `sanciones_activas` | `jugador_inscrito_id` | `jugador_id` (FK a `jugadores`, NUEVA) + `rut` (ya existe, clave real) |
| `cobros` | `equipo_id` | `inscripcion_id` |
| `inscripciones_torneo` | `equipo_sombra_id` | (se elimina, sin reemplazo) |

> Las sanciones ya se identifican por `rut` + `torneo_id` (AUDIT-4). `jugador_id` es solo para
> mostrar nombre/club; el RUT sigue siendo la clave que impide evadir la sanción cambiando de club.

## Estrategia: dos fases (preservando historial)

Decidido con el dueño de producto (2026-06-07): **preservar todo el historial** y ejecutar en
**dos fases** para tener red de seguridad.

### Fase 1 — Flip de código + backfill (deploy verificable, NO destructivo)

1. **Schema aditivo** (`cleanup-orphans`): agregar `incidencias_partido.jugador_id` y
   `sanciones_activas.jugador_id` (FK nullable a `jugadores`). Backfill idempotente de TODAS las
   columnas nuevas en filas históricas:
   - `partidos.inscripcion_local/visita_id` ← mapeo `equipo_id` → inscripción (vía
     `inscripciones_torneo.equipo_sombra_id`).
   - `incidencias_partido.inscripcion_id`/`jugador_id` ← equipo→inscripción y
     `jugador_inscrito.rut` → `jugadores`.
   - `cobros.inscripcion_id` ← equipo→inscripción (mayormente ya poblado).
   - `sanciones_activas.jugador_id` ← `rut` → `jugadores`.
2. **Código**: todas las LECTURAS pasan al modelo nuevo (inscripción/jugador/planilla). Las
   ESCRITURAS escriben las columnas nuevas. Durante la Fase 1 el shim se mantiene en dual-write
   para que las tablas viejas sigan siendo un backup válido (`equipo_local_id` es NOT NULL).
3. **Tipos + frontend**: flip completo. La pestaña Equipos lista inscripciones; el detalle de
   equipo muestra la planilla de la inscripción; partidos/match-center/tribunal leen jugadores
   desde la planilla.
4. Deploy + verificación en prod (fixture, actas, sanciones, cobros, match-center, portal público).

### Fase 2 — Drop destructivo (migración formal con backup previo)

1. `pg_dump` previo obligatorio.
2. Migración formal TypeORM con `down()`: drop de columnas viejas, drop de tablas `equipos`,
   `jugadores_inscritos`, `series`; drop de `equipo_sombra_id`.
3. Remover entidades `Equipo`/`JugadorInscrito`, helpers del shim, dual-write y referencias en
   `cleanup-orphans`/`heal-prod-schema.sql`/seed.

## Consecuencias

### Positivas
- Una sola fuente de verdad. Fin de los bugs de sincronización del shim.
- Modelo de datos coherente con ADR-0004 (lo que siempre se quiso).
- Menos código y menos carga cognitiva por feature.

### Negativas / riesgos
- Refactor grande y transversal (~10 servicios + tipos + frontend + migración).
- La migración destructiva (Fase 2) es irreversible en datos: exige backfill verificado y backup.
- Ventana de coexistencia (Fase 1) con dual-write temporal.

## Revisión

Revisar si el backfill de Fase 1 no logra mapear el 100% de las filas históricas (ej.: equipos
sin `equipo_sombra_id`, o jugadores_inscritos sin RUT que no matchean un `jugador`). En ese caso,
resolver los huérfanos ANTES de la Fase 2.

---

*Decidido con el dueño de producto el 2026-06-07 vía AskUserQuestion (preservar historial + dos fases).*
