// Atmos service worker: makes the dashboard installable and lets its shell open offline.
// Live data (weather, storms, river levels) is never cached here, so it is always fresh or absent.
// Bump VERSION when the list of shell files changes.
const VERSION = 'atmos-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png', './icon-192.png', './icon-512.png'];
const LIBRARIES = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
const STATIC_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(async cache => {
    await cache.addAll(SHELL);
    // Libraries are a bonus: a failure here must not block installation.
    await Promise.all(LIBRARIES.map(url => cache.add(url).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The app's own files: network first so a newly published version shows up straight away,
  // falling back to the saved copy when offline. The local helper's /ffws relay is live data, so skip it.
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/ffws')) return;
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }

  // Versioned libraries and fonts: saved copy first, network as a fallback.
  if (STATIC_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    })));
  }
  // Everything else (forecast, storm and map requests) goes straight to the network.
});
