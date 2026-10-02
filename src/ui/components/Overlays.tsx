import { useEffect, useRef } from 'preact/hooks';
import { motion } from '../../motion/scheduler';
import { DUR, EASE } from '../../motion/tokens';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { applyUpdate } from '../sw-register';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (toast && ref.current) motion.play(ref.current, [{ opacity: 0, transform: 'translate(-50%, 12px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: DUR.sheetIn, easing: EASE.out, channel: 'toast' });
  }, [toast?.id]);
  if (!toast) return null;
  return (
    <div class="toast" ref={ref} role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}

export function LoadingVeil() {
  const loading = useApp((s) => s.loading);
  if (!loading) return null;
  return (
    <div class="loading-veil" role="status" aria-live="polite">
      <div class="paint-dots" aria-hidden="true">
        {[1, 3, 5, 6, 8].map((d, k) => (
          <i style={{ background: `var(--fill-${d})`, animationDelay: `${k * 90}ms` }} />
        ))}
      </div>
      <p>{loading}</p>
    </div>
  );
}

/** Shows when a new version is waiting. Never reloads mid-puzzle without consent. */
export function UpdatePrompt() {
  const ready = useApp((s) => s.updateReady);
  const screen = useApp((s) => s.screen);
  const playing = useApp((s) => s.game?.status === 'playing' && s.screen === 'game');
  if (!ready || playing) return null;
  return (
    <div class="update-prompt" role="status">
      <span>A new version of Huedoku is ready.</span>
      <button
        class="btn primary small"
        onClick={() => {
          void store.repo.flush().then(() => applyUpdate());
        }}
      >
        Update
      </button>
      <span class="visually-hidden">{screen}</span>
    </div>
  );
}
