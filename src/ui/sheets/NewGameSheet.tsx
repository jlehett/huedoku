import { useRef } from 'preact/hooks';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '../../engine/logic/types';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { Sheet, useSheetClose } from '../components/Sheet';
import { formatTime } from '../format';

const BLURB: Record<Difficulty, string> = {
  easy: 'Singles only. A calm warm-up.',
  medium: 'Pairs and pointing pairs.',
  hard: 'Triples and X-Wings.',
  expert: 'Swordfish, XY- and XYZ-Wings.',
  master: 'Coloring and chains.',
};

export function NewGameSheet() {
  const ref = useRef<HTMLDivElement>(null);
  const close = useSheetClose(ref);
  const stats = useApp((s) => s.meta.stats.classic);
  const games = useApp((s) => s.games);
  return (
    <Sheet title="New Classic game" sheetRef={ref}>
      <div class="difficulty-list">
        {DIFFICULTIES.map((d, k) => {
          const inProgress = games[`classic:${d}`]?.status === 'playing';
          const best = stats[d].bestTimeMs;
          return (
            <button class="difficulty" data-d={d} onClick={() => close(() => void store.newClassic(d))}>
              <span class="pips" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i class={i <= k ? 'on' : ''} style={i <= k ? { background: `var(--fill-${[1, 3, 5, 6, 8][i]})` } : undefined} />
                ))}
              </span>
              <span class="name">{DIFFICULTY_LABEL[d]}</span>
              <span class="blurb">{inProgress ? 'Starts over the game in progress' : BLURB[d]}</span>
              <span class="best">{best ? `Best ${formatTime(best)}` : ''}</span>
            </button>
          );
        })}
      </div>
      <button class="btn ghost wide" onClick={() => close(() => store.go('custom'))}>
        Enter your own puzzle
      </button>
    </Sheet>
  );
}
