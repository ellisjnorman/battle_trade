// Battle Trade Service Worker — offline support for IRL events
// Versioned cache names; bump version to bust caches on deploy

const STATIC_CACHE = 'bt-static-v1';
const API_CACHE = 'bt-api-v1';

const STATIC_URLS = [
  '/',
  '/dashboard',
  '/login',
  '/brand/logo-main.png',
  '/brand/logo-icon.png',
  '/brand/logo-stacked.png',
  '/brand/logo-variant.png',
  '/brand/favicon.png',
];

// ---------------------------------------------------------------------------
// Install: pre-cache static shell assets
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_URLS).catch((err) => {
        // In dev some routes may 404 — don't block install
        console.warn('[SW] pre-cache partial failure', err);
      });
    })
  );
  // Activate immediately instead of waiting for open tabs to close
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate: purge old versioned caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  const KNOWN_CACHES = new Set([STATIC_CACHE, API_CACHE]);

  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => !KNOWN_CACHES.has(name))
          .map((name) => {
            console.log('[SW] deleting old cache', name);
            return caches.delete(name);
          })
      )
    )
  );
  // Claim all open clients so they use this SW immediately
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch: strategy depends on request type
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests — they can't be cached.
  // Instead, let them pass through; the client-side offline queue handles
  // POST/PUT/DELETE when the network is unavailable.
  if (request.method !== 'GET') return;

  // ----- API calls: network-first, fall back to cache -----
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // ----- Static assets: cache-first, update in background -----
  event.respondWith(cacheFirstWithRefresh(request));
});

// ---------------------------------------------------------------------------
// Network-first strategy (API calls, price data)
// ---------------------------------------------------------------------------
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);

    // Only cache successful GET responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      // Clone — response body can only be consumed once
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (_err) {
    // Network failed — try the cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Tag the response so the client knows it came from cache
      return cachedResponse;
    }

    // Nothing in cache either — return a minimal offline JSON response
    // so fetch() doesn't reject and callers can degrade gracefully
    return new Response(
      JSON.stringify({ offline: true, error: 'No network and no cached data' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Cache-first with background refresh (static assets)
// ---------------------------------------------------------------------------
async function cacheFirstWithRefresh(request) {
  const cachedResponse = await caches.match(request);

  // Fire-and-forget: update the cache in the background
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        caches.open(STATIC_CACHE).then((cache) => {
          cache.put(request, networkResponse);
        });
      }
      return networkResponse.clone();
    })
    .catch(() => null);

  if (cachedResponse) {
    // Serve from cache immediately; background fetch will refresh it
    // We don't await fetchPromise here — it's a stale-while-revalidate pattern
    fetchPromise; // intentionally not awaited
    return cachedResponse;
  }

  // Nothing in cache — wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  // Both cache and network failed — return a basic offline page
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title>' +
      '<style>body{background:#0A0A0A;color:#fff;font-family:system-ui;display:flex;' +
      'align-items:center;justify-content:center;height:100vh;margin:0}' +
      '.box{text-align:center;max-width:360px}.dot{width:12px;height:12px;' +
      'border-radius:50%;background:#F5A0D0;display:inline-block;margin-bottom:16px}' +
      'h1{font-size:24px;margin:0 0 8px}p{color:#888;font-size:14px}</style></head>' +
      '<body><div class="box"><span class="dot"></span>' +
      '<h1>You\'re offline</h1>' +
      '<p>Battle Trade needs a connection. We\'ll reconnect automatically when your signal returns.</p>' +
      '</div></body></html>',
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  );
}

// ---------------------------------------------------------------------------
// Broadcast offline/online status to all clients
// ---------------------------------------------------------------------------
function broadcastStatus(isOnline) {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'BT_CONNECTION_STATUS',
        online: isOnline,
        timestamp: Date.now(),
      });
    });
  });
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'BT_STATUS_CHECK') {
    // Client is asking for current status — do a quick connectivity check
    fetch('/api/market-data', { method: 'HEAD', cache: 'no-store' })
      .then(() => broadcastStatus(true))
      .catch(() => broadcastStatus(false));
  }

  if (event.data && event.data.type === 'BT_SKIP_WAITING') {
    self.skipWaiting();
  }
});
