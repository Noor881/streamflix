const CACHE_NAME = 'streamflix-v4';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/favicon.jpeg',
    '/manifest.json'
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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.origin === 'https://image.tmdb.org') {
        event.respondWith(cacheFirst(event.request, 'streamflix-images'));
        return;
    }

    if (url.origin === 'https://api.themoviedb.org') {
        event.respondWith(networkFirst(event.request, 'streamflix-api', 300));
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request, CACHE_NAME, 3000));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(event.request, CACHE_NAME));
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
            const fallback = await cache.match('/');
            if (fallback) return fallback;
        }

        return new Response('Offline', { status: 503 });
    }
}
