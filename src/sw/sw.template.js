/* Huedoku service worker. Generated into dist/sw.js by vite.config.ts.
 *
 * - Precaches the whole app shell under a versioned cache name.
 * - Serves everything cache-first; navigations fall back to the cached index.
 * - Waits as "waiting" on a new deploy until the page asks it to take over
 *   (the app shows "Update available" and only reloads between games).
 * - Deletes caches from older versions when it activates.
 * - Makes no network requests except for its own files.
 */
const VERSION = '__VERSION__';
const CACHE = `huedoku-${VERSION}`;
const PRECACHE = /*__PRECACHE__*/ [];

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
        const shell = await cache.match('./');
        if (shell) return shell;
      }
      const hit = await cache.match(req, { ignoreSearch: url.pathname.endsWith('version.json') ? false : true });
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
