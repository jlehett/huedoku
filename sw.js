/* Huedoku service worker. Generated into dist/sw.js by vite.config.ts.
 *
 * - Precaches the whole app shell under a versioned cache name.
 * - Serves everything cache-first; navigations fall back to the cached index.
 * - Waits as "waiting" on a new deploy until the page asks it to take over
 *   (the app shows "Update available" and only reloads between games).
 * - Deletes caches from older versions when it activates.
 * - Makes no network requests except for its own files.
 */
const VERSION = '5af62d2e027b';
const CACHE = `huedoku-${VERSION}`;
const PRECACHE = ["./","assets/bank-v1-5fLNzB2C.json","assets/caveat-brush-400-CRLcJ5yr.woff2","assets/engine.worker-DbmB-qSZ.js","assets/fredoka-500-Blp3YfgB.woff2","assets/fredoka-600-DjqcVTek.woff2","assets/index-CkOi7An3.css","assets/index-Cpt8BY3L.js","assets/nunito-600-BNyLnkFZ.woff2","assets/nunito-800-Brg0d1sd.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-192.png","icons/maskable-512.png","manifest.webmanifest"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' bypasses the HTTP cache so a new version never stores stale files.
      await Promise.all(
        PRECACHE.map(async (url) => {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (!res.ok) throw new Error(`precache failed for ${url}: ${res.status}`);
          await cache.put(url, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('huedoku-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') event.source && event.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        const shell = await cache.match('./', { ignoreVary: true });
        if (shell) return shell;
      }
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        const shell = req.mode === 'navigate' ? await cache.match('./') : undefined;
        if (shell) return shell;
        throw e;
      }
    })(),
  );
});
