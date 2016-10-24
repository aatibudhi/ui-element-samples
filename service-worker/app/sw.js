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

self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));
