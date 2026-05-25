// ──────────────────────────────────────────────────────────────────────
// SENTRY — debe ser el PRIMER import del proceso. El side-effect ejecuta
// Sentry.init() y registra los hooks de OpenTelemetry antes de cargar
// express/typeorm/pg.
// ──────────────────────────────────────────────────────────────────────
import './instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import { Logger as PinoLogger } from 'nestjs-pino';
import { initializeTransactionalContext } from 'typeorm-transactional';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Inicializar el contexto transaccional ANTES de crear la app.
  // typeorm-transactional usa AsyncLocalStorage para propagar la transacción
  // activa a todas las queries de TypeORM dentro del request, sin tener que
  // refactorizar cada service. Esto habilita que el TenantContextInterceptor
  // envuelva cada request en una tx donde SET LOCAL app.current_tenant_id
  // se propaga correctamente — pre-requisito de RLS.
  initializeTransactionalContext();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('Bootstrap');

  // ─── Validación temprana de secretos críticos ───────────────────────
  // En prod: JWT_SECRET y SSO_STATE_SECRET deben tener ≥32 caracteres, no
  // ser un default conocido, y ser distintos entre sí. Falla loud (el
  // container crashea) es mejor que silent insecurity.
  const knownWeakSecrets = new Set([
    'CAMBIAR_POR_SECRETO_JWT_SEGURO',
    'CAMBIAR_POR_SECRETO_SSO_SEGURO',
    'super-secret-jwt-key-for-dev-only',
    'changeme',
    'secret',
    'jwt-secret',
    'your-secret-here',
    'cambia-esto-por-32-caracteres-minimo-aleatorios-prod',
  ]);
  const isSecretWeak = (val: string): boolean =>
    val.length < 32 || knownWeakSecrets.has(val);

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ?? '';

  if (isProduction && isSecretWeak(jwtSecret)) {
    throw new Error(
      'JWT_SECRET is weak or missing in production. Required: at least 32 chars and not a known default. Generate with: openssl rand -base64 32',
    );
  }
  if (!isProduction && isSecretWeak(jwtSecret)) {
    logger.warn(
      'JWT_SECRET is weak (< 32 chars or known default). OK for dev; must be rotated in production.',
    );
  }

  const ssoStateSecret = process.env.SSO_STATE_SECRET ?? '';
  if (isProduction && isSecretWeak(ssoStateSecret)) {
    throw new Error(
      'SSO_STATE_SECRET is weak or missing in production. Required: at least 32 chars and not a known default. Must be different from JWT_SECRET.',
    );
  }
  if (isProduction && ssoStateSecret === jwtSecret) {
    throw new Error(
      'SSO_STATE_SECRET equals JWT_SECRET in production. They must be different — the whole point is isolation.',
    );
  }

  // ─── Trust proxy ─────────────────────────────────────────────────────
  // El API corre detrás de nginx dentro de la misma red de Docker. Sin esto,
  // Express usa la IP del contenedor nginx en lugar de la IP real del cliente
  // y el rate limit cuenta todo como una sola IP.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.enableShutdownHooks();

  // ─── /metrics basic auth ─────────────────────────────────────────────
  const metricsUser = process.env.METRICS_USER;
  const metricsPass = process.env.METRICS_PASSWORD;
  if (metricsUser && metricsPass) {
    app.use(
      '/metrics',
      (
        req: { headers: Record<string, string> },
        res: {
          setHeader: (k: string, v: string) => void;
          status: (n: number) => { send: (b: string) => unknown };
        },
        next: () => void,
      ) => {
        const authHeader = req.headers['authorization'] ?? '';
        if (!authHeader.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
          return res.status(401).send('Authentication required');
        }
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
        const [user, pass] = decoded.split(':');
        if (user === metricsUser && pass === metricsPass) return next();
        res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
        return res.status(401).send('Invalid credentials');
      },
    );
    logger.log('Metrics endpoint /metrics protected with basic auth');
  } else if (isProduction) {
    logger.warn(
      'METRICS_USER/METRICS_PASSWORD not set — /metrics endpoint is UNPROTECTED in production',
    );
  }

  // ─── Cookies (necesario para SSO callback con signed state cookie) ──
  // Debe ir antes de cualquier body parser.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());

  // ─── Webhooks: raw body antes del JSON parser ────────────────────────
  // Stripe y MercadoPago verifican firmas contra los bytes exactos. Si
  // Nest parsea el body primero, la firma falla. Registramos express.raw
  // para esos paths antes del parser global.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const express = require('express');
  app.use('/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/webhooks/mercadopago', express.raw({ type: '*/*', limit: '1mb' }));
  app.use('/webhooks/webpay', express.raw({ type: '*/*', limit: '1mb' }));

  // Body parser global — uploads de avatares y escudos en base64 hasta 10MB.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  // ─── Security headers (sin helmet, zero-dep) ─────────────────────────
  app.use(
    (
      _req: unknown,
      res: { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void },
      next: () => void,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.removeHeader('X-Powered-By');
      next();
    },
  );

  // ─── CORS con whitelist obligatoria en producción ────────────────────
  const frontendUrl = process.env.FRONTEND_URL;
  const allowedOrigins = frontendUrl
    ? frontendUrl
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
    : null;

  if (isProduction && (!allowedOrigins || allowedOrigins.length === 0)) {
    throw new Error(
      'FRONTEND_URL is required in production. Set it to the exact frontend origin(s) (comma-separated if multiple). Reflect-all-origins mode is disabled in production.',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: string | boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins && allowedOrigins.length > 0) {
        return callback(null, allowedOrigins.includes(origin));
      }
      return callback(null, origin);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ─── Validation pipe global ─────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready', 'health/version', 'metrics'],
  });

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`Fixtura API running on port ${port}`);
  logger.log(
    `CORS allowed origins: ${allowedOrigins ? allowedOrigins.join(', ') : 'all (reflect — dev only)'}`,
  );
  logger.log('Health: GET /health/live | /health/ready | /health/version');
}

process.on('unhandledRejection', (reason) => {
  const logger = new Logger('UnhandledRejection');
  logger.error(`Unhandled promise rejection: ${reason}`, (reason as Error)?.stack);
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
    tags: { source: 'unhandledRejection' },
  });
});

process.on('uncaughtException', (err) => {
  const logger = new Logger('UncaughtException');
  logger.error(`Uncaught exception: ${err.message}`, err.stack);
  Sentry.captureException(err, { tags: { source: 'uncaughtException' } });
  Sentry.close(2000).finally(() => {
    setTimeout(() => process.exit(1), 500);
  });
});

void bootstrap();
