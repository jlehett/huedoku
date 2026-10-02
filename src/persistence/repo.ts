/**
 * Loads and saves everything through a KV store: migrations on load,
 * validation of every record, quarantine of corrupt data, ordered writes,
 * and export/import of the whole save.
 */
import type { KV } from './kv';
import { isV1Save, migrateV1 } from './migrations';
import {
  SCHEMA_VERSION,
  defaultMeta,
  validateDaily,
  validateDailyPuzzle,
  validateGame,
  validateMeta,
  wrap,
  type Envelope,
  type Meta,
} from './schema';
import type { DailyRecord, GameState } from '../state/types';
import type { Difficulty } from '../engine/logic/types';

export interface LoadedData {
  meta: Meta;
  games: Record<string, GameState>;
  dailies: Record<string, DailyRecord>;
  dailyPuzzles: Record<string, { givens: string; solution: string; difficulty: Difficulty }>;
  warnings: string[];
}

export interface ExportFile {
  app: 'huedoku';
  schema: number;
  exportedAt: string;
  records: Record<string, Envelope<unknown>>;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function unwrap(raw: unknown): { schema: number; data: unknown } | null {
  if (!isObj(raw) || typeof raw.schema !== 'number' || !('data' in raw)) return null;
  return { schema: raw.schema, data: raw.data };
}

/** Parse a set of raw records into validated data (shared by load and import). */
export function parseRecords(entries: [string, unknown][], now: number): LoadedData & { corrupt: string[]; migrated: Record<string, Envelope<unknown>> | null } {
  let migrated: Record<string, Envelope<unknown>> | null = null;
  const map = new Map(entries);
  const legacy = map.get('save');
  if (isV1Save(legacy)) {
    migrated = migrateV1(legacy as Record<string, unknown>, now);
    map.delete('save');
    for (const [k, v] of Object.entries(migrated)) if (!map.has(k)) map.set(k, v);
  }
  const out: LoadedData & { corrupt: string[]; migrated: typeof migrated } = {
    meta: defaultMeta(now),
    games: {},
    dailies: {},
    dailyPuzzles: {},
    warnings: [],
    corrupt: [],
    migrated,
  };
  for (const [key, raw] of map) {
    if (key.startsWith('corrupt:')) continue;
    const env = unwrap(raw);
    if (!env) {
      out.corrupt.push(key);
      continue;
    }
    if (key === 'meta') {
      out.meta = validateMeta(env.data, now);
    } else if (key.startsWith('game:')) {
      const g = validateGame(env.data);
      if (!g) out.corrupt.push(key);
      else {
        out.games[key.slice(5)] = g.game;
        if (g.repaired) out.warnings.push(`Repaired saved game ${key.slice(5)} (its undo history was damaged).`);
      }
    } else if (key.startsWith('daily:')) {
      const d = validateDaily(env.data);
      if (!d) out.corrupt.push(key);
      else out.dailies[d.dateKey] = d;
    } else if (key.startsWith('dpuzzle:')) {
      const p = validateDailyPuzzle(env.data);
      if (p) out.dailyPuzzles[key.slice(8)] = p;
    }
  }
  if (out.corrupt.length) out.warnings.push(`Some saved data was damaged and was set aside (${out.corrupt.length} item${out.corrupt.length > 1 ? 's' : ''}).`);
  return out;
}

export class Repo {
  private chains = new Map<string, Promise<void>>();
  constructor(public kv: KV) {}

  async load(now = Date.now()): Promise<LoadedData> {
    let entries: [string, unknown][] = [];
    try {
      entries = await this.kv.entries();
    } catch (e) {
      return { meta: defaultMeta(now), games: {}, dailies: {}, dailyPuzzles: {}, warnings: [`Could not read saved data: ${String(e)}`] };
    }
    const parsed = parseRecords(entries, now);
    // Quarantine corrupt records so they never crash a later load, but keep them for support.
    for (const key of parsed.corrupt) {
      const raw = entries.find(([k]) => k === key)?.[1];
      await this.kv.set(`corrupt:${key}:${now}`, raw ?? null).catch(() => {});
      await this.kv.del(key).catch(() => {});
    }
    if (parsed.migrated) {
      for (const [k, v] of Object.entries(parsed.migrated)) await this.kv.set(k, v);
      await this.kv.del('save');
      parsed.warnings.push('Your saved progress was upgraded to the new format.');
    }
    const { corrupt: _c, migrated: _m, ...data } = parsed;
    return data;
  }

  /** Writes to the same key are applied in call order; different keys run concurrently. */
  private write(key: string, op: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(op, op).catch((e) => console.warn('save failed', key, e));
    this.chains.set(key, next);
    return next;
  }

  saveMeta(meta: Meta) {
    return this.write('meta', () => this.kv.set('meta', wrap(meta)));
  }
  saveGame(slot: string, game: GameState) {
    return this.write(`game:${slot}`, () => this.kv.set(`game:${slot}`, wrap(game)));
  }
  deleteGame(slot: string) {
    return this.write(`game:${slot}`, () => this.kv.del(`game:${slot}`));
  }
  saveDaily(rec: DailyRecord) {
    return this.write(`daily:${rec.dateKey}`, () => this.kv.set(`daily:${rec.dateKey}`, wrap(rec)));
  }
  saveDailyPuzzle(date: string, p: { givens: string; solution: string; difficulty: Difficulty }) {
    return this.write(`dpuzzle:${date}`, () => this.kv.set(`dpuzzle:${date}`, wrap(p)));
  }
  async flush() {
    await Promise.all(this.chains.values());
  }

  async exportAll(): Promise<ExportFile> {
    await this.flush();
    const records: Record<string, Envelope<unknown>> = {};
    for (const [k, v] of await this.kv.entries()) {
      if (k.startsWith('corrupt:') || k.startsWith('dpuzzle:')) continue;
      records[k] = v as Envelope<unknown>;
    }
    return { app: 'huedoku', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), records };
  }

  /** Validate an export file, then replace all saved data with it. */
  async importAll(file: unknown, now = Date.now()): Promise<{ ok: true; data: LoadedData } | { ok: false; error: string }> {
    if (!isObj(file) || file.app !== 'huedoku' || !isObj(file.records)) return { ok: false, error: 'This is not a Huedoku save file.' };
    if (typeof file.schema === 'number' && file.schema > SCHEMA_VERSION) return { ok: false, error: 'This save comes from a newer version of Huedoku.' };
    const parsed = parseRecords(Object.entries(file.records), now);
    if (!('meta' in file.records) && !parsed.migrated) return { ok: false, error: 'The save file is missing its settings and statistics.' };
    await this.flush();
    await this.kv.clear();
    await this.kv.set('meta', wrap(parsed.meta));
    for (const [slot, g] of Object.entries(parsed.games)) await this.kv.set(`game:${slot}`, wrap(g));
    for (const d of Object.values(parsed.dailies)) await this.kv.set(`daily:${d.dateKey}`, wrap(d));
    const { corrupt: _c, migrated: _m, ...data } = parsed;
    return { ok: true, data };
  }
}
