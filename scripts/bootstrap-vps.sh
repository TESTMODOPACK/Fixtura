#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# Fixtura — Bootstrap del VPS (Hostinger KVM 2, Ubuntu 24.04 LTS)
# ══════════════════════════════════════════════════════════════════════
#
# Qué hace este script:
#   1. Actualiza el sistema y agrega swap (compensa 8 GB en spikes de build)
#   2. Configura firewall UFW (solo SSH + HTTP + HTTPS)
#   3. Instala fail2ban (protección anti-brute-force SSH)
#   4. Instala Docker Engine + plugin compose
#   5. Crea usuario `fixtura` con sudo y acceso a docker
#   6. Crea estructura de directorios en /home/fixtura/fixtura
#
# Cómo correr:
#   1. SSH como root al VPS recién provisionado
#   2. wget https://raw.githubusercontent.com/<usuario>/<repo>/main/scripts/bootstrap-vps.sh
#      (o subilo manualmente con scp)
#   3. chmod +x bootstrap-vps.sh
#   4. ./bootstrap-vps.sh
#   5. Seguir las instrucciones finales del script
#
# Idempotente: podés correrlo varias veces sin romper nada.
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colores para legibilidad ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}        $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}      $*"; }
die()  { echo -e "${RED}[fatal]${NC}     $*" >&2; exit 1; }

# ─── Pre-checks ────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Este script debe correrse como root. Probá: sudo ./bootstrap-vps.sh"

if ! command -v lsb_release &>/dev/null; then
  apt-get update -qq && apt-get install -y lsb-release
fi

OS_ID=$(lsb_release -is 2>/dev/null || echo "Unknown")
OS_VER=$(lsb_release -rs 2>/dev/null || echo "Unknown")
log "Sistema detectado: ${OS_ID} ${OS_VER}"

if [[ "$OS_ID" != "Ubuntu" ]]; then
  warn "Este script está testeado en Ubuntu. Otros distros pueden requerir ajustes."
fi

# ─── 1. Actualización del sistema y swap ──────────────────────────────
log "Actualizando paquetes del sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget gnupg ca-certificates lsb-release \
  ufw fail2ban htop nano vim git unattended-upgrades

ok "Sistema actualizado"

# Swap de 2 GB — Postgres y los builds de Next.js pueden tener spikes que
# exceden 8 GB nominales. Mejor tener swap que un OOM kill.
if [[ ! -f /swapfile ]]; then
  log "Creando swap de 2 GB..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -q vm.swappiness=10
  ok "Swap configurado (2 GB, swappiness=10)"
else
  ok "Swap ya existe"
fi

# Actualizaciones de seguridad automáticas
dpkg-reconfigure -plow unattended-upgrades || true
ok "Unattended-upgrades habilitado"

# ─── 2. Firewall UFW ──────────────────────────────────────────────────
log "Configurando firewall UFW..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ok "Firewall: deny incoming except SSH/HTTP/HTTPS"

# ─── 3. fail2ban ──────────────────────────────────────────────────────
log "Configurando fail2ban..."
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban
ok "fail2ban activo (ban 1h tras 5 intentos fallidos)"

# ─── 4. Docker Engine + compose plugin ────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Instalando Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') instalado"
else
  ok "Docker ya instalado: $(docker --version)"
fi

# Configurar log rotation a nivel daemon (refuerza la de docker-compose)
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
systemctl restart docker
ok "Docker daemon: log rotation 50m × 5"

# ─── 5. Usuario fixtura con sudo y docker ─────────────────────────────
if ! id -u fixtura &>/dev/null; then
  log "Creando usuario 'fixtura'..."
  useradd -m -s /bin/bash -G sudo,docker fixtura
  # Sin password — solo acceso por SSH key
  passwd -l fixtura >/dev/null
  ok "Usuario 'fixtura' creado (sudo + docker, sin password)"
else
  usermod -aG docker fixtura
  ok "Usuario 'fixtura' ya existe (agregado a grupo docker por si acaso)"
fi

# Copiar claves SSH autorizadas de root al usuario fixtura (común al
# provisionar el VPS con SSH key en cuenta root)
if [[ -f /root/.ssh/authorized_keys ]]; then
  mkdir -p /home/fixtura/.ssh
  cp /root/.ssh/authorized_keys /home/fixtura/.ssh/authorized_keys
  chown -R fixtura:fixtura /home/fixtura/.ssh
  chmod 700 /home/fixtura/.ssh
  chmod 600 /home/fixtura/.ssh/authorized_keys
  ok "SSH keys de root copiadas al usuario fixtura"
fi

# ─── 6. Directorio de la app ──────────────────────────────────────────
APP_DIR=/home/fixtura/fixtura
if [[ ! -d "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  chown -R fixtura:fixtura "$APP_DIR"
  ok "Directorio /home/fixtura/fixtura creado"
fi

# ─── 7. Hardening de SSH (opcional pero recomendado) ──────────────────
log "Endureciendo SSH..."
SSHD_CONFIG=/etc/ssh/sshd_config

# Backup
cp -n "$SSHD_CONFIG" "${SSHD_CONFIG}.bootstrap.bak"

# Deshabilitar password auth y root login si hay SSH keys configuradas
if [[ -f /root/.ssh/authorized_keys ]] && [[ -s /root/.ssh/authorized_keys ]]; then
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
  sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
  systemctl reload ssh || systemctl reload sshd || true
  ok "SSH: password auth deshabilitada, root solo con key"
else
  warn "No hay authorized_keys en /root/.ssh — NO endurezco SSH (te dejaría afuera)"
fi

# ─── Resumen final ─────────────────────────────────────────────────────
echo
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Bootstrap completado.${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo
echo "Próximos pasos (como usuario fixtura, NO root):"
echo
echo "  1. Cambiar al usuario fixtura:"
echo "     sudo su - fixtura"
echo
echo "  2. Clonar el repo:"
echo "     cd ~/fixtura"
echo "     git clone https://github.com/<usuario>/<repo>.git ."
echo
echo "  3. Crear .env con valores de producción:"
echo "     cp .env.example .env"
echo "     nano .env"
echo
echo "  4. Setear NGINX_CONF para etapa sin dominio:"
echo "     echo 'NGINX_CONF=nginx.bootstrap.conf' >> .env"
echo
echo "  5. Levantar la app:"
echo "     export GIT_SHA=\$(git rev-parse --short HEAD)"
echo "     docker compose up -d --build"
echo
echo "  6. Primera vez: correr migrations + seed"
echo "     docker compose exec api \\"
echo "       sh -c 'pnpm migration:run && pnpm db:seed'"
echo
echo "  7. Verificar:"
echo "     curl http://localhost/api/health/live"
echo "     # Desde tu máquina:"
echo "     curl http://<IP-DEL-VPS>/api/health/live"
echo
echo "Documentación completa: docs/DEPLOY_HOSTINGER.md"
echo
