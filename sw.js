const CACHE_NAME = 'honesty-store-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/customer.css',
  '/css/admin.css',
  '/js/config.js',
  '/js/store-db.js',
  '/js/auth.js',
  '/js/cashfree-client.js',
  '/js/supabase-client.js',
  '/js/customer-app.js',
  '/js/admin-app.js',
  '/js/app.js',
  '/assets/logo.jpg',
  '/assets/avatar.png',
  '/assets/lays.png',
  '/assets/oreo.png',
  '/assets/parleg.png',
  '/assets/dairymilk.png',
  '/assets/shelf.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and exclude dynamic API / Supabase calls
  if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate for fast rendering
        fetch(event.request).then((fresh) => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, fresh));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});
