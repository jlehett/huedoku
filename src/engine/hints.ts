/**
 * Turns a logical Step into one plain sentence a player can follow, and finds
 * the hint for a board position: first any wrong entries, then the simplest
 * logical step, then the placement that step unlocks.
 */
import { applyStep, cloneState, createState, findStep, isSolved, type LogicState } from './logic';
import { TECHNIQUE_BY_ID, type Step } from './logic/types';
import { hiddenSingle, nakedSingle } from './logic/techniques';
import { classic, type Variant } from './variant';

export type NameFn = (d: number) => string;

const KIND_WORD: Record<string, string> = { row: 'row', col: 'column', box: 'box', region: 'region', diagonal: 'diagonal' };

function unitWord(v: Variant, id: number) {
  return KIND_WORD[v.units[id].kind];
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function explainStep(step: Step, name: NameFn, v: Variant = classic): string {
  const d = step.digits[0];
  const u0 = step.units[0] !== undefined ? unitWord(v, step.units[0]) : 'unit';
  switch (step.technique) {
    case 'hiddenSingle':
      return `This ${u0} only has one place left for ${name(d)}.`;
    case 'nakedSingle':
      return `Every other color is already in this cell's row, column or box, so it can only be ${name(d)}.`;
    case 'pointing': {
      const line = unitWord(v, step.units[1]);
      return `In this box, ${name(d)} can only go in one ${line}, so it can't go anywhere else in that ${line}.`;
    }
    case 'boxLine':
      return `In this ${u0}, ${name(d)} can only go inside one box, so the rest of that box can't be ${d}.`;
    case 'nakedPair':
      return `These two cells can only be ${name(step.digits[0])} or ${name(step.digits[1])}, so no other cell in this ${u0} can be either.`;
    case 'hiddenPair':
      return `${cap(name(step.digits[0]))} and ${name(step.digits[1])} only fit in these two cells of this ${u0}, so those cells can't hold anything else.`;
    case 'nakedTriple':
      return `These three cells only use ${list(step.digits.map(name))} between them, so the rest of this ${u0} can't.`;
    case 'hiddenTriple':
      return `${cap(list(step.digits.map(name)))} only fit in these three cells of this ${u0}, so those cells can't hold anything else.`;
    case 'xWing':
    case 'swordfish': {
      const base = step.roles?.base ?? [];
      const n = step.technique === 'xWing' ? 'two' : 'three';
      const baseWord = base.length ? unitWord(v, base[0]) : 'row';
      const coverWord = baseWord === 'row' ? 'column' : 'row';
      return `In ${n} ${baseWord}s, ${name(d)} only fits in the same ${n} ${coverWord}s, so ${d} can't go anywhere else in those ${coverWord}s.`;
    }
    case 'xyWing': {
      const z = name(d);
      return `The middle cell has two choices, and either way one of its two partners becomes ${z}, so a cell that sees both partners can't be ${d}.`;
    }
    case 'xyzWing':
      return `One of these three cells must be ${name(d)}, so a cell that sees all three can't be ${d}.`;
    case 'simpleColoring':
      return step.roles?.rule?.[0] === 1
        ? `Follow the linked pairs of ${name(d)}: one shade of the chain would put two ${d}s in the same unit, so every cell of that shade is not ${d}.`
        : `Follow the linked pairs of ${name(d)}: one of the two shades is ${d}, and this cell sees both, so it can't be ${d}.`;
    case 'xyChain':
      return `Along this chain of two-choice cells, if the first cell isn't ${name(d)} then the last one is, so a cell that sees both ends can't be ${d}.`;
  }
}

export interface HintResult {
  kind: 'wrong' | 'step' | 'none' | 'solved';
  /** Cells with wrong entries (kind 'wrong'). */
  wrong?: number[];
  step?: Step;
  techniqueName?: string;
  sentence?: string;
  /** The placement this hint leads to, ready to offer to the player. */
  place?: { cell: number; digit: number };
  /** Extra sentence when the step is an elimination that unlocks a placement. */
  followUp?: string;
}

/** Find the next single after `s`, used to turn an elimination into a placement. */
function nextSingle(s: LogicState, v: Variant): Step | null {
  return hiddenSingle(s, v) ?? nakedSingle(s, v);
}

export function findHint(values: readonly number[], solution: string, givens: string, name: NameFn, v: Variant = classic): HintResult {
  const wrong: number[] = [];
  for (let i = 0; i < 81; i++) if (values[i] && givens[i] === '0' && values[i] !== solution.charCodeAt(i) - 48) wrong.push(i);
  if (wrong.length) {
    return {
      kind: 'wrong',
      wrong,
      sentence: wrong.length === 1 ? `This ${name(values[wrong[0]])} doesn't fit the solution. Clear it first.` : `${wrong.length} entries don't fit the solution. Clear them first.`,
    };
  }
  const s = createState(values, v);
  if (!s) return { kind: 'none', sentence: 'The board has a conflict to fix first.' };
  if (isSolved(s)) return { kind: 'solved' };
  const step = findStep(s, v, 5);
  if (!step) {
    return { kind: 'none', sentence: "None of the techniques I know apply here. This puzzle needs a guess." };
  }
  const res: HintResult = { kind: 'step', step, techniqueName: TECHNIQUE_BY_ID[step.technique].name, sentence: explainStep(step, name, v) };
  if (step.placement) {
    res.place = step.placement;
    return res;
  }
  // Apply eliminations (and any further steps) until a placement appears.
  const t = cloneState(s);
  applyStep(t, v, step);
  for (let guard = 0; guard < 40; guard++) {
    const single = nextSingle(t, v);
    if (single?.placement) {
      res.place = single.placement;
      res.followUp = `That leaves ${name(single.placement.digit)} for the highlighted cell.`;
      return res;
    }
    const more = findStep(t, v, 5);
    if (!more) break;
    applyStep(t, v, more);
  }
  return res;
}
