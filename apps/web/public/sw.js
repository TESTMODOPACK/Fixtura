/**
 * Service Worker de LigaPlus.
 *
 * Estrategias:
 *   - Estáticos (JS, CSS, fuentes, imágenes propias): cache-first + revalidate
 *     en background. Permite que la app cargue sin red después de la primera
 *     visita.
 *   - API GETs públicos (fixture, tabla, sponsors, etc.): stale-while-revalidate.
 *     El usuario ve data cacheada de inmediato; el background fetch actualiza
 *     para la próxima vez.
 *   - API GETs autenticados (/admin/*): network-only. Sin cache (tienen JWT).
 *   - POST/PATCH/DELETE: NUNCA cacheamos. Si falla offline, la app cliente
 *     usa offline-queue.ts (IndexedDB) para encolar.
 *   - Fallback offline: si todo lo anterior falla y la request es navegación
 *     HTML, devolvemos la página /offline.html.
 *
 * Versión cache — bumpear cuando cambien las estrategias.
 */
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `fixtura-static-${CACHE_VERSION}`;
const API_CACHE = `fixtura-api-${CACHE_VERSION}`;
const ACTA_CACHE = `fixtura-acta-${CACHE_VERSION}`;

/**
 * Sprint 13: endpoints del acta que sí cacheamos (stale-while-revalidate)
 * aunque sean /admin/*. El árbitro en cancha sin señal necesita ver:
 *   - GET /admin/partidos/:id              (detalle del partido + incidencias)
 *   - GET /admin/equipos/:id               (plantel del equipo local)
 *   - GET /admin/equipos/:id/jugadores     (alias plantel)
 *   - GET /admin/partidos/:id/designaciones-recinto
 *   - GET /admin/torneos/:id/personal      (para autocompletar)
 *
 * Excepción consciente: la regla "admin = network-only" sigue valiendo
 * por default. Acá hacemos opt-in selectivo para que la PWA del acta
 * funcione offline sin meter cache a TODO /admin/*.
 */
function esEndpointActa(pathname) {
  return (
    /^\/api\/v1\/admin\/partidos\/[0-9a-f-]{8,}/i.test(pathname) ||
    /^\/api\/v1\/admin\/equipos\/[0-9a-f-]{8,}(\/jugadores)?$/i.test(pathname) ||
    /^\/api\/v1\/admin\/torneos\/[0-9a-f-]{8,}\/personal/i.test(pathname)
  );
}

// Assets críticos que pre-cacheamos en el install.
// Next.js sirve los chunks JS bajo /_next/static/... — esos se cachean
// dinámicamente al primer fetch.
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/brand/logo.png',
  '/brand/mark.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Si alguno de los assets no existe (ej. offline.html aún no creada),
        // no rompemos el install — los cacheamos dinámicamente al volar.
      }))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('fixtura-') && !k.endsWith(`-${CACHE_VERSION}`))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim())
      // Notificar a clientes que el SW se activó (para recargar la
      // página si es la primera vez después de un update mayor).
      .then(() =>
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION })),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Solo manejamos GET. POST/PATCH/DELETE pasan directo a la red — el
  // cliente JS los encola en IndexedDB si fallan.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // No interceptar cross-origin (fonts.googleapis, Resend, Sentry, etc.)
  if (url.origin !== self.location.origin) return;

  // API pública: stale-while-revalidate
  if (url.pathname.startsWith('/api/v1/public/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // API admin del acta: cacheamos selectivamente para soportar acta
  // offline (el árbitro en cancha sin señal carga partido + plantel).
  if (url.pathname.startsWith('/api/v1/admin/') && esEndpointActa(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, ACTA_CACHE));
    return;
  }

  // API admin: network-only. Sin cache (data sensible / por usuario).
  if (url.pathname.startsWith('/api/v1/admin/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Health checks: no cachear
  if (url.pathname.startsWith('/api/v1/health/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Assets de Next.js: cache-first + revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(svg|png|jpg|jpeg|webp|woff2?|ttf|otf)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navegación HTML (modo SPA): network-first con fallback a /offline.html
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request)),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Background revalidate sin bloquear
    fetch(request)
      .then((fresh) => {
        if (fresh.ok) cache.put(request, fresh.clone());
      })
      .catch(() => {
        /* swallow */
      });
    return cached;
  }
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached ?? fetchPromise;
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Sin conexión',
        message: 'No se pudo contactar al servidor. Conectate a internet e intentá de nuevo.',
        offline: true,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

async function networkFirstHtml(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      // Cacheamos la respuesta HTML para fallback futuro
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Sin red — intentar cache primero
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: página offline genérica
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// Listener para mensajes del cliente — útil para forzar skipWaiting tras
// un update del SW (cuando el cliente quiere refrescar).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Web Push (F56.4) ────────────────────────────────────────────────
// El backend (PushService) envía un payload JSON { title, body, url, tag,
// data }. Mostramos la notificación y, al tocarla, abrimos/enfocamos la
// URL indicada (ej. el detalle del partido).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'LigaPlus', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'LigaPlus';
  const options = {
    body: payload.body || '',
    icon: '/brand/mark.png',
    badge: '/brand/mark.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Si ya hay una ventana abierta, la enfocamos y navegamos.
      for (const w of wins) {
        if ('focus' in w) {
          w.focus();
          if ('navigate' in w) w.navigate(url).catch(() => {});
          return undefined;
        }
      }
      return clients.openWindow(url);
    }),
  );
});
