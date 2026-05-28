#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# Fixtura — Wrapper protector de `docker compose`
# ══════════════════════════════════════════════════════════════════════
#
# Razón de existir:
#   El 2026-05-28 detectamos que ejecutar `docker compose down -v` en el
#   VPS de producción borraba el volumen `postgres_data` y con él TODA
#   la base de datos (torneos cargados, equipos, jugadores, actas).
#
#   Este wrapper intercepta los argumentos antes de invocar `docker
#   compose` y aborta con confirmación explícita si detecta opciones
#   destructivas en producción:
#     - down -v / down --volumes
#     - volume rm fixtura_postgres_data
#     - volume prune (sin filtro)
#
# Uso:
#   ./scripts/dc.sh up -d
#   ./scripts/dc.sh build --no-cache api web
#   ./scripts/dc.sh down -v          ← bloqueado salvo confirmación
#
# Instalación recomendada en el VPS (como usuario fixtura):
#   alias dc='~/fixtura/scripts/dc.sh'
#   # agregar a ~/.bashrc para que sea permanente
#
# Bypass de emergencia (úselo con responsabilidad):
#   FIXTURA_ALLOW_DESTRUCTIVE=1 ./scripts/dc.sh down -v
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# ── Detectar flags destructivos ───────────────────────────────────────
ARGS=("$@")
DESTRUCTIVO=""
MOTIVO=""

# Buscar `down` seguido de `-v` o `--volumes` en cualquier posición
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  case "${ARGS[$i]}" in
    down)
      # Mirar el resto de los args en busca de -v / --volumes
      for ((j = i + 1; j < ${#ARGS[@]}; j++)); do
        case "${ARGS[$j]}" in
          -v|--volumes)
            DESTRUCTIVO="yes"
            MOTIVO="\`docker compose down -v\` borra TODOS los volúmenes del proyecto, incluyendo postgres_data (toda la DB)."
            break 2
            ;;
          -*v*)
            # Caso -fv o similar
            if [[ "${ARGS[$j]}" == *v* ]]; then
              DESTRUCTIVO="yes"
              MOTIVO="\`docker compose down ${ARGS[$j]}\` incluye -v en flags combinados — borraría volúmenes."
              break 2
            fi
            ;;
        esac
      done
      ;;
    volume)
      # `docker compose volume rm ...` y `volume prune`
      NEXT="${ARGS[$((i + 1))]:-}"
      if [[ "$NEXT" == "rm" || "$NEXT" == "prune" ]]; then
        DESTRUCTIVO="yes"
        MOTIVO="\`docker compose volume $NEXT\` puede borrar postgres_data."
        break
      fi
      ;;
  esac
done

# ── Si es destructivo, pedir confirmación o abortar ────────────────────
if [[ -n "$DESTRUCTIVO" ]]; then
  if [[ "${FIXTURA_ALLOW_DESTRUCTIVE:-}" == "1" ]]; then
    echo -e "${YELLOW}⚠️  FIXTURA_ALLOW_DESTRUCTIVE=1 detectado — bypass habilitado.${NC}"
    echo -e "${YELLOW}    Procediendo con: docker compose ${ARGS[*]}${NC}"
  else
    echo
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  🛑 COMANDO DESTRUCTIVO BLOQUEADO${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    echo
    echo -e "  Intentaste:  docker compose ${ARGS[*]}"
    echo
    echo -e "  Motivo:      $MOTIVO"
    echo
    echo -e "  Si querés ${YELLOW}solo reiniciar${NC} sin perder DB:"
    echo -e "    ${GREEN}./scripts/dc.sh down${NC}        # SIN -v"
    echo -e "    ${GREEN}./scripts/dc.sh restart${NC}     # más rápido"
    echo -e "    ${GREEN}./scripts/dc.sh up -d${NC}       # idempotente"
    echo
    echo -e "  Si REALMENTE querés borrar la DB (raro, último recurso):"
    echo -e "    ${YELLOW}FIXTURA_ALLOW_DESTRUCTIVE=1 ./scripts/dc.sh ${ARGS[*]}${NC}"
    echo
    echo -e "  Antes de hacerlo, BACKUP:"
    echo -e "    ${GREEN}./scripts/backup-db.sh${NC}"
    echo
    echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
    exit 1
  fi
fi

# ── Pasar al docker compose real ──────────────────────────────────────
exec docker compose "${ARGS[@]}"
