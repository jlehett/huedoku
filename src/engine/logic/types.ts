export type TechniqueId =
  | 'hiddenSingle'
  | 'nakedSingle'
  | 'pointing'
  | 'boxLine'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'swordfish'
  | 'xyWing'
  | 'xyzWing'
  | 'simpleColoring'
  | 'xyChain';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
export const DIFFICULTY_TIER: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3, expert: 4, master: 5 };
export const TIER_DIFFICULTY: Record<number, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'expert', 5: 'master' };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  master: 'Master',
};

export interface TechniqueInfo {
  id: TechniqueId;
  tier: number;
  name: string;
}

/** Ordered from simplest to hardest. The solver always applies the simplest available step. */
export const TECHNIQUES: readonly TechniqueInfo[] = [
  { id: 'hiddenSingle', tier: 1, name: 'Hidden single' },
  { id: 'nakedSingle', tier: 1, name: 'Naked single' },
  { id: 'pointing', tier: 2, name: 'Pointing pair' },
  { id: 'boxLine', tier: 2, name: 'Box/line reduction' },
  { id: 'nakedPair', tier: 2, name: 'Naked pair' },
  { id: 'hiddenPair', tier: 2, name: 'Hidden pair' },
  { id: 'nakedTriple', tier: 3, name: 'Naked triple' },
  { id: 'hiddenTriple', tier: 3, name: 'Hidden triple' },
  { id: 'xWing', tier: 3, name: 'X-Wing' },
  { id: 'swordfish', tier: 4, name: 'Swordfish' },
  { id: 'xyWing', tier: 4, name: 'XY-Wing' },
  { id: 'xyzWing', tier: 4, name: 'XYZ-Wing' },
  { id: 'simpleColoring', tier: 5, name: 'Simple coloring' },
  { id: 'xyChain', tier: 5, name: 'XY-Chain' },
];

export const TECHNIQUE_BY_ID: Record<TechniqueId, TechniqueInfo> = Object.fromEntries(
  TECHNIQUES.map((t) => [t.id, t]),
) as Record<TechniqueId, TechniqueInfo>;

export interface Elimination {
  cell: number;
  digit: number;
}

export interface Step {
  technique: TechniqueId;
  placement?: { cell: number; digit: number };
  eliminations: Elimination[];
  /** Cells that form the pattern (highlighted by hints). */
  cells: number[];
  /** Unit ids the pattern lives in. */
  units: number[];
  /** Digits the pattern is about. */
  digits: number[];
  /** Named roles for richer explanations (pivot, wings, chain, colorA, colorB, ...). */
  roles?: Record<string, number[]>;
}

export interface GradeResult {
  /** True when the logical solver finished the grid. */
  solved: boolean;
  /** Hardest tier used (1..5), 0 for an already complete grid. */
  tier: number;
  difficulty: Difficulty | null;
  /** How often each technique was applied. */
  counts: Partial<Record<TechniqueId, number>>;
  /** Total logical steps taken. */
  steps: number;
}
