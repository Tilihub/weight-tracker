// The service worker. VERSION and FILES are not declared in this file: the
// build writes them above this code in dist/sw.js (workerFiles in
// vite.config.ts).
const CACHE_NAME = `weight-tracker-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES);
    }),
  );
});
