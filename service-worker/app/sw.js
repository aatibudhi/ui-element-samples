const VERSION = 'v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(`static-${VERSION}`)
      .then(caches =>
        caches.addAll([
          '/favicon.ico',
          '/static/app.js',
          '/static/sc-view.js',
          '/static/sc-router.js',
          '/static/superstyles.css',
          '/static/images/spinner.png'
        ])
      )
      .then(_ => self.skipWaiting())
  );
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  event.request.parsedUrl = new URL(event.request.url);
  if (event.request.parsedUrl.pathname.startsWith('/static/')) {
    return cacheFirst(event, `static-${VERSION}`);
  }
  return staleWhileRevalidate(event, `dynamic-${VERSION}`);
});

function cacheFirst(event, cachename) {
  const cachedVersion = caches.match(event.request);
  const cacheThenFetch = cachedVersion.then(resp => resp || fetch(event.request));

  event.respondWith(cacheThenFetch.then(resp => resp.clone()));

  event.waitUntil(
    cachedVersion.then(resp =>
      resp || Promise.all([cacheThenFetch, caches.open(cachename)])
        .then(([response, cache]) => cache.put(event.request, response))
    )
  );
}

function staleWhileRevalidate(event, cachename) {
  const cachedVersion = caches.match(event.request);
  const fetchedVersion = fetch(event.request);
  const fetchedCopy = fetchedVersion.then(resp => resp.clone());

  event.respondWith(
    Promise.race([cachedVersion, fetchedVersion.catch(_ => cachedVersion)])
      .then(response => response || fetchedVersion)
      .catch(_ => new Response(null, {status: 404}))
  );

  event.waitUntil(
    Promise.all([fetchedCopy, caches.open(cachename)])
      .then(([response, cache]) => cache.put(event.request, response))
      .catch(_ => {/* eat errors*/})
  );
}
