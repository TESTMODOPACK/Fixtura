# Revisión manual de Fase 1

Checklist de validación end-to-end del MVP. Recorrido completo desde el
onboarding de una liga nueva hasta el cierre de un torneo, con todos
los flujos críticos cubiertos.

**Cómo usar este documento**:
1. Trabajá con el seed del torneo "Apertura 2026" (Liga Demo) **+** creá
   una segunda liga nueva desde el super admin para probar onboarding
   limpio.
2. Marcá la casilla `[ ]` → `[x]` cuando un punto pase ok.
3. Si encontrás un bug, anotalo abajo del punto con prefijo **BUG:**
   y avisame para que lo arregle.

---

## 🔑 Pre-requisitos

- [ ] **Credenciales** del seed:
  - Admin de liga: `admin@fixtura.local` / `Fixtura2026!`
  - Super admin: necesitás crearte uno con `INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (...)` o pedírmelo.
- [ ] Producción accesible en `https://fixtura.cl` (o tu dominio).
- [ ] DB no vacía — al menos el seed inicial corrió.

---

## 🅐 Flujo A — Onboarding de una liga nueva (Super Admin)

> Esto es lo que ocurre cuando vos como dueño de Fixtura registrás un cliente nuevo.

### A1 · Login como super admin
- [ ] Abrí `/login`, ingresá con el user super admin.
- [ ] Después del login, el sidebar muestra la sección **"PLATAFORMA"** (5 ítems: Panel super admin, Tenants, Planes, Impersonar, Health).
- [ ] **Buscá bug**: si NO ves la sección, el rol del user en `user_roles` no es SUPER_ADMIN.

### A2 · Panel super admin
- [ ] Click en **Panel super admin** (`/admin/super`).
- [ ] Ves KPIs: total tenants, activos, trial, suspendidos, cancelados.
- [ ] Card "Estado del sistema" con DB OK + latencia + uptime + Git SHA.
- [ ] Card "Ingresos recurrentes" con MRR + ARR.
- [ ] **Buscá bug**: ningún KPI debe decir `NaN` ni `undefined`.

### A3 · Catálogo de planes
- [ ] Click en **Planes** (`/admin/super/planes`).
- [ ] Ves los 4 planes: Starter / Growth / Pro / Enterprise con precios `$19.900`, `$39.900`, `$69.900`, `$99.900` CLP/mes.
- [ ] Cada plan muestra límites (torneos, equipos, partidos/mes) y features (matchCenter, sponsors, sii, etc.).
- [ ] **Buscá bug**: si la tabla está vacía, el seed no corrió — revisar logs.

### A4 · Crear tenant nuevo
- [ ] Click en **Tenants** → **Crear tenant**.
- [ ] Llená:
  - Slug: `liga-test-rev` (lowercase, sin espacios)
  - Nombre: `Liga Revisión 2026`
  - Tipo: `LIGA`
  - Plan: `Growth`
  - Trial: `30` días
  - Admin email: `admin@liga-test.cl`, nombre `Test`, apellido `Liga`, password `Liga2026Test!`
- [ ] Click **Crear tenant** → redirige al detalle.
- [ ] El nuevo tenant aparece en la lista con estado `TRIAL`.
- [ ] **Buscá bug**: si el password es < 8 caracteres, debería rechazar. Si el slug tiene mayúsculas o espacios, debería rechazar.

### A5 · Login con el admin recién creado
- [ ] **Cerrá sesión** del super admin.
- [ ] Logueá con `admin@liga-test.cl` / `Liga2026Test!`.
- [ ] Llega al panel de la liga (`/admin`), no al super admin.
- [ ] El sidebar NO muestra la sección "PLATAFORMA" (porque no es SUPER_ADMIN).

---

## 🅑 Flujo B — Setup inicial de la liga (Admin Liga)

### B1 · Ajustes — branding
- [ ] Tab **Branding**: cambiá color primario y nombre comercial. Guardar.
- [ ] Tab **Dominio**: leé los pasos (custom domain CNAME).
- [ ] Tab **Reglamento**: subí URL del PDF reglamentario, definí puntajes (victoria/empate/derrota).
- [ ] Tab **Equipo admin**: invitá un coordinador con email + password temporal. El select muestra los 6 roles invitables con descripción.
- [ ] Tab **Calendario**: importá feriados de Chile 2026. Debería decir "10 creados".
- [ ] **Buscá bug**: cambiar color a hex inválido (`#XYZ`) debe rechazar.

