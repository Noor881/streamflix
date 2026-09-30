const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SiteSEO = require('../seo-core.js');
const source = fs.readFileSync('app.js', 'utf8');

const movie = { id: 550, title: 'Fight <Club> & Friends', poster_path: '/movie.jpg', genre_ids: [18], release_date: '1999-10-15' };
const show = { id: 1396, name: 'Breaking Bad', poster_path: '/show.jpg', genre_ids: [18], first_air_date: '2008-01-20' };
const listing = results => ({ results, page: 1, total_pages: 3, total_results: results.length });
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));

function harness(path = '/movies', { initialSchema = null, serverRendered = false } = {}) {
    let schema = initialSchema ? script(JSON.stringify(initialSchema)) : null;
    const app = {
        innerHTML: serverRendered ? '<h1>Server-rendered catalog</h1>' : '',
        dataset: serverRendered ? { serverRendered: 'true' } : {}, style: {},
        querySelectorAll() {
            // Read the cards produced by the real catalog renderers as a browser DOM would.
            return [...this.innerHTML.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="card-wrapper"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({
                getAttribute: name => name === 'href' ? decode(match[1]) : null,
                querySelector: () => {
                    const title = match[2].match(/<h3 class="card-info-title">([\s\S]*?)<\/h3>/);
                    return title ? { textContent: decode(title[1]) } : null;
                }
            }));
        }
    };
    function script(textContent = '') {
        const node = { id: 'page-schema', type: 'application/ld+json', textContent, remove() { if (schema === node) schema = null; } };
        return node;
    }
    const metadata = new Map();
    const document = {
        hidden: false, title: '', body: { style: {} }, addEventListener() {},
        head: { appendChild(node) { schema = node; } }, createElement: () => script(),
        getElementById: id => id === 'app' ? app : id === 'page-schema' ? schema : null,
        querySelector(selector) {
            if (!selector.startsWith('meta[') && !selector.startsWith('link[')) return null;
            if (!metadata.has(selector)) metadata.set(selector, { setAttribute(name, value) { this[name] = value; } });
            return metadata.get(selector);
        },
        querySelectorAll: () => []
    };
    const location = {};
    function setPath(value) {
        const url = new URL(value, SiteSEO.SITE);
        Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash, href: url.href, origin: url.origin });
    }
    setPath(path);
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: true }),
        navigator: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SiteSEO, location, history: { pushState(_state, _title, value) { setPath(value); }, replaceState(_state, _title, value) { setPath(value); } }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => [] } }
    };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.testing = { pages, tmdbAPI, router, routeTarget, updateRouteMetadata, updateCollectionSchema };', context);
    return { app, document, metadata, api: context.testing, setPath, get schema() { return schema; }, readSchema: () => schema ? JSON.parse(schema.textContent) : null };
}

function initialCollection(path = '/movies') {
    const meta = SiteSEO.describe(path);
    return { '@context': 'https://schema.org', '@type': 'CollectionPage', name: meta.title, url: meta.canonical, mainEntity: { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, url: SiteSEO.titleMeta(movie, 'movie').canonical, name: movie.title }] } };
}

test('initial router hydration retains matching server collection schema and visible content', () => {
    const initial = initialCollection();
    const h = harness('/movies', { initialSchema: initial, serverRendered: true });
    const element = h.schema;
    h.api.pages.movies = () => {};
    h.api.router.init();
    assert.equal(h.schema, element);
    assert.deepEqual(h.readSchema(), initial);
    assert.equal(h.app.innerHTML, '<h1>Server-rendered catalog</h1>');
});

