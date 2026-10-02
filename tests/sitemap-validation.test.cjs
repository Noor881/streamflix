const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SEO = require('../seo-core.js');
const {titleURL, staticRoutes} = require('../generate-sitemap.js');
const source = fs.readFileSync('generate-sitemap.js', 'utf8');

function harness(responseFor) {
    let previous = '<previous-valid-sitemap />';
    const requests = [], writes = [];
    const context = {
        module: {exports: {}}, console: {log() {}}, AbortSignal,
        require: id => {
            if (id === 'node:fs') return {writeFileSync(path, value) {writes.push(path); previous = value;}};
            if (id === './server/tmdb.js') return {request: (endpoint,params)=>context.fetch(require('../server/tmdb.js').url(endpoint,params))};
            if (id === './discovery-core.js') return require('../discovery-core.js');
            assert.equal(id, './seo-core.js');
            return SEO;
        },
        fetch: async input => {
            const url = new URL(input);
            requests.push({path: url.pathname, page: url.searchParams.get('page')});
            return responseFor(url);
        }
    };
    vm.runInNewContext(source, context);
    return {generate: context.module.exports.generateSitemap, requests, writes, xml: () => previous};
}
function validResponse(url) {
    const movie = /\/movie(?:\/|$)/.test(url.pathname);
    const type = movie ? 'movie' : 'tv';
    return {ok: true, json: async () => ({results: [
        {id: 7, [movie ? 'title' : 'name']: 'A < & "quoted" title', media_type: type},
        {id: 8, [movie ? 'title' : 'name']: '日本語の作品'}
    ]})};
}

test('sitemap title URLs share the rendered canonical policy for valid movie and TV metadata', () => {
    for (const type of ['movie', 'tv']) {
        for (const name of ['A < & "quoted" title', '日本語の作品', '  A -- Title  ']) {
            const item = {id: 7, [type === 'movie' ? 'title' : 'name']: name, media_type: type};
            assert.equal(titleURL(item, type), SEO.titleMeta(item, type).canonical);
            const url = new URL(titleURL(item, type));
            assert.equal(url.origin, SEO.SITE);
            assert.equal(url.search, '');
            assert.equal(url.hash, '');
        }
    }
});

test('sitemap rejects malformed identifiers, missing names and unsupported media rather than inventing URLs', () => {
    for (const item of [null, [], {}, {id: 0}, {id: -1}, {id: 1.5}, {id: NaN}, {id: Infinity}, {id: Number.MAX_SAFE_INTEGER + 1}, {id: '7'}, {id: '7?extra=1'}, {id: 7}, {id: 7, title: ''}, {id: 7, title: '   '}, {id: 7, title: {}}, {id: 7, title: []}, {id: 7, name: 'Not a movie title'}, {id: 7, title: 'Title', media_type: 'person'}, {id: 7, title: 'Title', media_type: 'tv'}]) {
        assert.throws(() => titleURL(item, 'movie'));
    }
    assert.throws(() => titleURL({id: 7, title: 'Not a TV name'}, 'tv'));
    assert.throws(() => titleURL({id: 7, title: 'Title'}, 'person'));
    assert.equal(titleURL({id: 928480}, 'movie'), null, 'the removed movie remains excluded');
    assert.ok(titleURL({id: 928480, name: 'A different TV title'}, 'tv'));
});

test('bounded sitemap generation emits unique canonical titles and all public static routes using mocked requests only', async () => {
    const h = harness(validResponse);
    await h.generate();
    assert.equal(h.requests.length, 120);
    assert.deepEqual([...new Set(h.requests.map(r => r.page))].sort((a, b) => a - b), Array.from({length: 10}, (_, i) => String(i + 1)));
    assert.deepEqual(h.writes, ['sitemap.xml']);
    const urls = [...h.xml().matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    assert.equal(urls.length, new Set(urls).size);
    assert.equal(urls.length, staticRoutes.length + 4);
    for (const route of staticRoutes) assert.ok(urls.includes(SEO.SITE + route));
    for (const url of urls) assert.equal(SEO.describe(url).status === 200 || /^https:\/\/hdwatchzone\.com\/(movie|tv)\/[78]-/.test(url), true);
    assert.ok(urls.every(url => !/undefined|#/.test(url) && (!url.includes('?') || staticRoutes.includes(url.slice(SEO.SITE.length)))));
    assert.ok(!/<lastmod>|<priority>|<changefreq>/.test(h.xml()));
});

test('a mixed valid/malformed metadata page cannot overwrite the previous sitemap', async () => {
    const h = harness(url => {
        const response = validResponse(url);
        return {...response, json: async () => ({results: [...(await response.json()).results, {id: '7?extra=1', title: 'Bad', name: 'Bad'}]})};
    });
    await assert.rejects(h.generate(), /Invalid sitemap title identifier/);
    assert.deepEqual(h.writes, []);
    assert.equal(h.xml(), '<previous-valid-sitemap />');
});

test('empty, malformed, failed and invalid-JSON metadata responses preserve the previous sitemap', async () => {
    for (const responseFor of [
        () => ({ok: false, status: 503}),
        () => ({ok: true, json: async () => ({results: []})}),
        () => ({ok: true, json: async () => ({results: {id: 7}})}),
        () => ({ok: true, json: async () => {throw new Error('Invalid JSON');}})
    ]) {
        const h = harness(responseFor);
        await assert.rejects(h.generate());
        assert.deepEqual(h.writes, []);
        assert.equal(h.xml(), '<previous-valid-sitemap />');
    }
});
