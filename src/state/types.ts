import type { Difficulty } from '../engine/logic/types';
import type { PaletteId } from '../color/palettes';

export type Mode = 'classic' | 'daily';
export type GameDifficulty = Difficulty | 'custom';
export type MistakeMode = 'immediate' | 'conflicts' | 'off';
export type Status = 'playing' | 'solved' | 'failed';

/** One cell's before/after inside a move. */
export interface CellChange {
  i: number;
  v0: number;
  v1: number;
  n0: number;
  n1: number;
}

export type MoveKind = 'place' | 'erase' | 'note' | 'notes' | 'autoNotes' | 'hint' | 'applyHintNotes' | 'clearNotes';

/**
 * Command record. Undo replays the `0` side of each change, redo the `1`
 * side, so every command (placement, note paint stroke, auto-candidates,
 * hint) undoes the same way and the history serializes to plain JSON.
 */
export interface Move {
  kind: MoveKind;
  changes: CellChange[];
  /** Cell the player acted on (used for motion origin). */
  cell?: number;
  digit?: number;
}

export interface GameState {
  id: string;
  mode: Mode;
  difficulty: GameDifficulty;
  /** Daily date key (YYYY-MM-DD) */
  dateKey?: string;
  /** Daily played after its day. */
  archive?: boolean;
  /** Bank entry used, for "never twice" bookkeeping. */
  source?: string;
  variant: 'classic';
  givens: string;
  solution: string;
  values: number[];
  notes: number[];
  history: Move[];
  future: Move[];
  selected: number | null;
  notesMode: boolean;
  brush: number | null;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  /** Mistake-limit was waived after running out. */
  limitWaived: boolean;
  status: Status;
  startedAt: number;
  updatedAt: number;
  solvedAt?: number;
  /** Correct placements in order, for the quilt replay. */
  placements: number[];
  /** Cells flagged by a manual Check Board. */
  checked: number[];
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  palette: PaletteId;
  patterns: boolean;
  notesStyle: 'numerals' | 'dots';
  sound: boolean;
  sfxVolume: number;
  music: boolean;
  musicVolume: number;
  haptics: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  leftHanded: boolean;
  numeralSize: 'small' | 'medium' | 'large';
  mistakeMode: MistakeMode;
  mistakeLimit: boolean;
  autoRemoveNotes: boolean;
  highlightUnits: boolean;
  highlightSame: boolean;
  hideTimer: boolean;
  inputMode: 'cell' | 'paint';
  tutorialDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  palette: 'spectrum',
  patterns: false,
  notesStyle: 'numerals',
  sound: true,
  sfxVolume: 0.8,
  music: false,
  musicVolume: 0.4,
  haptics: true,
  reducedMotion: 'system',
  leftHanded: false,
  numeralSize: 'medium',
  mistakeMode: 'immediate',
  mistakeLimit: false,
  autoRemoveNotes: true,
  highlightUnits: true,
  highlightSame: true,
  hideTimer: false,
  inputMode: 'cell',
  tutorialDone: false,
};

export interface BucketStats {
  started: number;
  solved: number;
  totalTimeMs: number;
  bestTimeMs: number | null;
  noMistakes: number;
  noHints: number;
  perfect: number;
  currentStreak: number;
  bestStreak: number;
}

export const emptyBucket = (): BucketStats => ({
  started: 0,
  solved: 0,
  totalTimeMs: 0,
  bestTimeMs: null,
  noMistakes: 0,
  noHints: 0,
  perfect: 0,
  currentStreak: 0,
  bestStreak: 0,
});

export interface Stats {
  classic: Record<GameDifficulty, BucketStats>;
  daily: Record<Difficulty, BucketStats>;
  dailyStreak: { current: number; best: number; lastDay: string | null };
}

export interface DailyRecord {
  dateKey: string;
  difficulty: Difficulty;
  solvedAt: number;
  timeMs: number;
  mistakes: number;
  hints: number;
  archive: boolean;
  /** Solved grid (81 chars). */
  grid: string;
  givens: string;
  placements: number[];
}

export interface Prefetch {
  /** Ready-to-play puzzles per difficulty. */
  queue: Partial<Record<Difficulty, { givens: string; solution: string; source: string }[]>>;
  /** Bank entries already served per difficulty. */
  usedBank: Partial<Record<Difficulty, number[]>>;
  /** Hashes of recently served generated puzzles. */
  seen: string[];
}
