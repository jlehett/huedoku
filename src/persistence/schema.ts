/**
 * Save-data schema (version 2) with validation and salvage.
 *
 * Keys in the KV store:
 *   meta              settings, stats, prefetch queue, current slot
 *   game:<slot>       in-progress game ("classic:easy", "daily:2026-10-01", ...)
 *   daily:<date>      a solved daily (a quilt patch)
 *   dpuzzle:<date>    cached daily puzzle (givens + solution)
 * Every value is wrapped as { schema, data }.
 */
import { DIFFICULTIES, type Difficulty } from '../engine/logic/types';
import { PALETTE_BY_ID } from '../color/palettes';
import {
  DEFAULT_SETTINGS,
  emptyBucket,
  type BucketStats,
  type DailyRecord,
  type GameState,
  type Move,
  type Prefetch,
  type Settings,
  type Stats,
} from '../state/types';

export const SCHEMA_VERSION = 2;

export interface Envelope<T> {
  schema: number;
  data: T;
}

export interface Meta {
  settings: Settings;
  stats: Stats;
  prefetch: Prefetch;
  currentSlot: string | null;
  lastDifficulty: Difficulty;
  createdAt: number;
}

export const wrap = <T>(data: T): Envelope<T> => ({ schema: SCHEMA_VERSION, data });

export function defaultStats(): Stats {
  return {
    classic: { easy: emptyBucket(), medium: emptyBucket(), hard: emptyBucket(), expert: emptyBucket(), master: emptyBucket(), custom: emptyBucket() },
    daily: { easy: emptyBucket(), medium: emptyBucket(), hard: emptyBucket(), expert: emptyBucket(), master: emptyBucket() },
    dailyStreak: { current: 0, best: 0, lastDay: null },
  };
}

export function defaultMeta(now: number): Meta {
  return {
    settings: { ...DEFAULT_SETTINGS },
    stats: defaultStats(),
    prefetch: { queue: {}, usedBank: {}, seen: [] },
    currentSlot: null,
    lastDifficulty: 'easy',
    createdAt: now,
  };
}

// ---------------------------------------------------------------- validators

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isGrid = (x: unknown): x is string => typeof x === 'string' && /^[0-9]{81}$/.test(x);
const isFull = (x: unknown): x is string => typeof x === 'string' && /^[1-9]{81}$/.test(x);
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isCells = (x: unknown, hiVal: number): x is number[] => Array.isArray(x) && x.length === 81 && x.every((v) => isInt(v, 0, hiVal));
const isDiff = (x: unknown): x is Difficulty => typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);

function validMove(m: unknown): m is Move {
  if (!isObj(m) || typeof m.kind !== 'string' || !Array.isArray(m.changes)) return false;
  return m.changes.every((c) => isObj(c) && isInt(c.i, 0, 80) && isInt(c.v0, 0, 9) && isInt(c.v1, 0, 9) && isInt(c.n0, 0, 511) && isInt(c.n1, 0, 511));
}

export function validateSettings(x: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!isObj(x)) return out;
  const pick = <K extends keyof Settings>(k: K, ok: (v: unknown) => boolean) => {
    if (ok(x[k])) (out[k] as unknown) = x[k];
  };
  const oneOf = (...vals: string[]) => (v: unknown) => typeof v === 'string' && vals.includes(v);
  const bool = (v: unknown) => typeof v === 'boolean';
  const unit = (v: unknown) => isNum(v) && v >= 0 && v <= 1;
  pick('theme', oneOf('system', 'light', 'dark'));
  pick('palette', (v) => typeof v === 'string' && v in PALETTE_BY_ID);
  pick('patterns', bool);
  pick('notesStyle', oneOf('numerals', 'dots'));
  pick('sound', bool);
  pick('sfxVolume', unit);
  pick('music', bool);
  pick('musicVolume', unit);
  pick('haptics', bool);
  pick('reducedMotion', oneOf('system', 'on', 'off'));
  pick('leftHanded', bool);
  pick('numeralSize', oneOf('small', 'medium', 'large'));
  pick('mistakeMode', oneOf('immediate', 'conflicts', 'off'));
  pick('mistakeLimit', bool);
  pick('autoRemoveNotes', bool);
  pick('highlightUnits', bool);
  pick('highlightSame', bool);
  pick('hideTimer', bool);
  pick('inputMode', oneOf('cell', 'paint'));
  pick('tutorialDone', bool);
  return out;
}

function validateBucket(x: unknown): BucketStats {
  const b = emptyBucket();
  if (!isObj(x)) return b;
  for (const k of Object.keys(b) as (keyof BucketStats)[]) {
    const val = x[k];
    if (k === 'bestTimeMs') b.bestTimeMs = isNum(val) && val > 0 ? val : null;
    else if (isNum(val) && val >= 0) (b[k] as number) = val;
  }
  return b;
}

export function validateStats(x: unknown): Stats {
  const s = defaultStats();
  if (!isObj(x)) return s;
  if (isObj(x.classic)) for (const k of Object.keys(s.classic) as (keyof Stats['classic'])[]) s.classic[k] = validateBucket(x.classic[k]);
  if (isObj(x.daily)) for (const k of Object.keys(s.daily) as Difficulty[]) s.daily[k] = validateBucket(x.daily[k]);
  if (isObj(x.dailyStreak)) {
    const d = x.dailyStreak;
    s.dailyStreak = {
      current: isInt(d.current, 0, 1e6) ? d.current : 0,
      best: isInt(d.best, 0, 1e6) ? d.best : 0,
      lastDay: isDate(d.lastDay) ? d.lastDay : null,
    };
  }
  return s;
}

