/* ============================================================
   Split Ledger — offline shell.

   Deliberately conservative for a financial app: pages and API responses
   are NEVER served stale, because showing a balance that is quietly out of
   date is worse than showing nothing. Only static build assets are cached,
   plus one offline fallback page.
   ============================================================ */

const VERSION = 'v1';
const STATIC = `split-ledger-static-${VERSION}`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache anything that carries account state or money.
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api')) return;

  // Immutable build output: cache first, it is content-hashed.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: always go to the network. If the network is gone, say so
  // plainly rather than handing back a balance from an unknown point in time.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit ?? new Response('Offline', { status: 503 })),
      ),
    );
  }
});
