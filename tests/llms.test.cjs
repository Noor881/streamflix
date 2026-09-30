const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('optional agent summary uses llms Markdown file-list hyperlinks', () => {
    const text = fs.readFileSync('llms.txt', 'utf8');
    assert.match(text, /^# HD Watchzone\r?\n> /);
    const links = text.split(/\r?\n/).filter(line => line.startsWith('- '));
    assert.equal(links.length, 18);
    const paths = new Set();
    for (const line of links) {
        const match = line.match(/^- \[([^\]]+)\]\((https:\/\/hdwatchzone\.com\/[^\s)]*)\): (.+)$/);
        assert.ok(match, `valid Markdown file-list link: ${line}`);
        const url = new URL(match[2]);
        assert.equal(url.hash, '');
        assert.equal(url.search, '');
        assert.ok(!paths.has(url.pathname), `unique listed page: ${url.pathname}`);
        paths.add(url.pathname);
    }
    assert.ok(paths.has('/movies') && paths.has('/privacy'));
    assert.match(text, /not a special Google Search ranking or indexing mechanism/);
});
