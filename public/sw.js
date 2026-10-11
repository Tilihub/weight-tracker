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

// Answers the page's requests from the files this version saved, and asks
// the network for anything that isn't saved. Requests to other sites, like
// the sync's calls to GitHub, are left to the browser.
self.addEventListener("fetch", (event) => {
  const requestOrigin = new URL(event.request.url).origin;

  if (requestOrigin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // ignoreVary: the preview server marks every answer as depending on
        // the request's Origin header, and the lookup would miss the code file.
        return cache.match(event.request, { ignoreVary: true });
      })
      .then((response) => {
        return response ?? fetch(event.request);
      }),
  );
});
