// Hamlet Music Board — service worker
// Pre-caches the app shell on install and the audio files on request
// from the page, so the board loads instantly and runs fully offline.

const CACHE = "hamlet-v0.23.0";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./show-data.js",
  "./favicon.svg",
  "./skull-mark.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page sends the list of audio URLs to pre-cache for offline use.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_AUDIO" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(data.urls.map((url) =>
          cache.match(url).then((hit) =>
            hit || fetch(url, { cache: "reload" })
              .then((res) => { if (res && res.status === 200) return cache.put(url, res.clone()); })
              .catch(() => {})
          )
        ))
      )
    );
  }
});

// Cache-first for same-origin GETs. Returns the full cached response even to
// Range requests (the browser handles a 200 to a Range request fine, and the
// duration bar is display-only so no seeking depends on 206s).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
