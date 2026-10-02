const CACHE_NAME = 'streamflix-v19';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline.html', '/logo-v2.webp'])).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
    try { for (const key of await caches.keys()) if (/^streamflix-v/.test(key) && key !== CACHE_NAME) await caches.delete(key); } catch { /* cache access is optional */ }
    await self.clients.claim();
})()));
async function networkFirst(request, name) {
    let timer;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
        const response = await Promise.race([
            fetch(request, { signal: controller?.signal }),
            new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('Request timed out')); }, 12000); })
        ]);
        clearTimeout(timer);
        if (response.status >= 500) throw new Error('Service unavailable');
        // Cross-origin image requests can be opaque (status 0); they are valid browser responses.
        if (!response.ok && response.type !== 'opaque') return response;
        const policy = response.headers?.get('cache-control') || '';
        if (!/private|no-store/i.test(policy)) try {
            const cache = await caches.open(name);
            await cache.put(request, response.clone());
            const keys = await cache.keys();
            for (const key of keys.slice(0, Math.max(0, keys.length - 100))) await cache.delete(key);
        } catch { /* A full/blocked cache must not discard a successful online response. */ }
        return response;
    } catch {
        clearTimeout(timer);
        try {
            const cache = await caches.open(name);
            const saved = await cache.match(request);
            if (saved) return saved;
            if (request.mode === 'navigate') { const offline = await caches.match('/offline.html'); if (offline) return offline; }
        } catch { /* blocked cache */ }
        return new Response('Offline', { status: 503 });
    }
}
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin === 'https://api.themoviedb.org') event.respondWith(networkFirst(event.request, 'streamflix-api'));
    else if (url.origin === 'https://image.tmdb.org') event.respondWith(networkFirst(event.request, 'streamflix-images'));
    else if (url.origin === self.location.origin) event.respondWith(networkFirst(event.request, CACHE_NAME));
});
// Local-only watchlists: do not call a nonexistent sync endpoint or discard legacy queued data.