test('catalog hydration preserves SSR data while pending and refreshes it from the visible title cards', async () => {
    const h = harness('/movies', { initialSchema: initialCollection(), serverRendered: true });
    let release;
    h.api.tmdbAPI.getPopularMovies = () => new Promise(resolve => { release = resolve; });
    h.api.updateRouteMetadata('/movies');
    const rendering = h.api.pages.movies();
    assert.ok(h.schema);
    assert.equal(h.app.innerHTML, '<h1>Server-rendered catalog</h1>');
    release(listing([movie, { id: 680, title: 'Pulp Fiction', poster_path: '/related.jpg' }]));
    await rendering;
    const schema = h.readSchema();
    assert.equal(schema.url, SiteSEO.SITE + '/movies');
    assert.deepEqual(schema.mainEntity.itemListElement.map(item => [item.position, item.name, item.url]), [
        [1, movie.title, SiteSEO.titleMeta(movie, 'movie').canonical],
        [2, 'Pulp Fiction', SiteSEO.SITE + '/movie/680-pulp-fiction']
    ]);
    assert.ok(!JSON.stringify(schema).includes('aggregateRating'));
});

test('SPA navigation clears stale schema while loading, then describes the new page and exact card order', async () => {
    const h = harness('/movies', { initialSchema: initialCollection() });
    let release, rendering;
    h.api.tmdbAPI.getPopularTV = () => new Promise(resolve => { release = resolve; });
    const renderTV = h.api.pages.tv;
    h.api.pages.tv = (...args) => rendering = renderTV(...args);
    h.api.router.navigate('/tv?page=2');
    assert.equal(h.schema, null);
    release(listing([show, { id: 66732, name: 'Stranger Things', poster_path: '/related.jpg' }]));
    await rendering;
    const schema = h.readSchema();
    assert.equal(schema.url, SiteSEO.SITE + '/tv?page=2');
    assert.equal(schema.name, SiteSEO.describe('/tv?page=2').title);
    assert.deepEqual(schema.mainEntity.itemListElement.map(item => item.url), [SiteSEO.SITE + '/tv/1396-breaking-bad', SiteSEO.SITE + '/tv/66732-stranger-things']);
});

test('noindex filters, utility pages, homepage and empty/error content have no collection schema', async () => {
    const h = harness('/movies?category=top_rated', { initialSchema: initialCollection() });
    h.api.tmdbAPI.getTopRatedMovies = async () => listing([movie]);
    h.api.updateRouteMetadata('/movies?category=top_rated');
    await h.api.pages.movies('top_rated');
    assert.ok(h.app.innerHTML.includes(movie.title.replace('<', '&lt;').replace('>', '&gt;').replace('& Friends', '&amp; Friends')));
    assert.equal(h.schema, null);
    for (const path of ['/', '/search?q=batman', '/account', '/my-list', '/faq']) {
        h.setPath(path);
        h.api.updateCollectionSchema(h.app);
        assert.equal(h.schema, null, path);
    }
    h.setPath('/movies');
    h.app.innerHTML = '<p>Catalog temporarily unavailable</p>';
    h.api.updateCollectionSchema(h.app);
    assert.equal(h.schema, null);
});

test('a late render from the old route cannot restore stale catalog content or schema', async () => {
    const h = harness('/movies');
    let releaseMovie;
    h.api.tmdbAPI.getPopularMovies = () => new Promise(resolve => { releaseMovie = resolve; });
    const staleRendering = h.api.pages.movies();
    h.api.tmdbAPI.getPopularTV = async () => listing([show]);
    const renderTV = h.api.pages.tv;
    let currentRendering;
    h.api.pages.tv = (...args) => currentRendering = renderTV(...args);
    h.api.router.navigate('/tv');
    await currentRendering;
    const current = h.readSchema();
    releaseMovie(listing([movie]));
    await staleRendering;
    assert.deepEqual(h.readSchema(), current);
    assert.equal(current.url, SiteSEO.SITE + '/tv');
    assert.ok(h.app.innerHTML.includes('Breaking Bad'));
    assert.ok(!h.app.innerHTML.includes('Fight &lt;Club&gt;'));
});

test('invalid hash routes discard the previous collection schema', () => {
    const h = harness('/movies', { initialSchema: initialCollection() });
    h.api.router.navigate('/missing');
    assert.equal(h.schema, null);
    assert.ok(h.app.innerHTML.includes('Page not found'));
});
