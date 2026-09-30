const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function appImages() {
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {},
        requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: false }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: {}, document: { hidden: false, body: { style: {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
        window: { SiteSEO: require('../seo-core.js'), location: { pathname: '/', search: '', hash: '' }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => [] } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('app.js', 'utf8') + '\nthis.images = { components, utils };', context);
    return context.images;
}

test('hero exposes responsive image and prioritizes only the first slide', () => {
    const html = appImages().components.heroCarousel([1, 2, 3].map(id => ({ id, title: `Movie ${id}`, backdrop_path: `/backdrop-${id}.jpg`, poster_path: `/poster-${id}.jpg` })));
    const backdrops = html.match(/<img[^>]+class="hero-backdrop-image"[^>]+>/g);
    assert.equal(backdrops.length, 3);
    assert.equal((html.match(/fetchpriority="high"/g) || []).length, 1);
    assert.ok(backdrops[0].includes('loading="eager"'));
    assert.ok(backdrops[0].includes('fetchpriority="high"'));
    assert.ok(backdrops[1].includes('loading="lazy"'));
    assert.ok(backdrops[1].includes('fetchpriority="low"'));
    assert.ok(backdrops[0].includes('/w300/backdrop-1.jpg 300w'));
    assert.ok(backdrops[0].includes('/w780/backdrop-1.jpg 780w'));
    assert.ok(backdrops[0].includes('/w1280/backdrop-1.jpg 1280w'));
    assert.ok(backdrops[0].includes('sizes="100vw"'));
    assert.ok(!html.includes('background-image:'));
});

test('catalog and saved images reserve portrait space and offer responsive candidates', () => {
    const { components, utils } = appImages();
    for (const html of [components.card({ id: 1, title: 'Movie', poster_path: '/poster.jpg' }), components.continueCard({ id: 1, type: 'movie', title: 'Movie', poster: 'https://image.tmdb.org/t/p/w342/poster.jpg' })]) {
        assert.ok(html.includes('width="300" height="450"'));
        assert.ok(html.includes('decoding="async"'));
        assert.ok(html.includes('/w185/poster.jpg 185w'));
        assert.ok(html.includes('/w780/poster.jpg 780w'));
        assert.ok(html.includes('calc((100vw - 34px) / 2)'));
    }
    assert.ok(!utils.imageAttrs(null).includes('srcset'));
    assert.ok(!utils.imageAttrs('https://another.example/image.jpg').includes('srcset'));
});

test('detail responsive dimensions and lazy trailer avoid unnecessary early requests', () => {
    const context = { document: { addEventListener() {} }, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('detail.js', 'utf8') + '\nthis.images = { responsiveImageAttrs, buildTrailer, imgUrl };', context);
    const attrs = context.images.responsiveImageAttrs('/episode.jpg', 'still', '300px');
    assert.ok(attrs.includes('width="300" height="169"'));
    assert.ok(attrs.includes('/w300/episode.jpg 300w'));
    assert.ok(!attrs.includes('/w500/episode.jpg'));
    const trailer = context.images.buildTrailer({ results: [{ site: 'YouTube', type: 'Trailer', key: 'abcdefghijk' }] });
    assert.ok(trailer.includes('loading="lazy"'));
    assert.ok(trailer.includes('title="Trailer video"'));
    assert.ok(!context.images.imgUrl(null).includes('<svg'));
    assert.ok(!fs.readFileSync('detail.js', 'utf8').includes('<div class="hero-backdrop">'));
    assert.ok(!fs.readFileSync('detail.js', 'utf8').includes('<div class="hero-poster">'));
});
