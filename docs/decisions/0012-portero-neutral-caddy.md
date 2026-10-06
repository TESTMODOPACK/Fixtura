# ADR-0012 — Portero neutral del VPS: Caddy dueño de 80/443

**Fecha:** 2026-10-06 · **Estado:** aceptada

## Contexto

LigaPlus y Eva360 comparten un VPS. Solo un proceso puede escuchar los
puertos públicos 80/443, y los tenía el nginx de Eva360: para servir
ligaplus.cl se le pegaba a mano un vhost (con el certificado de LigaPlus)
dentro de SU configuración, y el tráfico se proxeaba al nginx de LigaPlus
en el puerto 8080 (docs/COEXISTENCIA_EVA360.md).

El 2026-10-06 ese esquema falló en producción: el vhost desapareció de la
config de Eva360 (un redeploy suyo la regenera sin el bloque pegado),
ligaplus.cl pasó a ser atendido por el server default con el certificado
de eva360.ascenda.cl, y el navegador rechazó TLS → sitio caído con
"Failed to fetch". Además la renovación de certbot estaba rota (el cert
de Eva360 vencía ese mismo día sin renovarse a los 30 días). La auditoría
2026-10-05 ya marcaba este acoplamiento (M-16) y el riesgo de DoS mutuo.

## Decisión

Un **portero neutral**: Caddy instalado nativo en el host (systemd),
único dueño de 80/443, que enruta por dominio y gestiona certificados
Let's Encrypt automáticamente (emisión y renovación, sin certbot):

- `www.ligaplus.cl` → `127.0.0.1:8080` (nginx de LigaPlus, HTTP;
  `NGINX_BIND=127.0.0.1` en el .env — el compose quedó parametrizado).
- `ligaplus.cl` → 301 a www.
- `eva360.ascenda.cl` → `https://127.0.0.1:8444` (el listener 443
  original de Eva360 republicado en loopback; su configuración interna
  no se toca, su cert interno deja de importar).

Config y runbook de migración/rollback: `infra/edge/`.

## Consecuencias

- (+) Ninguna app puede romper a la otra: ni redeploys de Eva360 ni sus
  certificados afectan a ligaplus.cl, y viceversa.
- (+) Renovación de certificados automática y sin estado compartido.
- (+) Se cierra el acceso directo por `IP:8080` desde internet (hallazgo
  M-9 de seguridad) al pasar el bind a loopback.
- (+) Deja listo el terreno para `*.ligaplus.cl` (T49): un bloque más en
  el Caddyfile (wildcard requiere DNS challenge con token del proveedor).
- (−) Aparece una pieza nueva (Caddy), mínima y sin redeploys.
- (−) Eva360 se toca UNA vez (solo el mapeo de puertos de su compose).
- El rate limit de LigaPlus sigue viendo IP real: Caddy envía
  X-Forwarded-For y el realip de T6 confía en rangos privados.

## Alternativas descartadas

- **VPS propio para LigaPlus**: máxima independencia, pero costo mensual
  extra y migración de datos/DNS. Queda como evolución natural si el
  producto escala (el Caddyfile se lleva tal cual).
- **Blindar el esquema actual** (vhost como include + monitoreo): barato,
  pero mantiene el acoplamiento y el certbot frágil que ya falló.
