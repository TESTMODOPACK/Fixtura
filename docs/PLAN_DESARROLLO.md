# Fixtura — Plan de desarrollo

> Plan consolidado que cruza el dominio del producto (documento maestro + 2 anexos + prototipo HTML) con el contrato técnico de [`CLAUDE.md`](../CLAUDE.md). Sirve como hoja de ruta y referencia para todas las decisiones de arquitectura, alcance de fase y priorización.
>
> **Audiencia**: equipo de producto, desarrollo y operaciones de Fixtura. Cualquier cambio mayor de plan se discute, se registra como ADR en [`docs/decisions/`](decisions/) y se actualiza este archivo.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Decisiones arquitectónicas — confirmadas y pendientes](#2-decisiones-arquitectónicas)
3. [Arquitectura de alto nivel](#3-arquitectura-de-alto-nivel)
4. [Bounded contexts y modelo de datos](#4-bounded-contexts-y-modelo-de-datos)
5. [Inventario de módulos y RFs](#5-inventario-de-módulos-y-rfs)
6. [Fases del proyecto](#6-fases-del-proyecto)
7. [Definición de MVP — Fase 1](#7-definición-de-mvp--fase-1)
8. [Estrategia de testing](#8-estrategia-de-testing)
9. [Seguridad y compliance chileno](#9-seguridad-y-compliance-chileno)
10. [Stack de integraciones priorizado](#10-stack-de-integraciones-priorizado)
11. [Riesgos y mitigaciones](#11-riesgos-y-mitigaciones)
12. [Backlog de RFs faltantes / huecos del producto](#12-backlog-de-rfs-faltantes)
13. [Próximos 5 pasos concretos](#13-próximos-5-pasos-concretos)

---

## 1. Resumen ejecutivo

Fixtura es una plataforma SaaS multi-tenant para **gestión integral de ligas de fútbol amateur** y recintos deportivos, foco inicial Chile, expansión planeada a Argentina, Uruguay y Perú. Reemplaza el ecosistema actual de Excel + WhatsApp + papel y lápiz en cancha por una solución integral que cubre:

- **Core deportivo** — torneos, fixture, actas digitales, disciplina, portal público
- **Operaciones** — designaciones de árbitros/planilleros/paramédicos, órdenes de trabajo, liquidaciones bancarias
- **Financiero** — cobros con Webpay/MercadoPago/MACH, facturación SII, morosidad
- **Comunidad** — perfil estilo FUT, ranking, insignias, seguidores
- **Analytics** — ocupación de canchas, precios dinámicos, NPS, rentabilidad
- **Publicidad** — banners y métricas para sponsors
- **Gamificación legal** — Fantasy League y Polla en créditos ficticios (Ley 19.995)

**Modelo SaaS**: tenant principal = liga / recinto / asociación regional. Suscripción mensual escalonada ($19.900–$99.900 CLP) más opcional comisión sobre transacciones.

**Diferenciadores** que justifican el desarrollo propio en lugar de comprar:
1. Liquidación bancaria automatizada de personal (BancoEstado, Santander, BCI).
2. Cumplimiento estricto del marco legal chileno (SII, Leyes 19.995 / 19.628 / 21.057).
3. PWA offline-first para árbitros y planilleros en canchas sin señal.
4. Generación automática de contenido visual para redes sociales con data en vivo.

**Estado actual del proyecto (2026-05-24)**:
- Repo Fixtura sin código, solo documentación de producto y prototipos HTML.
- `CLAUDE.md` con stack y patrones validados en Eva360.
- Documento maestro funcional + 2 anexos correctivos + prototipo HTML del rol LIGA_ADMIN.
- Esperando luz verde para arrancar Fase 0.

**Estrategia general**: replicar el stack y las prácticas de Eva360 (NestJS + Next.js + PostgreSQL + RLS + monorepo pnpm/Turbo), aplicar las lecciones aprendidas desde el día 1 (seguridad, observabilidad, log rotation, RLS con FORCE) y construir incrementalmente respetando 4 reglas:

1. **MVP funcional en 10-12 semanas** que cierre el ciclo "crear liga → cargar plantel → generar fixture → cargar acta → ver tabla → cobrar inscripción".
2. **Cumplimiento legal antes que pulido**: SII y Ley 19.628 desde Fase 1 (no posponer).
3. **Multi-tenant + RLS desde el commit cero**. Habilitar RLS en tabla pivot en Fase 0, rollout a todas las tablas en Fase 1.
4. **PWA offline-first**, NO React Native en MVP. Re-evaluar después de validar producto.

---

## 2. Decisiones arquitectónicas

### 2.1 Decisiones confirmadas

| # | Decisión | Justificación |
|---|---|---|
| D-01 | Monorepo pnpm + Turbo | Heredado de Eva360, validado en prod |
| D-02 | NestJS 11 + TypeORM 0.3 (no Prisma) | CLAUDE.md ya lo dictamina; el patrón RLS + `typeorm-transactional` está validado y migrar a Prisma agregaría 2-3 semanas de R&D al MVP. Ver [ADR-0001](decisions/0001-orm-typeorm-vs-prisma.md). |
| D-03 | PostgreSQL 16 + RLS con `FORCE` | Defense-in-depth multi-tenant; usuario DB no-superuser |
| D-04 | Next.js 14 App Router | Mismo stack que Eva360; PWA con `next-pwa` |
| D-05 | Mobile = PWA, NO React Native en MVP | Duplica el costo de desarrollo con 1 sola persona técnica. PWA cubre 90% de los flujos críticos (cámara via `getUserMedia`, push via FCM Web, offline via IndexedDB, firma via Canvas). Re-evaluar para Fase 4+ si la fricción real lo amerita. Ver [ADR-0002](decisions/0002-mobile-pwa-vs-react-native.md). |
| D-06 | Catálogo completo de 16 roles desde Fase 1 | Refactorizar permisos después es caro. Modelar bien una vez. Ver [ADR-0003](decisions/0003-roles-granularidad.md). |
| D-07 | TanStack Query + Zustand (no Redux) | Heredado |
| D-08 | i18n con español como base; `es.json` master, `en.json` / `pt.json` traducciones | Foco Chile → expansión LATAM. Inglés solo para portal público y onboarding internacional. |
| D-09 | BullMQ + Redis para jobs asíncronos | Pos-acta, notificaciones FCM, generación de PDFs, liquidaciones bancarias. Sin esto los workers ahogan al API. |
| D-10 | Docker Compose sobre VPS único (Hostinger u Hetzner) | Costo razonable para MVP; migración a ECS/Cloud Run cuando supere 50 tenants activos. |

### 2.2 Decisiones recientemente cerradas (2026-05-24)

| # | Decisión | Resolución | Impacto en el plan |
|---|---|---|---|
| D-11 | Pricing | **Flat fee mensual por plan** ($19.900 / $39.900 / $69.900 / $99.900 CLP/mes según Starter / Growth / Pro / Enterprise) | Tabla `planes_suscripcion` + `tenant.plan_id` desde Fase 1. Sin comisión transaccional. |
| D-12 | Tipo de tenant | **Un solo modelo `tenants` con campo `tipo` (LIGA / RECINTO / FEDERACION)** que activa o desactiva módulos en runtime via feature flags | Modelo de datos consolidado. Menos código duplicado. El módulo de reservas se activa cuando `tipo=RECINTO` o cuando una LIGA habilita la feature. |
| D-13 | M7 Fantasy/Polla | **Fase 3, condicional a OK legal de Ley 19.995** corriendo en paralelo desde Fase 1 | Si la revisión falla, M7 se cae sin afectar MVP. Provisión: contratar revisión legal en Sprint 1. |
| D-14 | Torneos infantiles | **Excluidos del MVP** por Ley 21.057 (verificación antecedentes). Soporte completo en Fase 2 con provider definido | MVP solo soporta torneos de adultos. UI bloquea creación de torneos con categorías infantiles. Banner explicativo. |

### 2.3 Decisiones pendientes — requieren input del producto

Cada una está expandida con preguntas concretas en [§11 Riesgos](#11-riesgos-y-mitigaciones). Las que no bloquean Fase 0 pueden resolverse durante Sprint 1 cuando el código las necesite.

| # | Decisión pendiente | Bloquea | Urgencia |
|---|---|---|---|
| P-02 | Branding definitivo: ¿queda Fixtura o "Bandera"? El prototipo HTML usa "bandera_registro_completo.html" | Diseño, dominio, assets, README, copy | Media — antes de Sprint 4 |
| P-04 | Walkovers — flujo, marcador automático (3-0?), sanción al equipo no presentado | RF nuevo en Módulo 1 | Alta — Sprint 4 |
| P-05 | Cuotas mensuales por jugador (vs sólo inscripción de equipo) | RF nuevo en Módulo 3 | Media — Sprint 6 |
| P-06 | Provider de verificación de antecedentes (Ley 21.057) | Fase 2 (no MVP por D-14) | Baja — Fase 2 |
| P-07 | Generador de contenido redes sociales — ¿alcance Fase 2 o Fase 3? | Sin RF dedicado | Baja — Fase 3 |
| P-09 | Provider de WhatsApp: Meta Cloud API directo o Twilio? | Onboarding personal (RF-04b) | Alta — Sprint 1 |

---

## 3. Arquitectura de alto nivel

### 3.1 Stack final

```
┌────────────────────────────────────────────────────────────────────┐
│ Cliente                                                            │
│  ─ Web responsive (Next.js 14 App Router) — admin, delegado,       │
│    portal público, jugador, hincha                                  │
│  ─ PWA instalable (mismo Next.js) — árbitro, planillero,           │
│    paramédico en cancha; sirve offline con IndexedDB + sync queue  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │ HTTPS (TLS 1.3)
                          │ Cookie HttpOnly (refresh) + Authorization Bearer (access)
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ Nginx (reverse proxy, rate limit, Let's Encrypt)                   │
└─────────────────────────┬──────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
   ┌────────────────────┐   ┌────────────────────┐
   │ Next.js (web)      │   │ NestJS API         │
   │ • SSR público      │   │ • REST /api/v1     │
   │ • Client comps     │   │ • Auth JWT 15m+7d  │
   │ • PWA service work │   │ • RLS context      │
   └────────────────────┘   │ • BullMQ producers │
                            └───────┬─────────┬──┘
                                    │         │
                                    ▼         ▼
                       ┌────────────────┐ ┌────────────────────┐
                       │ PostgreSQL 16  │ │ Redis              │
                       │ + RLS FORCE    │ │ • Refresh tokens   │
                       │ + tenant_id    │ │ • Rate limit       │
                       │ • DB user      │ │ • BullMQ queues    │
                       │   non-super    │ │ • Cache TanStack   │
                       └────────────────┘ │ • Sessions sponsors│
                                          └────────────────────┘
                                                  │
                                                  ▼
                                  ┌──────────────────────────────┐
                                  │ Workers BullMQ (mismo image  │
                                  │ que API, modo "worker"):     │
                                  │  • acta-closed-cascade       │
                                  │  • notifications-fcm-email   │
                                  │  • liquidacion-bancaria      │
                                  │  • sii-emit-boleta           │
                                  │  • social-image-gen          │
                                  │  • fantasy-recalc-jornada    │
                                  └──────────────────────────────┘

                       Integraciones externas:
                         • Transbank Webpay, MercadoPago, MACH
                         • Open Factura (SII)
                         • Resend (email), FCM (push), WhatsApp Cloud API
                         • Cloudinary o S3 (uploads)
                         • Sentry, Plausible
```

### 3.2 Monorepo target

```
fixtura/
├── apps/
│   ├── api/                 # NestJS — REST + BullMQ producers
│   ├── worker/              # NestJS — consumer-only para BullMQ (misma imagen, otro entrypoint)
│   └── web/                 # Next.js 14 — todas las UIs
├── packages/
│   ├── ui/                  # Componentes React compartidos
│   ├── types/               # DTOs + Zod schemas compartidos cliente-servidor
│   ├── config/              # eslint, tsconfig, prettier
│   └── domain/              # Lógica pura del dominio reutilizable (fixture engine, sanciones, fantasy-score)
├── docs/
│   ├── decisions/           # ADRs append-only
│   ├── PLAN_DESARROLLO.md   # este archivo
│   ├── MIGRATIONS.md
│   ├── OPS_RUNBOOK.md
│   └── ...
├── nginx/
│   ├── nginx.conf
│   └── certbot/
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Nota sobre `apps/worker`**: comparte código con `apps/api` (mismo módulo NestJS, mismo `tenant-cron-runner`, mismo schema). Es la misma imagen Docker con `CMD` distinto. Esto evita duplicar código pero permite escalar workers y API por separado.

**Nota sobre `packages/domain`**: aquí va la lógica pura no acoplada a HTTP ni a la DB:
- Algoritmo de generación de fixture (Round Robin Berger, Playoffs, Groups).
- Cálculo de sanciones por acumulación.
- Detección de conflictos (doble booking, conflicto de interés árbitro).
- Cálculo de puntos Fantasy / Polla.
- Validador de reglas de calendario (Efecto Dominó vs Trasnoche).

Esto es testeable con Jest puro sin DB y reusable desde API y workers.

### 3.3 Topología de despliegue (MVP)

**Single VPS** (Hostinger 4-8 GB, Hetzner CPX31/41 o equivalente):

| Servicio | mem_limit | cpus | Notas |
|---|---|---|---|
| db (PostgreSQL 16) | 1g | 1.0 | volume persistente con backup diario |
| redis | 256m | 0.5 | persistencia AOF, no RDB |
| api (NestJS) | 768m | 1.0 | 1 instancia |
| worker (NestJS) | 512m | 0.5 | 1 instancia inicial; escalar a 2-3 si las queues crecen |
| web (Next.js) | 384m | 0.5 | |
| nginx | 64m | 0.25 | TLS termination, rate limit, static |

Total reservado ~3 GB en un VPS de 4 GB (deja headroom para el host). A los ~50 tenants activos o ~5000 partidos/mes considerar migrar a topología con DB managed (RDS / Neon / Supabase) y servicios containerizados en ECS o Cloud Run.

### 3.4 CI/CD

GitHub Actions — pipeline por PR:
1. `pnpm install --frozen-lockfile`
2. `turbo run lint`
3. `turbo run test`
4. `turbo run build`
5. (en `main`) deploy automático a staging vía SSH al VPS.

Producción: deploy manual desde release tag, siguiendo `docs/OPS_RUNBOOK.md`.

---

## 4. Bounded contexts y modelo de datos

Diseño DDD-light: agrupamos las 50+ tablas en 8 contextos delimitados. Cada contexto tiene su carpeta de módulos en `apps/api/src/modules/`. Las dependencias inter-contexto son explícitas y unidireccionales.

### 4.1 Mapa de contextos

```
                     ┌────────────────┐
                     │ Identidad      │
                     │ (auth, users,  │
                     │  tenants,roles)│
                     └────────┬───────┘
                              │ (todos dependen)
                              ▼
       ┌──────────────────────┴──────────────────────┐
       │                                             │
┌──────▼─────────┐                          ┌────────▼────────┐
│ Core deportivo │◄────dispara eventos────►│ Operaciones     │
│ • torneos      │                          │ • personal      │
│ • equipos      │                          │ • designaciones │
│ • partidos     │                          │ • órdenes trab. │
│ • actas        │                          │ • liquidaciones │
│ • sanciones    │                          └────────┬────────┘
└──────┬─────────┘                                   │
       │                                             │
       │ datos para ►                                ▼
       │                                   ┌─────────────────┐
       ▼                                   │ Financiero      │
┌────────────────┐                         │ • cobros        │
│ Comunidad      │                         │ • pasarelas     │
│ • perfiles FUT │                         │ • SII boletas   │
│ • ranking      │                         │ • morosidad     │
│ • insignias    │                         │ • billetera     │
│ • seguidores   │                         └─────────────────┘
└───────┬────────┘
        │
        ▼
┌────────────────┐                         ┌─────────────────┐
│ Gamificación   │                         │ Recintos        │
│ • fantasy      │                         │ • canchas       │
│ • polla        │                         │ • reservas      │
└────────────────┘                         │ • calendario    │
                                           │ • bloqueos      │
                                           └─────────────────┘

┌────────────────┐                         ┌─────────────────┐
│ Analytics      │                         │ Publicidad      │
│ • ocupación    │                         │ • patrocinadores│
│ • NPS          │                         │ • banners       │
│ • rentabilidad │                         │ • métricas CTR  │
└────────────────┘                         └─────────────────┘
```

### 4.2 Entidades principales por contexto

> Solo los campos clave. Toda tabla tenant-scoped tiene `tenant_id UUID NOT NULL`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, RLS + FORCE + policy + índice en `tenant_id`.

**Identidad** (sin RLS para `tenants`, con RLS para el resto):
- `tenants` — id, slug, tipo (LIGA/RECINTO/FEDERACION), branding_json, plan_suscripcion, is_active
- `users` — email, rut, password_hash, foto_url, idioma_pref
- `user_roles` — user_id, role (16 valores), scope_type (PLATFORM/TENANT/TEAM/PERSONAL), scope_id
- `refresh_tokens` — user_id, token_hash, expires_at, revoked_at
- `magic_links` — email_or_phone, token_hash, role_to_grant, expires_at (72h)
- `audit_logs` — user_id, tenant_id, ip, action, entity_type, entity_id, before/after JSONB

**Core deportivo**:
- `temporadas` — nombre, año, fecha_inicio/fin
- `torneos` — nombre, temporada_id, tipo_formato (ROUND_ROBIN/PLAYOFFS/GROUPS/MIXTO), ruedas, puntos_v/e/d, estado, fecha_inicio/fin, reglamento_url
- `series` — torneo_id, nombre (Honor / Senior / Súper Senior / Infantil / etc.)
- `equipos` — torneo_id, serie_id, nombre, escudo_url, colores, delegado_user_id, estado
- `jugadores_inscritos` — equipo_id, user_id (o `jugador_id` si no tiene cuenta), número_camiseta, posición
- `fechas` — torneo_id, numero, fecha_inicio/fin
- `partidos` — fecha_id, equipo_local_id, equipo_visita_id, cancha_id, fecha_hora, estado (PROGRAMADO/EN_CURSO/FINALIZADO/SUSPENDIDO_FUERZA_MAYOR/REPROGRAMADO/WALKOVER), goles_local, goles_visita, acta_cerrada_at, acta_cerrada_by_user_id
- `incidencias_partido` — partido_id, user_id_jugador, equipo_id, tipo (GOL/AMARILLA/ROJA/CAMBIO/MVP), minuto, detalle JSONB
- `sanciones_activas` — rut_jugador, torneo_id, tipo, fechas_pendientes UUID[], origen_incidencia_id, cumplida
- `casos_disciplinarios` — partido_id, tipo, descripción, fallo_tribunal, fechas_adicionales

**Operaciones**:
- `personal` — user_id, nombre, rut, rol, tipo_contrato (HONORARIOS/AD_HONOREM), tarifa_base, carnet_anfa_numero/vence, datos_bancarios_json, emite_boleta_honorarios, rating_promedio
- `turnos_partidos` — partido_id, personal_id, rol_asignado, monto_pago, estado (PROPUESTA/CONFIRMADA/RECHAZADA), asistencia_confirmada, check_in/out_at
- `ordenes_trabajo` — cancha_id, tipo_tarea, prioridad, estado, asignado_a_personal_id, origen (MANUAL/AUTO), fecha_limite, evidencia_url
- `liquidaciones` — personal_id, periodo, subtotal, retencion_honorarios, total, archivo_banco_url, estado (BORRADOR/EMITIDA/TRANSFERIDA)

**Financiero**:
- `cuentas_corrientes_equipos` — equipo_id, saldo_deudor, saldo_acreedor, estado (AL_DIA/MOROSO/SUSPENDIDO), credito_billetera
- `transacciones` — cuenta_equipo_id (nullable), user_pagador_id, monto, tipo_concepto (INSCRIPCION/CUOTA/RESERVA/MULTA), pasarela (WEBPAY/MERCADOPAGO/MACH/MANUAL), estado (PENDIENTE/PAGO_EN_TRANSITO/APROBADO/EXPIRADO/REVERSADO), token_pasarela, idempotency_key UNIQUE
- `documentos_tributarios` — transaccion_id, tipo (BOLETA/FACTURA), folio_sii, url_pdf_sii, url_xml
- `pagos_pendientes_dunning` — cuenta_id, dias_morosidad, ultima_notificacion_at

**Recintos**:
- `recintos` — nombre, dirección, lat/lng, contacto
- `canchas` — recinto_id, nombre, superficie (CESPED/SINTETICO/INDOOR), formato (BABY/F7/F11), precio_base
- `calendario_excepciones` — recinto_id, fecha_inicio/fin, motivo, bloquea_todo_arriendo
- `reservas_canchas` — cancha_id, user_id, fecha, hora_inicio/fin, precio_total, porcentaje_sena, estado, transaccion_sena_id, expira_at

**Comunidad**:
- `perfiles_jugadores` — user_id, apodo, posición, pie_hábil, contadores (goles/asistencias/tarjetas/partidos/minutos/mvp), ratings (ataque/defensa/disciplina/resistencia, overall GENERATED), insignias UUID[], perfil_publico
- `seguidores_jugadores` — seguidor_id, seguido_id
- `historico_notificaciones` — user_id, titulo, mensaje, tipo, canal (FCM/EMAIL/WHATSAPP), estado, enviada/leida_at

**Gamificación**:
- `equipos_fantasy` — user_id, torneo_id, puntos_totales, presupuesto_restante
- `alineaciones_fantasy` — equipo_fantasy_id, fecha_id, jugadores_ids UUID[], capitan_id, formacion, puntos_fecha, bloqueado_at
- `precios_fantasy_jornada` — fecha_id, user_id_jugador, precio_congelado (calculado viernes 18:00)
- `pronosticos_polla` — user_id, partido_id, goles_local/visita_pronostico, puntos_obtenidos, bloqueado_at

**Analytics**:
- `metricas_ocupacion_canchas` — cancha_id, fecha, bloque_horario, estado_bloque, precio_aplicado, reserva_id
- `encuestas_nps` — user_id, partido_id, puntaje_nps, eval_arbitraje, eval_recinto, eval_organizacion, comentario
- `reportes_rentabilidad_mensual` — tenant_id, mes, año, ingresos_*, costos_*, utilidad_neta GENERATED

**Publicidad**:
- `patrocinadores` — rut_empresa, contacto, monto_contrato, fechas vigencia
- `espacios_publicitarios` — patrocinador_id, ubicación_app, url_imagen, peso_ponderación, fechas vigencia
- `metricas_publicidad_diarias` — espacio_id, fecha, impresiones, clics, ctr GENERATED

**Total estimado**: ~50 tablas tenant-scoped + ~5 de plataforma. Comparable a Eva360 (78 entidades en producción) → topología y patrones probados.

### 4.3 Eventos del dominio (BullMQ)

Algunos eventos críticos que disparan cascadas asíncronas:

| Evento | Triggers downstream |
|---|---|
| `acta.cerrada` | `tabla.recalcular`, `stats.actualizar_jugadores`, `sancion.evaluar`, `fcm.notificar_pospartido`, `fantasy.calcular_puntos_fecha`, `polla.calcular_puntos`, `nps.enviar_encuesta` (delay 30 min), `cache.invalidar_portal_publico` |
| `partido.suspendido` | `fcm.alertar_capitanes_personal`, `whatsapp.notificar`, `planilla.bloquear`, `reserva.gestionar_credito_billetera` |
| `pago.aprobado` | `cuenta_equipo.actualizar_saldo`, `sii.emitir_boleta`, `fcm.notificar_pagador`, `morosidad.recalcular` |
| `pago.expirado` | `reserva.liberar` (si aplica), `notificacion.enviar` |
| `personal.invitado` | `magic_link.generar`, `email_o_whatsapp.enviar` |
| `jornada.congelar_fantasy` | `precios_fantasy_jornada.snapshot` (cron viernes 18:00) |
| `jornada.recalcular_fantasy` | `precios_fantasy.recalcular` (cron lunes 08:00) |

---

## 5. Inventario de módulos y RFs

Mapeo de los 7 módulos del producto vs los contextos arquitectónicos. Para cada módulo: subfunciones, fase de implementación target, complejidad relativa.

| Módulo producto | Contextos involucrados | Subfunciones clave | Fase target | Complejidad |
|---|---|---|---|---|
| **M1 — Core deportivo** | Core deportivo, Identidad | Torneos, fixture (Berger), actas PWA offline, sanciones, tribunal, portal público | 1 (MVP) + 2 | ★★★★★ |
| **M2 — Operaciones** | Operaciones, Identidad | Designaciones drag&drop, conflictos, órdenes trabajo, liquidaciones bancarias | 1 (básico) + 2 (liquidaciones) | ★★★★ |
| **M3 — Financiero** | Financiero, Identidad | Webpay/MP/MACH, SII, morosidad, billetera, dunning | 1 (Webpay+SII) + 2 (resto) | ★★★★★ |
| **M4 — Comunidad** | Comunidad, Identidad | Perfil FUT, ranking, insignias, seguidores, push pospartido | 1 (perfil básico) + 2 | ★★★ |
| **M5 — Analytics** | Analytics, todos | Ocupación, precios dinámicos, NPS, rentabilidad | 2 + 3 | ★★★ |
| **M6 — Publicidad** | Publicidad | Banners, métricas, reportes sponsors, generador de contenido redes | 3 | ★★ |
| **M7 — Gamificación** | Gamificación, Comunidad | Fantasy, Polla, créditos ficticios | 3 (dependiente de validación legal) | ★★★★ |

### 5.1 RFs identificados en el maestro y anexos (numeración nueva)

> Esta lista consolida los RFs del maestro con los corregidos en anexos. No reproduce los detalles — sirve como índice y check-list de implementación.

**Identidad y plataforma**
- RF-01 Registro de tenant (liga / recinto / federación) con onboarding wizard
- RF-02 Login email+password con JWT 15m + refresh 7d con rotación
- RF-03 Recuperación de contraseña (token email, 30 min)
- RF-04 Invitación de delegado con Magic Link 72h (email)
- **RF-04b** Onboarding seguro de personal vía Magic Link 72h (email o WhatsApp) — *nuevo, anexo*
- RF-05 Gestión de usuarios y roles (16 roles, scopes)
- RF-06 Impersonación Super Admin con audit log
- RF-07 Audit log inmutable de acciones críticas

**Core deportivo**
- RF-10 Crear torneo (wizard nombre/temporada/formato/series/canchas/reglamento)
- RF-11 Inscribir equipos a torneo
- RF-12 Cargar plantel de equipo (manual + CSV)
- **RF-13** Calendario de días no jugables y excepciones — *anexo*
- **RF-14** Protocolo de suspensión masiva (Efecto Dominó vs Trasnoche) — *anexo*
- RF-15 Generador automático de fixture (Berger; constraints: impar→fecha libre, no 3 locales seguidos, no doble torneo, equipos que comparten cancha no simultáneos)
- RF-16 Drag & drop manual de partidos
- RF-17 Match Center en vivo (marcador + cronómetro, único componente real-time)
- RF-18 Acta digital PWA offline con firma touch, IndexedDB, sync queue
- RF-19 Cierre de acta con bloqueo de edición (salvo admin con motivo)
- RF-20 Sanciones automáticas por acumulación de tarjetas — *aplicación por RUT × torneo (anexo)*
- RF-21 Tribunal de disciplina: revisión de casos, agregar fechas manualmente
- RF-22 Tabla de posiciones (actualizada al cierre de cada partido — etiquetado)
- RF-23 Ranking de goleadores / asistentes / Fair Play
- RF-24 Portal público SEO con subdominio `{slug}.fixtura.cl`

**Operaciones**
- RF-30 Catálogo de personal (árbitros, planilleros, paramédicos, seguridad, mantenimiento)
- RF-31 Vencimiento de carnet ANFA con alertas
- RF-32 Designación de personal a partido (drag & drop calendario)
- RF-33 Detección de conflictos: doble booking, conflicto de interés árbitro/jugador *(ajustado a misma Serie/División por anexo)*
- RF-34 Notificación automática de designación (WhatsApp + push, botones confirmar/rechazar)
- RF-35 Check-in/out de personal en cancha
- RF-36 Órdenes de trabajo (manual + auto por trigger cada N partidos)
- RF-37 Liquidaciones quincenales/mensuales por personal con retención 13,75%
- RF-38 Archivo bancario .txt posicional (BancoEstado / Santander / BCI / Banco de Chile)
- RF-39 Voluntarios ad honorem (no genera honorarios, certificado QR)

**Financiero**
- RF-40 Cuenta corriente por equipo (saldo, estado morosidad)
- RF-41 Pago de inscripción (Webpay obligatorio MVP; MercadoPago + MACH en Fase 2)
- RF-42 Reserva de cancha con seña 30% — *timer 30 min, estado `PAGO_EN_TRANSITO` (anexo)*
- RF-43 Webhook handler con idempotencia y reversa automática si conflicto — *anexo*
- RF-44 Facturación electrónica SII (Open Factura / LibreDTE) automática post-pago
- RF-45 Dunning: AL_DIA / MOROSO >15d / SUSPENDIDO >30d con recordatorios automáticos
- RF-46 Crédito en billetera por reservas suspendidas (no reembolso a tarjeta)
- RF-47 Reportes financieros mensuales con facturación SII consolidada

**Comunidad**
- RF-50 Perfil jugador tipo FUT (ratings, insignias, tarjeta exportable PNG)
- RF-51 Cálculo de overall (0.30 ataque + 0.25 defensa + 0.20 resistencia + 0.15 disciplina + 0.10 MVP)
- RF-52 Ranking por goles/asistencias/MVP/Fair Play (público y por torneo)
- RF-53 Sistema de insignias automático (hat-trick, primer gol, 100 partidos, etc.)
- RF-54 Seguidores entre jugadores y hinchas
- RF-55 Notificaciones push FCM pos-partido (delay máximo 2 min después de acta cerrada)

**Analytics**
- RF-60 Heatmap ocupación de canchas 24×7
- RF-61 Precios dinámicos automáticos (bloque a 7 días <20% → ajuste)
- RF-62 Encuestas NPS post-partido (delay 30 min)
- RF-63 Reporte rentabilidad mensual (cron día 1)
- RF-64 Dashboard con KPIs (ingresos / gastos / utilidad / NPS / ocupación)

**Publicidad**
- RF-70 Gestión de patrocinadores y contratos
- RF-71 Espacios publicitarios con peso y aleatoriedad
- RF-72 Métricas impresiones/clics en Redis con sync horario a Postgres
- RF-73 Reporte PDF mensual para sponsor (CTR, alcance)
- RF-74 Generador automático de infografías para redes sociales con Satori + Sharp — *Fase 2/3, sin RF detallado en maestro*

**Gamificación**
- RF-80 Fantasy League (presupuesto 100M ficticios, restricciones tácticas, capitán ×2)
- RF-81 Polla pronósticos (3 pts exacto, 1 pt tendencia, bloqueo 15 min antes)
- RF-82 Congelamiento de precios por jornada *(anexo)*
- RF-83 Recálculo batch de precios lunes 08:00 *(anexo)*
- RF-84 Ranking público de Fantasy y Polla

### 5.2 RFs faltantes a definir

Ver [§12 Backlog](#12-backlog-de-rfs-faltantes) — incluye walkovers, cuotas mensuales por jugador, verificación de antecedentes (Ley 21.057), generador de redes sociales y otros 4-5 huecos.

---

## 6. Fases del proyecto

> Estimaciones asumen 1 desarrollador full-time (el caso de Eva360). Si el equipo crece, las fases pueden paralelizarse parcialmente, pero hay dependencias duras (Fase 0 antes de cualquier feature de negocio).

### Fase 0 — Infraestructura base (1.5 semanas, bloqueante)

**Objetivo**: tener todo listo para empezar a escribir lógica de negocio el lunes siguiente sin pelear con la infra.

**Entregables**:
- Monorepo pnpm + Turbo configurado, lints + format running
- Docker Compose con db, redis, api, web, worker, nginx — todos healthy en `docker compose up -d`
- PostgreSQL 16 con usuario superuser + usuario app no-superuser; primera migración crea `tenants`, `users`, `user_roles`, `audit_logs`
- RLS habilitado con FORCE en `users` (tabla pivot, prueba de fuego)
- NestJS bootstrap con: Sentry como primer import, validación de secrets, `typeorm-transactional` init, `TenantContextInterceptor` global, CORS estricto, security headers, webhook raw body, body parser limits, graceful shutdown, Pino, Prometheus con basic auth, health endpoints (`/live`, `/ready`, `/version`)
- Auth JWT 15m + refresh 7d con rotación, bcrypt 12, rate limit login
- Next.js 14 con: middleware de auth, fetch wrapper tipado, i18next, TanStack Query provider, Zustand store base, error boundary global
- BullMQ con primera queue dummy + worker app que la consume
- CI/CD GitHub Actions: lint + test + build en cada PR
- `.env.example` completo y comentado
- `README.md` con quickstart de 5 minutos (clonar → docker compose up → seed → login admin)
- `docker-compose.prod.yml` con mem_limit, healthchecks, log rotation
- Backup script `pg_dump` rotativo
- ADRs 0001 (ORM), 0002 (mobile), 0003 (roles)

**Criterio de salida**: un dev nuevo clona el repo, corre `pnpm install && docker compose up -d && pnpm seed`, va a `http://localhost:3001`, hace login con admin demo, ve el dashboard vacío.

---

### Fase 1 — MVP Core (10-12 semanas)

**Objetivo**: cerrar el ciclo completo de una liga, end-to-end, con una pasarela de pago y SII activos. Una liga real puede usarlo sin Excel paralelo.

**Hitos** (un sprint cada 2 semanas, ~6 sprints):

**S1 — Identidad y onboarding**
- Registro de tenant (RF-01) con wizard simple
- Invitación de delegado vía Magic Link (RF-04)
- Onboarding seguro de personal con Magic Link (RF-04b)
- CRUD de usuarios + roles
- Página de login + recuperación de contraseña
- Audit log scaffolding

**S2 — Catálogo deportivo**
- Crear temporada + torneo (RF-10) con wizard
- Configurar series/divisiones
- Inscribir equipos (RF-11) y plantel CSV (RF-12)
- Catálogo de recintos + canchas
- Calendario de excepciones (RF-13)

**S3 — Fixture engine**
- Algoritmo Berger en `packages/domain` con tests unitarios robustos
- Generador con constraints: impar→fecha libre, no 3 locales seguidos, equipos que comparten cancha no simultáneos
- Drag & drop manual (RF-16)
- Modal "Suspender Fecha" con Efecto Dominó vs Trasnoche (RF-14)

**S4 — Designaciones y acta básica**
- Catálogo de personal (RF-30), carnet ANFA (RF-31)
- Designaciones drag&drop con detección de conflictos (RF-32, RF-33)
- Notificación email + WhatsApp simple (RF-34)
- Acta digital en vivo (web responsive), aún sin PWA offline
- Cierre de acta con bloqueo (RF-19)
- Cálculo de sanciones por acumulación (RF-20, RF-21 básico)

**S5 — Acta PWA offline y consecuencias del cierre**
- Service worker + IndexedDB + sync queue (RF-18)
- Firma touch
- Acta cerrada dispara cadena BullMQ: `tabla.recalcular`, `stats.actualizar`, `sancion.evaluar`, `fcm.notificar` (RF-22, RF-23, RF-55)
- Portal público SEO con tabla y goleadores (RF-24) — versión simple

**S6 — Financiero MVP**
- Cuentas corrientes equipos (RF-40)
- Pago de inscripción con Webpay (RF-41) — solo una pasarela
- Webhook handler con idempotencia (RF-43)
- Boleta SII automática con Open Factura (RF-44)
- Dunning básico AL_DIA/MOROSO/SUSPENDIDO (RF-45)

**Fuera del MVP**: MercadoPago/MACH (Fase 2), liquidaciones bancarias (Fase 2), reservas de cancha (Fase 2), órdenes de trabajo automáticas (Fase 2), perfil FUT (Fase 2), Fantasy/Polla (Fase 3), generador de contenido redes (Fase 3), analytics avanzado (Fase 2).

**Criterio de salida MVP**:
- Una liga real puede crear un torneo, inscribir 8 equipos, generar fixture, cobrar inscripciones por Webpay, recibir boleta SII, cargar actas vía PWA offline, actualizar tabla, sancionar jugadores, y publicar todo en portal público — sin Excel ni WhatsApp paralelo.
- Smoke tests E2E pasan: crear-tenant → inscribir → fixture → acta → tabla.
- Test de RLS confirma cero leak cross-tenant.

---

### Fase 2 — Operaciones y reservas (6-8 semanas)

**Objetivo**: cerrar la operación financiera completa y abrir el módulo de recintos.

- MercadoPago y MACH como pasarelas adicionales (RF-41)
- Reservas de cancha con seña 30% (RF-42), estado `PAGO_EN_TRANSITO`, crédito billetera (RF-46)
- Liquidaciones bancarias automáticas (RF-37, RF-38) — BancoEstado primero, luego los demás bancos
- Voluntarios ad honorem (RF-39)
- Órdenes de trabajo automáticas y manuales (RF-36)
- Perfil FUT completo, ranking, insignias automáticas (RF-50, RF-51, RF-52, RF-53)
- Seguidores entre jugadores (RF-54)
- Analytics: heatmap ocupación, NPS post-partido, rentabilidad mensual (RF-60, RF-62, RF-63)
- Match Center en vivo con WebSocket (RF-17) — *único componente real-time*

**Criterio de salida**: un recinto puede operar reservas completas, los árbitros reciben liquidación quincenal automática, el dashboard de admin muestra KPIs en tiempo casi-real.

---

### Fase 3 — Comunidad y comercial (6-8 semanas)

**Objetivo**: completar la propuesta de valor "comunitaria" y abrir la palanca de monetización publicitaria.

- Patrocinadores y banners (RF-70, RF-71)
- Métricas publicitarias con Redis (RF-72)
- Reportes PDF para sponsors (RF-73)
- Generador de infografías para redes con Satori + Sharp (RF-74)
- Fantasy League (RF-80, RF-82, RF-83) — *dependiente de OK legal sobre Ley 19.995*
- Polla pronósticos (RF-81)
- Ranking público Fantasy/Polla (RF-84)
- Precios dinámicos automáticos (RF-61)

**Bloqueante**: si la revisión legal del módulo Fantasy/Polla concluye que el riesgo es alto, esa parte se cae y la fase se acorta.

---

### Fase 4 — Mobile nativo + Federaciones (opcional, 8-10 semanas)

**Si y solo si** la PWA muestra fricción real medida (>30% de árbitros reportan problemas offline, batería, cámara, push). Entonces:
- App React Native para árbitros/planilleros con misma DB y misma API
- Soporte multi-liga ("Federación") con superdashboard
- API pública para integradores
- SSO con Google / Microsoft (OIDC) para tenants corporativos

---

### Fase 5+ — Escala y enterprise

- Migración a topología multi-VPS o cloud managed
- Schema-per-tenant para clientes enterprise grandes
- Compliance SOC 2, GDPR equivalente (ya cubrimos Ley 19.628 desde Fase 1)
- Analytics avanzado / BI interno
- Marketplace de integraciones

---

## 7. Definición de MVP — Fase 1

### 7.1 Tabla "sí va / no va"

| Funcionalidad | Sí va | No va | Justificación |
|---|---|---|---|
| Crear liga + torneo + fixture | ✅ | | Core del producto |
| Inscribir equipos + plantel CSV | ✅ | | Core |
| Designaciones con WhatsApp | ✅ | | Diferenciador operativo |
| Acta digital PWA offline | ✅ | | Diferenciador clave |
| Sanciones automáticas | ✅ | | Core deportivo |
| Tribunal disciplinario básico | ✅ | | Sin él el círculo no cierra |
| Tabla + ranking goleadores | ✅ | | Output esperado de torneo |
| Portal público SEO | ✅ (simple) | | Diferenciador comunitario |
| Pago inscripción Webpay | ✅ | | Sin pagos, no hay negocio |
| Boleta SII | ✅ | | Obligación legal en Chile |
| Dunning básico | ✅ | | Esencial financiero |
| MercadoPago / MACH | | ⛔ | Webpay cubre 80% del mercado CL |
| Reservas de canchas | | ⛔ | Es del mundo "Recinto", no de "Liga". Fase 2 |
| Liquidaciones bancarias | | ⛔ | Mejora marginal, hace MVP enorme |
| Perfil FUT | | ⛔ | Es engagement, no operación. Fase 2 |
| Fantasy / Polla | | ⛔ | Requiere revisión legal. Fase 3 |
| Match Center en vivo | | ⛔ | WebSocket pesado para MVP. Fase 2 |
| Patrocinadores | | ⛔ | Monetización secundaria. Fase 3 |
| Mobile RN | | ⛔ | PWA es suficiente. Fase 4 si amerita |
| Verificación Ley 21.057 | | ⛔ | D-14: MVP solo torneos adultos. UI bloquea creación con categoría infantil |
| Tenant RECINTO (reservas públicas) | | ⛔ | D-12: misma tabla `tenants` con `tipo`, pero el módulo de reservas activa Fase 2 |

### 7.2 Stack de MVP

| Capa | Tecnología | Versión target |
|---|---|---|
| BD | PostgreSQL | 16-alpine |
| ORM | TypeORM | 0.3.x |
| Cache + queue | Redis | 7-alpine |
| Backend | NestJS | 11 |
| Workers | BullMQ + NestJS | 11 |
| Frontend | Next.js (App Router) | 14.2 |
| UI | Tailwind + Radix UI primitives | 3.4 / 1.x |
| Forms | RHF + Zod | 7 / 4 |
| Server state | TanStack Query | 5 |
| UI state | Zustand | 5 |
| Auth | Passport-JWT + bcrypt | 12 cost |
| Email | Resend | 6.x |
| Pasarela | Transbank Webpay Plus | Plus |
| SII | Open Factura (o LibreDTE) | API REST |
| Notif WhatsApp | Meta WhatsApp Cloud API | v18+ |
| Push | FCM Web | v1 |
| Observabilidad | Sentry + Pino + Prometheus | últimas |
| CDN / DNS | Cloudflare | — |
| VPS | Hostinger / Hetzner | 4-8 GB |

### 7.3 Métricas de éxito MVP

- ≥ 1 liga real activa con torneo completo cerrado en producción.
- ≥ 200 actas digitales cargadas vía PWA, sin pérdida de datos por offline.
- ≥ $1.000.000 CLP transados en Webpay con 0 errores irreparables.
- ≥ 50 boletas SII emitidas correctamente sin intervención manual.
- 0 incidentes de RLS leak detectados.
- p95 latencia API < 500ms.
- Uptime ≥ 99%.

---

## 8. Estrategia de testing

| Capa | Herramienta | Cubrir mínimo |
|---|---|---|
| Unit (domain pure) | Jest | 80%+ del fixture engine, sanciones, fantasy-score, validadores de calendario |
| Unit (services API) | Jest + mocks | Lógica de cada service tenant-scoped |
| Integration API | Supertest + DB real (Docker) | Cada endpoint con: auth válida/inválida, tenant isolation, validación DTO |
| E2E RLS | Jest + DB real | Login user tenant A → endpoint NO retorna data tenant B (con y sin RLS, debe fallar sin) |
| E2E flow | Playwright | Crear tenant → invitar delegado → inscribir equipo → cobrar inscripción → cargar acta |
| Smoke prod | Curl + cron | Health endpoints + login no-creds + portal público cargan |

**Reglas**:
- `testTimeout: 30000`, `maxWorkers: 50%`
- Coverage thresholds bajos pero crecientes (5% → 20% → 40% por fase)
- Cada bug fix tiene un test que falla sin el fix
- Tests de seguridad en cada PR que toca permisos

---

## 9. Seguridad y compliance chileno

Más allá de lo que dicta `CLAUDE.md` (RLS, JWT, bcrypt, audit log, CORS estricto, secrets validados), Fixtura tiene obligaciones legales chilenas concretas:

### 9.1 SII — facturación electrónica
- Toda transacción de pago genera boleta o factura electrónica vía Open Factura o LibreDTE.
- Folios SII se obtienen anticipadamente y se reservan.
- Si la integración SII falla, el pago se aprueba pero se marca `pendiente_documento_tributario` y un cron reintenta cada 30 min.
- Backup mensual de los XML firmados (legalmente obligatorios 6 años).

### 9.2 Ley 19.628 — protección de datos personales
- Política de privacidad clara, aceptación explícita en registro.
- Derecho de acceso, rectificación, cancelación (ARC). Endpoint `/me/data` exporta JSON con todos los datos del usuario; `/me/delete` agenda borrado en 30 días (soft delete + cron físico).
- Consentimiento para compartir datos con sponsors (modelo opt-in).
- Audit log de accesos a datos personales sensibles (RUT, datos bancarios).

### 9.3 Ley 19.995 — gamificación y apuestas
- Fantasy / Polla operan exclusivamente con créditos ficticios. **Nunca dinero real**.
- Términos y condiciones revisados por abogado antes del go-live de M7.
- Sin retiros, sin canje a dinero, sin intercambio entre usuarios.
- Premios físicos provistos exclusivamente por sponsors (modelo fidelización), nunca por Fixtura.

### 9.4 Ley 21.057 — entrevistas videograbadas y protección de menores
- Si el torneo incluye categorías infantiles, todo personal en contacto con menores requiere verificación de antecedentes.
- Modelo: campo `verificacion_antecedentes_at + url_certificado` en `personal`. Bloqueo automático si no está vigente y el partido es infantil.
- Provider de verificación: TBD (P-06).

### 9.5 PCI DSS — datos de tarjetas
- **Fixtura NUNCA almacena PAN ni CVV**. Tokenización 100% en el lado de Transbank / MercadoPago / MACH.
- Solo guardamos el `token_pasarela` y los últimos 4 dígitos (para UX).
- Webhook signatures verificadas antes del JSON parser (heredado de Eva360).

### 9.6 Otros
- HTTPS forzado, HSTS, TLS 1.3.
- 2FA opcional desde MVP, obligatorio para roles financieros desde Fase 2.
- Backups encriptados (`gpg`) + restore mensual verificado.
- Rate limit estricto: 5 intentos login / 15 min / IP; 100 req/min en endpoints de pago.

---

## 10. Stack de integraciones priorizado

| Integración | Fase | Criticidad | Proveedor | Alternativa |
|---|---|---|---|---|
| Webpay Plus | 1 | ★★★★★ | Transbank | — (es el estándar CL) |
| SII facturación | 1 | ★★★★★ | Open Factura | LibreDTE |
| Resend (email) | 1 | ★★★★ | Resend | Postmark, SES |
| WhatsApp Cloud API | 1 | ★★★★ | Meta directo | Twilio (más caro) |
| FCM push | 1 | ★★★ | Google | OneSignal |
| Cloudinary (assets) | 1 | ★★★ | Cloudinary | S3 + Sharp |
| Sentry | 0 | ★★★★ | Sentry | — |
| MercadoPago | 2 | ★★★ | MP directo | — |
| MACH | 2 | ★★ | BCI | — |
| Fintoc / Khipu | 2 | ★★★ | Fintoc | Khipu Empresarial |
| Banco APIs | 2 | ★★ | Archivo .txt batch | API REST si bancos publican |
| Google Maps | 2 | ★★ | Google | Mapbox |
| Plausible | 2 | ★ | Plausible | Umami self-hosted |
| Registro Civil RUT | 3 | ★ | RUT_Online o SII validación | Validación local algoritmo módulo 11 |

---

## 11. Riesgos y mitigaciones

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|---|
| R-01 | Webhook tardío de Transbank causa conflicto reserva | Alto (cliente molesto, doble cobro) | Medio | Estado `PAGO_EN_TRANSITO` + reversa automática + crédito billetera (RF-43, RF-46) |
| R-02 | Acta offline pierde datos por bug en sync queue | Alto (datos del partido perdidos) | Medio | Diseño "last write wins" con timestamp + log de conflictos + reintento idempotente |
| R-03 | RLS roto por una query nueva sin contexto | Crítico (leak cross-tenant) | Bajo | Tests E2E RLS por PR + audit periódico + lint rule que prohíbe `getRepository` directo |
| R-04 | Validación legal Fantasy/Polla falla → toda M7 cae | Medio (afecta diferenciador) | Medio | Revisión legal en Fase 1, antes de codear M7. Si falla, Fase 3 se acorta y se reasigna |
| R-05 | SII rechaza facturas por config errada | Alto | Medio | Sandbox SII desde Fase 0; primeras 50 boletas con doble check manual |
| R-06 | PWA offline no funciona bien en Android viejo / iOS Safari | Alto (árbitros enojados) | Medio | Testing real en dispositivos antes de cada release; fallback a "modo online básico" |
| R-07 | Maestro propone Prisma pero CLAUDE.md TypeORM → confusión | Medio | Bajo (ya resuelto en D-02) | ADR documentado; cualquier dev nuevo lo lee primero |
| R-08 | 1 desarrollador full-time es cuello de botella → MVP se atrasa | Alto | Alto | Priorización estricta MVP, no ceder a "agreguemos esto chiquito" |
| R-09 | Cambio de pricing post-MVP rompe data de billing | Medio | Bajo | Esquema de pricing versionado (`plan_version_id`) desde Fase 1 |
| R-10 | Liga real prueba MVP y rechaza por UX confusa | Alto | Medio | UAT con liga piloto desde S4; iterar UX antes de invertir en features |
| R-11 | WhatsApp Cloud API bloquea por volumen / spam | Medio | Bajo | Templates aprobadas por Meta + opt-in claro + rate limit interno |

---

## 12. Backlog de RFs faltantes

Lista de RFs que el maestro no define con detalle suficiente y que requieren conversación con producto antes de implementar. Cada uno tiene un placeholder con preguntas concretas.

### B-01 Walkovers (W.O.)
- ¿Quién declara el W.O.? ¿Cuándo? (¿15 min después de la hora del partido si no aparece el equipo?)
- ¿Marcador automático? 3-0 es el estándar ANFA.
- ¿Impacto en estadísticas de jugadores del equipo ganador? (¿Cuenta como partido jugado?)
- ¿Sanción al equipo no presentado? Multa, descuento de puntos.
- ¿Goleadores ficticios o sin goles individuales?

### B-02 Cuotas mensuales de jugador
- ¿Aplica a Fixtura o solo cuota de inscripción de equipo?
- Si aplica: ¿cobro recurrente al usuario o al delegado del equipo?
- ¿Tarjeta guardada (Webpay Oneclick)?

### B-03 Verificación de antecedentes (Ley 21.057)
- ¿Provider? PDI, Servicio de Registro Civil, Dicom...
- ¿Flujo: el personal sube certificado y admin valida, o integración API?
- ¿Periodicidad de re-verificación?

### B-04 Generador de contenido redes
- ¿Plantillas por tipo de contenido? (Pre-partido, resultado, hat-trick, MVP, tabla actualizada)
- ¿Quién dispara la generación? (Auto post-acta, manual desde dashboard)
- ¿Publica directamente a IG/FB/Twitter o solo genera asset para descarga?

### B-05 Tribunal de disciplina avanzado
- ¿Workflow formal (apertura → notificación → defensa → fallo)?
- ¿Roles: ponente, jurado?
- ¿Plazos legales de defensa?

### B-06 Tabla de posiciones — tiebreakers
- ¿Orden: puntos → diferencia gol → goles a favor → enfrentamiento directo → sorteo?
- Configurable por torneo?

### B-07 Playoffs y formatos eliminatorios
- Brackets de eliminación directa
- Reglas: ida y vuelta, gol de visitante, prórroga, penales
- Generación automática a partir de tabla regular

### B-08 Cumplimiento Ley 19.628 — operacionalización
- ¿Quién es el responsable de datos? (Cada tenant o Fixtura como encargado)
- ¿Acuerdo de tratamiento con cada tenant?
- ¿Política de retención por tipo de dato? (Boletas SII: 6 años. Datos personales: 3 años post-baja)

### B-09 Reportes a federaciones
- Si una liga se afilia a ANFA o ANFP, ¿formato de reportes requerido?
- ¿Export estandarizado?

### B-10 Sistema de comunicación interno
- ¿Mensajería entre delegados y admin de liga?
- ¿Anuncios masivos?
- ¿Notificaciones push generales del torneo?

---

## 13. Próximos 5 pasos concretos

> Acciones inmediatas. Estado al 2026-05-24: ya cerramos D-11 a D-14 (pricing, tipo tenant, M7 condicional, infantiles fuera). ADRs 0001-0003 escritos.

1. **Arrancar Fase 0**: scaffold del monorepo. Orden de trabajo: `pnpm-workspace.yaml` + `turbo.json` → `apps/api` con bootstrap mínimo (Sentry + typeorm-transactional + validación de secrets + Pino + health endpoints) → `apps/web` con login → `docker-compose.yml` con db + redis + nginx → CI/CD básico → `cleanup-orphans.ts` con primeras tablas. Plazo: 1.5 semanas.
2. **Validación legal en paralelo** (asíncrono, 1-2 semanas): contratar revisión de abogado para (a) Fantasy/Polla bajo Ley 19.995 — habilita o bloquea M7, (b) Ley 19.628 — modelo de responsable de datos y T&Cs. La verificación de antecedentes (Ley 21.057) se difiere a Fase 2.
3. **Confirmar provider de WhatsApp** (P-09): decisión técnica entre Meta Cloud API directo y Twilio. Necesario antes de Sprint 1 para implementar RF-04b (onboarding personal vía Magic Link).
4. **Confirmar branding** (P-02): decidir definitivamente Fixtura vs Bandera. Adquirir dominio, redes sociales y assets antes de Sprint 4.
5. **Demo de Fase 0 al cliente piloto** (si existe): validar onboarding, login, look & feel base. Recoger feedback antes de Sprint 1 de Fase 1.

**Decisiones diferidas a Sprint 1-6** (no bloquean Fase 0):
- P-04 (walkovers) — necesario en Sprint 4 al implementar actas.
- P-05 (cuotas mensuales) — necesario en Sprint 6 al implementar financiero.
- P-07 (generador redes sociales) — sin urgencia hasta Fase 3.

---

## Historial de cambios

| Fecha | Cambios |
|---|---|
| 2026-05-24 | Versión inicial. Decisiones D-11 a D-14 cerradas: flat fee mensual; un solo modelo `tenants` con `tipo`; M7 Fantasy/Polla Fase 3 condicional; torneos infantiles fuera del MVP. |

*Próxima revisión: al cerrar Fase 0.*
