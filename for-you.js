/* Local-only recommendation inputs. This module never reads or changes storage. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ForYou = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const MAX_SEEDS = 3;
    const MAX_RESULTS = 20;
    const MAX_SOURCE_RESULTS = 100;

    function identifier(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (!/^\d+$/.test(String(value))) return null;
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    function text(value, maximum) {
        if (typeof value !== 'string') return '';
        return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
    }

    function mediaType(record, fallback) {
        const explicit = record.media_type || record.type;
        if (record.media_type && record.type && record.media_type !== record.type) return null;
        const type = explicit || fallback;
        return type === 'movie' || type === 'tv' ? type : null;
    }

    function titleFor(record, type) {
        return text(type === 'tv' ? record.name || record.title : record.title || record.name, 300);
    }

    function normalizeSeed(record, order) {
        if (!record || typeof record !== 'object' || Array.isArray(record) || record.adult === true) return null;
        const id = identifier(record.id);
        const type = mediaType(record);
        if (!id || !type || (type === 'movie' && id === 928480)) return null;
        const title = titleFor(record, type);
        if (!title) return null;
        const timestamps = [record.viewedAt, record.savedAt, record.timestamp].filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
        return { id, type, title, order, recentAt: timestamps.length ? Math.max(...timestamps) : 0 };
    }

    function imagePath(value) {
        return typeof value === 'string' && /^\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(value) ? value : null;
    }

    function date(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    }

    function normalizeRecommendation(record, seed) {
        if (!record || typeof record !== 'object' || Array.isArray(record) || record.adult === true) return null;
        const id = identifier(record.id);
        const type = mediaType(record, seed.type);
        // Recommendation endpoints return one media kind; conflicting rows are not trusted.
        if (!id || !type || type !== seed.type || (type === 'movie' && id === 928480)) return null;
        const title = titleFor(record, type);
        if (!title) return null;
        const rating = typeof record.vote_average === 'number' && Number.isFinite(record.vote_average) && record.vote_average >= 0 && record.vote_average <= 10 ? record.vote_average : 0;
        const genreIds = Array.isArray(record.genre_ids) ? [...new Set(record.genre_ids.filter(value => Number.isSafeInteger(value) && value > 0))].slice(0, 20) : [];
        return {
            id, type, media_type: type, title, name: title,
            poster_path: imagePath(record.poster_path),
            backdrop_path: imagePath(record.backdrop_path),
            release_date: date(record.release_date),
            first_air_date: date(record.first_air_date),
            vote_average: rating,
            genre_ids: genreIds,
            overview: text(record.overview, 1000),
            reason: `Because you saved or viewed ${seed.title}`,
            reasonSeed: { id: seed.id, type: seed.type, title: seed.title }
        };
    }

    async function load(options = {}) {
        const input = options && typeof options === 'object' ? options : {};
        const history = Array.isArray(input.history) ? input.history : [];
        const saved = Array.isArray(input.saved) ? input.saved : [];
        const limit = Number.isInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, MAX_RESULTS) : MAX_RESULTS;
        const records = [...history, ...saved].map(normalizeSeed).filter(Boolean);
        records.sort((left, right) => right.recentAt - left.recentAt || left.order - right.order);
        const excluded = new Set(records.map(record => `${record.type}:${record.id}`));
        const unique = new Map();
        for (const record of records) {
            const key = `${record.type}:${record.id}`;
            if (!unique.has(key)) unique.set(key, record);
        }
        const seeds = [...unique.values()].slice(0, MAX_SEEDS).map(({ id, type, title }) => ({ id, type, title }));
        const base = { recommendations: [], seeds, seedCount: seeds.length, failures: 0, partial: false, emptyReason: null };
        if (!seeds.length) return { ...base, emptyReason: 'new-user' };

        const results = await Promise.all(seeds.map(async seed => {
            try {
                if (typeof input.fetcher !== 'function') throw new Error('Recommendations unavailable');
                const data = await input.fetcher(`/${seed.type}/${seed.id}/recommendations`, { page: 1, language: 'en-US' });
                if (!data || typeof data !== 'object' || !Array.isArray(data.results)) throw new Error('Recommendations unavailable');
                const sourceSeen = new Set();
                const items = [];
                for (const record of data.results.slice(0, MAX_SOURCE_RESULTS)) {
                    const item = normalizeRecommendation(record, seed);
                    if (!item) continue;
                    const key = `${item.type}:${item.id}`;
                    if (excluded.has(key) || sourceSeen.has(key)) continue;
                    sourceSeen.add(key);
                    items.push(item);
                }
                return { items, failed: false };
            } catch {
                // Do not propagate/log upstream URLs, credentials, or private seed records.
                return { items: [], failed: true };
            }
        }));

        const failures = results.filter(result => result.failed).length;
        const merged = [];
        const seen = new Set();
        const pointers = results.map(() => 0);
        // Round-robin sources, including a fresh source after duplicate candidates.
        while (merged.length < limit) {
            let added = false;
            for (let source = 0; source < results.length && merged.length < limit; source++) {
                const items = results[source].items;
                while (pointers[source] < items.length) {
                    const item = items[pointers[source]++];
                    const key = `${item.type}:${item.id}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    merged.push(item);
                    added = true;
                    break;
                }
            }
            if (!added) break;
        }

        return {
            ...base,
            recommendations: merged,
            failures,
            partial: failures > 0 && failures < seeds.length,
            emptyReason: merged.length ? null : failures === seeds.length ? 'unavailable' : 'no-results'
        };
    }

    return Object.freeze({ load });
});
