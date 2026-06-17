#!/usr/bin/env bash
#
# Deploy manual de Fixtura en VPS.
#
# Uso (como usuario fixtura en el VPS):
#   cd ~/fixtura
#   ./scripts/deploy.sh         # deploy estándar: rebuild + up
#   ./scripts/deploy.sh rolling # rolling: solo api y web, --no-deps
#   ./scripts/deploy.sh quick   # quick: solo up -d (sin rebuild — SOLO si NO cambió código)
#
# Por qué este script existe:
#   El bug del 2026-05-27 (commit daefe48) ocurrió porque se hizo
#   `git pull && docker compose up -d` sin `--no-cache`. Docker reusó la
#   imagen vieja del API que tenía el cleanup-orphans desactualizado, y
#   varias migraciones no se aplicaron en prod. Resultado: API crashea
#   con "column cancha_id does not exist" en cada request.
#
#   Este script hace IMPOSIBLE saltarse el rebuild en deploys que
#   tocan código. Si el usuario corre `quick` por error, ve un warning
#   visible.

set -euo pipefail

MODO="${1:-standard}"

cd "$(dirname "$0")/.."

# ── Detectar si hay cambios de código sin rebuild ────────────────────
SHA_REPO=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
SHA_IMAGEN=$(docker compose images api --format json 2>/dev/null \
  | head -1 \
  | python3 -c "import sys, json; data = json.loads(sys.stdin.read()); print(data.get('Tag', 'none'))" 2>/dev/null \
  || echo "none")

echo "==> Estado actual"
echo "    Repo HEAD     : $SHA_REPO"
echo "    Imagen actual : $SHA_IMAGEN"
echo "    Modo deploy   : $MODO"
echo ""

# ── Validación del modo quick ────────────────────────────────────────
if [ "$MODO" = "quick" ]; then
  echo "⚠️  MODO QUICK: NO se rebuildea la imagen."
  echo "    Solo usar esto si NO cambió código del API/web (ej: cambio de .env)."
  echo "    Si hubo `git pull` con cambios de código, este modo PROVOCA BUGS"
  echo "    (cleanup-orphans queda viejo, migraciones no aplican)."
  echo ""
  read -p "¿Confirmás que NO hubo cambios de código? [escribí 'si']: " confirm
  if [ "$confirm" != "si" ]; then
    echo "Abortado. Usá './scripts/deploy.sh' (sin args) para deploy seguro."
    exit 1
  fi
fi

# ── BACKUP previo siempre ────────────────────────────────────────────
echo "==> Backup defensivo de DB"
mkdir -p /var/backups/fixtura 2>/dev/null || sudo mkdir -p /var/backups/fixtura
BACKUP_FILE="/var/backups/fixtura/pre-deploy-$(date +%Y-%m-%d-%H%M%S).sql.gz"
if docker compose exec -T db pg_dump -U fixtura -d fixtura --clean --if-exists 2>/dev/null \
  | gzip > "$BACKUP_FILE"; then
  SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")
  if [ "$SIZE" -gt 1024 ]; then
    echo "    Backup OK: $BACKUP_FILE ($SIZE bytes)"
  else
    echo "    ⚠️  Backup demasiado chico — algo raro, abortando"
    rm -f "$BACKUP_FILE"
    exit 2
  fi
else
  echo "    ⚠️  No se pudo hacer backup (¿DB no está arriba?). Continuando con cuidado."
fi
echo ""

# ── Pull del repo (si no se hizo ya) ─────────────────────────────────
echo "==> Sync del repo"
git fetch origin main
git reset --hard origin/main
NEW_SHA=$(git rev-parse --short HEAD)
echo "    HEAD ahora: $NEW_SHA"
echo ""

export GIT_SHA="$NEW_SHA"

# ── Build ────────────────────────────────────────────────────────────
if [ "$MODO" != "quick" ]; then
  # KVM 2 tiene RAM limitada: buildear api y web EN PARALELO con --no-cache
  # agota la memoria y buildkit muere con "Unavailable: error reading from
  # server: EOF". Buildeamos SECUENCIAL para bajar el pico de memoria.
  echo "==> docker compose build --no-cache api (1/2)"
  docker compose build --no-cache api
  echo "==> docker compose build --no-cache web (2/2)"
  docker compose build --no-cache web
  echo ""
fi

# ── Up ───────────────────────────────────────────────────────────────
case "$MODO" in
  rolling)
    echo "==> docker compose up -d --no-deps api web"
    docker compose up -d --no-deps api web
    ;;
  quick|standard|*)
    echo "==> docker compose up -d"
    docker compose up -d
    ;;
esac
echo ""

# ── Esperar healthy ──────────────────────────────────────────────────
echo "==> Esperando que api esté healthy"
TIMEOUT=120
ELAPSED=0
while true; do
  STATUS=$(docker inspect fixtura_api --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$STATUS" = "healthy" ]; then
    echo "    api healthy en ${ELAPSED}s"
    break
  fi
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "    ❌ Timeout esperando healthy. Mostrando logs:"
    docker compose logs --tail=50 api
    exit 3
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

# ── Verificación de migraciones (logs de cleanup-orphans) ────────────
echo ""
echo "==> Verificando que cleanup-orphans corrió"
LOGS=$(docker compose logs --tail=100 api 2>&1 | grep -iE "cleanup|asegurad|done\." || true)
if [ -z "$LOGS" ]; then
  echo "    ⚠️  No se ven logs de cleanup-orphans. Revisar manualmente:"
  echo "    docker compose logs --tail=200 api | grep -i clean"
else
  echo "$LOGS" | sed 's/^/    /'
fi
echo ""

# ── Smoke tests ──────────────────────────────────────────────────────
echo "==> Smoke tests"
if curl -fsS http://localhost/api/health/live > /dev/null 2>&1; then
  echo "    /api/health/live OK"
else
  echo "    ⚠️  /api/health/live falló"
fi
VERSION=$(curl -fsS http://localhost/api/health/version 2>/dev/null || echo "?")
echo "    /api/health/version: $VERSION"
echo ""

# ── Cleanup ──────────────────────────────────────────────────────────
echo "==> Limpieza de imágenes viejas"
docker image prune -f
echo ""

echo "✅ Deploy OK — SHA=$NEW_SHA modo=$MODO"
echo "Backup pre-deploy: $BACKUP_FILE"
