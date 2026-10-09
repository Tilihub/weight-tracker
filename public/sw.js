// service worker
const CACHE_NAME = "weight-tracker-v9";

const FILES = [
  "./",
  "./manifest.json",
  "./assets/index-ZKq_9cjS.js",
  "./index.html",
  "./icons/icon-192.png",
  "./icons/icon.svg",
  "./icons/icon-maskable-512.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES);
    }),
  );
});
