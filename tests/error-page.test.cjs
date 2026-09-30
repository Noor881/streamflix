const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function errorPage(fetchImplementation = async () => ({ok: true, json: async () => ({results: []})})) {
    const html = fs.readFileSync('404.html', 'utf8');
    const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
        .find(match => !/\bsrc=/.test(match[1]))[2]
        .replace(/\bloadTrending\(\);\s*$/, '');
    const grid = {innerHTML: ''};
    const context = {fetch: fetchImplementation, document: {getElementById: () => grid}};
    vm.createContext(context);
    new vm.Script(script, {filename: '404-inline.js'}).runInContext(context);
    return {context, grid};
}

test('404 cards escape both title text and attribute values without changing card markup', () => {
    const {context} = errorPage();
    const title = `A & "B" 'C' <img src=x onerror=alert(1)>`;
    const html = context.renderTrendingCards([{id: 550, media_type: 'movie', title, poster_path: '/poster_1.jpg', vote_average: 8.26}]);
    const safeTitle = 'A &amp; &quot;B&quot; &#39;C&#39; &lt;img src=x onerror=alert(1)&gt;';
    assert.ok(html.includes(`alt="${safeTitle}"`));
    assert.ok(html.includes(`<div class="trending-card-title">${safeTitle}</div>`));
    assert.equal((html.match(/<img\b/g) || []).length, 1);
    assert.ok(html.includes('href="/movie/550"'));
    assert.ok(html.includes('src="https://image.tmdb.org/t/p/w342/poster_1.jpg"'));
    assert.ok(html.includes('★ 8.3'));
});

test('404 recommendations admit only valid movie/TV IDs and safe poster paths, capped at 12', () => {
    const {context} = errorPage();
    const valid = {id: 1, media_type: 'movie', title: 'Movie', poster_path: '/poster.jpg', vote_average: 'invalid'};
    const invalid = [
        null, {...valid, media_type: 'person'}, {...valid, id: 0}, {...valid, id: -1},
        {...valid, id: 1.5}, {...valid, id: '1'}, {...valid, id: Number.MAX_SAFE_INTEGER + 1},
        {...valid, poster_path: '/poster.jpg" onerror="alert(1)'},
        {...valid, poster_path: 'https://other.example/poster.jpg'}, {...valid, poster_path: null}
    ];
    const html = context.renderTrendingCards([...invalid, valid, {...valid, id: 2, media_type: 'tv', title: undefined, name: 'TV & More'}]);
    assert.equal((html.match(/class="trending-card"/g) || []).length, 2);
    assert.ok(html.includes('href="/tv/2"'));
    assert.ok(html.includes('TV &amp; More'));
    assert.ok(!html.includes('trending-card-rating'));
    assert.equal(context.renderTrendingCards({results: []}), '');
    assert.equal(context.renderTrendingCards(null), '');
    const capped = context.renderTrendingCards(Array.from({length: 20}, (_, index) => ({...valid, id: index + 1})));
    assert.equal((capped.match(/class="trending-card"/g) || []).length, 12);
});

test('404 loader handles an unsuccessful upstream response with its existing fallback', async () => {
    let requests = 0;
    const {context, grid} = errorPage(async () => {
        requests++;
        return {ok: false, json: async () => {throw new Error('Error response should not be parsed');}};
    });
    await context.loadTrending();
    assert.equal(requests, 1);
    assert.ok(grid.innerHTML.includes('Could not load trending content.'));
});

test('404 and admin utility navigation use clean URLs and retain branding', () => {
    const error = fs.readFileSync('404.html', 'utf8');
    const admin = fs.readFileSync('admin.html', 'utf8');
    for (const html of [error, admin]) assert.doesNotMatch(html, /href=["'](?:\/)?#\//);
    assert.ok(error.includes('href="/movies"'));
    assert.ok(admin.includes('href="/account"'));
    assert.ok(admin.includes('href="/cookies"'));
    assert.ok(error.includes('Lost in the Stream'));
    assert.ok(error.includes('HD Watchzone'));
});
