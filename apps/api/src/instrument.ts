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

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
  });
}
