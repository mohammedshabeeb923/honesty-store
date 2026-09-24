const CACHE_NAME = 'honesty-store-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/customer.css',
  '/css/admin.css',
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
            console.log('[PWA SW] Clearing old cache:', key);
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

  // Network-first for JS and HTML so users immediately get app updates
  const isCodeAsset = event.request.url.endsWith('.js') || 
                      event.request.url.endsWith('.html') || 
                      event.request.url.endsWith('/') ||
                      event.request.url.includes('.js?');

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request).then((fresh) => {
        if (fresh && fresh.status === 200) {
          const freshClone = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, freshClone));
        }
        return fresh;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for images and fonts
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((fresh) => {
        if (fresh && fresh.status === 200) {
          const freshClone = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, freshClone));
        }
        return fresh;
      });
    })
  );
});
