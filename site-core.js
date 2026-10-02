/* Shared, local-only preferences. No analytics network request before opt-in. */
(() => {
    window.fetchWithDeadline = async (input, options = {}, milliseconds = 12000) => {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        let timer;
        try {
            return await Promise.race([
                fetch(input, { ...options, signal: controller?.signal || options.signal }),
                new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('Request timed out')); }, milliseconds); })
            ]);
        } finally { clearTimeout(timer); }
    };
    const preference = key => { try { return localStorage.getItem(key); } catch { return null; } };
    let canPersist = true;
    const backup = key => {
        try {
            const raw = localStorage.getItem(key);
            if (raw && !localStorage.getItem(key + '_recovery_backup')) localStorage.setItem(key + '_recovery_backup', raw);
        } catch { canPersist = false; }
    };
    const readArray = key => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            if (!Array.isArray(value)) { backup(key); return []; }
            return value.filter(item => {
                const valid = item && typeof item === 'object' && !Array.isArray(item) && /^\d+$/.test(String(item.id)) && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0 && ['movie','tv'].includes(item.media_type || item.type || 'movie');
                if (!valid) backup(key);
                else if (item.poster != null && typeof item.poster !== 'string' || item.poster_path != null && typeof item.poster_path !== 'string') backup(key);
                return valid;
            });
        } catch { backup(key); return []; }
    };
    window.Watchlist = {
        read() {
            canPersist = true;
            const items = [...readArray('streamflix_my_list'), ...readArray('watchlist')];
            const unique = new Map();
            for (const item of items) {
                const type = item.media_type || item.type || 'movie';
                const poster = typeof item.poster === 'string' ? item.poster : '';
                const posterPath = typeof item.poster_path === 'string' ? item.poster_path : poster.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/, '');
                if (item.poster != null && typeof item.poster !== 'string' || item.poster_path != null && typeof item.poster_path !== 'string') backup('streamflix_my_list');
                unique.set(`${type}:${Number(item.id)}`, { ...item, id:Number(item.id), title:typeof item.title==='string'?item.title:typeof item.name==='string'?item.name:'Untitled', name:typeof item.name==='string'?item.name:typeof item.title==='string'?item.title:'Untitled', media_type: type, type, poster, poster_path: posterPath });
            }
            const list = [...unique.values()];
            if (canPersist) try { localStorage.setItem('streamflix_my_list', JSON.stringify(list)); localStorage.removeItem('watchlist'); } catch { /* original data preserved when storage is disabled */ }
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
