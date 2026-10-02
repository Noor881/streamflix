const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ForYou = require('../for-you.js');

function seed(id, type = 'movie', extra = {}) { return { id, type, title: `Seed ${id}`, ...extra }; }
function item(id, extra = {}) { return { id, title: `Title ${id}`, vote_average: 8, poster_path: '/poster.jpg', ...extra }; }

test('For You has a browser UMD export without reading storage', async () => {
    const context = { window: {}, localStorage: { getItem() { throw new Error('Storage must not be read'); }, setItem() { throw new Error('Storage must not be changed'); } } };
    vm.runInNewContext(fs.readFileSync('for-you.js', 'utf8'), context);
    assert.equal(typeof context.window.ForYou.load, 'function');
    const result = await context.window.ForYou.load({});
    assert.equal(result.emptyReason, 'new-user');
});

test('new users and corrupt seed inputs trigger no metadata requests', async () => {
    let requests = 0;
    const fetcher = async () => { requests++; return { results: [] }; };
    const result = await ForYou.load({ saved: [null, [], {}, seed(0), seed(-1), seed('1.5'), seed(Number.MAX_SAFE_INTEGER + 1), seed(true), seed(2, 'person'), seed(2, 'movie', { title: {} }), seed(2, 'movie', { title: ' ' }), seed(2, 'movie', { adult: true }), seed(2, 'movie', { media_type: 'tv' })], history: { id: 4 }, fetcher });
    assert.equal(requests, 0);
    assert.equal(result.seedCount, 0);
    assert.equal(result.emptyReason, 'new-user');
    assert.equal((await ForYou.load(null)).emptyReason, 'new-user');
});

test('at most three unique recent seeds make one request each and no inputs mutate', async () => {
    const calls = [];
    const history = [seed(1, 'movie', { savedAt: 100 }), seed(2, 'tv', { savedAt: 400 }), seed(1, 'movie', { savedAt: 500 })];
    const saved = [seed(3, 'movie', { savedAt: 300 }), seed(4, 'movie', { savedAt: 200 })];
    const snapshot = JSON.stringify({ history, saved });
    const result = await ForYou.load({ history, saved, fetcher: async (endpoint, params) => { calls.push({ endpoint, params }); return { results: [] }; } });
    assert.deepEqual(result.seeds.map(value => `${value.type}:${value.id}`), ['movie:1', 'tv:2', 'movie:3']);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], { endpoint: '/movie/1/recommendations', params: { page: 1, language: 'en-US' } });
    assert.equal(JSON.stringify({ history, saved }), snapshot);
});

test('same numeric movie and TV IDs remain distinct in seeds and recommendations', async () => {
    const result = await ForYou.load({ saved: [seed('10'), seed(10, 'tv')], fetcher: async endpoint => ({ results: [item(20, endpoint.startsWith('/tv/') ? { name: 'TV Twenty', title: undefined } : {})] }) });
    assert.equal(result.seedCount, 2);
    assert.deepEqual(result.recommendations.map(value => `${value.media_type}:${value.id}`), ['movie:20', 'tv:20']);
    assert.equal(result.recommendations[1].name, 'TV Twenty');
});

test('fair deterministic interleaving excludes every saved and history title', async () => {
    const result = await ForYou.load({ history: [seed(1), seed(2), seed(3), seed(4)], saved: [seed(5)], fetcher: async endpoint => ({ results: endpoint.includes('/1/') ? [item(4), item(5), item(10), item(11), item(12)] : endpoint.includes('/2/') ? [item(10), item(20), item(21)] : [item(30), item(31)] }) });
    assert.deepEqual(result.recommendations.map(value => value.id), [10, 20, 30, 11, 21, 31, 12]);
    assert.equal(result.recommendations[0].reason, 'Because you saved or viewed Seed 1');
    assert.deepEqual(result.recommendations[0].reasonSeed, { id: 1, type: 'movie', title: 'Seed 1' });
});

test('adult, person, conflicting media types and malformed recommendations are excluded', async () => {
    const result = await ForYou.load({ saved: [seed(1)], fetcher: async () => ({ results: [null, [], {}, item(0), item(true), item(Number.MAX_SAFE_INTEGER + 1), item(2, { adult: true }), item(3, { media_type: 'person' }), item(4, { media_type: 'tv' }), item(5, { title: {} }), item(6, { title: '' }), item(928480), item(8)] }) });
    assert.deepEqual(result.recommendations.map(value => value.id), [8]);
});

test('recommendations normalize unsafe fields without creating HTML or external image URLs', async () => {
    const hostileTitle = '<img src=x onerror=alert(1)>';
    const result = await ForYou.load({ saved: [seed(1, 'movie', { title: hostileTitle })], fetcher: async () => ({ results: [item(2, { title: '  A\u0000B  ', poster_path: 'https://example.com/a.jpg', backdrop_path: '/../a.jpg', vote_average: '9.8', genre_ids: [28, 28, -1, '35', null], release_date: '<script>', overview: {} })] }) });
    const value = result.recommendations[0];
    assert.equal(value.title, 'A B');
    assert.equal(value.poster_path, null);
    assert.equal(value.backdrop_path, null);
    assert.equal(value.vote_average, 0);
    assert.deepEqual(value.genre_ids, [28]);
    assert.equal(value.release_date, '');
    assert.equal(value.overview, '');
    assert.equal(value.reason, `Because you saved or viewed ${hostileTitle}`); // Plain text; renderer must escape.
});

test('request errors, invalid payloads and missing fetcher return safe outage states', async () => {
    const partial = await ForYou.load({ saved: [seed(1), seed(2), seed(3)], fetcher: async endpoint => { if (endpoint.includes('/1/')) return { results: [item(20)] }; if (endpoint.includes('/2/')) throw new Error('https://example.com/?api_key=private'); return { results: null }; } });
    assert.equal(partial.failures, 2);
    assert.equal(partial.partial, true);
    assert.equal(partial.emptyReason, null);
    assert.equal(JSON.stringify(partial).includes('api_key'), false);
    const unavailable = await ForYou.load({ saved: [seed(1), seed(2)] });
    assert.equal(unavailable.failures, 2);
    assert.equal(unavailable.partial, false);
    assert.equal(unavailable.emptyReason, 'unavailable');
    const noResults = await ForYou.load({ saved: [seed(1)], fetcher: async () => ({ results: [] }) });
    assert.equal(noResults.emptyReason, 'no-results');
    assert.equal(noResults.failures, 0);
});

test('request concurrency does not alter ordering and recommendations never exceed twenty', async () => {
    const result = await ForYou.load({ saved: [seed(1), seed(2), seed(3)], limit: 100, fetcher: async endpoint => { const id = Number(endpoint.split('/')[2]); await new Promise(resolve => setTimeout(resolve, (4 - id) * 5)); return { results: Array.from({ length: 50 }, (_, index) => item(id * 100 + index)) }; } });
    assert.equal(result.recommendations.length, 20);
    assert.deepEqual(result.recommendations.slice(0, 6).map(value => value.id), [100, 200, 300, 101, 201, 301]);
    const short = await ForYou.load({ saved: [seed(1)], limit: 2, fetcher: async () => ({ results: [item(2), item(3), item(4)] }) });
    assert.equal(short.recommendations.length, 2);
});
