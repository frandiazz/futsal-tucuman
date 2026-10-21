/* ==========================================================================
   FUTSAL TUCUMÁN — SERVICE WORKER
   Offline-first for assets, network-first for API, background sync for forms
   ========================================================================== */

const CACHE_NAME = 'futsal-tucuman-v1';
const ASSETS_CACHE = 'futsal-assets-v1';
const API_CACHE = 'futsal-api-v1';
const OFFLINE_QUEUE_KEY = 'futsal_offline_queue';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/css/tokens.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/pages.css',
  '/js/app.js',
  '/js/api.js',
  '/js/router.js',
  '/js/state.js',
  '/js/components/index.js',
  '/js/views/HomeView.js',
  '/js/views/TablesView.js',
  '/js/views/ResultsView.js',
  '/js/views/SelectionView.js',
  '/js/views/VenuesView.js',
  '/js/views/LoginView.js',
  '/manifest.json',
  '/images/favicon.svg',
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Cache first - for static assets
  cacheFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return new Response('Offline', { status: 503 });
    }
  },
  
  // Network first - for API calls
  networkFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      return new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  
  // Stale while revalidate - for HTML pages
  staleWhileRevalidate: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    
    return cached || fetchPromise;
  },
};

// Install - precache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => ![CACHE_NAME, ASSETS_CACHE, API_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - route requests to appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip cross-origin
  if (url.origin !== location.origin) return;
  
  // API calls - network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(CACHE_STRATEGIES.networkFirst(request, API_CACHE));
    return;
  }
  
  // Static assets - cache first
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'font' ||
      request.destination === 'image') {
    event.respondWith(CACHE_STRATEGIES.cacheFirst(request, ASSETS_CACHE));
    return;
  }
  
  // HTML pages - stale while revalidate
  if (request.destination === 'document' || 
      request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(CACHE_STRATEGIES.staleWhileRevalidate(request, CACHE_NAME));
    return;
  }
  
  // Default - network first
  event.respondWith(CACHE_STRATEGIES.networkFirst(request, CACHE_NAME));
});

// Background Sync - for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'futsal-offline-sync') {
    event.waitUntil(syncOfflineQueue());
  }
});

// Push notifications (future)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.url ? { url: data.url } : {},
    actions: data.actions || [],
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action) {
    // Handle action buttons
    return;
  }
  
  // Default click - open app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
  );
});

// ────────────────────────────────────────────────────────────────────────
// OFFLINE QUEUE SYNC
// ────────────────────────────────────────────────────────────────────────
async function syncOfflineQueue() {
  try {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    
    // Get offline queue from IndexedDB or localStorage via postMessage
    const clients_list = await self.clients.matchAll();
    for (const client of clients_list) {
      client.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'QUEUE_OFFLINE_ACTION') {
    // Store in IndexedDB for background sync
    storeOfflineAction(event.data.payload);
    
    // Register background sync
    self.registration.sync.register('futsal-offline-sync').catch(() => {});
  }
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function storeOfflineAction(payload) {
  // In a real implementation, use IndexedDB
  // For now, we'll rely on localStorage in main thread
  console.log('Offline action queued:', payload);
}

// ────────────────────────────────────────────────────────────────────────
// PERIODIC BACKGROUND SYNC (if supported)
// ────────────────────────────────────────────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'futsal-periodic-sync') {
    event.waitUntil(syncOfflineQueue());
  }
});