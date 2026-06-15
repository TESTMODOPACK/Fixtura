# Deploy a Hostinger — runbook completo

Guía paso a paso para llevar Fixtura de cero a producción en un VPS Hostinger
con deploy automatizado vía GitHub Actions.

> **Target**: VPS Hostinger KVM 2 (2 vCPU / 8 GB RAM / 100 GB SSD), Ubuntu 24.04 LTS.
> **Tiempo total**: ~45 min la primera vez (incluyendo provisioning).

---

## Resumen de la arquitectura de deploy

```
   GitHub Push a main
          │
          ▼
   GitHub Actions CI (lint + test + build)
          │ (si pasa)
          ▼
   GitHub Actions Deploy
          │ SSH al VPS con clave privada (secret)
          ▼
   VPS Hostinger (usuario "fixtura")
          │ git pull → docker compose build → migrate → up -d → healthcheck
          ▼
   Nginx (puerto 80 / 443) → API:3000 + Web:3001 + DB + Redis
```

---

## Paso 1 — Provisionar el VPS en Hostinger

1. Comprar el plan KVM 2 (Ubuntu 24.04 LTS).
2. Durante el provisioning, en el panel de Hostinger:
   - **OS**: Ubuntu 24.04 LTS
   - **Hostname**: `fixtura-prod` (lo que quieras)
   - **SSH key**: pegar tu clave **pública** personal (`~/.ssh/id_rsa.pub` o similar).
     Si no tenés clave, generala en tu máquina:
     ```powershell
     ssh-keygen -t ed25519 -C "rmorales.olate@gmail.com"
     # Acepta los defaults. Se crea ~/.ssh/id_ed25519 + .pub
     type $HOME\.ssh\id_ed25519.pub
     # Copiar el contenido al campo de Hostinger
     ```
3. Esperar que termine el provisioning (~3-5 min). Hostinger te muestra la
   IP pública del VPS.

### Verificar acceso SSH

```powershell
ssh root@<IP-DEL-VPS>
# Si entra sin pedir password, todo OK
# Probá: whoami → debería decir "root"
```

---

## Paso 2 — Bootstrap del VPS

El script `scripts/bootstrap-vps.sh` configura todo lo necesario:
firewall UFW, fail2ban, Docker Engine + Compose, usuario `fixtura`, swap,
y endurece SSH (deshabilita password auth, root login solo con key).

Es **idempotente** — podés correrlo varias veces sin romper nada.

```bash
# Como root en el VPS
wget https://raw.githubusercontent.com/TESTMODOPACK/Fixtura/main/scripts/bootstrap-vps.sh
chmod +x bootstrap-vps.sh
./bootstrap-vps.sh
```

Si tu repo es privado, GitHub bloquea el wget. Alternativa:

```powershell
# Desde tu máquina local
scp scripts/bootstrap-vps.sh root@<IP-VPS>:/root/

# Luego en el VPS
ssh root@<IP-VPS>
chmod +x /root/bootstrap-vps.sh
/root/bootstrap-vps.sh
```

El script al terminar te imprime los próximos pasos.

---

## Paso 3 — Clonar el repo en el VPS (primera vez)

Como el repo es privado, necesitás autenticación. Tres opciones:

### Opción A — Deploy key (recomendado)

Una SSH key específica para que el VPS pueda clonar este repo (read-only):

```bash
# En el VPS como usuario fixtura
sudo su - fixtura
ssh-keygen -t ed25519 -C "fixtura-vps-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# Copiar la salida
```

En GitHub: <https://github.com/TESTMODOPACK/Fixtura/settings/keys/new>
- Title: `VPS Hostinger`
- Key: pegar el contenido `.pub`
- **NO** marcar "Allow write access" (el VPS solo necesita pull)

Configurar SSH para usar esa key con GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com  # Debe responder "Hi TESTMODOPACK/Fixtura! You've successfully authenticated"
```

Ahora clonar:

```bash
cd ~/fixtura
git clone git@github.com:TESTMODOPACK/Fixtura.git .
```

### Opción B — Personal Access Token (más simple, menos seguro)

```bash
cd ~/fixtura
git clone https://<USERNAME>:<TOKEN>@github.com/TESTMODOPACK/Fixtura.git .
```

OJO: el token queda en `.git/config`. Si alguien tiene acceso al VPS, lo ve.

---

## Paso 4 — Configurar `.env` de producción

```bash
cd ~/fixtura
cp .env.example .env
nano .env
```

Valores **mínimos obligatorios** (el resto pueden quedar vacíos en Fase 0):

```env
NODE_ENV=production

