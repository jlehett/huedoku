/**
 * Puzzle text formats: the common 81-character string, and a short share code
 * ("H1" + base64url of an 81-bit given mask followed by packed 4-bit digits).
 */
import { grade } from './logic';
import type { Difficulty } from './logic/types';
import { findConflicts, solve } from './solver';
import { classic, type Variant } from './variant';
import { gridToString } from './generator';

const EMPTY_CHARS = new Set(['0', '.', '-', '_', '*', 'x', 'X']);
const IGNORE = /[\s|+=]/g;

export type ParseError = { ok: false; reason: 'format' | 'conflict' | 'noSolution' | 'multipleSolutions'; message: string; cells?: number[] };
export type ParseOk = { ok: true; givens: string; solution: string; difficulty: Difficulty | null; clues: number };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToB64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.ceil(((Math.min(3, bytes.length - i)) * 8) / 6);
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

function b64ToBytes(s: string): number[] | null {
  const bytes: number[] = [];
  let acc = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
    }
  }
  return bytes;
}

export function encodeShareCode(givens: string): string {
  const bytes: number[] = new Array(11).fill(0);
  const digits: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== '0') {
      bytes[i >> 3] |= 0x80 >> (i & 7);
      digits.push(givens.charCodeAt(i) - 48);
    }
  }
  for (let i = 0; i < digits.length; i += 2) bytes.push((digits[i] << 4) | (digits[i + 1] ?? 0));
  return 'H1' + bytesToB64(bytes);
}

export function decodeShareCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith('H1')) return null;
  const bytes = b64ToBytes(trimmed.slice(2));
  if (!bytes || bytes.length < 11) return null;
  const out = new Array<string>(81).fill('0');
  let k = 0;
  for (let i = 0; i < 81; i++) {
    if (bytes[i >> 3] & (0x80 >> (i & 7))) {
      const byte = bytes[11 + (k >> 1)];
      if (byte === undefined) return null;
      const d = k % 2 === 0 ? byte >> 4 : byte & 15;
      if (d < 1 || d > 9) return null;
      out[i] = String(d);
      k++;
    }
  }
  return out.join('');
}

/** Normalize raw text (81-char string, grid drawing, or share code) to an 81-char '0'-padded string. */
export function normalizePuzzleText(text: string): { givens: string } | { error: string } {
  const t = text.trim();
  if (t.startsWith('H1')) {
    const g = decodeShareCode(t);
    return g ? { givens: g } : { error: 'That share code is damaged or incomplete.' };
  }
  const chars = t.replace(IGNORE, '');
  let out = '';
  for (const ch of chars) {
    if (ch >= '1' && ch <= '9') out += ch;
    else if (EMPTY_CHARS.has(ch)) out += '0';
    else return { error: `Unexpected character "${ch}". Use 1-9 for givens and 0 or . for empty cells.` };
  }
  if (out.length !== 81) return { error: `A puzzle needs exactly 81 cells; this has ${out.length}.` };
  return { givens: out };
}

/** Validate a custom puzzle: format, conflicts, and exactly one solution. */
export function parseCustomPuzzle(text: string, variant: Variant = classic): ParseOk | ParseError {
  const norm = normalizePuzzleText(text);
  if ('error' in norm) return { ok: false, reason: 'format', message: norm.error };
  const grid = Uint8Array.from(norm.givens, (c) => c.charCodeAt(0) - 48);
  const conflicts = findConflicts(grid, variant);
  if (conflicts.size) {
    return { ok: false, reason: 'conflict', message: 'Some givens repeat in a row, column or box.', cells: [...conflicts] };
  }
  const r = solve(grid, variant, 2, undefined, 2e6);
  if (r.count === 0) return { ok: false, reason: 'noSolution', message: 'This puzzle has no solution.' };
  if (r.count > 1) return { ok: false, reason: 'multipleSolutions', message: 'This puzzle has more than one solution, so it cannot be solved by logic alone.' };
  const g = grade(grid, variant, 5);
  return {
    ok: true,
    givens: norm.givens,
    solution: gridToString(r.solution!),
    difficulty: g.solved ? g.difficulty : null,
    clues: grid.reduce((n, d) => n + (d ? 1 : 0), 0),
  };
}
