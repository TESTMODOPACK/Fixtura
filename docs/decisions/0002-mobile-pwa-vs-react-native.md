# ADR-0002 — Mobile: PWA en MVP, React Native diferido

- **Estado**: Aceptada (revisable en Fase 4)
- **Fecha**: 2026-05-24
- **Decisores**: Equipo Fixtura

## Contexto

El documento maestro propone una **app móvil React Native** para árbitros, planilleros y jugadores. El argumento es que la operación en cancha (carga de actas, firma touch, fotos, push notifications, modo offline robusto) requiere capacidades nativas.

Realidad operativa: el equipo arranca con 1 desarrollador full-time. React Native implica:
- Stack adicional completo (Metro, Hermes, builds iOS + Android, App Store / Play Store, code signing)
- Duplicación de UI (web + RN) o aprendizaje de cross-platform UI (React Native Web)
- Tests separados (Jest + Detox vs Playwright)
- Pipeline de release nativa: TestFlight, internal testing, externals
- Mantenimiento de SDKs cada 6-12 meses (Firebase RN, IAP, etc.)

Costo realista: **+8-10 semanas** al MVP. Para un producto que aún no validó product-market-fit, eso es prohibitivo.

Alternativa: **PWA instalable** sobre Next.js 14. Cubre la mayoría de las necesidades operativas:

| Capacidad requerida | PWA moderna 2026 | Notas |
|---|---|---|
| Modo offline | ✅ IndexedDB + Service Worker | Workbox o `next-pwa` |
| Sync queue diferida | ✅ Background Sync API | Soportado en Chrome/Edge; fallback con cola en IDB en Safari |
| Cámara para fotos | ✅ `getUserMedia` + `<input type=file capture>` | Funciona en iOS Safari 14+ |
| Firma touch | ✅ Canvas API | Cualquier librería tipo `react-signature-canvas` |
| Push notifications | ✅ Web Push + FCM Web | Soportado iOS desde 16.4 (2023) |
| Geolocalización | ✅ Geolocation API | Estándar |
| Instalación en home screen | ✅ `manifest.json` | Add to Home Screen |
| Lectura de QR | ✅ `BarcodeDetector` o jsQR | Estable en Chrome; lib en Safari |
| Performance | ⚠️ ligeramente peor en arranque | Aceptable para uso operativo |
| Acceso a Bluetooth / NFC | ❌ | No requerido por Fixtura |
| App Store presence | ❌ | Marketing/branding, no funcional |

El único flujo donde PWA es claramente inferior: cargar actas en canchas **sin señal absoluta de internet por horas** y con dispositivos Android viejos (< Android 9). Pero el patrón `escribir local → sync cuando hay conexión` funciona idéntico en PWA y en RN.

## Decisión

**MVP y Fases 1-3: PWA Next.js exclusivamente.**

**Fase 4 (opcional)**: evaluar React Native con base en métricas reales:
- Si ≥30% de los árbitros activos reportan problemas de carga de actas offline → re-evaluar.
- Si las ligas piloto exigen app de tienda como condición comercial → re-evaluar.
- Si necesitamos capacidades que la web no expone (background tasks largos, integraciones nativas).

Implementación PWA:
- `next-pwa` o configuración manual de Service Worker.
- `manifest.json` con icons (192/512), theme color, prompt de instalación.
- IndexedDB con `idb` o `dexie` para queue de actas offline.
- Background Sync para reintento automático al volver online.
- FCM Web SDK para push.
- Test exhaustivo en dispositivos reales: Android 9+, iOS 15+.

## Consecuencias

**Positivas**:
- MVP 8-10 semanas más rápido.
- Una sola base de código frontend (todo Next.js).
- Updates inmediatos sin esperar review de Apple/Google.
- Un dev cubre todo el frontend sin contratar especialista mobile.

**Negativas**:
- Sin presencia en App Store / Play Store (impacto marketing).
- Push notifications en iOS dependen del usuario instalando la PWA primero (no abre por sí solo).
- Algunos flujos en iOS Safari tienen quirks (autoplay de audio, permissions de cámara) que la app nativa evita.
- Si la PWA es inestable en algún dispositivo target, el rollback es difícil (ya hicimos el commit a la estrategia).

## Plan de mitigación

- **Testing en dispositivos físicos** desde Sprint S5: tener al menos 1 Android viejo (~Android 9) y 1 iPhone con iOS 15+ para validación manual.
- **Métrica explícita** en analytics: cuántos eventos `offline-sync-failed` por usuario. Si crece, alarma.
- **Survey periódico** a árbitros: ¿la PWA te sirvió esta semana? Sí / No / Tuve problemas con: ...

## Revisión

Re-evaluar en Fase 4 con datos en mano. La decisión no es permanente — es "no ahora".
