const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function appFixture(savedItems = []) {
    const app = { innerHTML: '', style: {} };
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval() {},
        requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: false }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: {}, document: { hidden: false, body: { style: {} }, addEventListener() {}, getElementById: id => id === 'app' ? app : null, querySelector: () => null, querySelectorAll: () => [] },
        window: { SiteSEO: require('../seo-core.js'), location: { pathname: '/', search: '', hash: '' }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => savedItems } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('app.js', 'utf8') + '\nthis.testing = { cards: components, pages };', context);
    return { ...context.testing, app };
}

test('Recently Viewed uses catalog portrait classes and preserves TV episode links', () => {
    const html = appFixture().cards.continueCard({ id: 1396, type: 'tv', title: 'Breaking Bad', poster_path: '/x.jpg', season: 2, episode: 3 });
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
    const { cards } = appFixture();
    const html = cards.continueCard({ id: 1, media_type: 'movie', title: '<script>alert(1)</script>', progress: 90, progressVerified: false });
    assert.ok(html.includes('data-type="movie"'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('Recently opened'));
    assert.ok(!html.includes('recent-progress-bar'));
    const verified = cards.continueCard({ id: 1, type: 'movie', title: 'Movie', progress: 150, progressVerified: true });
    assert.ok(verified.includes('style="width:100%"'));
});

test('My List renders saved movie and TV cards without changing saved records', async () => {
    const saved = [
        { id: 550, media_type: 'movie', title: 'Fight Club', poster_path: '/fight-club.jpg' },
        { id: 1396, media_type: 'tv', name: 'Breaking Bad', poster_path: '/breaking-bad.jpg' }
    ];
    const before = JSON.stringify(saved);
    const { pages, app } = appFixture(saved);
    await pages.myList();
    assert.equal((app.innerHTML.match(/class="card-wrapper"/g) || []).length, 2);
    assert.equal((app.innerHTML.match(/class="card-poster"/g) || []).length, 2);
    assert.equal((app.innerHTML.match(/width="300" height="450"/g) || []).length, 2);
    assert.ok(app.innerHTML.includes('/movie/550-fight-club'));
    assert.ok(app.innerHTML.includes('/tv/1396-breaking-bad'));
    assert.ok(app.innerHTML.includes('class="content-grid"'));
    assert.ok(!app.innerHTML.includes('continue-card-thumb'));
    assert.equal(JSON.stringify(saved), before);
});

test('saved cards share authoritative portrait sizing without the old landscape override', () => {
    const css = fs.readFileSync('cards.css', 'utf8');
    assert.match(css, /\.card-wrapper > \.card\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/);
    assert.match(css, /\.card-wrapper > \.card-info\s*\{[^}]*height:\s*84px/);
    assert.match(css, /\.content-row > \.card-wrapper\s*\{[^}]*var\(--poster-card-width\)/);
    const design = fs.readFileSync('design-v2.css', 'utf8');
    assert.ok(!design.includes('.continue-card-thumb'));
    assert.ok(!design.includes('min(360px, 78vw)'));
    for (const file of ['index.html', 'movie.html', 'tv.html']) assert.ok(!fs.readFileSync(`server/templates/${file}`, 'utf8').includes('scripts/watchlist.js'));
});
