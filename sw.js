const CACHE_NAME = "weight-tracker-v6";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "./",
        "./index.html",
        "./db.js",
        "./app.js",
        "./trend-line.js",
        "./manifest.json",
        "./vendor/chart.umd.js",
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/icon-maskable-512.png",
      ]);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => {
        return Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestOrigin = new URL(event.request.url).origin;

  if (requestOrigin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
