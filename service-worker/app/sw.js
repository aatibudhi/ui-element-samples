const VERSION = 'v1';

importScripts('/node_modules/dot/doT.min.js');
doT.templateSettings.strip = false;

self.addEventListener('install', event => {
  event.waitUntil(async function () {
    const cache = await caches.open(`static-${VERSION}`);
    await cache.addAll([
      '/favicon.ico',
      '/static/app.js',
      '/static/sc-view.js',
      '/static/sc-router.js',
      '/static/superstyles.css',
      '/static/images/spinner.png',
      '/header.partial.html',
      '/footer.partial.html'
    ]);
    return self.skipWaiting();
  }());
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

  event.respondWith(async function() {
    const resp = await cacheThenFetch;
    return resp.clone();
  }());

  event.waitUntil(async function() {
    const cachedResp = await cachedVersion;
    if (cachedResp) {
      return;
    }
    const cache = await caches.open(cachename);
    const response = await cacheThenFetch;
    return cache.put(event.request, response);
  }());
}

function staleWhileRevalidate(event, cachename) {
  const cachedVersion = caches.match(event.request);
  const fetchedVersion = fetch(event.request);
  const fetchedCopy = fetchedVersion.then(resp => resp.clone());

  event.respondWith(async function() {
    try {
      const response = await Promise.race([cachedVersion, fetchedVersion.catch(_ => cachedVersion)]);
      if (response) {
        return response;
      }
      return await fetchedVersion;
    } catch (e) {
      return new Response(null, {status: 404});
    }
  }());

  event.waitUntil(async function() {
    try {
      const response = await fetchedCopy;
      const cache = await caches.open(cachename);
      return cache.put(event.request, response);
    } catch (e) {/* eat errors*/}
  }());
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

  event.respondWith(async function() {
    const files = await Promise.all([
      isPartial || caches.match('/header.partial.html'),
      staleWhileRevalidateWrapper(URLcpy.toString(), `dynamic-${VERSION}`, event.waitUntil),
      isPartial || caches.match('/footer.partial.html')
    ]);
    const contents = await Promise.all(files.filter(f => f !== true).map(f => f.text()));
    const template = contents.join('');
    const data = doT.template(template)(event.request);
    return new Response(data, {headers: {'Content-Type': 'text/html'}});
  }());
}
