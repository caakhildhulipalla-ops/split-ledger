/**
 * The device database.
 *
 * IndexedDB is the source of truth. A supervisor in a shed with no signal
 * opens the app, records the morning collection and sees it in the list — the
 * cloud is a later, optional convenience, not a dependency.
 *
 * Everything is wrapped in promises and every read path degrades to an
 * in-memory store, because IndexedDB is genuinely absent in three situations
 * this app meets: Next's static prerender at build time, a WebView with site
 * data blocked, and the test runner. A thrown `indexedDB is not defined`
 * during prerender would break the build; falling back keeps it honest.
 */

export const DB_NAME = 'layer-farm-mis';
export const DB_VERSION = 1;

export type StoreName = 'records' | 'outbox' | 'audit' | 'meta';

const STORES: StoreName[] = ['records', 'outbox', 'audit', 'meta'];

/** In-memory stand-in, used when IndexedDB cannot be reached. */
const memory = new Map<StoreName, Map<IDBValidKey, unknown>>(
  STORES.map((s) => [s, new Map<IDBValidKey, unknown>()]),
);

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function available(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (!available()) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) {
        const records = db.createObjectStore('records', { keyPath: 'id' });
        records.createIndex('by_type', 'type');
        records.createIndex('by_tenant_type', ['tenantId', 'type']);
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'seq' });
      }
      if (!db.objectStoreNames.contains('audit')) {
        const audit = db.createObjectStore('audit', { keyPath: 'id' });
        audit.createIndex('by_entity', 'entityId');
        audit.createIndex('by_tenant', 'tenantId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    // A blocked or refused database is not fatal — memory carries the session.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

const mem = (store: StoreName): Map<IDBValidKey, unknown> => memory.get(store)!;

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return [...mem(store).values()] as T[];
  try {
    return await tx<T[]>(db, store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  } catch {
    return [...mem(store).values()] as T[];
  }
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return mem(store).get(key) as T | undefined;
  try {
    return await tx<T | undefined>(db, store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  } catch {
    return mem(store).get(key) as T | undefined;
  }
}

export async function put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const id = key ?? (value as { id?: IDBValidKey; seq?: IDBValidKey })?.id ?? (value as { seq?: IDBValidKey })?.seq;
  if (id !== undefined) mem(store).set(id, value);
  if (!db) return;
  try {
    await tx(db, store, 'readwrite', (s) => s.put(value as never));
  } catch {
    /* memory already holds it; the next sync will carry it up */
  }
}

export async function putMany(store: StoreName, values: readonly unknown[]): Promise<void> {
  const db = await openDb();
  for (const value of values) {
    const id = (value as { id?: IDBValidKey; seq?: IDBValidKey })?.id ?? (value as { seq?: IDBValidKey })?.seq;
    if (id !== undefined) mem(store).set(id, value);
  }
  if (!db || values.length === 0) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      for (const value of values) objectStore.put(value as never);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  mem(store).delete(key);
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, store, 'readwrite', (s) => s.delete(key));
  } catch {
    /* already gone from memory */
  }
}

export async function clear(store: StoreName): Promise<void> {
  mem(store).clear();
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, store, 'readwrite', (s) => s.clear());
  } catch {
    /* nothing more to do */
  }
}

export async function clearAll(): Promise<void> {
  for (const store of STORES) await clear(store);
}

/* ------------------------------------------------------------ meta keys */

interface MetaRow { key: string; value: unknown }

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await get<MetaRow>('meta', key);
  return row?.value as T | undefined;
}

export const setMeta = (key: string, value: unknown): Promise<void> =>
  put('meta', { key, value } satisfies MetaRow);

/** Reset for tests: forget the cached handle and empty the memory stores. */
export function _resetForTests(): void {
  dbPromise = null;
  for (const store of STORES) mem(store).clear();
}
