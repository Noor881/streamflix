const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SiteSEO = require('../seo-core.js');
const render = require('../api/render.js');
const source = fs.readFileSync('app.js', 'utf8');
const SUPPORT_EMAIL = 'noor2304f@gmail.com';
const SUPPORT_LINK = 'mailto:' + SUPPORT_EMAIL;

function assertPublicContact(html, route) {
    assert.ok(html.includes('Noor'), route + ' identifies the confirmed operator');
    assert.ok(html.includes(SUPPORT_EMAIL), route + ' displays the confirmed support address');
    assert.ok(html.includes('href="' + SUPPORT_LINK + '"'), route + ' exposes a correctly escaped email link');
    assert.ok(!html.includes('support@hdwatchzone.com'));
    assert.ok(!html.includes('"legalName":"Noor"'), 'a public operator name is not an invented formal legal entity');
}

function browserHarness() {
    const app = { innerHTML: '', style: {} };
    const inputs = new Map();
    const document = {
        hidden: false, body: { style: {} }, addEventListener() {},
        getElementById: id => id === 'app' ? app : inputs.get(id) || null,
        querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ setAttribute() {} })
    };
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
        requestAnimationFrame() {}, matchMedia: () => ({ matches: true }), navigator: {}, document,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SiteSEO, location: { pathname: '/contact', search: '', hash: '', href: SiteSEO.SITE + '/contact' }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => [] } }
    };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.testing = { pages, handleContactSubmit };', context);
    return { app, inputs, api: context.testing, window: context.window };
}

test('actual server-rendered Contact and Legal pages publish only the confirmed operator and support address', async () => {
    const originalFetch = global.fetch;
    let externalRequests = 0;
    global.fetch = async () => { externalRequests++; throw new Error('Static contact information needs no external request'); };
    try {
        for (const route of ['contact', 'legal']) {
            const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(html) { this.html = html; } };
            await render({ query: { route }, url: '/' + route }, response);
            assert.equal(response.statusCode, 200);
            assertPublicContact(response.html, route);
            assert.ok(response.html.includes('href="' + SiteSEO.SITE + '/' + route + '"'));
        }
        assert.equal(externalRequests, 0);
    } finally { global.fetch = originalFetch; }
});

test('client Contact and Legal renderers use the same public operator and support details', () => {
    const h = browserHarness();
    for (const route of ['contact', 'legal']) {
        h.window.location.pathname = '/' + route;
        h.api.pages[route]();
        assertPublicContact(h.app.innerHTML, route);
    }
    assert.ok(!source.includes('support@hdwatchzone.com'), 'the replaced support destination is absent from active source');
});

test('contact submit prepares a mailto for the confirmed inbox and escapes all visitor-entered fields without sending', () => {
    const h = browserHarness();
    const values = { 'contact-name': 'Visitor <name> & "quote"', 'contact-email': 'visitor@example.com', 'contact-subject': 'Bug & subject? #fragment=1', 'contact-message': 'Details & next=value?\nSecond line <message>' };
    for (const [id, value] of Object.entries(values)) h.inputs.set(id, { value });
    let prevented = false, notice;
    const form = { querySelector: () => null, appendChild(node) { notice = node; } };
    h.api.handleContactSubmit({ target: form, preventDefault() { prevented = true; } });
    const url = new URL(h.window.location.href);
    assert.equal(url.protocol, 'mailto:');
    assert.equal(url.pathname, SUPPORT_EMAIL);
    assert.ok(h.window.location.href.startsWith(SUPPORT_LINK + '?subject='));
    assert.equal(url.searchParams.get('subject'), values['contact-subject']);
    const body = url.searchParams.get('body');
    assert.ok(body.includes(values['contact-name']));
    assert.ok(body.includes(values['contact-email']));
    assert.ok(body.includes(values['contact-message']));
    assert.equal(url.searchParams.size, 2, 'visitor input cannot inject additional mailto query fields');
    assert.equal(url.hash, '');
    assert.ok(prevented);
    assert.ok(notice.textContent.includes('Nothing has been sent by this website'));
    assert.ok(!notice.textContent.includes('sent successfully'));
});
