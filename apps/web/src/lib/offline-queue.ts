/**
 * Cola de operaciones offline persistida en IndexedDB.
 *
 * Cuando el cliente intenta una operación crítica (cargar incidencia,
 * cerrar acta) y está sin internet, se encola aquí. El listener de
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
  // Token JWT al momento de encolar (fallback; el flush prefiere el token
  // fresco del store para no trabar en 401).
  authToken: string | null;
  // Timestamp para troubleshooting
  enqueuedAt: number;
  // Para qué tipo de operación es (para el toast de UX)
  kind: 'incidencia' | 'cerrar-acta' | 'certificar-presentes' | 'otro';
  // Identificadores para el log y diagnóstico
  partidoId?: string;
  // MOV-4 — robustez del replay.
  attempts?: number; // reintentos ya hechos
  nextRetryAt?: number; // backoff: no reintentar antes de este timestamp
  deadLetter?: boolean; // fallo permanente (4xx o agotó reintentos): visible, no se reintenta
  lastError?: string; // último error, para el banner
}

/** MOV-4 — máximo de reintentos antes de mandar el item a dead-letter. */
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 3000;
const BACKOFF_CAP_MS = 5 * 60_000;

/** Backoff exponencial con cap (3s, 6s, 12s, 24s, 48s, … máx 5 min). */
function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_CAP_MS);
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

/** Cuenta los items pendientes de sincronizar (excluye dead-letter). */
export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all.filter((i) => !i.deadLetter).length;
}

/** MOV-4 — items que fallaron permanentemente (4xx o agotaron reintentos). */
export async function deadLetterCount(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all.filter((i) => i.deadLetter).length;
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

/** MOV-4 — persiste un item modificado (attempts/backoff/dead-letter). */
async function updateItem(item: QueueItem): Promise<void> {
  const db = await getDb();
  await db.put(STORE, item);
}

/** Limpia toda la cola — usar con cuidado. */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}

/** MOV-4 — descarta solo los items en dead-letter (fallos permanentes). */
export async function clearDeadLetter(): Promise<void> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  await Promise.all(
    all
      .filter((i) => i.deadLetter && i.id !== undefined)
      .map((i) => db.delete(STORE, i.id as number)),
  );
}

/**
 * Resultado del flush: cuántos se sincronizaron OK y cuántos fallaron.
 */
export interface FlushResult {
  syncedOk: number;
  /** Items que quedaron pendientes (backoff / 401) — se reintentarán. */
  failed: number;
  /** MOV-4 — items que pasaron a dead-letter (fallo permanente). */
  deadLettered: number;
  errors: Array<{ id: number; url: string; message: string }>;
}

/**
 * Drena la cola: intenta replay de cada item contra el API (MOV-4).
 *
 * - 2xx (o 409 en cerrar-acta) → dequeue.
 * - 401 → NO penaliza el item (es la sesión, no la operación): backoff corto y
 *   se reintenta cuando la app renueve el token.
 * - 4xx permanente → dead-letter VISIBLE (no se pierde silenciosamente).
 * - 5xx / red → attempts++ con backoff exponencial; al agotar MAX_RETRIES pasa
 *   a dead-letter.
 *
 * Prefiere `opts.currentToken` (token fresco del store) sobre el guardado al
 * encolar, que suele estar vencido. `apiBaseUrl` = NEXT_PUBLIC_API_URL.
 */
export async function flushQueue(
  apiBaseUrl: string,
  opts?: { currentToken?: string | null },
): Promise<FlushResult> {
  const items = await getPending();
  const result: FlushResult = { syncedOk: 0, failed: 0, deadLettered: 0, errors: [] };
  const now = Date.now();
  const freshToken = opts?.currentToken ?? null;

  for (const item of items) {
    if (item.id === undefined) continue;
    if (item.deadLetter) continue; // fallo permanente: no se reintenta
    if (item.nextRetryAt && item.nextRetryAt > now) continue; // backoff no cumplido

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = freshToken ?? item.authToken;
    if (auth) headers.Authorization = `Bearer ${auth}`;

    const attempts = (item.attempts ?? 0) + 1;

    const marcarDead = async (message: string): Promise<void> => {
      await updateItem({ ...item, attempts, deadLetter: true, lastError: message });
      result.deadLettered++;
      result.errors.push({ id: item.id!, url: item.url, message });
    };
    const reintentar = async (message: string, penaliza: boolean): Promise<void> => {
      await updateItem({
        ...item,
        attempts: penaliza ? attempts : item.attempts ?? 0,
        nextRetryAt: now + (penaliza ? backoffMs(attempts) : 5000),
        lastError: message,
      });
      result.failed++;
      result.errors.push({ id: item.id!, url: item.url, message });
    };

    try {
      const res = await fetch(`${apiBaseUrl}${item.url}`, {
        method: item.method,
        headers,
        credentials: 'include',
        body: JSON.stringify(item.body),
      });

      // 2xx, o 409 en cerrar-acta (el efecto ya está aplicado).
      if (res.ok || (res.status === 409 && item.kind === 'cerrar-acta')) {
        await dequeue(item.id);
        result.syncedOk++;
        continue;
      }

      // 401: la sesión venció — no es culpa del item. Reintento sin penalizar;
      // el próximo flush usa el token renovado por la actividad de la app.
      if (res.status === 401) {
        await reintentar('Sesión expirada — se reintenta al renovar sesión', false);
        continue;
      }

      // 4xx permanente (no 401/409): dead-letter visible.
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => '');
        await marcarDead(`${res.status}: ${text.slice(0, 200)}`);
        continue;
      }

      // 5xx transitorio: backoff + reintento; al agotar reintentos, dead-letter.
      if (attempts >= MAX_RETRIES) {
        await marcarDead(`Error del servidor ${res.status} — agotó reintentos`);
      } else {
        await reintentar(`Error del servidor ${res.status} — reintentando`, true);
      }
    } catch {
      // Red fallida (transitorio): backoff + reintento; maxRetries → dead-letter.
      if (attempts >= MAX_RETRIES) {
        await marcarDead('Sin conexión — agotó reintentos');
      } else {
        await reintentar('Sin conexión — reintentando', true);
      }
    }
  }

  return result;
}
