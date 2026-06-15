# Coexistencia LigaPlus + Eva360 en el mismo VPS

El VPS de Hostinger (`187.127.14.243`) corre **dos** proyectos:

- **Eva360** → reverse proxy nginx en los puertos **80/443** (dominio `eva360.ascenda.cl`).
- **LigaPlus** → nginx en **8080/8443** (no puede tomar 80/443 porque ya los usa Eva360).

Como un dominio sin puerto siempre llega al 80/443, hacemos que el **nginx de
Eva360 enrute `ligaplus.cl` hacia LigaPlus** (puerto 8080 del host). Eva360
termina el TLS y reenvía todo; LigaPlus hace su propio routing interno.

```
  www.ligaplus.cl ─┐
                   ▼  (TLS)
  eva360_nginx :443 ── proxy_pass ──▶ host:8080 ── fixtura_nginx ─┬─ /api → api:3000
  eva360.ascenda.cl ──▶ eva360 web/api (sin cambios)              └─ /    → web:3001
```

> ⚠️ **Eva360 está en producción.** Solo vamos a *agregar* bloques a su config,
> nunca modificar los suyos. Backup antes de tocar. nginx valida (`nginx -t`)
> antes de cada reload, así un error no tumba Eva360.

Rutas en el VPS: **Eva360 en `/docker/eva360`** (su `docker-compose.yml` +
`nginx.conf`), **LigaPlus en `/opt/fixtura`**. Redes Docker separadas
(`eva360_default`, `fixtura_default`). Usuario: `root`.

---

## Paso 1 — DNS

En el panel del registrador de `ligaplus.cl`, dos A records a la IP del VPS:

```
A   @     187.127.14.243   TTL 300
A   www   187.127.14.243   TTL 300
```

Esperá a que resuelvan antes de seguir: `nslookup www.ligaplus.cl`.

---

## Paso 2 — Obtener la IP del host vista desde el nginx de Eva360

Como Eva360 y LigaPlus están en redes separadas, el nginx de Eva360 llega a
LigaPlus por el puerto 8080 publicado en el host. La IP del host desde adentro
del container es el **gateway de la red `eva360_default`**:

```bash
docker network inspect eva360_default -f '{{(index .IPAM.Config 0).Gateway}}'
```

Anotá esa IP (típicamente `172.x.0.1`) — la vas a usar en el `proxy_pass` del
Paso 5. **No hace falta editar el compose de Eva360** (cero downtime): el
`nginx.conf` es un volumen montado, así que alcanza con editarlo y recargar.

---

## Paso 3 — Asegurar LigaPlus en bootstrap (HTTP en 8080)

LigaPlus NO hace su propio TLS en este escenario (lo hace Eva360). Confirmá
que su `.env` use el nginx bootstrap y las URLs del dominio:

```bash
cd /opt/fixtura
git fetch origin main && git reset --hard origin/main

# NGINX_CONF debe quedar en bootstrap (HTTP). Si lo habías puesto en nginx.conf, revertilo:
sed -i 's/^NGINX_CONF=.*/NGINX_CONF=nginx.bootstrap.conf/' .env || echo 'NGINX_CONF=nginx.bootstrap.conf' >> .env

# URLs públicas (https porque Eva360 termina el TLS). APP_URL define el CORS y
# la base de los links de email; API_URL se hornea en el build del web.
sed -i 's|^APP_URL=.*|APP_URL=https://www.ligaplus.cl|' .env
sed -i 's|^API_URL=.*|API_URL=https://www.ligaplus.cl/api|' .env

grep -E '^(NGINX_CONF|APP_URL|API_URL)=' .env   # verificar

# Rebuild de web (NEXT_PUBLIC_API_URL es build-time) y nginx, y levantar
export GIT_SHA=$(git rev-parse --short HEAD)
docker compose build --no-cache web nginx
docker compose up -d
```

Verificar que LigaPlus responde por su puerto:

```bash
curl -s -H 'Host: www.ligaplus.cl' http://localhost:8080/api/health/live   # {"status":"ok"}
```

---

## Paso 4 — Emitir el certificado de ligaplus.cl (fase HTTP)

El cert se emite con **webroot**, usando el nginx de Eva360 (sin downtime).
Para eso, primero agregamos SOLO el bloque HTTP de ligaplus.cl a la config de
Eva360 (sirve el challenge ACME):

```bash
cd /docker/eva360
cp nginx.conf nginx.conf.bak     # BACKUP — importante
```

Agregá al **final** del `nginx.conf` de Eva360 este bloque (nada más todavía):

```nginx
server {
    listen 80;
    server_name ligaplus.cl www.ligaplus.cl;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://www.ligaplus.cl$request_uri; }
}
```

Validar y recargar:

```bash
docker compose exec nginx nginx -t      # debe decir "syntax is ok / test is successful"
docker compose exec nginx nginx -s reload
```

Emitir el cert (webroot que Eva360 ya monta en /var/www/certbot):

```bash
docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /docker/eva360/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d ligaplus.cl -d www.ligaplus.cl \
  --agree-tos -m rmorales.olate@gmail.com --non-interactive
```

Debe terminar con "Successfully received certificate". Queda en
`/etc/letsencrypt/live/ligaplus.cl/`.

---

## Paso 5 — Activar el proxy HTTPS hacia LigaPlus

Ahora que el cert existe, agregá los **dos bloques HTTPS** (apex→www y www→proxy).
El contenido exacto está en [`nginx/ligaplus.eva360-vhost.conf`](../nginx/ligaplus.eva360-vhost.conf)
del repo de LigaPlus — copiá los dos `server { listen 443 ... }` al final del
`nginx.conf` de Eva360 (después del bloque HTTP del paso 4).

Validar y recargar:

```bash
cd /docker/eva360
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

---

## Paso 6 — Verificar

```bash
curl -I https://www.ligaplus.cl                 # 200, landing de LigaPlus
curl -I https://ligaplus.cl                      # 301 → www
curl -s https://www.ligaplus.cl/api/health/live  # {"status":"ok"}
curl -I https://eva360.ascenda.cl                # Eva360 sigue OK (no se tocó)
```

En el navegador: `https://www.ligaplus.cl` muestra la landing comercial con candado.

---

## Renovación automática del cert (cron del host)

```bash
sudo crontab -e
# Renueva (webroot, sin downtime) y recarga el nginx de Eva360:
0 3 * * * docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /docker/eva360/certbot/www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f /docker/eva360/docker-compose.yml exec -T nginx nginx -s reload
```

---

## Rollback (si algo sale mal)

Como solo tocamos el `nginx.conf` de Eva360, el rollback es restaurar el
backup y recargar (sin recrear nada):

```bash
cd /docker/eva360
cp nginx.conf.bak nginx.conf
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

`ligaplus.cl` dejará de resolver, pero Eva360 queda intacto. LigaPlus sigue
accesible por `http://187.127.14.243:8080`.
