# ─── Builder ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

RUN apk add --no-cache python3 make g++ \
    && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Copiar workspace root y manifestos
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile=false

# Copiar fuentes
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build packages compartidos y el API
RUN pnpm --filter @fixtura/api run build

# ─── Runtime ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production

RUN apk add --no-cache wget tini \
    && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copiar artefactos compilados y deps de producción
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml* ./
COPY --from=builder /repo/packages/ ./packages/
COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api

EXPOSE 3000

# Tini como PID 1 para graceful shutdown correcto.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node dist/database/cleanup-orphans.js && node dist/main"]