### B2 · Personal & roles — cargar árbitros
- [ ] Sidebar → **Personal & roles**.
- [ ] Click **+ Nuevo registro** y creá 3 árbitros (rol ARBITRO_PRINCIPAL), 1 con telefono.
- [ ] Para el que tiene teléfono, click en el botón **enviar invitación** (avión de papel) → debería abrir menú con "Email / WhatsApp / Ambos".
- [ ] Probá enviar por WhatsApp → en logs del API debe aparecer el mock con el mensaje renderizado.
- [ ] **Buscá bug**: invitar a alguien sin email ni teléfono debe dar error claro.

### B3 · Canchas
- [ ] Sidebar → **Ocupación canchas**.
- [ ] Click **Nueva cancha** y creá 2 canchas (Cancha 1, Cancha 2) con dirección y capacidad.
- [ ] Vista de ocupación semana actual (debería estar vacía).

---

## 🅒 Flujo C — Crear temporada + torneo

### C1 · Temporada
- [ ] Sidebar → **Torneos & fixture** → click **+ Nueva temporada**.
- [ ] Nombre: `Apertura Revisión 2026`, año `2026`.

### C2 · Crear torneo
- [ ] Click **+ Crear torneo** → completá:
  - Nombre: `Liga Test Apertura`
  - Slug: `liga-test-apertura`
  - Tipo formato: `ROUND_ROBIN`
  - Ruedas: `1`
  - Puntos: 3/1/0
- [ ] El torneo aparece en estado **DRAFT**.
- [ ] **Buscá bug**: el slug duplicado en la misma temporada debe rechazar.

---

## 🅓 Flujo D — Inscribir equipos y jugadores

### D1 · Equipos
- [ ] Entrá al torneo → tab **Equipos**.
- [ ] Click **+ Inscribir equipo** y creá 6 equipos (Halcones, Pumas, Zorros, Cóndores, Estrella Polar, Rayos).
- [ ] Cada equipo tiene nombre, slug, color hex.
- [ ] **Buscá bug**: el formulario debe estar visible porque el torneo está en DRAFT.

### D2 · Jugadores manual
- [ ] Click en uno de los equipos → tab plantilla.
- [ ] Cargá 5 jugadores manualmente (uno como capitán con RUT).
- [ ] **Buscá bug**: capitán sin RUT debe rechazar (regla AUDIT-8).

### D3 · Jugadores vía CSV
- [ ] En otro equipo, click **Importar CSV** → pegá:
  ```
  nombre,apellido,rut,numero,posicion
  Juan,Pérez,11.111.111-1,10,DELANTERO
  Pedro,González,22.222.222-2,5,DEFENSA
  ```
- [ ] Importa los 2 jugadores.
- [ ] **Buscá bug**: si hay duplicados en CSV mismo RUT, debe detectar antes de insertar (AUDIT-10).

---

## 🅔 Flujo E — Generar fixture

### E1 · Configurar generación
- [ ] Tab **Fixture** → click **Generar fixture (Berger)**.
- [ ] Completá:
  - Fecha inicio: hoy + 7 días
  - Días entre fechas: `7`
  - Horarios: `10:00,12:00,14:00,16:00`
  - Canchas: del catálogo
- [ ] Click generar.

### E2 · Validar fixture generado
- [ ] Si tu torneo tiene 6 equipos → debería crear 5 fechas (ruedas=1, round-robin).
- [ ] Cada fecha tiene 3 partidos.
- [ ] Si alguna fecha cae en feriado del calendario (Sprint 16), debe mostrar `diasNoJugablesAjustados` con la fecha movida.
- [ ] **Buscá bug**: ningún partido con misma cancha+horario en la misma fecha (constraint).

### E3 · Activar torneo
- [ ] Tab **Configuración** → cambiá estado a **ACTIVO**.
- [ ] Volvé a tab **Equipos**: el botón "+ Inscribir equipo" debe desaparecer y mostrar badge "Torneo activo · inscripciones cerradas".

---

## 🅕 Flujo F — Designar personal

### F1 · Auto-asignación
- [ ] En el torneo, link **Designaciones →** abre `/admin/torneos/[id]/designaciones`.
- [ ] Elegí una fecha → click **Auto-asignar**.
- [ ] Validá que cada partido recibe N árbitros según SLOTS_POR_ROL (1 principal + 2 auxiliares).
- [ ] **Buscá bug**: árbitros con conflicto de interés (delegado o jugador del mismo equipo) NO deben asignarse.

