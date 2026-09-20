// Service worker: makes the app work fully offline after the first visit,
// while still fetching the latest version whenever there's a connection —
// so updates you publish reach people automatically next time they're online,
// but the app never breaks just because there's no signal on site.

const CACHE_NAME = 'g4gas-calc-v1';
const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Only handle GET requests for this app's own pages — never intercept the
// license-check call to the Netlify function, which must always hit the
// real network to give an accurate answer.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/.netlify/functions/')) return;
  if (url.origin !== self.location.origin) return; // leave Google Fonts etc. alone

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('', { status: 504 });
        });
      })
  );
});
