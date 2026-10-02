const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {transformSync} = require('esbuild');
const {publicAssets} = require('../scripts/build-static.cjs');

test('catalogue loads discovery dependencies in order before the application', () => {
    const html = fs.readFileSync('server/templates/index.html', 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].map(match => ({
        pathname: new URL(match[2], 'https://hdwatchzone.com').pathname,
        attributes: match[1] + match[3]
    }));
    const order = ['/discovery-core.js', '/seo-core.js', '/site-core.js', '/for-you.js', '/app.js'];
    let previous = -1;
    for (const pathname of order) {
        const index = scripts.findIndex(script => script.pathname === pathname);
        assert.ok(index > previous, `${pathname}: ordered after its dependencies`);
        assert.match(scripts[index].attributes, /\bdefer\b/);
        assert.doesNotMatch(scripts[index].attributes, /\basync\b/);
        previous = index;
    }
    for (const file of ['movie.html', 'tv.html']) {
        const watch = fs.readFileSync(`server/templates/${file}`, 'utf8');
        assert.ok(watch.indexOf('/discovery-core.js') < watch.indexOf('/seo-core.js'), 'watch metadata receives discovery definitions before SEO');
        assert.doesNotMatch(watch, /for-you\.js/, 'watch pages do not fetch unused personalized recommendation scripts');
    }
});

test('discovery features have clean catalogue navigation and public runtime assets', () => {
    const html = fs.readFileSync('server/templates/index.html', 'utf8');
    for (const route of ['/for-you', '/indian', '/collections']) {
        assert.ok(html.includes(`href="${route}" class="mobile-nav-link"`), `${route}: mobile menu entry`);
        assert.ok(html.includes(`<a href="${route}">`), `${route}: footer entry`);
    }
    assert.match(html, /href="\/collections" class="dnav-link discovery-nav-link"/);
    for (const file of ['discovery-core.js', 'for-you.js', 'discovery.css']) {
        assert.ok(publicAssets().includes(file), `${file}: explicit public build allowlist`);
    }
});

test('discovery styles use bounded responsive tiles without changing poster sizes', () => {
    const css = fs.readFileSync('discovery.css', 'utf8');
    const result = transformSync(css, {loader: 'css', target: ['chrome90', 'edge90', 'firefox88', 'safari14'], logLevel: 'silent'});
    assert.equal(result.warnings.length, 0, 'production browser targets accept discovery CSS');
    assert.match(css, /\.discovery-links\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.discovery-language-grid\s*\{[^}]*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*\.discovery-language-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /:focus-visible[\s\S]*outline:\s*3px/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /\.card-info\.has-recommendation\s*\{[^}]*height:\s*112px/);
    const withoutReasonHeight = css.replace(/\.card-wrapper\s*>\s*\.card-info\.has-recommendation\s*\{[^}]*\}/, '');
    assert.doesNotMatch(withoutReasonHeight, /(?:^|\n)\s*\.(?:card|card-wrapper|card-poster)[\s:{>.]/, 'shared portrait geometry stays authoritative');
});
