import type { Difficulty } from '../engine/logic/types';
import type { HintResult } from '../engine/hints';
import type { ParseError, ParseOk } from '../engine/codec';

export interface PuzzlePayload {
  givens: string;
  solution: string;
  difficulty: Difficulty;
  source: string;
}

export type Request =
  | { type: 'generate'; difficulty: Difficulty; seed: string }
  | { type: 'bank'; difficulty: Difficulty; used: number[]; seed: string }
  | { type: 'daily'; dateKey: string }
  | { type: 'hint'; values: number[]; solution: string; givens: string; names: string[] }
  | { type: 'validate'; text: string }
  | { type: 'ping' };

export type Response =
  | { type: 'puzzle'; puzzle: PuzzlePayload; ms: number }
  | { type: 'hint'; hint: HintResult }
  | { type: 'validate'; result: ParseOk | ParseError }
  | { type: 'pong' };

export interface Envelope {
  id: number;
  req?: Request;
  cancel?: boolean;
}

export interface Reply {
  id: number;
  ok: boolean;
  res?: Response;
  error?: string;
}
