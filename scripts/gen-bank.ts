/**
 * Builds src/assets/bank-v1.json with the engine's own generator.
 * Every entry is generated from the seed "huedoku/bank/v1/<slice>/<grade>/<i>",
 * so the bank is reproducible. Work is split across CPU cores.
 *
 *   npx tsx scripts/gen-bank.ts            (full build)
 *   npx tsx scripts/gen-bank.ts --shard a b (internal: worker mode)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeShareCode } from '../src/engine/codec';
import { generate } from '../src/engine/generator';
import type { Difficulty } from '../src/engine/logic/types';
import { rngFrom } from '../src/engine/prng';

export const BANK_PLAN: { slice: 'classic' | 'daily'; difficulty: Difficulty; count: number }[] = [
  { slice: 'classic', difficulty: 'hard', count: 600 },
  { slice: 'classic', difficulty: 'expert', count: 520 },
  { slice: 'classic', difficulty: 'master', count: 520 },
  { slice: 'daily', difficulty: 'hard', count: 420 },
];

type Job = { slice: string; difficulty: Difficulty; i: number };

function allJobs(): Job[] {
  return BANK_PLAN.flatMap((p) => Array.from({ length: p.count }, (_, i) => ({ slice: p.slice, difficulty: p.difficulty, i })));
}

function runShard(index: number, total: number, out: string) {
  const jobs = allJobs().filter((_, k) => k % total === index);
  const res: Record<string, string> = {};
  for (const j of jobs) {
    const p = generate({ difficulty: j.difficulty, rng: rngFrom(`huedoku/bank/v1/${j.slice}/${j.difficulty}/${j.i}`) })!;
    res[`${j.slice}/${j.difficulty}/${j.i}`] = encodeShareCode(p.givens);
  }
  writeFileSync(out, JSON.stringify(res));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--shard') {
    runShard(Number(args[1]), Number(args[2]), args[3]);
    return;
  }
  const total = Math.max(1, cpus().length - 2);
  const dir = join(tmpdir(), 'huedoku-bank');
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: total }, (_, k) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/gen-bank.ts', '--shard', String(k), String(total), join(dir, `shard-${k}.json`)], { stdio: 'inherit' });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`shard ${k} exited ${code}`))));
      }),
    ),
  );
  const merged: Record<string, string> = {};
  for (let k = 0; k < total; k++) Object.assign(merged, JSON.parse(readFileSync(join(dir, `shard-${k}.json`), 'utf8')));
  const bank: { version: number; classic: Record<string, string[]>; daily: Record<string, string[]> } = { version: 1, classic: {}, daily: {} };
  for (const p of BANK_PLAN) {
    bank[p.slice][p.difficulty] = Array.from({ length: p.count }, (_, i) => merged[`${p.slice}/${p.difficulty}/${i}`]);
  }
  mkdirSync('src/assets', { recursive: true });
  writeFileSync('src/assets/bank-v1.json', JSON.stringify(bank));
  console.log(`bank written in ${((Date.now() - t0) / 1000).toFixed(1)}s using ${total} processes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
