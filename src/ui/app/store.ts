/**
 * App store: owns the loaded save, the current game, navigation and
 * transient UI state. Game rules live in state/game.ts; this file wires them
 * to persistence (autosave on every move), the engine worker, the timer and
 * statistics. Components subscribe with useApp().
 */
import { audio } from '../../audio/audio';
import { addDays, localDateKey } from '../../engine/dates';
import { dailyDifficulty } from '../../engine/daily';
import type { HintResult } from '../../engine/hints';
import { DIFFICULTIES, type Difficulty } from '../../engine/logic/types';
import { haptics } from '../../haptics/haptics';
import { motion } from '../../motion/scheduler';
import { openBestKV } from '../../persistence/kv';
import { Repo } from '../../persistence/repo';
import { defaultMeta, type Meta } from '../../persistence/schema';
import * as G from '../../state/game';
import type { GameEvent } from '../../state/game';
import type { BucketStats, DailyRecord, GameDifficulty, GameState, Settings } from '../../state/types';
import { engine, randomSeed } from '../../worker/client';
import type { PuzzlePayload } from '../../worker/protocol';
import { applyTheme, currentTheme, resolveTheme } from '../theme';

export type Screen = 'home' | 'game' | 'stats' | 'settings' | 'howto' | 'tutorial' | 'custom';

export type Sheet =
  | { type: 'newGame' }
  | { type: 'menu' }
  | { type: 'patch'; dateKey: string }
  | { type: 'archive'; dateKey: string }
  | { type: 'failed' }
  | { type: 'confirm'; title: string; body: string; ok: string; action: () => void; danger?: boolean }
  | { type: 'monthDone'; y: number; m: number };

export interface HintUi {
  result: HintResult;
  stage: 1 | 2;
}

export interface Results {
  mode: 'classic' | 'daily';
  difficulty: GameDifficulty;
  timeMs: number;
  mistakes: number;
  hints: number;
  bestTime: boolean;
  prevBestMs: number | null;
  firstSolve: boolean;
  streak: number;
  dateKey?: string;
  archive?: boolean;
  perfect: boolean;
}

export interface StitchIntent {
  dateKey: string;
  /** Board rectangle at the moment the finale ended (for the shrink-and-fly). */
  from: { x: number; y: number; w: number; h: number } | null;
}

export interface AppState {
  ready: boolean;
  screen: Screen;
  screenFrom: Screen | null;
  sheets: Sheet[];
  meta: Meta;
  games: Record<string, GameState>;
  dailies: Record<string, DailyRecord>;
  slot: string | null;
  game: GameState | null;
  paused: boolean;
  hint: HintUi | null;
  loading: string | null;
  toast: { text: string; id: number } | null;
  updateReady: boolean;
  results: Results | null;
  stitch: StitchIntent | null;
  quiltMonth: { y: number; m: number };
  today: string;
  howtoTab: 'classic' | 'daily';
  /** Bumped by Check Board so the board can flash its result. */
  checkFlash: number;
  /** Digit highlighted from the pad when no cell is selected (not saved). */
  focus: number | null;
}

type Listener = () => void;
type EventListener = (events: GameEvent[], prevValues: readonly number[]) => void;

const now = () => Date.now();
const slotFor = (g: Pick<GameState, 'mode' | 'difficulty' | 'dateKey'>) => (g.mode === 'daily' ? `daily:${g.dateKey}` : `classic:${g.difficulty}`);

function todayParts() {
  const t = localDateKey();
  return { t, y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) };
}

export class AppStore {
  state: AppState;
  repo!: Repo;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private resumedAt: number | null = null;
  private refillAbort: AbortController | null = null;
  private dailyCache = new Map<string, { givens: string; solution: string; difficulty: Difficulty }>();
  private toastId = 0;
  private pending: Promise<unknown> | null = null;

  constructor() {
    const { t, y, m } = todayParts();
    this.state = {
      ready: false,
      screen: 'home',
      screenFrom: null,
      sheets: [],
      meta: defaultMeta(now()),
      games: {},
      dailies: {},
      slot: null,
      game: null,
      paused: false,
      hint: null,
      loading: null,
      toast: null,
      updateReady: false,
      results: null,
      stitch: null,
      quiltMonth: { y, m },
      today: t,
      howtoTab: 'classic',
      checkFlash: 0,
      focus: null,
    };
  }

