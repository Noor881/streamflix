/* Shared, local-only preferences. No analytics network request before opt-in. */
(() => {
    const preference = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const readArray = key => {
        try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
        catch { return []; }
    };
    window.Watchlist = {
        read() {
            const items = [...readArray('streamflix_my_list'), ...readArray('watchlist')];
            const unique = new Map();
            for (const item of items) {
                const type = item.media_type || item.type || 'movie';
                unique.set(`${type}:${item.id}`, { ...item, media_type: type, type, poster_path: item.poster_path || (item.poster || '').replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/, '') });
            }
            const list = [...unique.values()];
            try { localStorage.setItem('streamflix_my_list', JSON.stringify(list)); localStorage.removeItem('watchlist'); } catch { /* storage disabled */ }
            return list;
        }
    };
    window.Watchlist.read();
    window.Watchlist.ready = (async () => {
        // Preserve former IndexedDB watchlists without enabling remote synchronization.
        if (!window.indexedDB || preference('watchlist_idb_migrated') === 'true') return;
        try {
            if (indexedDB.databases && !(await indexedDB.databases()).some(db => db.name === 'streamflix-db')) return;
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('streamflix-db');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            if (db.objectStoreNames.contains('watchlist')) {
                const items = await new Promise((resolve,reject) => {
                    const request = db.transaction('watchlist','readonly').objectStore('watchlist').getAll();
                    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
                });
                localStorage.setItem('watchlist', JSON.stringify(items));
                window.Watchlist.read();
            }
            db.close();
            localStorage.setItem('watchlist_idb_migrated', 'true');
        } catch { /* Existing IndexedDB data is never removed on migration failure. */ }
    })();
    let loaded = false;
    function enableAnalytics() {
        if (loaded) return;
        loaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', 'G-ZHQKVYP1WN', { anonymize_ip: true });
        const script = document.createElement('script');
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-ZHQKVYP1WN';
        script.async = true;
        document.head.appendChild(script);
    }
    window.AnalyticsConsent = {
        set(enabled) {
            try { localStorage.setItem('analytics_consent', String(enabled)); } catch { /* Session-only preference if storage is unavailable. */ }
            window['ga-disable-G-ZHQKVYP1WN'] = !enabled;
            if (enabled) enableAnalytics();
            else {
                for (const cookie of document.cookie.split(';')) {
                    const name = cookie.split('=')[0].trim();
                    if (name.startsWith('_ga') || name.startsWith('_gid')) {
                        for (const domain of ['', location.hostname, '.' + location.hostname]) document.cookie = `${name}=; Max-Age=0; path=/${domain ? '; domain=' + domain : ''}`;
                    }
                }
            }
        }
    };
    window['ga-disable-G-ZHQKVYP1WN'] = preference('analytics_consent') !== 'true';
    if (!window['ga-disable-G-ZHQKVYP1WN']) enableAnalytics();
})();
