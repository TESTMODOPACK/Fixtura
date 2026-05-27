#!/usr/bin/env bash
#
# Backup diario de la DB de Fixtura — pg_dump con rotación.
#
# Uso:
#   1) Copiá este script al VPS: /opt/fixtura/scripts/backup-db.sh
#   2) chmod +x /opt/fixtura/scripts/backup-db.sh
#   3) Agregar al crontab del host (no del container):
#        0 3 * * * /opt/fixtura/scripts/backup-db.sh >> /var/log/fixtura-backup.log 2>&1
#      Corre todos los días a las 03:00 AM.
#
# Estrategia:
#   - Guarda dumps en /var/backups/fixtura/ con timestamp
#   - Compresión gzip
#   - Retención: 30 días (configurable con RETENTION_DAYS)
#   - Si pg_dump falla, sale con código != 0 (cron lo loguea)
#
# Restore (manual cuando se necesite):
#   gunzip -c /var/backups/fixtura/fixtura-YYYY-MM-DD-HHMMSS.sql.gz | \
#     docker compose exec -T db psql -U fixtura -d fixtura

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fixtura}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_USER="${DB_USER:-fixtura}"
DB_NAME="${DB_NAME:-fixtura}"
# Nombre del container postgres. Si tu docker-compose lo llama distinto,
# sobreescribilo con: DB_CONTAINER=mi-postgres ./backup-db.sh
DB_CONTAINER="${DB_CONTAINER:-fixtura-db-1}"
# Carpeta del docker-compose.yml (para que docker compose exec funcione
# sin -f). Default asume que el script vive en /opt/fixtura/scripts.
COMPOSE_DIR="${COMPOSE_DIR:-/opt/fixtura}"

# ── Setup ─────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/fixtura-$TS.sql.gz"

echo "[$(date -Iseconds)] Iniciando backup → $OUT_FILE"

# ── Backup ────────────────────────────────────────────────────────────
# Probamos docker compose primero. Si falla (no está en el host), usamos
# docker exec directo al container por nombre.
if command -v docker >/dev/null 2>&1; then
  if docker compose --project-directory "$COMPOSE_DIR" ps db >/dev/null 2>&1; then
    docker compose --project-directory "$COMPOSE_DIR" exec -T db \
      pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
      | gzip > "$OUT_FILE"
  else
    docker exec "$DB_CONTAINER" \
      pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
      | gzip > "$OUT_FILE"
  fi
else
  echo "[ERROR] docker no está instalado" >&2
  exit 1
fi

# Verificar que el archivo tiene contenido (>1KB) — pg_dump puede salir
# sin error pero generar un archivo vacío si algo raro pasó.
SIZE=$(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "[ERROR] Backup demasiado chico ($SIZE bytes). Algo falló." >&2
  rm -f "$OUT_FILE"
  exit 2
fi

echo "[$(date -Iseconds)] Backup OK: $OUT_FILE ($SIZE bytes)"

# ── Rotación ─────────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "fixtura-*.sql.gz" -mtime +$RETENTION_DAYS -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date -Iseconds)] Rotación: $DELETED backup(s) viejos eliminados (>$RETENTION_DAYS días)"
fi

# ── Status final ─────────────────────────────────────────────────────
TOTAL=$(find "$BACKUP_DIR" -name "fixtura-*.sql.gz" | wc -l)
LATEST=$(ls -t "$BACKUP_DIR"/fixtura-*.sql.gz 2>/dev/null | head -1)
echo "[$(date -Iseconds)] Backups totales: $TOTAL. Último: $(basename "$LATEST")"
