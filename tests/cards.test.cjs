const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function components() {
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {},
        requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: false }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: {}, document: { hidden: false, body: { style: {} }, addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
        window: { location: { pathname: '/', search: '', hash: '' }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => [] } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('app.js', 'utf8') + '\nthis.cards = components;', context);
    return context.cards;
}

test('Recently Viewed uses catalog portrait classes and preserves TV episode links', () => {
    const html = components().continueCard({ id: 1396, type: 'tv', title: 'Breaking Bad', poster_path: '/x.jpg', season: 2, episode: 3 });
    assert.ok(html.includes('href="/tv/1396-breaking-bad/2/3"'));
    for (const cssClass of ['card-wrapper recent-card', 'class="card"', 'class="card-poster"', 'class="card-info"', 'class="card-info-title"', 'class="card-info-desc"']) assert.ok(html.includes(cssClass));
    assert.ok(html.includes('S2 E3'));
    assert.ok(!html.includes('continue-card'));
    assert.ok(!html.includes('recent-progress-bar'));
    const app = fs.readFileSync('app.js', 'utf8');
    assert.ok(app.includes('class="content-row recent-row"'));
    assert.ok(app.includes('myListItems.map(item => components.card'));
});

test('Recent cards escape saved titles and ignore unverified progress', () => {
    const cards = components();
    const html = cards.continueCard({ id: 1, media_type: 'movie', title: '<script>alert(1)</script>', progress: 90, progressVerified: false });
    assert.ok(html.includes('data-type="movie"'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('Recently opened'));
    assert.ok(!html.includes('recent-progress-bar'));
    const verified = cards.continueCard({ id: 1, type: 'movie', title: 'Movie', progress: 150, progressVerified: true });
    assert.ok(verified.includes('style="width:100%"'));
});
