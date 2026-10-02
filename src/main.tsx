import { render } from 'preact';
import './ui/styles/base.css';
import './ui/styles/board.css';
import './ui/styles/game.css';
import './ui/styles/ui.css';
import { audio } from './audio/audio';
import { App, store } from './ui/App';
import { registerSW } from './ui/sw-register';

const t0 = performance.now();
render(<App />, document.getElementById('app')!);

// Unlock audio on the first gesture anywhere (iOS needs this).
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.onHidden();
  else store.onVisible();
});
window.addEventListener('pagehide', () => store.onHidden());
window.addEventListener('popstate', () => store.back());
try {
  history.replaceState({ root: true }, '');
  history.pushState({ screen: 'home' }, '');
} catch {
  /* ignore */
}

matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => void store.applySettings(store.settings, true));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => void store.applySettings(store.settings));

void store.boot().then(() => {
  performance.mark('huedoku-interactive');
  (window as unknown as { __huedokuReadyMs: number }).__huedokuReadyMs = performance.now() - t0;
  document.documentElement.dataset.ready = 'true';
  document.getElementById('boot')?.remove();
});
registerSW();