function validatePrefetch(x: unknown): Prefetch {
  const p: Prefetch = { queue: {}, usedBank: {}, seen: [] };
  if (!isObj(x)) return p;
  if (isObj(x.queue)) {
    for (const d of DIFFICULTIES) {
      const q = x.queue[d];
      if (Array.isArray(q)) {
        p.queue[d] = q.filter((e): e is { givens: string; solution: string; source: string } => isObj(e) && isGrid(e.givens) && isFull(e.solution) && typeof e.source === 'string').slice(0, 4);
      }
    }
  }
  if (isObj(x.usedBank)) {
    for (const d of DIFFICULTIES) {
      const u = x.usedBank[d];
      if (Array.isArray(u)) p.usedBank[d] = u.filter((n): n is number => isInt(n, 0, 1e6));
    }
  }
  if (Array.isArray(x.seen)) p.seen = x.seen.filter((s): s is string => typeof s === 'string').slice(-500);
  return p;
}

export function validateMeta(x: unknown, now: number): Meta {
  const m = defaultMeta(now);
  if (!isObj(x)) return m;
  m.settings = validateSettings(x.settings);
  m.stats = validateStats(x.stats);
  m.prefetch = validatePrefetch(x.prefetch);
  m.currentSlot = typeof x.currentSlot === 'string' ? x.currentSlot : null;
  m.lastDifficulty = isDiff(x.lastDifficulty) ? x.lastDifficulty : 'easy';
  m.createdAt = isNum(x.createdAt) ? x.createdAt : now;
  return m;
}

/**
 * Validate a stored game. Returns null when the core puzzle data is unusable;
 * otherwise repairs what it can (a corrupt history is dropped, the board kept).
 */
export function validateGame(x: unknown): { game: GameState; repaired: boolean } | null {
  if (!isObj(x)) return null;
  if (!isGrid(x.givens) || !isFull(x.solution) || !isCells(x.values, 9)) return null;
  const givens = x.givens;
  const solution = x.solution;
  for (let i = 0; i < 81; i++) if (givens[i] !== '0' && givens[i] !== solution[i]) return null;
  const values = (x.values as number[]).slice();
  for (let i = 0; i < 81; i++) if (givens[i] !== '0') values[i] = givens.charCodeAt(i) - 48;
  let repaired = false;
  const notes = isCells(x.notes, 511) ? x.notes.slice() : ((repaired = true), new Array(81).fill(0));
  const history = Array.isArray(x.history) && x.history.every(validMove) ? (x.history as Move[]) : ((repaired = true), []);
  const future = Array.isArray(x.future) && x.future.every(validMove) ? (x.future as Move[]) : ((repaired = true), []);
  const mode = x.mode === 'daily' ? 'daily' : 'classic';
  const difficulty = isDiff(x.difficulty) || x.difficulty === 'custom' ? x.difficulty : 'easy';
  const status = x.status === 'solved' || x.status === 'failed' ? x.status : 'playing';
  const game: GameState = {
    id: typeof x.id === 'string' ? x.id : `g${Date.now()}`,
    mode,
    difficulty,
    dateKey: isDate(x.dateKey) ? x.dateKey : undefined,
    archive: x.archive === true,
    source: typeof x.source === 'string' ? x.source : undefined,
    variant: 'classic',
    givens,
    solution,
    values,
    notes,
    history,
    future,
    selected: isInt(x.selected, 0, 80) ? x.selected : null,
    notesMode: x.notesMode === true,
    brush: isInt(x.brush, 1, 9) ? x.brush : null,
    elapsedMs: isNum(x.elapsedMs) && x.elapsedMs >= 0 ? x.elapsedMs : 0,
    mistakes: isInt(x.mistakes, 0, 1e6) ? x.mistakes : 0,
    hintsUsed: isInt(x.hintsUsed, 0, 1e6) ? x.hintsUsed : 0,
    limitWaived: x.limitWaived === true,
    status,
    startedAt: isNum(x.startedAt) ? x.startedAt : Date.now(),
    updatedAt: isNum(x.updatedAt) ? x.updatedAt : Date.now(),
    solvedAt: isNum(x.solvedAt) ? x.solvedAt : undefined,
    placements: Array.isArray(x.placements) ? x.placements.filter((n): n is number => isInt(n, 0, 80)) : [],
    checked: [],
  };
  if (mode === 'daily' && !game.dateKey) return null;
  return { game, repaired };
}

export function validateDaily(x: unknown): DailyRecord | null {
  if (!isObj(x)) return null;
  if (!isDate(x.dateKey) || !isDiff(x.difficulty) || !isFull(x.grid) || !isGrid(x.givens)) return null;
  if (!isNum(x.timeMs) || !isNum(x.solvedAt)) return null;
  return {
    dateKey: x.dateKey,
    difficulty: x.difficulty,
    solvedAt: x.solvedAt,
    timeMs: x.timeMs,
    mistakes: isInt(x.mistakes, 0, 1e6) ? x.mistakes : 0,
    hints: isInt(x.hints, 0, 1e6) ? x.hints : 0,
    archive: x.archive === true,
    grid: x.grid,
    givens: x.givens,
    placements: Array.isArray(x.placements) ? x.placements.filter((n): n is number => isInt(n, 0, 80)) : [],
  };
}

export function validateDailyPuzzle(x: unknown): { givens: string; solution: string; difficulty: Difficulty } | null {
  if (!isObj(x) || !isGrid(x.givens) || !isFull(x.solution) || !isDiff(x.difficulty)) return null;
  return { givens: x.givens, solution: x.solution, difficulty: x.difficulty };
}