### F2 · Asignación manual
- [ ] En un partido sin árbitros, click manual → seleccioná un árbitro disponible.
- [ ] Validá que aparece en el partido con estado `PROPUESTA`.

### F3 · Email de designación al árbitro
- [ ] Mirá logs del API: debe haberse enviado email (real con Resend o log si no hay key).
- [ ] El email tiene link `/designaciones/respuesta?token=...`.

### F4 · Respuesta del árbitro
- [ ] Abrí el link en otra ventana (sin login).
- [ ] Botones **Confirmar / Rechazar**.
- [ ] Confirmá → estado cambia a `CONFIRMADA`.

---

## 🅖 Flujo G — Día del partido (acta digital)

### G1 · Apertura del partido
- [ ] En `/admin/torneos/[id]/fixture`, click un partido de la fecha 1.
- [ ] Detalle del partido muestra: equipos, hora, cancha, árbitros designados.

### G2 · Match Center (RF-17, real-time)
- [ ] Click **Match Center** (botón naranja arriba).
- [ ] En `/admin/torneos/[id]/partidos/[id]/centro`:
  - [ ] Click **Iniciar partido** → cronómetro arranca, badge "EN VIVO".
  - [ ] Click `+ GOL` local → marcador sube. Hacé otro tab abierto en `/partidos/[id]/vivo` y validá que el marcador refresca solo (websocket).
  - [ ] Click **Pausar** → cronómetro se detiene.
  - [ ] Click **Reanudar** → sigue desde donde quedó.
  - [ ] Click **Siguiente período** → cronómetro a 00:00, periodo +1.
  - [ ] Click **Finalizar centro** → confirm. Estado pasa a FINALIZADO_CENTRO.
- [ ] **Buscá bug**: si la conexión WS cae (cortá la red en devtools), el cronómetro debe seguir refrescando via polling HTTP cada 5s.

### G3 · Cargar acta
- [ ] Volvé al detalle del partido.
- [ ] Click **Cargar acta**.
- [ ] Ingresá goles, agregá incidencias:
  - 1 gol del local (jugador X minuto 15)
  - 1 amarilla (jugador Y minuto 30)
  - 1 cambio
- [ ] **Cerrá el acta**.
- [ ] El partido queda en estado `FINALIZADO`, los goles + incidencias bloqueados.
- [ ] **Buscá bug**: si dos jugadores del mismo equipo tienen el mismo número, el sistema lo permite pero debería avisar (gap conocido).

### G4 · Acta offline (PWA)
- [ ] Abrí la página de acta de otro partido **sin acta cerrada**.
- [ ] DevTools → Network → activá **Offline**.
- [ ] Aparece banner naranja "Estás sin conexión".
- [ ] Agregá una incidencia → se encola, badge "1 acción pendiente".
- [ ] Volvé a online → auto-flush, el banner desaparece y la incidencia se persiste.

---

## 🅗 Flujo H — Suspensión de partido individual

- [ ] Detalle de un partido programado → click **Suspender**.
- [ ] Motivo: `LLUVIA`, observación libre. Confirmar.
- [ ] El partido queda `SUSPENDIDO_FUERZA_MAYOR` con badge danger.
- [ ] Click **Reprogramar** → elegí nueva fecha+hora+cancha.
- [ ] Vuelve a `PROGRAMADO` con la nueva fecha.
- [ ] **Buscá bug**: si tiene acta cerrada, NO debe permitir suspenderlo (regla histórica).

---

## 🅘 Flujo I — Suspensión de fecha completa (4 estrategias)

> Esta es la sección que más bugs reportaste antes. Probar las 4.

### I1 · Estrategia AL_FINAL
- [ ] Suspendé la **Fecha 3** con estrategia "Reprogramar al final del calendario", motivo `LLUVIA`.
- [ ] La Fecha 3 queda SUSPENDIDA + badge "ORIGINAL" gris.
- [ ] Se crea una nueva fila "Fecha 3" con badge "REPROGRAMADA" accent, ubicada al final.
- [ ] Los partidos de la Fecha 3 ORIGINAL siguen visibles (suspendidos), **NO se borran**.
- [ ] Botón **Suspender** ya no aparece en la Fecha 3 SUSPENDIDA.
- [ ] Arrastrá un partido de Fecha 3 ORIGINAL a Fecha 3 REPROGRAMADA → se reactiva a PROGRAMADO automáticamente.

