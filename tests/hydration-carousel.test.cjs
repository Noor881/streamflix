const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SiteSEO = require('../seo-core.js');
const source = fs.readFileSync('app.js', 'utf8');

function node(active = false) {
    const classes = new Set(active ? ['active'] : []);
    const attributes = new Map();
    return {
        classList: {
            contains: name => classes.has(name),
            toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
            add: name => classes.add(name), remove: name => classes.delete(name)
        },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: name => attributes.get(name),
        removeAttribute: name => attributes.delete(name),
        textContent: '', inert: !active
    };
}

function harness({ serverRendered = false } = {}) {
    const app = { innerHTML: serverRendered ? '<h1>Server-rendered titles</h1>' : '', dataset: serverRendered ? { serverRendered: 'true' } : {}, style: {} };
    const timers = new Map();
    const documentEvents = {};
    let timerId = 0;
    let carousel = null;
    const document = {
        hidden: false, activeElement: null, body: { style: {} },
        addEventListener: (name, callback) => { documentEvents[name] = callback; },
        getElementById: id => id === 'app' ? app : id === 'hero-carousel' ? carousel : null,
        querySelector: selector => selector === '.hero-carousel' ? carousel : null,
        querySelectorAll: selector => selector === '.hero-slide' ? carousel?.slides || [] : selector === '.hero-dot' ? carousel?.dots || [] : []
    };
    const context = {
        console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
        setInterval: callback => { const id = ++timerId; timers.set(id, callback); return id; },
        clearInterval: id => timers.delete(id), requestAnimationFrame: callback => callback(),
        matchMedia: () => ({ matches: false }), navigator: {}, document,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { SiteSEO, location: { pathname: '/', search: '', hash: '' }, history: { pushState() {}, replaceState() {} }, addEventListener() {}, scrollTo() {}, Watchlist: { read: () => [] } }
    };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.testing = { showRouteLoading, routeTarget, components, pages, tmdbAPI, router, startHeroCarousel, stopHeroCarousel, goToSlide, nextSlide, snapshot: () => ({ currentSlide, heroPaused, timer: heroCarouselInterval }) };', context);
    function mountCarousel(activeIndex = 0) {
        const slides = Array.from({ length: 5 }, (_, i) => node(i === activeIndex));
        const dots = Array.from({ length: 5 }, (_, i) => node(i === activeIndex));
        const pause = node();
        const events = {};
        carousel = {
            dataset: {}, slides, dots, pause, events,
            querySelectorAll: selector => selector === '.hero-slide' ? slides : [],
            querySelector: selector => selector === '.hero-pause' ? pause : null,
            contains: element => element === pause,
            addEventListener: (name, callback) => { events[name] = callback; }
        };
        return carousel;
    }
    return { context, app, document, documentEvents, timers, mountCarousel, api: context.testing, window: context.window };
}

test('first hydration retains SSR content once; subsequent loading calls show skeleton without recursion', () => {
    const h = harness({ serverRendered: true });
    let loadingCalls = 0;
    h.api.components.loading = () => { loadingCalls++; return '<div>Loading</div>'; };
    h.api.showRouteLoading(h.api.routeTarget());
    assert.equal(h.app.innerHTML, '<h1>Server-rendered titles</h1>');
    assert.equal(h.app.dataset.serverRendered, undefined);
    assert.equal(loadingCalls, 0);
    h.api.showRouteLoading(h.api.routeTarget());
    assert.equal(h.app.innerHTML, '<div>Loading</div>');
    assert.equal(loadingCalls, 1);
});

test('home keeps SSR titles visible while hydration data is pending', async () => {
    const h = harness({ serverRendered: true });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    for (const name of ['getTrending', 'getPopularMovies', 'getPopularTV', 'getAnimeTVShows']) h.api.tmdbAPI[name] = () => pending;
    const rendering = h.api.pages.home();
    assert.equal(h.app.innerHTML, '<h1>Server-rendered titles</h1>');
    release({ results: [{ id: 1, title: 'Loaded title', media_type: 'movie', genre_ids: [] }] });
    await rendering;
    assert.ok(h.app.innerHTML.includes('Loaded title'));
    assert.ok(h.app.innerHTML.includes('id="hero-carousel"'));
});

test('a stale loading target cannot replace the newer route content', () => {
    const h = harness();
    const stale = h.api.routeTarget();
    h.api.pages.home = () => {};
    h.api.router.handleRoute();
    h.api.routeTarget().innerHTML = '<h1>New route</h1>';
    h.api.showRouteLoading(stale);
    assert.equal(h.app.innerHTML, '<h1>New route</h1>');
});

test('slide changes wrap indices and keep exactly one accessible active slide and dot', () => {
    const h = harness();
    const carousel = h.mountCarousel();
    for (const [input, expected] of [[7, 2], [-1, 4], [0, 0]]) {
        h.api.goToSlide(input);
        assert.equal(h.api.snapshot().currentSlide, expected);
        carousel.slides.forEach((slide, i) => {
            assert.equal(slide.classList.contains('active'), i === expected);
            assert.equal(slide.inert, i !== expected);
            assert.equal(slide.getAttribute('aria-hidden'), String(i !== expected));
        });
        carousel.dots.forEach((dot, i) => {
            assert.equal(dot.classList.contains('active'), i === expected);
            assert.equal(dot.getAttribute('aria-pressed'), String(i === expected));
        });
        assert.equal(h.timers.size, 1);
    }
});

test('returning home derives the new first slide and preserves explicit pause choice with truthful button state', () => {
    const h = harness();
    const first = h.mountCarousel();
    h.api.startHeroCarousel();
    h.api.goToSlide(4);
    h.window.toggleHeroRotation(first.pause);
    assert.equal(h.api.snapshot().heroPaused, true);
    assert.equal(h.timers.size, 0);
    h.api.stopHeroCarousel();
    const returning = h.mountCarousel(0);
    h.api.startHeroCarousel();
    assert.equal(h.api.snapshot().currentSlide, 0);
    assert.equal(returning.pause.textContent, 'Resume slideshow');
    assert.equal(returning.pause.getAttribute('aria-pressed'), 'true');
    assert.equal(h.timers.size, 0);
    h.window.toggleHeroRotation(returning.pause);
    assert.equal(returning.pause.textContent, 'Pause slideshow');
    assert.equal(returning.pause.getAttribute('aria-pressed'), 'false');
    assert.equal(h.timers.size, 1);
    h.api.nextSlide();
    assert.equal(h.api.snapshot().currentSlide, 1);
});

test('carousel initialization is idempotent and stops rotation while hidden or keyboard focused', () => {
    const h = harness();
    const carousel = h.mountCarousel();
    h.api.startHeroCarousel();
    const focusCallback = carousel.events.focusin;
    h.api.startHeroCarousel();
    assert.equal(carousel.events.focusin, focusCallback);
    assert.equal(h.timers.size, 1);
    h.document.hidden = true;
    h.documentEvents.visibilitychange();
    assert.equal(h.timers.size, 0);
    h.document.hidden = false;
    h.document.activeElement = carousel.pause;
    h.api.startHeroCarousel();
    assert.equal(h.timers.size, 0);
    h.document.activeElement = null;
    carousel.events.focusout({ relatedTarget: null });
    assert.equal(h.timers.size, 1);
});
