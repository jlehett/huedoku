/**
 * Minimal key-value storage on IndexedDB, with a localStorage fallback for
 * browsers where IndexedDB is unavailable (old private-mode Safari).
 */

export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
  entries(): Promise<[string, unknown][]>;
  clear(): Promise<void>;
  kind: 'idb' | 'local' | 'memory';
}

const DB_NAME = 'huedoku';
const STORE = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openIdb(name = DB_NAME, factory: IDBFactory = indexedDB): Promise<KV> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(name, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  const done = (t: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  return {
    kind: 'idb',
    get: <T>(key: string) => req(tx('readonly').get(key)) as Promise<T | undefined>,
    async set(key, value) {
      const s = tx('readwrite');
      s.put(value, key);
      await done(s.transaction);
    },
    async del(key) {
      const s = tx('readwrite');
      s.delete(key);
      await done(s.transaction);
    },
    keys: async () => (await req(tx('readonly').getAllKeys())).map(String),
    async entries() {
      const s = tx('readonly');
      const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
      return keys.map((k, i) => [String(k), values[i]] as [string, unknown]);
    },
    async clear() {
      const s = tx('readwrite');
      s.clear();
      await done(s.transaction);
    },
  };
}

export function localKV(prefix = 'huedoku:'): KV {
  const ls = globalThis.localStorage;
  const all = () => Object.keys(ls).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  return {
    kind: 'local',
    get: async <T>(key: string) => {
      const raw = ls.getItem(prefix + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    },
    set: async (key, value) => ls.setItem(prefix + key, JSON.stringify(value)),
    del: async (key) => ls.removeItem(prefix + key),
    keys: async () => all(),
    entries: async () =>
      all().map((k) => {
        const raw = ls.getItem(prefix + k)!;
        try {
          return [k, JSON.parse(raw)] as [string, unknown];
        } catch {
          return [k, raw] as [string, unknown];
        }
      }),
    clear: async () => all().forEach((k) => ls.removeItem(prefix + k)),
  };
}

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    kind: 'memory',
    get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined,
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
    entries: async () => [...m.entries()].map(([k, v]) => [k, structuredClone(v)] as [string, unknown]),
    clear: async () => m.clear(),
  };
}

export async function openBestKV(): Promise<KV> {
  try {
    if (typeof indexedDB !== 'undefined') return await openIdb();
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('huedoku:probe', '1');
      localStorage.removeItem('huedoku:probe');
      return localKV();
    }
  } catch {
    /* fall through */
  }
  return memoryKV();
}
