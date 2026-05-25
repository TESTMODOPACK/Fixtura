# Nginx self-contained — el archivo de configuración se copia al build,
# no se monta desde el host. Esto evita problemas con paneles tipo
# Hostinger Docker Manager o Portainer que persisten el docker-compose.yml
# en un working_dir distinto al checkout del repo.
#
# El archivo a usar se elige con build-arg NGINX_CONF:
#   - nginx.bootstrap.conf — HTTP only, sin TLS (etapa pre-dominio)
#   - nginx.conf           — HTTPS con Let's Encrypt (cuando hay dominio)
#
# El compose lo pasa desde la env var:
#   build:
#     args:
#       NGINX_CONF: ${NGINX_CONF:-nginx.bootstrap.conf}

FROM nginx:alpine

ARG NGINX_CONF=nginx.bootstrap.conf

# El build context del compose es la raíz del repo (igual que api y web),
# así que el path acá es nginx/<archivo>.
COPY nginx/${NGINX_CONF} /etc/nginx/conf.d/default.conf

# Healthcheck — valida que la config sea correcta. Sin volumes externos
# significa que un cambio de NGINX_CONF requiere rebuild de la imagen.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD nginx -t 2>/dev/null || exit 1
