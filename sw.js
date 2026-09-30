const CACHE_NAME = 'streamflix-v14';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline.html', '/logo-v2.webp'])).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const key of await caches.keys()) if (/^streamflix-v/.test(key) && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
})()));
async function networkFirst(request, name) {
    const cache = await caches.open(name);
    try {
        const response = await fetch(request, { signal: AbortSignal.timeout(12000) });
        if (response.status >= 500) throw new Error('Service unavailable');
        // Cross-origin image requests can be opaque (status 0); they are valid browser responses.
        if (!response.ok && response.type !== 'opaque') return response;
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        for (const key of keys.slice(0, Math.max(0, keys.length - 100))) await cache.delete(key);
        return response;
    } catch {
        return await cache.match(request) || (request.mode === 'navigate' && await caches.match('/offline.html')) || new Response('Offline', { status: 503 });
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
