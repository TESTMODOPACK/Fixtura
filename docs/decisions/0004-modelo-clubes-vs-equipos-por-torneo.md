# ADR-0004 — Clubes globales con inscripción a torneos (reemplaza equipos por torneo)

**Estado**: Aceptado · 2026-06-02
**Autor**: Equipo Fixtura
**Reemplaza**: modelo `equipos.torneo_id` heredado de Sprint 2

---

## Contexto

El modelo actual ata a cada **equipo** a UN torneo (`equipos.torneo_id NOT NULL`). Esto implica que cuando una liga arranca un torneo nuevo (Apertura, Clausura, Copa…), el admin tiene que recrear cada equipo y volver a cargar la planilla completa. No hay continuidad de club entre torneos, ni un registro de "Halcones FC" como entidad de liga.

La realidad del producto es la inversa: un **club** (entidad real del mundo) participa en múltiples torneos a lo largo del tiempo, con su identidad, directiva, escudo, plantilla maestra, e historial.

Además, surgen nuevos requerimientos:
- Definir cantidad de equipos por categoría+serie al crear un torneo.
- Tope de jugadores fichados por equipo (configurable por torneo).
- Validación cruzada de jugadores (RUT único cross-torneos, lista negra de vetados).
- Ficha del club con directiva, reseña, historial, etc.
- Refuerzos mid-torneo con fecha límite.

## Decisión

Refactor a un modelo **Club + Inscripción a Torneo** donde:

- El **Club** es la entidad de primera clase a nivel tenant (no a nivel torneo).
- Cada club mantiene **planteles por categoría** (Senior, Super Senior, etc.).
- La **inscripción** de un club a un torneo es una entidad pivote separada.
- Las **actas, sanciones, fixture y designaciones** apuntan a `inscripcion_id`, no a `equipo_id` directo (refactor cascada).

## Modelo de datos

### Club (tabla nueva `clubes`)

```
clubes
├── id (UUID PK)
├── tenant_id (UUID, FK)
├── slug (UNIQUE por tenant)
├── nombre
├── escudo_url
├── color_primario / color_secundario
├── pagina_web (varchar nullable)
├── resena (text plano, nullable)
├── presidente_nombre / email / telefono   ← contacto sin login
├── delegados (JSONB array de {nombre,email,telefono})
├── categorias_ids (UUID[] referencia categorias_jugadores)
│       ← multi-categoría editable
├── historial_manual (text plano nullable — fundación, títulos pre-Fixtura)
├── estado: ACTIVO | INACTIVO
└── created_at / updated_at
```

### Plantel (jugadores como entidad global del club)

Refactor de `jugadores_inscritos`: pasa a llamarse **`jugadores`** y se vincula al club + categoría (no al equipo-torneo):

```
jugadores
├── id (UUID PK)
├── tenant_id (UUID, FK)
├── club_id (UUID, FK)
├── categoria_id (UUID, FK)   ← un jugador pertenece a UNA categoría del club
├── rut (varchar)             ← UNIQUE (tenant_id, rut) — un jugador = un solo club
├── nombres
├── apellidos
├── fecha_nac (date)
├── email (varchar nullable)
├── telefono (varchar nullable)
├── numero_camiseta / posicion / pie_habil / apodo / capitan
└── created_at / updated_at
```

> **edad** y **edadCalendario** se calculan al vuelo desde `fecha_nac`. NO se persisten.

### Inscripción del club a un torneo (tabla nueva `inscripciones_torneo`)

```
inscripciones_torneo
├── id (UUID PK)
├── tenant_id
├── club_id (FK)
├── torneo_id (FK)
├── categoria_id (FK)
├── serie_slug (varchar, FK lógico a la categoría del torneo)
├── estado: INSCRITO | ACTIVO | RETIRADO | SUSPENDIDO
└── created_at
```

> UNIQUE (torneo_id, club_id, categoria_id) — un club puede inscribirse en varias categorías del MISMO torneo, pero no dos veces en la misma combinación.

### Planilla del torneo (tabla nueva `planilla_torneo`)

Subset del plantel del club que efectivamente participa en este torneo:

```
planilla_torneo
├── id (UUID PK)
├── tenant_id
├── inscripcion_id (FK)
├── jugador_id (FK)
├── fecha_incorporacion (timestamp) ← para tracking de refuerzos
└── UNIQUE (inscripcion_id, jugador_id)
```

### Torneo (extender lo existente)

```
torneos (campos NUEVOS sobre lo que ya hay):
├── categorias_series (JSONB)
│   └── [{categoria_id, serie_slug, cupo_equipos}]
├── tope_jugadores_por_equipo (smallint, default 25)
├── refuerzos_habilitados (bool, default true)
└── fecha_limite_refuerzos_numero (smallint nullable)
        ↑ "hasta la fecha N del torneo"
```

> El campo `torneos.categoria_id` introducido en Sprint 25 paso 3 se DEPRECA en favor de `categorias_series`. Migración aditiva, columna queda por back-compat hasta sprint posterior.

### Vetados (tabla nueva `jugadores_vetados`)

```
jugadores_vetados
├── id (UUID PK)
├── tenant_id
├── rut (UNIQUE por tenant_id)
├── motivo (text)
├── origen: TRIBUNAL | MANUAL
├── creado_por (UUID FK users nullable, NULL si origen=TRIBUNAL)
└── created_at
```

> Identificación por RUT único. Veto es **inmutable** salvo intervención manual del Super Admin (no un endpoint normal).

## Reglas de negocio

