/**
 * Inicialización temprana de Sentry — DEBE ser el primer import de main.ts.
 *
 * El side-effect del import ejecuta Sentry.init() ANTES de que se cargue
 * express/typeorm/pg, registrando los hooks de OpenTelemetry necesarios
 * para tracing automático. Si Sentry inicializa después de cargar esas
 * librerías, los traces nacen rotos.
 *
 * Si SENTRY_DSN no está definido, Sentry queda inactivo silenciosamente
 * (todos los Sentry.* son no-op). Eso es lo que queremos en dev local.
 */
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

/** T27 — corta la query string: ahí viajan tokens (?token=, ?token_ws=). */
function sinQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

const CLAVES_SENSIBLES = /pass|token|secret|apikey|api_key|authorization|cookie|clave/i;

function limpiarBody(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const copia: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const k of Object.keys(copia)) {
    if (CLAVES_SENSIBLES.test(k)) copia[k] = '[Filtrado]';
  }
  return copia;
}

/** Forma mínima común de ErrorEvent/TransactionEvent que acá se limpia. */
interface EventoConRequest {
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    data?: unknown;
  };
}

/**
 * T27 — scrubbing de lo que el SDK adjunta por defecto: URL con query,
 * query_string, cookies y headers Authorization/Cookie (ahí va la cookie
 * HttpOnly lp_refresh), más claves sensibles del body capturado.
 */
function limpiarEvento<T extends EventoConRequest>(event: T): T {
  if (event.request) {
    event.request.url = sinQuery(event.request.url) as string | undefined;
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    event.request.data = limpiarBody(event.request.data);
  }
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    beforeSend: (event) => limpiarEvento(event),
    beforeSendTransaction: (event) => {
      limpiarEvento(event);
      // Los spans HTTP llevan la URL completa en sus atributos.
      for (const span of event.spans ?? []) {
        const data = span.data as Record<string, unknown> | undefined;
        if (!data) continue;
        for (const clave of ['http.url', 'url.full', 'http.target', 'url.query']) {
          if (clave in data) data[clave] = sinQuery(data[clave]);
        }
      }
      return event;
    },
  });
}