# DB — generar passwords fuertes
# openssl rand -base64 24
DB_NAME=fixtura
DB_USER=fixtura
DB_PASSWORD=<password-fuerte-aleatorio>
DB_APP_USER=fixtura_app
DB_APP_PASSWORD=<otro-password-fuerte-distinto>
DB_SSL=false

# Redis
REDIS_URL=redis://redis:6379

# JWT secretos (≥32 chars cada uno, distintos entre sí)
# openssl rand -base64 32
JWT_SECRET=<32-chars-aleatorios>
SSO_STATE_SECRET=<otros-32-chars-aleatorios-distintos>

# URLs — usar la IP del VPS hasta que tengas dominio
APP_URL=http://<IP-VPS>
API_URL=http://<IP-VPS>/api
FRONTEND_URL=http://<IP-VPS>
NEXT_PUBLIC_API_URL=http://<IP-VPS>/api

# Nginx — usar config sin TLS hasta tener dominio
NGINX_CONF=nginx.bootstrap.conf

# Email demo (sin Resend activo en Fase 0)
EMAIL_FROM=Fixtura <onboarding@resend.dev>

# Seed
SEED_TENANT_SLUG=liga-demo
SEED_TENANT_NAME=Liga Demo
SEED_ADMIN_EMAIL=admin@fixtura.local
SEED_ADMIN_PASSWORD=<password-fuerte-para-el-admin>

# Métricas (basic auth, recomendado en prod)
METRICS_USER=prometheus
METRICS_PASSWORD=<password-fuerte>
```

Generar todos los secretos de una con:

```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)"
echo "DB_APP_PASSWORD=$(openssl rand -base64 24)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "SSO_STATE_SECRET=$(openssl rand -base64 32)"
echo "METRICS_PASSWORD=$(openssl rand -base64 16)"
echo "SEED_ADMIN_PASSWORD=$(openssl rand -base64 12)"
```

---

## Paso 5 — Primer arranque

```bash
cd ~/fixtura
export GIT_SHA=$(git rev-parse --short HEAD)

# Build de imágenes (~5-8 min la primera vez)
docker compose build api web

# Levantar DB + Redis primero
docker compose up -d db redis

# Esperar a que la DB pase healthcheck
sleep 15
docker compose ps

# Migrations
docker compose run --rm api \
  sh -c "node dist/database/cleanup-orphans.js && pnpm migration:run"

# Seed (crea tenant demo + admin)
docker compose run --rm api pnpm db:seed

# Levantar el resto
docker compose up -d
```

### Verificar

```bash
# Healthcheck local
curl http://localhost/api/health/live
# {"status":"ok"}

curl http://localhost/api/health/version
# {"gitSha":"abc1234","nodeEnv":"production"}

# Desde tu máquina
curl http://<IP-VPS>/api/health/live
# Si el firewall está OK, debería responder
```

Si todo funciona: <http://IP-VPS> te muestra el landing público de Fixtura.

---

## Paso 6 — Configurar deploy automático desde GitHub Actions

### 6.1. Generar SSH key específica para CI/CD

Esta clave la usa **GitHub Actions** para entrar al VPS, separada de tu clave personal.

**En tu máquina local**:

```powershell
ssh-keygen -t ed25519 -C "github-actions-fixtura" -f $HOME\.ssh\fixtura_deploy -N '""'
type $HOME\.ssh\fixtura_deploy.pub
# Copia el contenido — esta es la pública
type $HOME\.ssh\fixtura_deploy
# Esta es la privada — la pegás a GitHub abajo
```

**Agregar la pública al VPS** (como usuario `fixtura`):

```bash
# En el VPS
sudo su - fixtura
echo "ssh-ed25519 AAAA... github-actions-fixtura" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Verificar que la clave funciona — desde tu máquina:

```powershell
ssh -i $HOME\.ssh\fixtura_deploy fixtura@<IP-VPS> "whoami"
# Debería responder: fixtura
```

