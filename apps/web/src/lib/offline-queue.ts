/**
 * Cola de operaciones offline persistida en IndexedDB.
 *
 * Cuando el cliente intenta una operación crítica (cargar incidencia,
 * cerrar acta) y está sin internet, se encola acá. El listener de
 * `online` drena la queue automáticamente y replays cada operación
 * contra el API.
 *
 * Solo encolamos operaciones IDEMPOTENTES o seguras de reintentar:
 *   - POST /admin/partidos/:id/incidencias (crear)
 *   - POST /admin/partidos/:id/cerrar-acta (idempotente: si ya está
 *     cerrada, devuelve conflict y lo ignoramos)
 *
 * NO encolamos:
 *   - GETs (los maneja el SW con cache)
 *   - PATCHs / DELETEs (cambian state; el riesgo de replay duplicado es alto)
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface QueueItem {
  id?: number; // autoIncrement
  // URL relativa al API base (ej. "/admin/partidos/abc/incidencias")
  url: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  // Token JWT al momento de encolar (puede vencer si la sync demora)
  authToken: string | null;
  // Timestamp para troubleshooting
  enqueuedAt: number;
  // Para qué tipo de operación es (para el toast de UX)
  kind: 'incidencia' | 'cerrar-acta' | 'otro';
  // Identificadores para el log y diagnóstico
  partidoId?: string;
}

interface FixturaDB extends DBSchema {
  queue: {
    key: number;
    value: QueueItem;
    indexes: { 'by-enqueuedAt': number };
  };
}

const DB_NAME = 'fixtura-offline';
const DB_VERSION = 1;
const STORE = 'queue';

let dbPromise: Promise<IDBPDatabase<FixturaDB>> | null = null;

function getDb(): Promise<IDBPDatabase<FixturaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FixturaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-enqueuedAt', 'enqueuedAt');
        }
      },
    });
  }
  return dbPromise;
}

/** Agrega un item a la cola. */
export async function enqueue(item: Omit<QueueItem, 'id' | 'enqueuedAt'>): Promise<void> {
  const db = await getDb();
  await db.add(STORE, {
    ...item,
    enqueuedAt: Date.now(),
  });
}

/** Cuenta cuántos items hay pendientes. */
export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

/** Lee todos los items pendientes (sin sacarlos de la cola). */
export async function getPending(): Promise<QueueItem[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE, 'by-enqueuedAt');
}

/** Quita un item por id (cuando ya se sincronizó). */
export async function dequeue(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

/** Limpia toda la cola — usar con cuidado. */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}

/**
 * Resultado del flush: cuántos se sincronizaron OK y cuántos fallaron.
 */
export interface FlushResult {
  syncedOk: number;
  failed: number;
  errors: Array<{ id: number; url: string; message: string }>;
}

/**
 * Drena la cola: intenta replay de cada item contra el API.
 *
 * - Si responde 2xx → dequeue.
 * - Si responde 4xx (excepto 401/409): dequeue + log warning (no se va a
 *   recuperar reintentando).
 * - Si responde 5xx o falla red → deja el item en la cola para próximo intento.
 * - Si responde 401 → deja en cola y muestra mensaje (el token expiró).
 *
 * El `apiBaseUrl` debe ser el mismo NEXT_PUBLIC_API_URL que usa apiFetch.
 */
export async function flushQueue(apiBaseUrl: string): Promise<FlushResult> {
  const items = await getPending();
  const result: FlushResult = { syncedOk: 0, failed: 0, errors: [] };

  for (const item of items) {
    if (item.id === undefined) continue;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (item.authToken) headers.Authorization = `Bearer ${item.authToken}`;

    try {
      const res = await fetch(`${apiBaseUrl}${item.url}`, {
        method: item.method,
        headers,
        body: JSON.stringify(item.body),
      });

      if (res.ok) {
        await dequeue(item.id);
        result.syncedOk++;
        continue;
      }

      // Conflict (409) — el caso típico es "acta ya cerrada". Tratamos
      // como éxito porque el efecto neto deseado ya está aplicado.
      if (res.status === 409 && item.kind === 'cerrar-acta') {
        await dequeue(item.id);
        result.syncedOk++;
        continue;
      }

      // 4xx no recuperable: descartamos el item porque reintentar no va
      // a ayudar (validación falló, registro borrado, etc.).
      if (res.status >= 400 && res.status < 500 && res.status !== 401) {
        await dequeue(item.id);
        result.failed++;
        const text = await res.text().catch(() => '');
        result.errors.push({
          id: item.id,
          url: item.url,
          message: `${res.status}: ${text.slice(0, 200)}`,
        });
        continue;
      }

      // 401 (token expirado) o 5xx: dejamos en cola
      result.failed++;
      result.errors.push({
        id: item.id,
        url: item.url,
        message: res.status === 401 ? 'Sesión expirada — re-loguearse' : `Server error ${res.status}`,
      });
    } catch (err) {
      // Red fallida: dejamos en cola
      result.failed++;
      result.errors.push({
        id: item.id,
        url: item.url,
        message: 'Sin conexión',
      });
    }
  }

  return result;
}
