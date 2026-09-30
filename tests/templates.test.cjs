const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const templates = ['index.html', 'movie.html', 'tv.html'];

test('templates execute shared SEO before application or detail scripts', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].map(match => ({
            path: new URL(match[2], 'https://hdwatchzone.com').pathname,
            attributes: match[1] + match[3]
        }));
        const shared = scripts.findIndex(script => script.path === '/seo-core.js');
        const application = scripts.findIndex(script => script.path === (file === 'index.html' ? '/app.js' : '/detail.js'));
        assert.ok(shared >= 0 && application > shared, `${file}: shared SEO is loaded first`);
        for (const script of [scripts[shared], scripts[application]]) {
            assert.match(script.attributes, /\bdefer\b/, `${file}: ordered deferred execution`);
            assert.doesNotMatch(script.attributes, /\basync\b/, `${file}: no asynchronous dependency race`);
        }
    }
});

test('template navigation uses real clean URLs rather than hash routes', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        assert.doesNotMatch(html, /href=["'](?:\/)?#\//, `${file}: no hash-based internal anchors`);
    }
    const home = fs.readFileSync('server/templates/index.html', 'utf8');
    for (const path of ['/', '/movies', '/tv', '/anime', '/new', '/my-list', '/faq', '/help', '/contact', '/privacy', '/terms', '/cookies', '/legal']) {
        assert.ok(home.includes(`href="${path}"`), `clean navigation to ${path}`);
    }
});

test('template inline scripts and JSON-LD parse and verification tags remain', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        assert.match(html, /name="google-site-verification"/);
        assert.match(html, /name="facebook-domain-verification"/);
        for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (/\bsrc=/.test(attributes)) continue;
            if (/type="application\/ld\+json"/.test(attributes)) JSON.parse(body);
            else if (!/\btype=/.test(attributes)) new vm.Script(body, {filename: file});
        }
        if (file !== 'index.html') assert.match(html, /document\.addEventListener\('DOMContentLoaded'/);
    }
});

function linkAttribute(tag, name) {
    const attribute = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
    return attribute ? attribute[1].replace(/&amp;/g, '&') : null;
}

test('Inter does not block screen rendering and activates once loaded', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        const withoutNoscript = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/g, '');
        const fontLinks = [...withoutNoscript.matchAll(/<link\b[^>]*>/g)]
            .map(match => match[0])
            .filter(tag => (linkAttribute(tag, 'href') || '').startsWith('https://fonts.googleapis.com/css2?'));
        assert.equal(fontLinks.length, 1, `${file}: one live font stylesheet`);
        const font = fontLinks[0];
        assert.equal(linkAttribute(font, 'rel'), 'stylesheet');
        assert.equal(linkAttribute(font, 'media'), 'print', `${file}: font CSS is non-blocking for screen`);
        assert.equal(new URL(linkAttribute(font, 'href')).searchParams.get('display'), 'optional');
        const link = {media: 'print', onload: () => {}};
        new Function(linkAttribute(font, 'onload')).call(link);
        assert.equal(link.media, 'all', `${file}: loaded font styles become active`);
        assert.equal(link.onload, null, `${file}: handler is cleared after activation`);
        const stylesheetPreconnect = withoutNoscript.indexOf('<link rel="preconnect" href="https://fonts.googleapis.com">');
        const fontPreconnect = withoutNoscript.indexOf('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
        assert.ok(stylesheetPreconnect >= 0 && stylesheetPreconnect < withoutNoscript.indexOf(font), `${file}: early stylesheet-origin preconnect`);
        assert.ok(fontPreconnect >= 0 && fontPreconnect < withoutNoscript.indexOf(font), `${file}: early CORS font-origin preconnect`);
        assert.ok(withoutNoscript.indexOf(font) < withoutNoscript.indexOf('</head>'), `${file}: font discovery stays in head`);
    }
});

test('Inter has a matching normal stylesheet fallback when JavaScript is disabled', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        const fallbackLinks = [...html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/g)]
            .flatMap(match => [...match[1].matchAll(/<link\b[^>]*>/g)].map(link => link[0]))
            .filter(tag => (linkAttribute(tag, 'href') || '').startsWith('https://fonts.googleapis.com/css2?'));
        assert.equal(fallbackLinks.length, 1, `${file}: one no-JavaScript font fallback`);
        const fallback = fallbackLinks[0];
        const live = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/g, '')
            .match(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?[^>]*>/)[0];
        assert.equal(linkAttribute(fallback, 'href'), linkAttribute(live, 'href'), `${file}: identical weight and display requests`);
        assert.equal(linkAttribute(fallback, 'rel'), 'stylesheet');
        assert.equal(linkAttribute(fallback, 'media'), null);
        assert.equal(linkAttribute(fallback, 'onload'), null);
    }
});

test('layout styles remain blocking and ordered after the optional font declaration', () => {
    for (const file of templates) {
        const html = fs.readFileSync(`server/templates/${file}`, 'utf8');
        const expected = file === 'index.html'
            ? ['/nav.css', '/styles.css', '/responsive.css', '/design-v2.css', '/cards.css']
            : ['/nav.css', '/detail.css', '/seo-enhancements.css', '/responsive.css', '/design-v2.css', '/cards.css'];
        const layoutLinks = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0])
            .filter(tag => (linkAttribute(tag, 'href') || '').startsWith('/') && (linkAttribute(tag, 'href') || '').includes('.css'));
        assert.deepEqual(layoutLinks.map(tag => new URL(linkAttribute(tag, 'href'), 'https://hdwatchzone.com').pathname), expected);
        for (const tag of layoutLinks) {
            assert.equal(linkAttribute(tag, 'rel'), 'stylesheet', `${file}: layout CSS is not deferred`);
            assert.equal(linkAttribute(tag, 'media'), null, `${file}: screen layout remains immediately applicable`);
            assert.equal(linkAttribute(tag, 'onload'), null);
        }
        assert.ok(html.indexOf('display=optional') < html.indexOf(layoutLinks[0]), `${file}: font request precedes layout cascade`);
    }
});
