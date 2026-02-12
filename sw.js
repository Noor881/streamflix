const CACHE_NAME = 'streamflix-v4';
const STATIC_ASSETS = [
    '/styles.css',
    '/app.js',
    '/favicon.jpeg',
    '/manifest.json',
    '/offline.html',
    '/consent.js'
];

const CACHE_STRATEGIES = {
    static: 'cache-first',
    api: 'network-first',
    images: 'cache-first'
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Helper: trim cache to max entries
async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    if (requests.length <= maxItems) return;
    const removeCount = requests.length - maxItems;
    for (let i = 0; i < removeCount; i++) {
        await cache.delete(requests[i]);
    }
}

// Stale-While-Revalidate strategy
async function staleWhileRevalidate(request, cacheName, maxEntries = 60) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
            trimCache(cacheName, maxEntries);
        }
        return networkResponse;
    }).catch(()=>{});

    return cached || fetchPromise;
}

// Network-first with timeout
async function networkFirst(request, cacheName, timeout = 500) {
    const cache = await caches.open(cacheName);
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(id);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const fallback = await caches.match('/offline.html');
            if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503 });
    }
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Images (CDN + same-origin images)
    if (url.origin === 'https://image.tmdb.org' || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.avif')) {
        event.respondWith(staleWhileRevalidate(event.request, 'streamflix-images', 200));
        return;
    }

    // API calls - network first
    if (url.origin === 'https://api.themoviedb.org') {
        event.respondWith(networkFirst(event.request, 'streamflix-api', 700));
        return;
    }

    // Navigation requests - prefer network, fallback to offline
    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request, CACHE_NAME, 3000));
        return;
    }

    // Static assets on same-origin - cache first
    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME, 100));
        return;
    }
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName, timeout) {
    const cache = await caches.open(cacheName);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === 'navigate') {
            const fallback = await cache.match('/offline.html');
            if (fallback) return fallback;
        }

        return new Response('Offline', { status: 503 });
    }
}