  // ---------------------------------------------------------------- plumbing

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onGameEvents(fn: EventListener) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }
  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  get settings(): Settings {
    return this.state.meta.settings;
  }

  toast(text: string) {
    this.set({ toast: { text, id: ++this.toastId } });
    const id = this.toastId;
    setTimeout(() => {
      if (this.state.toast?.id === id) this.set({ toast: null });
    }, 2800);
  }

  // ---------------------------------------------------------------- boot

  async boot() {
    const kv = await openBestKV();
    this.repo = new Repo(kv);
    const data = await this.repo.load();
    for (const [k, v] of Object.entries(data.dailyPuzzles)) this.dailyCache.set(k, v);
    this.set({ meta: data.meta, games: data.games, dailies: data.dailies });
    await this.applySettings(data.meta.settings, true);
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* not supported */
    }
    const screen: Screen = data.meta.settings.tutorialDone ? 'home' : 'tutorial';
    this.set({ ready: true, screen });
    if (data.warnings.length) this.toast(data.warnings[0]);
    this.watchDay();
    window.setTimeout(() => {
      void this.refill();
      void this.warmDailies();
    }, 600);
  }

  /** Midnight rollover: the quilt and Daily follow the calendar. */
  private watchDay() {
    setInterval(() => {
      const t = localDateKey();
      if (t !== this.state.today) {
        const { y, m } = todayParts();
        this.set({ today: t, quiltMonth: { y, m } });
        void this.warmDailies();
      }
    }, 30_000);
  }

  async applySettings(s: Settings, initial = false) {
    audio.configure({ sound: s.sound, sfxVolume: s.sfxVolume, music: s.music, musicVolume: s.musicVolume });
    haptics.enabled = s.haptics;
    const sysReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    motion.reduced = s.reducedMotion === 'on' || (s.reducedMotion === 'system' && sysReduced);
    const root = document.documentElement;
    root.dataset.numerals = s.numeralSize;
    root.dataset.hand = s.leftHanded ? 'left' : 'right';
    root.dataset.reduced = motion.reduced ? 'true' : 'false';
    const prev = currentTheme();
    const theme = resolveTheme(s.theme);
    if (initial || !prev || prev.theme !== theme || prev.palette.id !== s.palette || this.lastPatterns !== s.patterns) {
      this.lastPatterns = s.patterns;
      await applyTheme(s.theme, s.palette, s.patterns);
      this.listeners.forEach((l) => l());
    }
  }
  private lastPatterns: boolean | null = null;

  async updateSettings(patch: Partial<Settings>) {
    const settings = { ...this.settings, ...patch };
    const meta = { ...this.state.meta, settings };
    this.set({ meta });
    void this.repo.saveMeta(meta);
    await this.applySettings(settings);
  }

  private saveMeta(meta: Meta) {
    this.set({ meta });
    void this.repo.saveMeta(meta);
  }

  // ---------------------------------------------------------------- navigation

  go(screen: Screen) {
    if (screen === this.state.screen) return;
    if (this.state.screen === 'game') this.pauseTimer();
    this.set({ screen, screenFrom: this.state.screen, sheets: [], hint: null });
    if (screen === 'game' && this.state.game?.status === 'playing' && !this.state.paused) this.resumeTimer();
    try {
      history.pushState({ screen }, '');
    } catch {
      /* ignore */
    }
  }

  openSheet(sheet: Sheet) {
    this.set({ sheets: [...this.state.sheets, sheet] });
    try {
      history.pushState({ sheet: sheet.type }, '');
    } catch {
      /* ignore */
    }
  }

  closeSheet() {
    if (!this.state.sheets.length) return;
    this.set({ sheets: this.state.sheets.slice(0, -1) });
  }

  /** Android back / browser back. */
  back() {
    if (this.state.sheets.length) return this.closeSheet();
    if (this.state.hint) return this.set({ hint: null });
    if (this.state.results) return this.dismissResults();
    if (this.state.screen !== 'home' && this.state.screen !== 'tutorial') this.go('home');
  }

  // ---------------------------------------------------------------- puzzles

  private abortRefill() {
    this.refillAbort?.abort();
    this.refillAbort = null;
  }

  /** Keep one ready puzzle per difficulty so New Game is instant. */
  async refill() {
    if (this.refillAbort) return;
    const ctrl = new AbortController();
    this.refillAbort = ctrl;
    try {
      for (const d of DIFFICULTIES) {
        if ((this.state.meta.prefetch.queue[d]?.length ?? 0) >= 1) continue;
        const res = await engine().request<'puzzle'>({ type: 'generate', difficulty: d, seed: randomSeed() }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const meta = structuredClone(this.state.meta);
        (meta.prefetch.queue[d] ??= []).push({ givens: res.puzzle.givens, solution: res.puzzle.solution, source: res.puzzle.source });
        this.saveMeta(meta);
      }
    } catch {
      /* aborted or failed: try again later */
    } finally {
      if (this.refillAbort === ctrl) this.refillAbort = null;
    }
  }

  private async obtainClassic(d: Difficulty): Promise<PuzzlePayload> {
    const meta = structuredClone(this.state.meta);
    const q = meta.prefetch.queue[d];
    const seen = new Set(meta.prefetch.seen);
    while (q && q.length) {
      const p = q.shift()!;
      if (seen.has(p.givens)) continue;
      meta.prefetch.seen = [...meta.prefetch.seen, p.givens].slice(-500);
      this.saveMeta(meta);
      return { ...p, difficulty: d };
    }
    if (d === 'hard' || d === 'expert' || d === 'master') {
      const used = meta.prefetch.usedBank[d] ?? [];
      const res = await engine().request<'puzzle'>({ type: 'bank', difficulty: d, used, seed: randomSeed() });
      const idx = Number(res.puzzle.source.split(':')[2]);
      const m2 = structuredClone(this.state.meta);
      const all = [...(m2.prefetch.usedBank[d] ?? []), idx];
      m2.prefetch.usedBank[d] = all;
      this.saveMeta(m2);
      return res.puzzle;
    }
    for (;;) {
      const res = await engine().request<'puzzle'>({ type: 'generate', difficulty: d, seed: randomSeed() });
      if (!seen.has(res.puzzle.givens)) {
        const m2 = structuredClone(this.state.meta);
        m2.prefetch.seen = [...m2.prefetch.seen, res.puzzle.givens].slice(-500);
        this.saveMeta(m2);
        return res.puzzle;
      }
    }
  }

  async dailyPuzzle(dateKey: string) {
    const hit = this.dailyCache.get(dateKey);
    if (hit) return hit;
    const res = await engine().request<'puzzle'>({ type: 'daily', dateKey });
    const p = { givens: res.puzzle.givens, solution: res.puzzle.solution, difficulty: res.puzzle.difficulty };
    this.dailyCache.set(dateKey, p);
    void this.repo.saveDailyPuzzle(dateKey, p);
    return p;
  }

  /** Prepare today's and the next two dailies in the background. */
  private async warmDailies() {
    for (let k = 0; k < 3; k++) {
      try {
        await this.dailyPuzzle(addDays(this.state.today, k));
      } catch {
        /* ignore */
      }
    }
  }

  // ---------------------------------------------------------------- starting games

  private beginGame(game: GameState, fresh: boolean) {
    const slot = slotFor(game);
    const games = { ...this.state.games, [slot]: game };
    const meta = structuredClone(this.state.meta);
    meta.currentSlot = slot;
    if (game.mode === 'classic' && game.difficulty !== 'custom') meta.lastDifficulty = game.difficulty;
    if (fresh) {
      const bucket = this.bucket(meta, game);
      bucket.started++;
    }
    this.saveMeta(meta);
    this.set({ games, slot, game, paused: false, hint: null, results: null, loading: null, sheets: [] });
    void this.repo.saveGame(slot, game);
    this.resumedAt = null;
    this.go('game');
    this.resumeTimer();
  }

  private bucket(meta: Meta, g: Pick<GameState, 'mode' | 'difficulty'>): BucketStats {
    return g.mode === 'daily' ? meta.stats.daily[g.difficulty as Difficulty] : meta.stats.classic[g.difficulty];
  }

  async newClassic(d: Difficulty) {
    if (this.pending) return;
    this.abortRefill();
    // Abandoning an unfinished game of this difficulty breaks its streak.
    const prev = this.state.games[`classic:${d}`];
    this.set({ loading: 'Mixing fresh paint…', sheets: [] });
    const task = (async () => {
      try {
        const p = await this.obtainClassic(d);
        if (prev && prev.status === 'playing' && prev.history.length) {
          const meta = structuredClone(this.state.meta);
          meta.stats.classic[d].currentStreak = 0;
          this.saveMeta(meta);
        }
        const game = G.newGameState(p, { id: `c-${now()}`, mode: 'classic', difficulty: d, source: p.source, now: now() });
        this.beginGame(game, true);
      } catch (e) {
        this.set({ loading: null });
        this.toast(`Could not make a puzzle: ${String(e)}`);
      } finally {
        this.pending = null;
        window.setTimeout(() => void this.refill(), 1500);
      }
    })();
    this.pending = task;
    await task;
  }

  async startCustom(givens: string, solution: string) {
    const game = G.newGameState({ givens, solution }, { id: `x-${now()}`, mode: 'classic', difficulty: 'custom', source: 'custom', now: now() });
    this.beginGame(game, true);
  }

  async playDaily(dateKey: string) {
    const slot = `daily:${dateKey}`;
    const existing = this.state.games[slot];
    if (existing && existing.status === 'playing') {
      this.continueSlot(slot);
      return;
    }
    if (this.state.dailies[dateKey]) {
      this.openSheet({ type: 'patch', dateKey });
      return;
    }
    this.set({ loading: 'Preparing the daily…', sheets: [] });
    try {
      const p = await this.dailyPuzzle(dateKey);
      const archive = dateKey !== this.state.today;
      const game = G.newGameState(p, { id: `d-${dateKey}-${now()}`, mode: 'daily', difficulty: dailyDifficulty(dateKey), dateKey, archive, source: `daily:${dateKey}`, now: now() });
      this.beginGame(game, true);
    } catch (e) {
      this.set({ loading: null });
      this.toast(`Could not prepare the daily: ${String(e)}`);
    }
  }

  continueSlot(slot: string) {
    const g = this.state.games[slot];
    if (!g) return;
    const meta = structuredClone(this.state.meta);
    meta.currentSlot = slot;
    this.saveMeta(meta);
    this.set({ slot, game: g, paused: false, hint: null, results: null, sheets: [] });
    this.go('game');
    this.resumeTimer();
  }

  /** The most recent unfinished Classic game, for the Continue button. */
  continuable(): { slot: string; game: GameState } | null {
    let best: { slot: string; game: GameState } | null = null;
    for (const [slot, g] of Object.entries(this.state.games)) {
      if (!slot.startsWith('classic:') || g.status !== 'playing') continue;
      if (!best || g.updatedAt > best.game.updatedAt) best = { slot, game: g };
    }
    return best;
  }

  // ---------------------------------------------------------------- timer

  elapsed(): number {
    const g = this.state.game;
    if (!g) return 0;
    return g.elapsedMs + (this.resumedAt !== null ? now() - this.resumedAt : 0);
  }

  resumeTimer() {
    if (this.resumedAt === null && this.state.game?.status === 'playing' && this.state.screen === 'game' && !this.state.paused) this.resumedAt = now();
  }

  pauseTimer() {
    const g = this.state.game;
    if (!g || this.resumedAt === null) return;
    const elapsedMs = g.elapsedMs + (now() - this.resumedAt);
    this.resumedAt = null;
    this.commitGame({ ...g, elapsedMs }, false);
  }

  setPaused(paused: boolean) {
    if (paused === this.state.paused) return;
    if (paused) {
      this.pauseTimer();
      audio.whoosh(false);
    } else audio.whoosh(true);
    this.set({ paused, hint: null });
    if (!paused) this.resumeTimer();
  }

  /** Page hidden: fold time into the save and pause. */
  onHidden() {
    if (this.state.screen === 'game' && this.state.game?.status === 'playing') {
      this.pauseTimer();
      this.set({ paused: true });
    }
    motion.finishAll();
    audio.suspend();
    void this.repo?.flush();
  }

  onVisible() {
    audio.resume();
  }

  // ---------------------------------------------------------------- moves

  private commitGame(g: GameState, touch = true) {
    const slot = this.state.slot ?? slotFor(g);
    const game = touch ? { ...g, updatedAt: now() } : g;
    this.set({ game, games: { ...this.state.games, [slot]: game } });
    void this.repo.saveGame(slot, game);
  }

  /** Apply a game action, autosave, and broadcast its events. */
  act(fn: (g: GameState, t: number) => G.Result) {
    const g = this.state.game;
    if (!g || this.state.paused) return;
    const prevValues = g.values;
    // Keep elapsed time current in the saved state.
    const t = now();
    const elapsedMs = this.resumedAt !== null ? g.elapsedMs + (t - this.resumedAt) : g.elapsedMs;
    if (this.resumedAt !== null) this.resumedAt = t;
    const r = fn({ ...g, elapsedMs }, t);
    if (r.state !== g) this.commitGame(r.state);
    if (this.state.hint && r.events.some((e) => e.type !== 'blocked')) this.set({ hint: null });
    if (r.events.length) this.eventListeners.forEach((l) => l(r.events, prevValues));
    if (r.events.some((e) => e.type === 'solve')) this.onSolved(r.state);
    if (r.events.some((e) => e.type === 'failed')) {
      this.pauseTimer();
      this.openSheet({ type: 'failed' });
    }
    if (r.events.some((e) => e.type === 'fullButWrong')) this.toast(this.settings.mistakeMode === 'off' ? 'Every cell is painted, but something is off. Try Check board in the menu.' : 'Every cell is painted, but some colors clash.');
  }

  setFocus(d: number | null) {
    this.set({ focus: d });
  }

  private strokeStart: number | null = null;
  /** Start a drag stroke: every note change until endStroke() becomes one undo step. */
  beginStroke() {
    this.strokeStart = this.state.game?.history.length ?? null;
  }
  endStroke() {
    const g = this.state.game;
    const start = this.strokeStart;
    this.strokeStart = null;
    if (!g || start === null || g.history.length - start < 2) return;
    const moves = g.history.slice(start);
    const merged = new Map<number, { i: number; v0: number; v1: number; n0: number; n1: number }>();
    for (const m of moves) {
      for (const ch of m.changes) {
        const prev = merged.get(ch.i);
        merged.set(ch.i, prev ? { ...prev, v1: ch.v1, n1: ch.n1 } : { ...ch });
      }
    }
    const squashed = { kind: 'notes' as const, changes: [...merged.values()], digit: moves[0].digit };
    this.commitGame({ ...g, history: [...g.history.slice(0, start), squashed] }, false);
  }

  select(cell: number | null) {
    const g = this.state.game;
    if (!g || g.selected === cell) return;
    this.commitGame({ ...g, selected: cell }, false);
  }

  setBrush(d: number | null) {
    const g = this.state.game;
    if (!g) return;
    this.commitGame({ ...g, brush: d }, false);
  }

  toggleNotesMode() {
    const g = this.state.game;
    if (!g) return;
    this.commitGame({ ...g, notesMode: !g.notesMode }, false);
  }

  /** Digit input from the pad or keyboard, honoring notes mode and input mode. */
  input(d: number, asNote = false) {
    const g = this.state.game;
    if (!g || g.status !== 'playing') return;
    const sel = g.selected;
    if (sel === null) return;
    if (asNote || g.notesMode) this.act((s, t) => G.toggleNote(s, sel, d, t));
    else this.act((s, t) => G.placeDigit(s, sel, d, this.settings, t));
  }

  eraseSelected() {
    const g = this.state.game;
    if (!g || g.selected === null) return;
    const sel = g.selected;
    this.act((s, t) => G.erase(s, sel, t));
  }

  undo() {
    this.act((s, t) => G.undo(s, t));
  }
  redo() {
    this.act((s, t) => G.redo(s, this.settings, t));
  }

  autoNotes() {
    this.act((s, t) => G.autoNotes(s, t));
  }
  clearNotes() {
    this.act((s, t) => G.clearNotes(s, t));
  }

  restartGame() {
    const g = this.state.game;
    if (!g) return;
    this.commitGame(G.restart(g, now()));
    this.set({ sheets: [], hint: null });
    this.eventListeners.forEach((l) => l([{ type: 'notesBatch', cells: [] }], g.values));
  }

  checkBoard() {
    const g = this.state.game;
    if (!g) return;
    const wrong = [...G.wrongCells(g)];
    this.commitGame({ ...g, checked: wrong }, false);
    this.set({ sheets: [], checkFlash: this.state.checkFlash + 1 });
    this.toast(wrong.length ? `${wrong.length} cell${wrong.length > 1 ? 's' : ''} don't match the solution.` : 'Everything painted so far is correct.');
  }

  waiveLimit() {
    const g = this.state.game;
    if (!g) return;
    this.commitGame({ ...g, status: 'playing', limitWaived: true });
    this.set({ sheets: [] });
    this.resumeTimer();
  }

  // ---------------------------------------------------------------- hints

  async requestHint() {
    const g = this.state.game;
    if (!g || g.status !== 'playing') return;
    if (this.state.hint) {
      if (this.state.hint.stage === 1 && this.state.hint.result.kind === 'step') this.set({ hint: { ...this.state.hint, stage: 2 } });
      return;
    }
    const pal = currentTheme()?.palette;
    const res = await engine().request<'hint'>({ type: 'hint', values: g.values, solution: g.solution, givens: g.givens, names: [...(pal?.names ?? [])] });
    const hint = res.hint;
    if (hint.kind === 'solved') return;
    const cur = this.state.game!;
    this.commitGame({ ...cur, hintsUsed: cur.hintsUsed + 1, selected: hint.place?.cell ?? (hint.wrong?.[0] ?? cur.selected) }, true);
    this.set({ hint: { result: hint, stage: hint.kind === 'step' ? 1 : 2 } });
  }

  hintStage2() {
    if (this.state.hint) this.set({ hint: { ...this.state.hint, stage: 2 } });
  }

  closeHint() {
    this.set({ hint: null });
  }

  applyHintPlacement() {
    const h = this.state.hint?.result;
    if (!h?.place) return;
    const { cell, digit } = h.place;
    this.set({ hint: null });
    this.act((s, t) => G.placeDigit({ ...s, selected: cell }, cell, digit, this.settings, t, 'hint'));
  }

  applyHintNotes() {
    const h = this.state.hint?.result;
    if (!h?.step) return;
    const elims = h.step.eliminations;
    this.act((s, t) => G.removeNotes(s, elims, t));
  }

  clearWrong() {
    const h = this.state.hint?.result;
    const cells = h?.wrong ?? [];
    this.set({ hint: null });
    for (const c of cells) this.act((s, t) => G.erase(s, c, t));
  }

  // ---------------------------------------------------------------- finishing

  private onSolved(g: GameState) {
    this.resumedAt = null;
    const timeMs = g.elapsedMs;
    const meta = structuredClone(this.state.meta);
    const b = this.bucket(meta, g);
    const prevBestMs = b.bestTimeMs;
    const firstSolve = b.solved === 0;
    b.solved++;
    b.totalTimeMs += timeMs;
    const bestTime = prevBestMs === null || timeMs < prevBestMs;
    if (bestTime) b.bestTimeMs = timeMs;
    if (g.mistakes === 0) b.noMistakes++;
    if (g.hintsUsed === 0) b.noHints++;
    if (g.mistakes === 0 && g.hintsUsed === 0) b.perfect++;
    b.currentStreak++;
    b.bestStreak = Math.max(b.bestStreak, b.currentStreak);
    let streak = b.currentStreak;
    let dailies = this.state.dailies;
    if (g.mode === 'daily' && g.dateKey) {
      const archive = g.dateKey !== this.state.today;
      const rec: DailyRecord = {
        dateKey: g.dateKey,
        difficulty: g.difficulty as Difficulty,
        solvedAt: now(),
        timeMs,
        mistakes: g.mistakes,
        hints: g.hintsUsed,
        archive,
        grid: g.solution,
        givens: g.givens,
        placements: g.placements,
      };
      dailies = { ...dailies, [g.dateKey]: rec };
      void this.repo.saveDaily(rec);
      if (!archive) {
        const ds = meta.stats.dailyStreak;
        if (ds.lastDay !== g.dateKey) {
          ds.current = ds.lastDay === addDays(g.dateKey, -1) ? ds.current + 1 : 1;
          ds.lastDay = g.dateKey;
          ds.best = Math.max(ds.best, ds.current);
        }
      }
      streak = meta.stats.dailyStreak.current;
    }
    const slot = slotFor(g);
    const games = { ...this.state.games };
    delete games[slot];
    void this.repo.deleteGame(slot);
    if (meta.currentSlot === slot) meta.currentSlot = null;
    this.saveMeta(meta);
    const results: Results = {
      mode: g.mode,
      difficulty: g.difficulty,
      timeMs,
      mistakes: g.mistakes,
      hints: g.hintsUsed,
      bestTime: bestTime && !firstSolve,
      prevBestMs,
      firstSolve,
      streak,
      dateKey: g.dateKey,
      archive: g.mode === 'daily' && g.dateKey !== this.state.today,
      perfect: g.mistakes === 0 && g.hintsUsed === 0,
    };
    this.set({ games, dailies, results, hint: null });
  }

  /** Called by the game screen when the finale ends (or is skipped). */
  finaleDone(boardRect: DOMRect | null) {
    const r = this.state.results;
    if (!r) return;
    if (r.mode === 'daily' && r.dateKey) {
      const [y, m] = [Number(r.dateKey.slice(0, 4)), Number(r.dateKey.slice(5, 7))];
      this.set({
        stitch: { dateKey: r.dateKey, from: boardRect ? { x: boardRect.left, y: boardRect.top, w: boardRect.width, h: boardRect.height } : null },
        quiltMonth: { y, m },
      });
      this.go('home');
    }
  }

  stitchDone() {
    const s = this.state.stitch;
    this.set({ stitch: null });
    if (!s) return;
    // Whole month sewn? Celebrate it.
    const [y, m] = [Number(s.dateKey.slice(0, 4)), Number(s.dateKey.slice(5, 7))];
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let all = true;
    for (let d = 1; d <= days; d++) if (!this.state.dailies[`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`]) all = false;
    if (all) this.openSheet({ type: 'monthDone', y, m });
  }

  dismissResults() {
    this.set({ results: null, game: null, slot: null });
    if (this.state.screen === 'game') this.go('home');
  }

  quit() {
    this.pauseTimer();
    this.set({ sheets: [] });
    this.go('home');
  }

  // ---------------------------------------------------------------- tutorial / misc

  finishTutorial() {
    void this.updateSettings({ tutorialDone: true });
    this.set({ screen: 'home', screenFrom: 'tutorial' });
  }

  setQuiltMonth(y: number, m: number) {
    this.set({ quiltMonth: { y, m } });
  }

  setHowtoTab(t: 'classic' | 'daily') {
    this.set({ howtoTab: t });
  }

  setUpdateReady() {
    this.set({ updateReady: true });
  }

  /**
   * Test hooks (used by Playwright scenes and the stress test): fill cells with
   * their solution digits, or set notes, without playing any effects.
   */
  debugFill(cells: number[]) {
    const g = this.state.game;
    if (!g) return;
    const values = g.values.slice();
    for (const c of cells) values[c] = g.solution.charCodeAt(c) - 48;
    this.commitGame({ ...g, values });
  }
  debugNotes(entries: [number, number][]) {
    const g = this.state.game;
    if (!g) return;
    const notes = g.notes.slice();
    for (const [c, m] of entries) notes[c] = m;
    this.commitGame({ ...g, notes });
  }

  /** Replace everything with an imported save. */
  async importSave(file: unknown): Promise<string | null> {
    const res = await this.repo.importAll(file);
    if (!res.ok) return res.error;
    this.set({ meta: res.data.meta, games: res.data.games, dailies: res.data.dailies, game: null, slot: null });
    await this.applySettings(res.data.meta.settings, true);
    return null;
  }
}

export const store = new AppStore();

// Debug/verification handle (used by Playwright tests and the stress test).
declare global {
  interface Window {
    __huedoku?: { store: AppStore; motion: typeof motion; audio: typeof audio; haptics: typeof haptics };
  }
}
if (typeof window !== 'undefined') window.__huedoku = { store, motion, audio, haptics };

export function difficultyOfToday(today: string) {
  return dailyDifficulty(today);
}
