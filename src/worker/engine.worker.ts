/// <reference lib="webworker" />
/**
 * Engine worker: generation, daily derivation, hints and custom-puzzle
 * validation run here so the UI thread never stalls. Generation yields between
 * attempts so a newer request can cancel an obsolete one.
 */
import bankUrl from '../assets/bank-v1.json?url';
import { puzzleFromCode, type BankFile } from '../engine/bank';
import { parseCustomPuzzle } from '../engine/codec';
import { dailyDifficulty, generateDaily } from '../engine/daily';
import { generate } from '../engine/generator';
import { findHint } from '../engine/hints';
import { rngFrom } from '../engine/prng';
import type { Envelope, Reply, Request, Response } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const cancelled = new Set<number>();
let bankPromise: Promise<BankFile> | null = null;

function loadBank(): Promise<BankFile> {
  bankPromise ??= fetch(bankUrl).then((r) => {
    if (!r.ok) throw new Error(`bank ${r.status}`);
    return r.json() as Promise<BankFile>;
  });
  bankPromise.catch(() => (bankPromise = null));
  return bankPromise;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class Cancelled extends Error {}

async function handle(id: number, req: Request): Promise<Response> {
  const t0 = performance.now();
  switch (req.type) {
    case 'ping':
      return { type: 'pong' };
    case 'generate': {
      const rng = rngFrom(req.seed);
      for (let attempt = 0; ; attempt++) {
        if (cancelled.has(id)) throw new Cancelled();
        const p = generate({ difficulty: req.difficulty, rng, maxAttempts: 1 });
        if (p) return { type: 'puzzle', puzzle: { givens: p.givens, solution: p.solution, difficulty: p.difficulty, source: `gen:${req.seed}` }, ms: performance.now() - t0 };
        if (attempt % 6 === 5) await tick();
      }
    }
    case 'bank': {
      const bank = await loadBank();
      const slice = bank.classic[req.difficulty] ?? [];
      if (!slice.length) throw new Error(`no bank for ${req.difficulty}`);
      const used = new Set(req.used);
      const free = slice.map((_, i) => i).filter((i) => !used.has(i));
      const pool = free.length ? free : slice.map((_, i) => i);
      const idx = rngFrom(req.seed).pick(pool);
      const p = puzzleFromCode(slice[idx], req.difficulty);
      return { type: 'puzzle', puzzle: { givens: p.givens, solution: p.solution, difficulty: p.difficulty, source: `bank:${req.difficulty}:${idx}` }, ms: performance.now() - t0 };
    }
    case 'daily': {
      const bank = await loadBank();
      const p = generateDaily(req.dateKey, bank);
      return {
        type: 'puzzle',
        puzzle: { givens: p.givens, solution: p.solution, difficulty: dailyDifficulty(req.dateKey), source: `daily:${req.dateKey}` },
        ms: performance.now() - t0,
      };
    }
    case 'hint': {
      const hint = findHint(req.values, req.solution, req.givens, (d) => `${req.names[d - 1]} ${d}`);
      return { type: 'hint', hint };
    }
    case 'validate':
      return { type: 'validate', result: parseCustomPuzzle(req.text) };
  }
}

self.onmessage = async (e: MessageEvent<Envelope>) => {
  const { id, req, cancel } = e.data;
  if (cancel) {
    cancelled.add(id);
    return;
  }
  if (!req) return;
  try {
    const res = await handle(id, req);
    if (!cancelled.has(id)) self.postMessage({ id, ok: true, res } satisfies Reply);
  } catch (err) {
    if (!(err instanceof Cancelled)) self.postMessage({ id, ok: false, error: String(err) } satisfies Reply);
  } finally {
    cancelled.delete(id);
  }
};
