/**
 * Service worker registration and the update handshake. A new deploy installs
 * in the background and waits; the app shows "Update available" (only when
 * no puzzle is in progress on screen) and reloads after the player taps it.
 */
import { store } from './app/store';

let waiting: ServiceWorker | null = null;

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            store.setUpdateReady();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        store.setUpdateReady();
      }
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for a new version when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return;
    reloading = true;
    window.location.reload();
  });
}

export function applyUpdate() {
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}
