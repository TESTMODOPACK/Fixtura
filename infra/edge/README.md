# Portero neutral (Caddy) — instalación y migración

> ADR-0012. Reemplaza el esquema "el nginx de Eva360 es dueño del 443 y
> lleva pegado el vhost de ligaplus.cl" — que causó el incidente del
> 2026-10-06 (vhost perdido → certificado equivocado → sitio caído) y
> dependía de un certbot cuya renovación estaba rota.
>
> Resultado: **Caddy nativo (systemd) es el único dueño de 80/443** y
> enruta por dominio; cada app vive detrás, en loopback, sin saber de la
> otra. Certificados automáticos con renovación incluida.

## Arquitectura

```
Internet ──443──> Caddy (host, systemd)
                    ├─ www.ligaplus.cl ──> 127.0.0.1:8080 (fixtura_nginx → api/web)
                    ├─ ligaplus.cl ──────> 301 a www
                    └─ eva360.ascenda.cl > https://127.0.0.1:8444 (nginx de Eva360, intacto)
```

- LigaPlus: `NGINX_BIND=127.0.0.1` en el `.env` (compose ya parametrizado).
  Se cierra de paso el acceso directo por `IP:8080` desde internet.
- Eva360: **no se toca su configuración**, solo el mapeo de puertos de su
  compose (80→127.0.0.1:8081, 443→127.0.0.1:8444). Su cert interno puede
  estar vencido: el público lo emite Caddy.
- WebSockets (socket.io del match center): Caddy los proxea nativo.

## 1. Instalar Caddy (una vez)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo systemctl stop caddy   # todavía no puede tomar 80/443 (los tiene Eva360)
```

Copiar la config y poner el email real:

```bash
sudo cp ~/fixtura/infra/edge/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # editar la línea email
caddy validate --config /etc/caddy/Caddyfile
```

Si Eva360 sirve más dominios, enumerarlos y agregarlos al Caddyfile:

```bash
docker exec <eva360_nginx> nginx -T 2>/dev/null | grep server_name
```

## 2. Ventana de corte (~2-3 minutos)

**a) Eva360 suelta 80/443** (en la carpeta de SU compose, p.ej. `/docker/eva360`):

```bash
cd /docker/eva360
cp docker-compose.yml docker-compose.yml.bak-adr0012
# En el servicio nginx de Eva360 cambiar:
#   "80:80"   → "127.0.0.1:8081:80"
#   "443:443" → "127.0.0.1:8444:443"
nano docker-compose.yml
docker compose up -d nginx
```

**b) LigaPlus pasa a loopback:**

```bash
cd ~/fixtura
grep -q NGINX_BIND .env || echo 'NGINX_BIND=127.0.0.1' >> .env
docker compose up -d nginx
```

**c) Caddy toma la puerta:**

```bash
sudo systemctl enable --now caddy
sudo journalctl -u caddy -n 30 --no-pager   # debe mostrar certificados obtenidos
```

## 3. Verificar

```bash
curl -sSI https://www.ligaplus.cl/ | head -3          # 200 + cert válido
curl -sSI https://ligaplus.cl/ | head -3              # 301 a www
curl -sSI https://eva360.ascenda.cl/ | head -3        # responde Eva360
curl -sS  https://www.ligaplus.cl/api/v1/tenants/me | head -c 200; echo
echo | openssl s_client -connect www.ligaplus.cl:443 -servername www.ligaplus.cl 2>/dev/null | openssl x509 -noout -subject -enddate
```

Y en el navegador: portal público, login, y un partido "En vivo" (prueba
el WebSocket).

## 4. Limpieza post-migración

```bash
# certbot ya no emite los certs públicos: silenciar sus crons/timers para
# que no fallen eternamente (NO borrar certificados).
systemctl list-timers | grep -i certbot
crontab -l | grep -i -n 'certbot\|letsencrypt'
sudo grep -ri certbot /etc/cron* 2>/dev/null
# → comentar/deshabilitar lo que aparezca (sudo systemctl disable --now certbot.timer, etc.)
```

El vhost de ligaplus pegado dentro del nginx de Eva360 queda inerte (ese
nginx ya no recibe tráfico de ligaplus.cl); retirarlo cuando se quiera.

## Rollback (si algo sale mal en la ventana)

```bash
sudo systemctl stop caddy
cd /docker/eva360 && cp docker-compose.yml.bak-adr0012 docker-compose.yml && docker compose up -d nginx
cd ~/fixtura && sed -i '/^NGINX_BIND=/d' .env && docker compose up -d nginx
```

Esto restaura el estado previo exacto (incluido el problema original del
vhost, pero con los puertos como estaban).
