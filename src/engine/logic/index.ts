/**
 * Logical (human-style) solver. Always applies the simplest available
 * technique, so the hardest technique it needs is the puzzle's grade.
 */
import { classic, type Variant } from '../variant';
import { applyStep, cloneState, createState, isSolved, type LogicState } from './state';
import * as T from './techniques';
import {
  TECHNIQUE_BY_ID,
  TIER_DIFFICULTY,
  type GradeResult,
  type Step,
  type TechniqueId,
} from './types';

type Finder = (s: LogicState, v: Variant) => Step | null;

const FINDERS: { id: TechniqueId; find: Finder }[] = [
  { id: 'hiddenSingle', find: T.hiddenSingle },
  { id: 'nakedSingle', find: T.nakedSingle },
  { id: 'pointing', find: (s, v) => T.intersections(s, v, 'pointing') },
  { id: 'boxLine', find: (s, v) => T.intersections(s, v, 'boxLine') },
  { id: 'nakedPair', find: (s, v) => T.nakedSubset(s, v, 2) },
  { id: 'hiddenPair', find: (s, v) => T.hiddenSubset(s, v, 2) },
  { id: 'nakedTriple', find: (s, v) => T.nakedSubset(s, v, 3) },
  { id: 'hiddenTriple', find: (s, v) => T.hiddenSubset(s, v, 3) },
  { id: 'xWing', find: (s, v) => T.fish(s, v, 2) },
  { id: 'swordfish', find: (s, v) => T.fish(s, v, 3) },
  { id: 'xyWing', find: T.xyWing },
  { id: 'xyzWing', find: T.xyzWing },
  { id: 'simpleColoring', find: T.simpleColoring },
  { id: 'xyChain', find: (s, v) => T.xyChain(s, v) },
];

/** Find the simplest step allowed up to `maxTier`. */
export function findStep(s: LogicState, v: Variant = classic, maxTier = 5): Step | null {
  for (const f of FINDERS) {
    if (TECHNIQUE_BY_ID[f.id].tier > maxTier) break;
    const step = f.find(s, v);
    if (step) return step;
  }
  return null;
}

/** Fill every single (hidden first) until none remain. Returns placements made. */
function runSingles(s: LogicState, v: Variant, counts: Partial<Record<TechniqueId, number>>): number {
  let n = 0;
  for (;;) {
    const step = T.hiddenSingle(s, v) ?? T.nakedSingle(s, v);
    if (!step) return n;
    applyStep(s, v, step);
    counts[step.technique] = (counts[step.technique] ?? 0) + 1;
    n++;
  }
}

/**
 * Grade a puzzle. `maxTier` caps the techniques allowed (the solver reports
 * solved=false if it gets stuck), which lets the generator reject puzzles
 * that are harder than wanted without finishing a full grade.
 */
export function grade(grid: ArrayLike<number>, v: Variant = classic, maxTier = 5): GradeResult {
  const s = createState(grid, v);
  const counts: Partial<Record<TechniqueId, number>> = {};
  if (!s) return { solved: false, tier: 0, difficulty: null, counts, steps: 0 };
  let tier = 0;
  let steps = 0;
  for (;;) {
    const n = runSingles(s, v, counts);
    steps += n;
    if (n > 0) tier = Math.max(tier, 1);
    if (isSolved(s)) break;
    const step = findStep(s, v, maxTier);
    if (!step) return { solved: false, tier, difficulty: null, counts, steps };
    applyStep(s, v, step);
    steps++;
    counts[step.technique] = (counts[step.technique] ?? 0) + 1;
    tier = Math.max(tier, TECHNIQUE_BY_ID[step.technique].tier);
  }
  return { solved: true, tier, difficulty: tier ? TIER_DIFFICULTY[tier] : TIER_DIFFICULTY[1], counts, steps };
}

/** Full logical trace (used by hints and the tutorial). */
export function solveSteps(grid: ArrayLike<number>, v: Variant = classic, maxTier = 5, limit = 400): Step[] {
  const s = createState(grid, v);
  if (!s) return [];
  const out: Step[] = [];
  while (!isSolved(s) && out.length < limit) {
    const step = findStep(s, v, maxTier);
    if (!step) break;
    out.push(step);
    applyStep(s, v, step);
  }
  return out;
}

export { applyStep, cloneState, createState, isSolved };
export type { LogicState };
export * from './types';
