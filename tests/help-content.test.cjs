const test = require('node:test');
const assert = require('node:assert/strict');
const render = require('../api/render.js');
const SEO = require('../seo-core.js');

async function rendered(route) {
    const response = {statusCode: 200, headers: {}, setHeader(name, value) {this.headers[name] = value;}, end(html) {this.html = html;}};
    await render({query: {route}, url: '/' + route}, response);
    assert.equal(response.statusCode, 200);
    assert.ok(response.html.includes('href="' + SEO.SITE + '/' + route + '"'));
    return response.html.match(/<div id="app"[^>]*>([\s\S]*?)<\/div>\s*<!-- SEO-Optimized About Section -->/)?.[1] || response.html;
}

test('Help SSR gives task-specific instructions with real, descriptive navigation targets', async () => {
    const html = await rendered('help');
    for (const text of ['Search and Browse', 'Playback and Full Screen', 'My List and Saved Titles', 'Privacy and Local Storage', 'Terms and Content Attribution', 'Contact the Operator', 'press Enter', 'tap the search icon', 'Full screen outside the embedded video', 'does not download the video', 'prepared draft in your email app']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('How to search for content</a>'));
    assert.ok(!html.includes('Understanding the interface</a>'));
    assert.ok(!html.includes('<h3>Search and Browse</h3>'));
    for (const [label, route] of [['Browse Movies', '/movies'], ['Browse TV Shows', '/tv'], ['Open My List', '/my-list'], ['Local Preferences', '/account'], ['Open the Contact Form', '/contact']]) {
        assert.ok(html.includes('href="' + route + '"'), route);
        assert.ok(html.includes(label), label);
        assert.equal(SEO.describe(route).status, 200);
    }
    assert.ok(html.includes('A catalog listing is not a playback guarantee'));
    assert.ok(html.includes('do not verify media rights'));
});

test('FAQ SSR supplies visible question controls and answers for the tasks advertised by Help', async () => {
    const html = await rendered('faq');
    for (const question of ['How do I search for a title?', 'How do I save or remove a title from My List?', 'How do I use full screen?', 'Why does an external player show ads or redirects?']) assert.ok(html.includes(question));
    assert.ok(html.includes('header search box and press Enter'));
    assert.ok(html.includes('does not sync to another device'));
    assert.ok(html.includes('cannot guarantee ad-free playback'));
    assert.ok(html.includes('does not guarantee fullscreen support in every mobile browser'));
    assert.ok(!html.includes('You can browse and watch content immediately'));
    const labels = [...html.matchAll(/aria-labelledby="(faq-question-\d+)"/g)].map(match => match[1]);
    assert.equal(labels.length, 15);
    assert.equal(new Set(labels).size, 15);
    for (const id of labels) assert.ok(html.includes('id="' + id + '"'), id);
    assert.equal((html.match(/<details class="faq-item"/g) || []).length, 15);
    assert.equal((html.match(/<summary class="faq-question"/g) || []).length, 15);
    assert.ok(!html.includes('onclick="toggleFaq('));
    assert.ok(!/<details[^>]*\sopen(?:[\s=>])/.test(html), 'answers start natively collapsed');
});
