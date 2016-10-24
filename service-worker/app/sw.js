const VERSION = 'v1';

importScripts('/node_modules/dot/doT.min.js');
doT.templateSettings.strip = false;

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
          '/static/images/spinner.png',
          '/header.partial.html',
          '/footer.partial.html'
        ])
      )
      .then(_ => self.skipWaiting())
  );
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

const toplevelSection = /([^/]*)(\/|\/index.html)$/;

self.addEventListener('fetch', event => {
  event.request.parsedUrl = new URL(event.request.url);
  const matches = toplevelSection.exec(event.request.parsedUrl.pathname);
  if (matches) {
    event.request.item = matches[1];
    return buildPage(event);
  }
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

function staleWhileRevalidateWrapper(path, cachename, waitUntil) {
  return new Promise(resolve => {
    staleWhileRevalidate({
      request: path,
      respondWith: resolve,
      waitUntil
    }, cachename);
  });
}

function buildPage(event) {
  const isPartial = event.request.parsedUrl.searchParams.get('partial') === '';
  const URLcpy = new URL(event.request.parsedUrl);
  URLcpy.searchParams.set('partial', '');

  event.respondWith(
    Promise.all([
      isPartial || caches.match('/header.partial.html'),
      staleWhileRevalidateWrapper(URLcpy.toString(), `dynamic-${VERSION}`, event.waitUntil),
      isPartial || caches.match('/footer.partial.html')
    ])
    .then(files => Promise.all(files.filter(f => f !== true).map(f => f.text())))
    .then(contents => {
      const template = contents.join('');
      const data = doT.template(template)(event.request);
      return new Response(data, {headers: {'Content-Type': 'text/html'}});
    })
  );
}
