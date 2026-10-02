import { useEffect } from 'preact/hooks';
import { audio } from '../../audio/audio';
import { DIFFICULTY_LABEL, type Difficulty } from '../../engine/logic/types';
import { motion } from '../../motion/scheduler';
import { DUR, EASE } from '../../motion/tokens';
import { store, type Results } from '../app/store';
import { IconSpool } from '../components/icons';
import { formatTime, prettyDate } from '../format';

export function ResultsCard({ results, onClose }: { results: Results; onClose?: () => void }) {
  useEffect(() => {
    audio.fanfare();
    const card = document.querySelector('.results-card');
    const rows = document.querySelectorAll('.results-card .stat');
    if (motion.reduced) {
      motion.play(card, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, channel: 'results' });
      return;
    }
    motion.play(card, [{ opacity: 0, transform: 'translateY(40px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: DUR.sheetIn, easing: EASE.out, channel: 'results' });
    rows.forEach((r, k) =>
      motion.play(r, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 160 + k * 70, easing: EASE.out, fill: 'backwards', channel: `results:${k}` }),
    );
  }, []);
  const diff = results.difficulty === 'custom' ? 'Custom' : DIFFICULTY_LABEL[results.difficulty as Difficulty];
  const close = onClose ?? (() => store.dismissResults());
  const again = () => {
    store.dismissResults();
    if (results.mode === 'classic' && results.difficulty !== 'custom') void store.newClassic(results.difficulty as Difficulty);
  };
  const callouts: string[] = [];
  if (results.firstSolve) callouts.push(`First ${diff} solve`);
  if (results.bestTime) callouts.push(`New best time, ${formatTime(results.prevBestMs! - results.timeMs)} faster`);
  if (results.perfect) callouts.push('No mistakes, no hints');
  return (
    <div class="results-scrim" role="dialog" aria-modal="true" aria-label="Puzzle solved">
      <div class="results-card">
        <p class="brush-title">{results.mode === 'daily' ? (results.archive ? 'Patch made' : 'Daily done') : 'Solved'}</p>
        <p class="sub">{results.mode === 'daily' && results.dateKey ? `${prettyDate(results.dateKey)} · ${diff}` : `Classic · ${diff}`}</p>
        <div class="stats-row">
          <div class="stat big">
            <span class="v">{formatTime(results.timeMs)}</span>
            <span class="k">time</span>
          </div>
          <div class="stat">
            <span class="v">{results.mistakes}</span>
            <span class="k">mistakes</span>
          </div>
          <div class="stat">
            <span class="v">{results.hints}</span>
            <span class="k">hints</span>
          </div>
        </div>
        {callouts.length > 0 && (
          <ul class="callouts">
            {callouts.map((c) => (
              <li class="stat">{c}</li>
            ))}
          </ul>
        )}
        {results.mode === 'daily' && !results.archive && (
          <p class="streak stat">
            <IconSpool size={18} /> Daily streak: {results.streak} day{results.streak === 1 ? '' : 's'}
          </p>
        )}
        {results.mode === 'daily' && results.archive && <p class="note stat">Archive patches fill the quilt but don't count toward the streak.</p>}
        <div class="actions">
          {results.mode === 'classic' && results.difficulty !== 'custom' && (
            <button class="btn primary" onClick={again}>
              New {diff} game
            </button>
          )}
          <button class={`btn ${results.mode === 'daily' ? 'primary' : 'ghost'}`} onClick={close}>
            {results.mode === 'daily' ? 'Back to the quilt' : 'Home'}
          </button>
        </div>
      </div>
    </div>
  );
}