### 6.2. Configurar secretos en GitHub

<https://github.com/TESTMODOPACK/Fixtura/settings/secrets/actions> → "New repository secret"

Crear estos cuatro:

| Nombre | Valor |
|---|---|
| `VPS_HOST` | IP del VPS (ej. `123.45.67.89`) |
| `VPS_USER` | `fixtura` |
| `VPS_SSH_KEY` | **Contenido de la clave privada** (`$HOME\.ssh\fixtura_deploy` entero, incluyendo `-----BEGIN ... END-----`) |
| `PRODUCTION_URL` | `http://<IP-VPS>` (o el dominio cuando lo tengas) |

### 6.3. Probar el workflow

Hacé cualquier cambio chico (ej. agregar línea al README) y push:

```powershell
cd C:\Claude\Dev\Fixtura
echo "" >> README.md
git add README.md
git commit -m "chore: trigger deploy"
git push origin main
```

En <https://github.com/TESTMODOPACK/Fixtura/actions> debería arrancar el workflow `Deploy to VPS`. Si pasa: deploy automático funcionando.

---

## Paso 7 — Apuntar el dominio www.ligaplus.cl (con el sistema ya corriendo por IP)

> Dominio canónico: **www.ligaplus.cl**. El apex `ligaplus.cl` redirige a www
> en nginx, así todo el tráfico tiene un único origen y el CORS es simple.

### 7.1 — DNS (en el panel del registrador de ligaplus.cl)

Crear dos A records apuntando a la IP del VPS:

```
A    ligaplus.cl       <IP-VPS>    TTL 300
A    www.ligaplus.cl   <IP-VPS>    TTL 300
```

Esperar propagación (5-30 min) y verificar desde tu máquina:

```bash
nslookup www.ligaplus.cl   # Debe mostrar la IP del VPS
nslookup ligaplus.cl
```

No sigas hasta que ambos resuelvan a la IP correcta — el certbot falla si el
DNS todavía no propagó.

### 7.2 — Emitir el certificado TLS (en el VPS)

```bash
ssh fixtura@<IP-VPS>
cd ~/fixtura

# Liberar el puerto 80 (nginx en modo bootstrap lo está usando)
docker compose stop nginx

# Un solo cert que cubre apex + www
docker run --rm -p 80:80 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d ligaplus.cl -d www.ligaplus.cl \
  --agree-tos -m rmorales.olate@gmail.com --non-interactive
```

Debe terminar con "Successfully received certificate". El cert queda en
`/etc/letsencrypt/live/ligaplus.cl/`.

### 7.3 — Cambiar el .env a las URLs del dominio + activar nginx TLS

`nginx.conf` ya está en el repo apuntando a `ligaplus.cl` (server_name + cert).
Solo hay que ajustar las URLs y el modo de nginx en el `.env` del VPS:

```bash
cd ~/fixtura

# nginx con TLS (en vez del bootstrap HTTP)
sed -i 's/^NGINX_CONF=.*/NGINX_CONF=nginx.conf/' .env || echo 'NGINX_CONF=nginx.conf' >> .env

# URLs del dominio. APP_URL define el CORS y la base de los links de email;
# API_URL se hornea en el build del web como NEXT_PUBLIC_API_URL.
sed -i 's|^APP_URL=.*|APP_URL=https://www.ligaplus.cl|' .env
sed -i 's|^API_URL=.*|API_URL=https://www.ligaplus.cl/api|' .env
# (Si tu .env tiene FRONTEND_URL suelto, actualizalo también; el compose
#  lo deriva de APP_URL, así que normalmente no hace falta.)
```

Confirmar los valores antes de seguir:

```bash
grep -E '^(NGINX_CONF|APP_URL|API_URL)=' .env
```

### 7.4 — Rebuild de web + nginx y levantar

`NEXT_PUBLIC_API_URL` se inyecta en **build time** del web, así que un simple
restart no alcanza: hay que **rebuildear** web. nginx también se rebuildea
porque la imagen embebe el conf según `NGINX_CONF`.

```bash
export GIT_SHA=$(git rev-parse --short HEAD)
docker compose build --no-cache web nginx
docker compose up -d web nginx
```

### 7.5 — Verificar

