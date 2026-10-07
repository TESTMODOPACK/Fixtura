# LigaPlus — Backups y restore

> Implementado en Fase 0 (T3, auditoría 2026-10-05). El script real es
> [`scripts/backup-db.sh`](../scripts/backup-db.sh); este runbook documenta
> la puesta en marcha, el restore y el drill mensual.

## Política

- `pg_dump` diario 03:00 Chile, local + **copia externa cifrada** (rclone → B2/S3).
- Retención local: 30 días. Retención remota: regla de lifecycle del bucket.
- Cifrado AES-256 (openssl, passphrase) **antes** de subir; la passphrase vive
  fuera del VPS (gestor de contraseñas) y en `/etc/ligaplus-backup.env` (root-only).
- Heartbeat a Healthchecks.io: si el ping diario NO llega, alerta por email.
- Restore de prueba **mensual** — backup que no se restaura es ficción.

## Puesta en marcha (una vez, en el VPS)

1. Instalar rclone y configurar el remote (ej. Backblaze B2 con una key
   **solo-escritura** sobre el bucket). **Con `sudo`**: el cron corre como
   root y lee la config de root (`/root/.config/rclone`):
   ```bash
   curl https://rclone.org/install.sh | sudo bash
   sudo rclone config   # remote "b2" → bucket ligaplus-backups
   ```
2. Crear el archivo de config root-only (los valores reales los carga el
   operador — nunca van al repo):
   ```bash
   sudo install -m 600 /dev/null /etc/ligaplus-backup.env
   sudo nano /etc/ligaplus-backup.env
   ```
   ```bash
   # Generar la passphrase (sin $, espacios ni comillas: el archivo se
   # evalúa como shell y un carácter especial la alteraría EN SILENCIO,
   # dejando backups indescifrables). Entre comillas simples:
   #   openssl rand -base64 48 | tr -d '/+=' 
   BACKUP_ENC_KEY='<passphrase generada — guardarla TAMBIÉN fuera del VPS>'
   BACKUP_RCLONE_REMOTE=b2:ligaplus-backups/db
   BACKUP_PING_URL=https://hc-ping.com/<uuid del check "backup-db">
   ```
3. Crontab de **root** (el env file es root-only y la config de rclone
   también):
   ```cron
   # sudo crontab -e
   0 3 * * * /opt/fixtura/scripts/backup-db.sh >> /var/log/fixtura-backup.log 2>&1
   ```
4. Crear el check "backup-db" en Healthchecks.io (periodo 1 día, gracia 3 h).
5. Correr el script a mano una vez (**con sudo**, igual que el cron) y
   verificar: archivo local `.sql.gz.enc`, objeto en el bucket, ping verde:
   ```bash
   sudo /opt/fixtura/scripts/backup-db.sh
   ```

## Restore

```bash
# 1. Bajar el backup (desde el bucket o desde /var/backups/fixtura)
rclone copy b2:ligaplus-backups/db/fixtura-2026-10-05-030000.sql.gz.enc .

# 2. Descifrar (pide BACKUP_ENC_KEY del gestor de contraseñas)
export BACKUP_ENC_KEY='<passphrase>'
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY \
  -in fixtura-2026-10-05-030000.sql.gz.enc -out restore.sql.gz

# 3. Restaurar (el dump es --clean --if-exists: dropea y recrea objetos).
#    ANTES: detener api y web — restaurar con la app escribiendo corrompe.
#    ON_ERROR_STOP corta al primer error en vez de seguir a medias.
docker compose stop api web
gunzip -c restore.sql.gz | docker compose exec -T db psql -U fixtura -d fixtura -v ON_ERROR_STOP=1
docker compose start api web
```

Para un restore de PRUEBA sin tocar prod, restaurar a una DB aparte:
```bash
docker compose exec -T db createdb -U fixtura fixtura_drill
gunzip -c restore.sql.gz | docker compose exec -T db psql -U fixtura -d fixtura_drill
```

## Drill mensual (checklist)

- [ ] Bajar el backup MÁS RECIENTE del bucket (no el local).
- [ ] Descifrar con la passphrase del gestor (prueba que la key sirve).
- [ ] Restaurar a `fixtura_drill`.
- [ ] Verificar: `SELECT count(*) FROM tenants; SELECT count(*) FROM partidos;
      SELECT count(*) FROM cobros WHERE pagado_at IS NOT NULL;`
- [ ] Comparar contra prod (mismo orden de magnitud, fechas recientes presentes).
- [ ] `docker compose exec -T db dropdb -U fixtura fixtura_drill`
- [ ] Anotar fecha y resultado al final de este archivo.

## Registro de drills

| Fecha | Backup usado | Resultado |
|---|---|---|
| _pendiente_ | | |
