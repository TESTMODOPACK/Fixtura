# ─── Builder ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG GIT_SHA=unknown
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV GIT_SHA=${GIT_SHA}

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/domain/package.json packages/domain/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile=false

COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @fixtura/web run build

# ─── Runtime ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ENV NODE_ENV=production

RUN apk add --no-cache wget tini \
    && corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml* ./
COPY --from=builder /repo/packages/ ./packages/
COPY --from=builder /repo/apps/web/package.json ./apps/web/
COPY --from=builder /repo/apps/web/.next ./apps/web/.next
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/web/node_modules ./apps/web/node_modules

WORKDIR /app/apps/web

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "start"]
