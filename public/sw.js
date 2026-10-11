// The service worker. VERSION and FILES are not declared in this file: the
// build writes them above this code in dist/sw.js (workerFiles in
// vite.config.ts).
const CACHE_PREFIX = "weight-tracker-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// Saves every file of this build into this version's own cache. If one
// download fails, the install fails and the previous version stays in charge.
self.addEventListener("install", (event) => {
  // Take over right after the install, instead of waiting until every page
  // opened under the previous version is closed.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // no-store skips the copy the browser keeps of a recent download. With
      // that copy, a push soon after another saves the earlier page next to
      // the new code file, and that page asks for a file that isn't saved.
      return cache.addAll(
        FILES.map((file) => new Request(file, { cache: "no-store" })),
      );
    }),
  );
});

// Runs when this version takes over. Deletes the caches of earlier versions,
// and only caches with our prefix: other sites on the same origin share this
// storage.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      const oldNames = names.filter((name) => {
        return name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME;
      });
      return Promise.all(oldNames.map((name) => caches.delete(name)));
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
