# Migraciones en cuarentena

Las migraciones de esta carpeta están **fuera del glob** de `datasource.ts`
(`migrations/*.{ts,js}`): `migration:run` NO las ejecuta.

## 1748430000000-DropModeloViejo

`DROP TABLE ... CASCADE` del modelo viejo (equipos, series, jugadores_inscritos
— ADR-0005 F2). Está acá porque el workflow de deploy ejecutaba
`migration:run` en cada push a main: quien lo "arreglara" habría disparado el
DROP sin backup (hallazgo A-8 de la auditoría 2026-10-05).

**Para ejecutarla (operación manual, una sola vez):**
1. Backup verificado: `scripts/backup-db.sh` y comprobar tamaño.
2. Pre-check de huérfanos: `scripts/drop-modelo-viejo.sql` (sección de checks).
3. Mover el archivo de vuelta a `../migrations/` y correr
   `pnpm --filter @fixtura/api migration:run` con credenciales de OWNER
   (el rol `fixtura_app` no es dueño de las tablas).
4. Verificar la app y borrar el archivo de ambas carpetas (quedará en el
   historial de git).
