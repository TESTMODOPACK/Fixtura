# Fixtura — Runbook operacional

Guía para deploys, monitoreo y troubleshooting en producción.

## Topología actual

VPS único (Hostinger o Hetzner, 4-8 GB RAM) con Docker Compose. Servicios:

| Servicio | Puerto interno | mem_limit |
|---|---|---|
| db (PostgreSQL 16) | 5432 (loopback) | 1 GB |
| redis | 6379 (loopback) | 256 MB |
| api (NestJS) | 3000 (loopback) | 768 MB |
| web (Next.js) | 3001 (loopback) | 384 MB |
| nginx | 80 / 443 (público) | 64 MB |

Nginx termina TLS, hace rate limit (5 req/min en `/auth/login`, 100 req/min en `/api/`)
y proxea a api/web.

## Deploys

> 🟢 **Recomendado**: usar siempre `./scripts/deploy.sh`. Hace backup defensivo
> previo, build con `--no-cache`, espera healthy, verifica `cleanup-orphans` y
> corre smoke tests. Evita el incidente del 2026-05-27 donde un
> `git pull + docker compose up -d` manual dejó la imagen del API con
> `cleanup-orphans` desactualizado → 4 migraciones sin aplicar → API crashea
> con `column "cancha_id" does not exist`.

### Deploy estándar (downtime ~30-60s) — recomendado

```bash
ssh fixtura@prod
cd ~/fixtura
./scripts/deploy.sh          # modo standard (default)
```

Pasos que ejecuta automáticamente:

1. `pg_dump` defensivo a `/var/backups/fixtura/pre-deploy-<TS>.sql.gz`
2. `git fetch && git reset --hard origin/main`
3. `docker compose build --no-cache api web` — **NUNCA omitir `--no-cache`**
4. `docker compose up -d`
5. Esperar `fixtura_api healthy` (timeout 120s)
6. Verificar logs de `cleanup-orphans` (debe decir "Done.")
7. Smoke tests `/api/health/live` + `/api/health/version`
8. `docker image prune -f`

Impacto: requests en vuelo durante el rollover reciben 502. Aceptable para features
no críticas. Para cambios que tocan pagos o webhooks usar el modo rolling.

### Deploy rolling (~10s gap, requests reintentados por nginx)

```bash
./scripts/deploy.sh rolling
```

Equivalente manual (sólo si necesitás debugear el script):

```bash
export GIT_SHA=$(git rev-parse --short HEAD)
docker compose build --no-cache api
docker compose up -d --no-deps api

timeout 120 bash -c 'until docker inspect fixtura_api --format "{{.State.Health.Status}}" | grep -q healthy; do sleep 5; done'

docker compose logs --tail=20 api | grep -iE 'running|error'
docker image prune -f
```

### ❌ Errores comunes — NO hacer

```bash
# ❌ Saltarse el rebuild:
git pull && docker compose up -d
# Esto NO actualiza la imagen del API. cleanup-orphans queda viejo,
# migraciones no se aplican, tabla "cancha_id does not exist" 500s.

# ❌ Rebuild con cache:
docker compose build api && docker compose up -d
# Sin --no-cache, Docker puede reusar layers desactualizadas (en
# especial pnpm-lock o packages/) y dejar dependencias viejas.

# ❌ docker compose down -v (¡destruye volúmenes!):
docker compose down -v
# Borra postgres_data — TODA la DB se pierde. Solo válido en dev.

# ❌ Reset hard sin pull previo:
git reset --hard HEAD~5
# Si el VPS quedó atrás, ese HEAD ya es antiguo. Hacer git fetch primero.
```

Si por error hiciste un `up -d` sin rebuild y la app crashea con errores de
columna/tabla no existente, ejecutar el script de recuperación:

```bash
docker compose cp scripts/heal-prod-schema.sql db:/tmp/heal.sql
docker compose exec db psql -U fixtura -d fixtura -f /tmp/heal.sql
docker compose restart api
```

(Ver `scripts/heal-prod-schema.sql` — idempotente, no toca datos.)

### Smoke tests post-deploy

```bash
# Health
curl -fsS https://fixtura.cl/api/health/live
# Login responde 4xx, no 5xx
curl -s -o /dev/null -w "%{http_code}\n" https://fixtura.cl/api/v1/auth/login
# Web sirve
curl -fsS https://fixtura.cl/login -o /dev/null && echo OK
# Version desplegada coincide con el GIT_SHA esperado
curl -s https://fixtura.cl/api/health/version
```

### Rollback