### I2 · Estrategia TRASNOCHE_DOMINO
- [ ] Reactivá la Fecha 3 anterior (botón "Reactivar").
- [ ] Volvé a suspender, ahora con "Intercalar nueva fecha y correr las siguientes" + 7 días.
- [ ] La Fecha 3 ORIGINAL queda SUSPENDIDA.
- [ ] Se crea Fecha 3 REPROGRAMADA con fecha de inicio = original+7d.
- [ ] Fechas 4, 5, ... se corrieron 7 días en su fechaInicio y quedan marcadas REPROGRAMADAS.

### I3 · Estrategia REUSAR_EXISTENTE
- [ ] Suspendé la Fecha 5 con "Reusar una fecha existente", elegí Fecha 6 como destino.
- [ ] Los partidos de Fecha 5 se mueven a Fecha 6 (preservando hora del partido).
- [ ] Fecha 6 se marca como REPROGRAMADA.

### I4 · Estrategia MANUAL
- [ ] Suspendé otra fecha con estrategia "Solo marcar suspendida".
- [ ] Los partidos quedan SUSPENDIDO_FUERZA_MAYOR.
- [ ] NO se crea fecha nueva (no aparece bis).

### I5 · Anti-error
- [ ] Intentá suspender una fecha que ya está suspendida → debería dar mensaje claro 400, NO 500.
- [ ] Intentá crear otra REPROGRAMADA cuando ya existe una → ConflictException con sugerencia.

### I6 · UI hederas
- [ ] **Buscá bug**: ¿la fecha (lunes 25 mayo 2026) se muestra en el header de cada card de fecha?
- [ ] Las fechas REPROGRAMADAS y ORIGINALES con el mismo número conviven sin error.

---

## 🅙 Flujo J — Walkovers (Sprint 9)

- [ ] En un partido PROGRAMADO, click **Declarar walkover** → seleccioná equipo perdedor.
- [ ] Resultado: 3-0 al ganador, partido FINALIZADO, badge `WALKOVER`.
- [ ] En `/tabla` (portal público) el resultado cuenta como victoria 3-0 (AUDIT-1 fix).
- [ ] **Buscá bug**: el equipo perdedor pierde puntos? Verificar que la tabla suma correctamente.

---

## 🅚 Flujo K — Tribunal de disciplina

- [ ] Sidebar → **Tribunal**.
- [ ] Lista sanciones automáticas (acumulación de amarillas o roja directa).
- [ ] Click una sanción → ver detalle, motivo, jugador, fechas pendientes.
- [ ] Click **Agregar fecha manual** → +1 fecha sancionado.
- [ ] **Buscá bug**: al cerrar un acta con doble amarilla del mismo jugador, debe sumar +1 a las fechas pendientes automáticamente.

---

## 🅛 Flujo L — Tabla de posiciones (RF-22, tiebreakers)

- [ ] Después de varios partidos cerrados, andá a `/admin/torneos/[id]/configuracion`.
- [ ] Ajustá el orden de tiebreakers (puntos, diferencia, GF, head-to-head "ed", nombre).
- [ ] En `/tabla` (portal público), validá que el orden de equipos respeta los tiebreakers.
- [ ] **Buscá bug**: si dos equipos están empatados, head-to-head debería desempatar (Sprint 12 + AUDIT-4).

---

## 🅜 Flujo M — Pagos (Webpay mock)

### M1 · Crear cobro
- [ ] Sidebar → **Finanzas & cobros**.
- [ ] Click **+ Nuevo cobro** → equipo, concepto "Inscripción", monto `50.000`.
- [ ] Estado inicial: `PENDIENTE`.

### M2 · Iniciar pago
- [ ] En la línea del cobro, click **Pagar online**.
- [ ] Redirige a `/pago/retorno/[id]?token_ws=MOCK-...` (provider mock).
- [ ] La página muestra "Aprobado" + monto.
- [ ] Volvé al admin: el cobro queda `PAGADO`.

### M3 · Boleta SII
- [ ] En el cobro pagado, debería haberse generado un documento tributario.
- [ ] Sidebar → finanzas → tab boletas → ver la boleta con folio + URL PDF (mock).
- [ ] **Buscá bug**: si el cobro se pagó, la boleta debe aparecer en máximo 30 segundos (cron retry).

### M4 · Dunning
- [ ] Creá un cobro con vencimiento ayer.
- [ ] Sidebar → finanzas → tab morosos → debe aparecer en MOROSO.
- [ ] Después de 30 días simulados (o forzá el cron), pasa a SUSPENDIDO.

