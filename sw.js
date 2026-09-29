const CACHE_NAME = 'streamflix-v8';
const STATIC_ASSETS = [
    '/styles.css',
    '/app.js',
    '/detail.css',
    '/detail.js',
    '/favicon.svg',
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

// Minimal IndexedDB helpers inside SW (similar to scripts/idb-helper.js)
function swOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('streamflix-db', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('watchlist')) db.createObjectStore('watchlist', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function swGetAll(storeName) {
    const db = await swOpenDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readonly');
        const rq = tx.objectStore(storeName).getAll();
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    }); 
}

async function swDeleteKey(storeName, key) {
    const db = await swOpenDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
    });
}

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-watchlist') {
        event.waitUntil((async () => {
            try {
                const out = await swGetAll('outbox');
                if (!out || !out.length) return;
                for (const entry of out) {
                    try {
                        await fetch('/api/sync-watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
                        // delete entry by its key - in getAll we don't get keys, so clear whole outbox after success
                    } catch (e) { /* leave for next sync */ }
                }
                // clear outbox
                const db = await swOpenDB();
                const tx = db.transaction('outbox', 'readwrite');
                tx.objectStore('outbox').clear();
            } catch (e) { }
        })());
    }
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
    }).catch(() => { });

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
