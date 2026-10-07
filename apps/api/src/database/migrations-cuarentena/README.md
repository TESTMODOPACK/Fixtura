# Migraciones en cuarentena

Las migraciones de esta carpeta están **fuera del glob** de `datasource.ts`
(`migrations/*.{ts,js}`): `migration:run` NO las ejecuta.

## 1748430000000-DropModeloViejo

`DROP TABLE ... CASCADE` del modelo viejo (equipos, series, jugadores_inscritos
— ADR-0005 F2). Está acá porque el workflow de deploy ejecutaba
`migration:run` en cada push a main: quien lo "arreglara" habría disparado el
DROP sin backup (hallazgo A-8 de la auditoría 2026-10-05).

**Para ejecutar el drop (operación manual, una sola vez):**
1. Backup verificado: `sudo scripts/backup-db.sh` y comprobar tamaño.
2. Ejecutar `scripts/drop-modelo-viejo.sql` — ese script ES el camino de
   producción: trae los pre-checks de huérfanos y el DROP en una misma
   transacción, y se corre con el usuario OWNER:
   `docker compose exec -T db psql -U fixtura -d fixtura -v ON_ERROR_STOP=1 < scripts/drop-modelo-viejo.sql`
3. Verificar la app y borrar este `.ts` de la cuarentena (queda en el
   historial de git).

Nota: mover el `.ts` de vuelta a `../migrations/` y usar `migration:run`
NO sirve en prod tal cual — el contenedor ejecuta el `dist/` horneado en
la imagen, no el árbol del repo. Esa vía es solo para entornos de dev.
