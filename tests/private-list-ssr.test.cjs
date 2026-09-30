const test = require('node:test');
const assert = require('node:assert/strict');
const render = require('../api/render.js');

test('My List initial HTML provides a generic heading without exposing or pretending to know saved titles', async () => {
    const original = global.fetch;
    let requests = 0;
    global.fetch = async () => {requests++; throw new Error('Private-list SSR must not request title metadata');};
    const response = {statusCode: 200, headers: {}, html: '', setHeader(key, value) {this.headers[key.toLowerCase()] = value;}, end(html) {this.html = String(html || '');}};
    try {await render({url: '/my-list', query: {route: 'my-list'}}, response);}
    finally {global.fetch = original;}
    assert.equal(response.statusCode, 200);
    assert.equal(requests, 0);
    assert.equal(response.headers['x-robots-tag'], 'noindex, follow');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.match(response.html, /<h1>📋 My List<\/h1>/);
    assert.match(response.html, /Saved titles are kept in this browser/);
    assert.match(response.html, /<noscript><p>Enable JavaScript to view or change this browser/);
    assert.match(response.html, /href="\/movies"/);
    assert.match(response.html, /rel="canonical" href="https:\/\/hdwatchzone\.com\/my-list"/);
    assert.ok(!response.html.includes('Your list is empty'), 'SSR does not know whether the visitor has saved titles');
    assert.ok(!response.html.includes('card-wrapper'), 'SSR must not serialize a private list');
    assert.ok(!response.html.includes('page-schema'), 'no collection schema for browser-private titles');
});
