const test = require('node:test');
const assert = require('node:assert/strict');
const render = require('../api/render.js');

function fixture(type = 'movie') {
    return {id: 550, [type === 'movie' ? 'title' : 'name']: 'Example Title', overview: 'An example synopsis.',
        [type === 'movie' ? 'release_date' : 'first_air_date']: '2020-01-02', genres: [], credits: {cast: [], crew: []},
        recommendations: {results: []}, seasons: [{season_number: 1, episode_count: 2}]};
}
async function responseFor(data, type = 'movie', id = '550-example-title') {
    const original = global.fetch;
    let calls = 0;
    global.fetch = async () => {calls++; return {ok: true, status: 200, json: async () => data};};
    const result = {statusCode: 200, headers: {}, html: '', setHeader(key, value) {this.headers[key.toLowerCase()] = value;}, end(html) {this.html = String(html || '');}};
    try {await render({url: '/' + type + '/' + id, query: {route: type === 'movie' ? 'movie' : 'show', id}}, result);}
    finally {global.fetch = original;}
    return {...result, calls};
}
function unavailable(result) {
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers['retry-after'], '60');
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
    assert.ok(!result.headers.location, 'bad upstream metadata cannot redirect to another identity');
    assert.ok(!result.html.includes('initial-title-data'));
    assert.ok(!result.html.includes('application/ld+json'));
}

test('detail SSR rejects malformed or mismatched upstream title identifiers before canonical redirects', async () => {
    for (const type of ['movie', 'tv']) {
        for (const data of [null, undefined, [], [fixture(type)], 'Invalid metadata']) unavailable(await responseFor(data, type));
        for (const id of [551, '550', '550?query=1', 0, -550, 550.5, Number.MAX_SAFE_INTEGER + 1]) {
            unavailable(await responseFor({...fixture(type), id}, type));
        }
    }
});

test('leading-zero aliases of the removed movie retain the 410 exclusion without metadata requests', async () => {
    for (const id of ['928480', '000928480', '000928480-old-title']) {
        const result = await responseFor({...fixture(), id: 928480}, 'movie', id);
        assert.equal(result.statusCode, 410);
        assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
        assert.equal(result.calls, 0);
        assert.ok(!result.headers.location);
    }
});

test('detail SSR requires the non-empty movie title or TV name appropriate to the requested media type', async () => {
    for (const type of ['movie', 'tv']) {
        const key = type === 'movie' ? 'title' : 'name';
        for (const value of [undefined, null, '', '   ', 2026, {}, []]) {
            unavailable(await responseFor({...fixture(type), [key]: value, [type === 'movie' ? 'name' : 'title']: 'Wrong media field'}, type));
        }
        unavailable(await responseFor({...fixture(type), media_type: type === 'movie' ? 'tv' : 'movie'}, type));
    }
});

test('non-text overview and date metadata return controlled retryable errors rather than escaping the handler', async () => {
    for (const type of ['movie', 'tv']) {
        const dateKey = type === 'movie' ? 'release_date' : 'first_air_date';
        for (const value of [2026, {}, []]) {
            unavailable(await responseFor({...fixture(type), overview: value}, type));
            unavailable(await responseFor({...fixture(type), [dateKey]: value}, type));
        }
    }
});

test('legitimate missing optional text and date fields still render the correct title and canonical', async () => {
    for (const type of ['movie', 'tv']) {
        const dateKey = type === 'movie' ? 'release_date' : 'first_air_date';
        for (const missing of [undefined, null, '']) {
            const result = await responseFor({...fixture(type), overview: missing, [dateKey]: missing}, type);
            assert.equal(result.statusCode, 200);
            assert.ok(result.html.includes('href="https://hdwatchzone.com/' + type + '/550-example-title"'));
            assert.ok(result.html.includes('<h1'));
            assert.ok(result.html.includes('Example Title'));
        }
        const leadingZero = await responseFor(fixture(type), type, '000550');
        assert.equal(leadingZero.statusCode, 301);
        assert.equal(leadingZero.headers.location, '/' + type + '/550-example-title');
    }
});

test('impossible numeric detail identifiers return non-indexable 404 without requesting metadata', async () => {
    for (const type of ['movie', 'tv']) {
        for (const id of ['0', '0000', '9007199254740992', '999999999999999999999999999999999999']) {
            const result = await responseFor(fixture(type), type, id);
            assert.equal(result.statusCode, 404);
            assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
            assert.equal(result.calls, 0);
        }
    }
});
