import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { openIdb, memoryKV } from '../src/persistence/kv';
import { Repo } from '../src/persistence/repo';
import { wrap } from '../src/persistence/schema';
import { newGameState, placeDigit } from '../src/state/game';
import { DEFAULT_SETTINGS } from '../src/state/types';
import v1 from './fixtures/save-v1.json';

const P = {
  givens: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
};

describe('persistence', () => {
  it('round-trips a game through IndexedDB', async () => {
    const kv = await openIdb('rt-' + Math.random());
    const repo = new Repo(kv);
    let g = newGameState(P, { id: 'a', mode: 'classic', difficulty: 'easy', now: 1 });
    g = placeDigit(g, 2, 4, DEFAULT_SETTINGS, 2).state;
    await repo.saveGame('classic:easy', g);
    const loaded = await new Repo(kv).load(3);
    expect(loaded.games['classic:easy'].values).toEqual(g.values);
    expect(loaded.games['classic:easy'].history).toEqual(g.history);
    expect(loaded.warnings).toEqual([]);
  });

  it('migrates a schema-1 save', async () => {
    const kv = memoryKV();
    await kv.set('save', v1);
    const loaded = await new Repo(kv).load(100);
    expect(loaded.meta.settings.sound).toBe(false);
    expect(loaded.meta.settings.theme).toBe('dark');
    expect(loaded.meta.stats.classic.easy.solved).toBe(4);
    expect(loaded.meta.stats.classic.easy.bestTimeMs).toBe(301000);
    const g = loaded.games['classic:medium'];
    expect(g.values[2]).toBe(4);
    expect(g.notes[3]).toBe((1 << 5) | (1 << 7));
    expect(g.elapsedMs).toBe(272000);
    expect(g.history[0].changes[0]).toMatchObject({ i: 2, v0: 0, v1: 4 });
    expect(loaded.dailies['2026-09-28'].hints).toBe(1);
    expect(await kv.get('save')).toBeUndefined();
    const again = await new Repo(kv).load(101);
    expect(again.games['classic:medium'].values).toEqual(g.values);
  });

  it('quarantines corrupt records and keeps the rest', async () => {
    const kv = memoryKV();
    const g = newGameState(P, { id: 'a', mode: 'classic', difficulty: 'easy', now: 1 });
    await kv.set('game:classic:easy', wrap(g));
    await kv.set('game:classic:hard', { schema: 2, data: { givens: 'garbage' } });
    await kv.set('daily:2026-01-01', 'not even json');
    await kv.set('meta', { schema: 2, data: { settings: { palette: 'nope', sound: 'loud', haptics: false } } });
    const loaded = await new Repo(kv).load(5);
    expect(loaded.games['classic:easy']).toBeTruthy();
    expect(loaded.games['classic:hard']).toBeUndefined();
    expect(loaded.meta.settings.palette).toBe('spectrum');
    expect(loaded.meta.settings.haptics).toBe(false);
    expect(loaded.warnings.length).toBe(1);
    const keys = await kv.keys();
    expect(keys.some((k) => k.startsWith('corrupt:game:classic:hard'))).toBe(true);
  });

  it('repairs a game with damaged history', async () => {
    const kv = memoryKV();
    const g = { ...newGameState(P, { id: 'a', mode: 'classic', difficulty: 'easy', now: 1 }), history: [{ kind: 'place', changes: [{ i: 999 }] }] };
    await kv.set('game:classic:easy', wrap(g));
    const loaded = await new Repo(kv).load(5);
    expect(loaded.games['classic:easy'].history).toEqual([]);
    expect(loaded.warnings[0]).toMatch(/Repaired/);
  });

  it('exports and imports', async () => {
    const a = new Repo(memoryKV());
    const g = newGameState(P, { id: 'a', mode: 'classic', difficulty: 'easy', now: 1 });
    await a.saveGame('classic:easy', g);
    await a.saveMeta((await a.load()).meta);
    const file = await a.exportAll();
    const b = new Repo(memoryKV());
    const res = await b.importAll(JSON.parse(JSON.stringify(file)));
    expect(res.ok).toBe(true);
    const loaded = await b.load();
    expect(loaded.games['classic:easy'].givens).toBe(P.givens);
    expect((await b.importAll({ app: 'other' })).ok).toBe(false);
  });
});
