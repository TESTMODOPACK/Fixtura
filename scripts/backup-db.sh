#!/usr/bin/env bash
#
# Backup diario de la DB de LigaPlus — pg_dump + cifrado + copia externa.
#
# Uso (crontab del HOST, no del container):
#   0 3 * * * /ruta/al/repo/scripts/backup-db.sh >> /var/log/fixtura-backup.log 2>&1
#
# Configuración: variables de entorno, o un archivo root-only en
# /etc/ligaplus-backup.env (se sourcea si existe):
#   BACKUP_DIR=/var/backups/fixtura      # destino local
#   RETENTION_DAYS=30                    # rotación local
#   BACKUP_ENC_KEY=...                   # passphrase AES-256 (¡guardarla FUERA del VPS!)
#   BACKUP_RCLONE_REMOTE=b2:bucket/db    # remote rclone para copia externa
#   BACKUP_PING_URL=https://hc-ping.com/<uuid>  # heartbeat (healthchecks.io)
#
# Diseño (hallazgo A-7, auditoría 2026-10-05):
#   - Sin copia externa, perder el VPS es perder cobros, pagos y boletas:
#     si BACKUP_RCLONE_REMOTE no está configurado, el script lo GRITA.
#   - El cifrado protege el dump en el bucket y en el disco compartido.
#   - El ping-en-éxito convierte "el cron murió en silencio" en alerta:
#     healthchecks.io avisa cuando el ping NO llega.
#
# Restore: ver docs/BACKUPS_RUNBOOK.md (incluye el test mensual).

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/ligaplus-backup.env}"
if [ -f "$BACKUP_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$BACKUP_ENV_FILE"
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/fixtura}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_USER="${DB_USER:-fixtura}"
DB_NAME="${DB_NAME:-fixtura}"
# Nombre del container postgres según docker-compose.yml (container_name).
DB_CONTAINER="${DB_CONTAINER:-fixtura_db}"
# Carpeta del docker-compose.yml: por defecto, la raíz del repo (el script
# vive en <repo>/scripts). El default viejo (/opt/fixtura) no existía en
# el VPS real (~/fixtura) y el fallback apuntaba a un container
# inexistente (fixtura-db-1) — el backup moría en silencio.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$SCRIPT_DIR")}"

fail() {
  echo "[$(date -Iseconds)] [ERROR] $*" >&2
  if [ -n "${BACKUP_PING_URL:-}" ]; then
    curl -fsS -m 10 "${BACKUP_PING_URL}/fail" > /dev/null 2>&1 || true
  fi
  exit 1
}

# ── Setup ─────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y-%m-%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/fixtura-$TS.sql.gz"

echo "[$(date -Iseconds)] Iniciando backup → $OUT_FILE"

command -v docker > /dev/null 2>&1 || fail "docker no está instalado"

# ── Dump ──────────────────────────────────────────────────────────────
if docker compose --project-directory "$COMPOSE_DIR" ps db > /dev/null 2>&1; then
  docker compose --project-directory "$COMPOSE_DIR" exec -T db \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
    | gzip > "$OUT_FILE" || fail "pg_dump falló (vía compose)"
else
  docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
    | gzip > "$OUT_FILE" || fail "pg_dump falló (vía docker exec $DB_CONTAINER)"
fi

# Verificar que el archivo tiene contenido (>1KB) — pg_dump puede salir
# sin error pero generar un archivo vacío si algo raro pasó.
SIZE=$(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE")
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$OUT_FILE"
  fail "Backup demasiado chico ($SIZE bytes)"
fi
echo "[$(date -Iseconds)] Dump OK: $OUT_FILE ($SIZE bytes)"

# ── Cifrado ───────────────────────────────────────────────────────────
UPLOAD_FILE="$OUT_FILE"
if [ -n "${BACKUP_ENC_KEY:-}" ]; then
  ENC_FILE="$OUT_FILE.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -pass env:BACKUP_ENC_KEY \
    -in "$OUT_FILE" -out "$ENC_FILE" || fail "cifrado falló"
  rm -f "$OUT_FILE"
  UPLOAD_FILE="$ENC_FILE"
  echo "[$(date -Iseconds)] Cifrado OK: $ENC_FILE"
else
  echo "[$(date -Iseconds)] ⚠️  BACKUP_ENC_KEY no configurada — el dump queda SIN cifrar"
fi

# ── Copia externa (rclone: B2, S3, lo que sea) ────────────────────────
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  command -v rclone > /dev/null 2>&1 || fail "BACKUP_RCLONE_REMOTE configurado pero rclone no está instalado"
  rclone copy "$UPLOAD_FILE" "$BACKUP_RCLONE_REMOTE" --no-traverse \
    || fail "subida a $BACKUP_RCLONE_REMOTE falló"
  echo "[$(date -Iseconds)] Copia externa OK → $BACKUP_RCLONE_REMOTE/$(basename "$UPLOAD_FILE")"
else
  echo "[$(date -Iseconds)] ⚠️  SIN COPIA EXTERNA (BACKUP_RCLONE_REMOTE vacío) — si se pierde el VPS, se pierde TODO"
fi

# ── Rotación local ────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" \( -name "fixtura-*.sql.gz" -o -name "fixtura-*.sql.gz.enc" \) -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date -Iseconds)] Rotación local: $DELETED backup(s) viejos eliminados (>$RETENTION_DAYS días)"
fi

# ── Heartbeat + status ───────────────────────────────────────────────
TOTAL=$(find "$BACKUP_DIR" \( -name "fixtura-*.sql.gz" -o -name "fixtura-*.sql.gz.enc" \) | wc -l)
echo "[$(date -Iseconds)] Backups locales: $TOTAL. Último: $(basename "$UPLOAD_FILE")"
if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 "$BACKUP_PING_URL" > /dev/null 2>&1 || true
fi
