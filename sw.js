// Sound Board — service worker
// Pre-caches the app shell on install and the audio files on request
// from the page, so the board loads instantly and runs fully offline.

const CACHE = "soundboard-v0.41.0";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./show-data.js",
  "./favicon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Bypass the HTTP cache so a new version never pre-caches stale files.
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
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

// Network-first for same-origin GETs, so a deploy shows up on the next
// load. Falls back to the cache when offline, or when the network takes
// more than 4 s (slow booth wifi). Returns the full cached response even to
// Range requests (the browser handles a 200 to a Range request fine).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
      return res;
    });
    if (!cached) return network;
    const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 4000));
    return Promise.race([network.catch(() => cached), slow]);
  })());
});