---

## 🅝 Flujo N — Sponsors

- [ ] Sidebar → **Sponsors & banners**.
- [ ] Crear sponsor con logo URL + link + posición (HOME_HERO).
- [ ] Abrí el portal público (`/`): el banner del sponsor aparece en el hero.
- [ ] **Buscá bug**: si hay 2 sponsors en HOME_HERO, deberían rotar aleatoriamente.

---

## 🅞 Flujo O — Portal público

### O1 · Home pública
- [ ] Abrí `/` (sin login).
- [ ] Ves nombre de la liga, torneo activo, próxima fecha, resultados recientes, top goleadores.
- [ ] **Buscá bug**: si el seed está vacío o falla la query, NO debe dar 500.

### O2 · Tabla / Goleadores / MVP / Asistencias
- [ ] Navegá a `/tabla`, `/goleadores`, `/asistencias`, `/mvp`.
- [ ] Datos coherentes con lo cargado en admin.

### O3 · Match Center público
- [ ] Mientras hay un partido en vivo (Flujo G2), abrí `/partidos/[id]/vivo`.
- [ ] Marcador y cronómetro se actualizan en tiempo real.

---

## 🅟 Flujo P — PWA (instalación)

### P1 · Android
- [ ] Abrí `https://fixtura.cl` en Chrome de un Android.
- [ ] Menú `⋮` → "Instalar app". Confirmá.
- [ ] El icono aparece en la pantalla de inicio. Abrí desde ahí → pantalla completa sin barra del browser.

### P2 · iOS
- [ ] Safari iOS → botón compartir → "Añadir a pantalla de inicio".

### P3 · Offline
- [ ] Con la PWA abierta, modo avión → la app sigue funcionando para vistas cacheadas.
- [ ] Cargar acta offline funciona (queue IndexedDB).

---

## 🅠 Flujo Q — Ley 19.628 (datos personales)

- [ ] Logueado como un user cualquiera, abrí (manualmente) `/me/data` con tu JWT (usa devtools o curl).
- [ ] Descarga JSON con tus datos completos (user, designaciones, push subscriptions, etc.).
- [ ] Llamá `POST /me/delete-request` → programa eliminación en 30 días.
- [ ] **Buscá bug**: si la sesión está impersonada, debe dar 403 `NoImpersonation`.

---

## 🅡 Flujo R — Audit log

- [ ] Como LIGA_ADMIN, sidebar → **Audit log**.
- [ ] Aparecen entradas de las acciones que hiciste (login, partido.acta_cerrada, etc.).
- [ ] Filtrá por prefijo `auth.` → solo auth events.
- [ ] Filtrá por fecha de hoy → solo hoy.
- [ ] Click un metadata → se expande con detalles.
- [ ] **Buscá bug**: las acciones de otros tenants NO deben aparecer (RLS).

---

## 🅢 Flujo S — Impersonación super admin

- [ ] Logueado como super admin → sidebar **Impersonar**.
- [ ] Buscá `admin@liga-test.cl` → click **Entrar como**.
- [ ] Aparece banner naranja "Modo impersonación · viendo como admin@liga-test.cl".
- [ ] Navegás como ese user. Toda acción queda en audit_log con metadata.impersonatorId.
- [ ] Intentá `POST /me/delete-request` → debe dar **403** (decorator `@NoImpersonation`).
- [ ] Click **Salir del modo soporte** → recarga, vuelves al super admin.

---

## 🅣 Flujo T — Suspender un tenant

- [ ] Super admin → Tenants → encontrá `liga-test-rev`.
- [ ] Click **Suspender** → motivo: "Prueba revisión".
- [ ] Estado pasa a `SUSPENDIDO`, isActive=false.
- [ ] Cerrá sesión y logueate con `admin@liga-test.cl` → debe rechazar el acceso (o al menos no ver datos del tenant suspendido).
- [ ] Volvé al super admin → click **Reactivar** → vuelve a ACTIVO.

---

## ✅ Cierre de la revisión

Cuando termines:
- [ ] Contame cuántas casillas marcaste OK / cuántas con BUG.
- [ ] Pegame la lista de BUGs encontrados.
- [ ] Decidimos el orden de fixes y pasamos a Fase 2.

**Cobertura objetivo**: 90%+ de pasos OK = Fase 1 certificada.
Si quedan más de 5 bugs críticos, hacemos una iteración de corrección
antes de declarar Fase 1 cerrada.