```bash
git log --oneline -10  # encontrar SHA anterior estable
git reset --hard <sha-previo>
export GIT_SHA=$(git rev-parse --short HEAD)
docker compose build --no-cache api web
docker compose up -d --no-deps api web
```

Si una migración rompió algo, primero revertirla:

```bash
docker compose exec api pnpm migration:revert
```

Luego rollback del código.

## Migraciones en prod

```bash
docker compose exec api pnpm migration:show
docker compose exec api pnpm migration:run
```

`cleanup-orphans.ts` corre automáticamente en cada arranque del container API.

## Logs

Cada servicio loguea a stdout. Docker rota a 50m × 5 archivos por servicio.

```bash
# Logs de un servicio en vivo
docker compose logs -f api

# Últimas 200 líneas filtradas por error
docker compose logs --tail=200 api | grep -iE 'error|warn'

# Logs estructurados Pino — filtrar por requestId
docker compose logs --tail=1000 api | grep '"requestId":"abc-123"'
```

Para errores complejos: revisar Sentry (configurado en `SENTRY_DSN`).

## Métricas

`/metrics` (Prometheus) está protegido con basic auth (`METRICS_USER` / `METRICS_PASSWORD`).
No exponer públicamente.

```bash
curl -u $METRICS_USER:$METRICS_PASSWORD https://fixtura.cl/api/metrics
```

Métricas mínimas a vigilar:
- `http_request_duration_seconds` — p95 < 500ms
- `http_requests_total{status=~"5.."}` — error rate < 1%
- `db_pool_active` — no llegar al máximo
- `bullmq_jobs_completed_total` vs `bullmq_jobs_failed_total`

## Monitoreo de recursos

```bash
docker stats --no-stream
df -h /
free -h
```

Alertar si:
- Disco > 80%
- Memoria de cualquier servicio cerca del `mem_limit`
- CPU del host sostenido > 80%

## Limpieza periódica

```bash
docker system prune -af      # imágenes/containers no usados
docker image prune -af       # solo imágenes
# OJO: no borrar volumes (postgres_data, redis_data)
```

## Backups

Ver `docs/BACKUPS_RUNBOOK.md` para detalle. Setup mínimo en el VPS:

```bash
# Copiar script al lugar canónico
sudo mkdir -p /opt/fixtura/scripts
sudo cp /home/fixtura/fixtura/scripts/backup-db.sh /opt/fixtura/scripts/
sudo chmod +x /opt/fixtura/scripts/backup-db.sh

# Test manual
/opt/fixtura/scripts/backup-db.sh
ls -lah /var/backups/fixtura/

# Agendar en cron del host (no del container)
sudo crontab -e
# Agregar:
0 3 * * * /opt/fixtura/scripts/backup-db.sh >> /var/log/fixtura-backup.log 2>&1
```

Además, **cada `./scripts/deploy.sh` hace un backup defensivo previo** a
`/var/backups/fixtura/pre-deploy-<TS>.sql.gz` — útil si el deploy rompe algo
inesperado y querés restaurar al estado anterior.

Mínimo recomendado:
- `pg_dump` rotativo diario, retención 30 días (default del script).
- Verificación mensual: bajar el último dump y restaurarlo en un container
  de test. Un backup que no se restaura es ficción.

## Troubleshooting

### "Container no llega a healthy"

```bash
docker compose logs --tail=100 api
docker inspect fixtura_api --format '{{json .State.Health}}' | jq
```

Causas comunes: DB no responde (revisar `db` healthcheck), env var faltante (el API
crashea loud con mensaje claro), migración pendiente.

### "Login devuelve 500"

Probablemente `JWT_SECRET` o `SSO_STATE_SECRET` mal configurados. El API debería
haber crasheado en bootstrap, así que revisar logs de arranque.

### "RLS está bloqueando queries que deberían pasar"

1. Verificar que el `TenantContextInterceptor` se ejecutó (debe haber un log con
   `app.current_tenant_id`).
2. Verificar que el usuario tiene el rol correcto en el tenant correcto
   (`SELECT * FROM user_roles WHERE user_id = '...'`).
3. Para queries cross-tenant (super admin), confirmar que se setea
   `app.current_tenant_id = ''`.

### "Webhook de pago devuelve 502"

Cuando un webhook recibe 502 durante un deploy estándar, Transbank reintenta hasta
3 veces. Si el deploy duró menos de eso, no se pierde. Para garantizar zero loss usar
deploy rolling.

## Contactos de emergencia

(Completar con datos reales del equipo)

- Tech lead: ...
- DBA: ...
- Sentry alerts: ...
