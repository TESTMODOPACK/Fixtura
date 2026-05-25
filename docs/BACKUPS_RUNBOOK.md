# Fixtura — Backups y restore

> Estado: **TODO completar en Sprint 0 antes de tener data de cliente real**.
> Este archivo es un placeholder con la estrategia mínima.

## Política

- `pg_dump` diario a las 03:00 hora Chile (madrugada baja).
- Retención: 30 días rotando (28 diarios + 2 mensuales).
- Backups encriptados con `gpg` antes de salir del host.
- Copia off-site cifrada en S3 / Backblaze B2.
- Restore mensual verificado en staging — backup que no se restaura es ficción.

## Script de backup (esquema)

```bash
#!/bin/bash
# /opt/fixtura/scripts/backup.sh
set -euo pipefail

DATE=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/fixtura
mkdir -p "$DEST"

docker compose -f /home/fixtura/docker-compose.prod.yml exec -T db \
  pg_dump -U fixtura -Fc fixtura | \
  gpg --batch --yes --encrypt --recipient backup@fixtura.cl > "$DEST/$DATE.dump.gpg"

# Subir a S3
aws s3 cp "$DEST/$DATE.dump.gpg" s3://fixtura-backups/daily/

# Rotación local: borrar > 30 días
find "$DEST" -name "*.dump.gpg" -mtime +30 -delete
```

Cron del host:

```cron
0 3 * * * /opt/fixtura/scripts/backup.sh >> /var/log/fixtura-backup.log 2>&1
```

## Restore (drill)

```bash
gpg --decrypt 20260601-030000.dump.gpg > restore.dump
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U fixtura -d fixtura_staging --clean --if-exists < restore.dump
```

Verificación post-restore: contar filas en tablas clave, login con usuario admin,
ver tabla de posiciones de un torneo histórico.

## Pendientes

- [ ] Implementar el script real
- [ ] Configurar cron + logrotate
- [ ] Generar keypair GPG y guardar private key en lugar seguro
- [ ] Configurar S3/B2 con bucket policy `write-only` desde el VPS
- [ ] Documentar el procedimiento de drill mensual
- [ ] Alertar si el cron falla (Sentry cron monitor o Healthchecks.io)