```bash
curl -I https://www.ligaplus.cl            # 200, sirve la landing
curl -I https://ligaplus.cl                # 301 → https://www.ligaplus.cl
curl -s https://www.ligaplus.cl/api/health/live   # {"status":"ok"}
```

En el navegador: `https://www.ligaplus.cl` muestra la landing comercial con
el candado verde.

### 7.6 — Renovación automática de certs (cron del host)

```bash
sudo crontab -e
# Agregar (renueva si faltan <30 días y recarga nginx):
0 3 * * * docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot renew --standalone --pre-hook "cd /home/fixtura/fixtura && docker compose stop nginx" --post-hook "cd /home/fixtura/fixtura && docker compose start nginx" --quiet
```

---

## Operación diaria

### Deploy manual (si por algún motivo el de GitHub Actions no corrió)

```bash
ssh fixtura@<IP-VPS>
cd ~/fixtura
./scripts/deploy.sh          # standard (default)
./scripts/deploy.sh rolling  # rolling (solo api + web, --no-deps)
./scripts/deploy.sh quick    # quick: SIN rebuild — solo si NO cambió código
```

El script hace backup `pg_dump` defensivo previo, `--no-cache` en el build,
espera healthy, verifica que `cleanup-orphans` corrió. Ver detalle completo
en [OPS_RUNBOOK.md](OPS_RUNBOOK.md#deploys).

> ⚠️  **NUNCA** hacer `git pull && docker compose up -d` sin rebuild. Ese
> atajo provoca el bug del 2026-05-27 (cleanup-orphans queda viejo y las
> tablas/columnas nuevas no se crean).

### Ver logs

```bash
ssh fixtura@<IP-VPS>
cd ~/fixtura
docker compose logs -f api
docker compose logs --tail=100 web
```

### Conectarse a la DB

```bash
docker compose exec db psql -U fixtura -d fixtura
```

### Ejecutar migraciones manualmente

```bash
docker compose exec api pnpm migration:run
```

### Restart de un servicio

```bash
docker compose restart api
```

### Ver recursos

```bash
docker stats --no-stream
df -h
free -h
```

---

## Troubleshooting

### El deploy de GitHub Actions falla con "Permission denied (publickey)"

- La clave privada en el secret `VPS_SSH_KEY` está mal pegada (faltan saltos de línea).
- La clave pública NO está en `~/.ssh/authorized_keys` del usuario `fixtura` en el VPS.
- Verificar con: `ssh -i fixtura_deploy fixtura@<IP-VPS>` desde tu máquina.

### "Container api: unhealthy"

```bash
docker compose logs --tail=100 api
docker compose exec api curl http://localhost:3000/health/ready
```

Causas típicas:
- DB no llegó a healthy antes que el API
- `.env` incompleto o malformado
- Migración pendiente que necesita ejecutarse manualmente

### "JWT_SECRET is weak or missing in production"

El API valida secretos al bootstrap. Generá uno fuerte:
```bash
openssl rand -base64 32
```

### Disco lleno

```bash
docker system prune -af   # imágenes y containers no usados
df -h
```

Cuidado: **no borres volumes** (`postgres_data`, `redis_data`).

---

## Backups (TODO antes de tener data real)

Ver [`BACKUPS_RUNBOOK.md`](BACKUPS_RUNBOOK.md). Hay que implementar el cron de
`pg_dump` antes de tener data de cliente.

---

## Checklist de "listo para producción"

- [ ] VPS provisionado y bootstrap corrido
- [ ] Repo clonado en `/home/fixtura/fixtura`
- [ ] `.env` con secretos fuertes (no defaults)
- [ ] Primer deploy manual funciona
- [ ] SSH key de CI/CD configurada
- [ ] Secrets de GitHub Actions configurados
- [ ] Workflow `Deploy to VPS` corre verde
- [ ] Smoke tests responden en `<IP-VPS>/api/health/live`
- [ ] Dominio comprado y A record apuntado al VPS
- [ ] Cert Let's Encrypt activo, HTTPS funciona
- [ ] Backups automáticos configurados
- [ ] Renovación de certs automatizada
- [ ] Sentry conectado (opcional pero recomendado)
- [ ] Alguien tiene acceso a `/etc/letsencrypt` además de vos