### Al crear un Club
- Admin elige nombre, slug, escudo, colores, datos de contacto opcionales.
- Marca las **categorías en las que participa** (multi-select). Edita después.
- La directiva (presidente/delegados) son **contactos sin login** (nombre, email, teléfono).
- Solo se guarda directiva actual (sin historial).

### Al crear un Torneo
Además de los campos actuales (formato, ruedas, puntos, etc.):
- **Categorías+series participantes** con cupo de equipos cada una.
- **Tope de jugadores fichados** por equipo (default 25).
- **Refuerzos**: SÍ/NO. Si SÍ: fecha límite por **número de fecha del torneo** (robusto contra reprogramaciones).

### Al inscribir un Club a un Torneo
- Admin elige clubes existentes (no se inscribe el delegado en fase 1).
- El admin selecciona club + categoría + serie del torneo.
- Backend valida que la combinación (categoría, serie) exista en `torneos.categorias_series` y haya cupo libre.
- Estado inicial: `INSCRITO`.

### Al cargar la planilla del torneo
- Subset del plantel del club en esa categoría.
- Tope: `torneos.tope_jugadores_por_equipo`.
- Validaciones por jugador:
  1. RUT formato + dígito verificador chileno.
  2. RUT no esté en `jugadores_vetados` del tenant.
  3. RUT no esté en otra planilla activa del mismo tenant (un jugador = un solo equipo en la liga).
  4. Edad cumple la categoría (edad calendario ≥ edad mínima, o entra en excepción con cupo).
  5. Email formato (si está cargado, no obligatorio).
- **Excepción de edad**: modal de confirmación antes de aceptar.
- **Menores de edad**: permitidos (las categorías regulan).

### Refuerzos mid-torneo
- Si `torneos.refuerzos_habilitados` y el torneo está en una fecha ≤ `fecha_limite_refuerzos_numero`, se permite sumar jugadores a la planilla (hasta el tope).
- Pasada la fecha límite o sin habilitación → planilla congelada.

### Walkover por cupo insuficiente
- Si un equipo no llega al mínimo de jugadores en cancha (regla de la liga, ej. 7), se aplica walkover automático (ya implementado).

## Migración de datos

Plan de migración (script idempotente):
1. Por cada `equipo` viejo, crear un `club` con sus datos (nombre, escudo, colores, delegado_user_id).
2. Por cada `equipo`, crear una `inscripcion_torneo` (club_id, torneo_id, categoria del torneo, serie_slug).
3. Migrar `jugadores_inscritos` a `jugadores` (vinculados al club + categoría) + entradas en `planilla_torneo`.
4. Refactor de actas, sanciones, fixture, designaciones para que apunten a `inscripcion_id` en vez de `equipo_id`.
5. Mantener `equipos` como vista o tabla legacy por 1-2 sprints para tener back-out.

## Alternativas consideradas

### Alternativa A — Refactor profundo con N:N puro
Equipos pasan a ser inscripciones del club al torneo sin tabla intermedia. Más limpio pero requiere migrar TODO el código que apunta a equipo_id.

**Descartada**: el costo de migración del schema es altísimo y la diferencia conceptual con la opción aceptada es mínima.

### Alternativa B — Solo agregar botón "Importar plantilla"
Mantener `equipos.torneo_id`, agregar feature para clonar planteles entre torneos.

**Descartada**: no resuelve el requerimiento del usuario de tener clubes como entidad de liga. Solo parchea.

### Alternativa C — Club global + equipo por torneo (modelo actual del ADR)

**Aceptada**: balance entre cambio conceptual real y disrupción del código.

## Sprints de implementación

| Sprint | Entregable |
|---|---|
| **26A** | Schema clubes + inscripciones_torneo + jugadores_vetados + planilla_torneo |
| **26B** | Entities + tipos compartidos + backend CRUD clubes/vetados |
| **26C** | UI `/admin/clubes` (listado + ficha + plantel inline) |
| **26D** | Extender torneo con categorias_series + tope_jugadores + refuerzos |
| **26E** | UI inscribir clubes al torneo + cargar planilla con validaciones |
| **26F** | Migración: equipos viejos → clubes + inscripciones |
| **26G** | Refactor cascada actas/sanciones/fixture a inscripcion_id |
| **26H** | `/admin/vetados` UI + integración tribunal automática |
| **26I** | Revisión exhaustiva total + tests + deploy |

## Consecuencias

### Positivas
- Modelo de dominio coherente con el negocio.
- Planteles reutilizables entre torneos.
- Validación RUT único cross-torneos.
- Base para "perfil de club" público en el portal (Sprint futuro).
- Historial automático del club (torneos jugados, posiciones).

### Negativas
- Refactor grande (~7 días estimados de implementación).
- Cascada de cambios en actas, sanciones, fixture, designaciones.
- Migración de datos en prod requiere ventana de mantenimiento o coexistencia con feature flag.
- Más entidades en el modelo (3 tablas nuevas: clubes, inscripciones_torneo, planilla_torneo, jugadores_vetados).

## Revisión

Este ADR debe revisarse si:
- Aparece un requerimiento de jugadores compartidos entre clubes (improbable, contradice "un jugador = un solo equipo").
- Surge la necesidad de auto-inscripción de delegados (lo dejamos como Fase 2).
- El historial de directiva pasa a ser requerido.

---

*Decidido en conjunto con el dueño de producto el 2026-06-02. Confirmado vía AskUserQuestion en 5 rondas de preguntas estructuradas.*
