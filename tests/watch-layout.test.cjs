const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SiteSEO = require('../seo-core.js');
const { detail: renderDetail } = require('../server/ssr.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function detailFixture(data) {
    const app = { innerHTML: '' };
    const context = {
        console, URL, URLSearchParams, AbortSignal,
        window: { SiteSEO, location: { pathname: '/', search: '' }, addEventListener() {} },
        document: { addEventListener() {}, getElementById: id => id === 'detail-app' ? app : null },
        fixtureData: data
    };
    vm.createContext(context);
    new vm.Script(read('detail.js') + `
        this.testing = { buildRecos, DetailPage, scrollRecommendations, updateRecommendationsRail, initRecommendationsRail };
        fetchWithRetry = async () => fixtureData;
        buildTrendingSection = async () => '';
        updateMeta = () => {};
        injectSchema = async () => {};
        saveToHistory = () => {};
        loadEpisodes = async () => {};
        layoutWatchPage = () => {};
        DetailPage.initNavScroll = () => {};
    `, { filename: 'detail.js' }).runInContext(context);
    return { ...context.testing, app, context };
}

// The renderers produce well-formed fragments. Track tag ancestry so a matching
// closing div in a card cannot accidentally stand in for the sidebar boundary.
function elements(html) {
    const nodes = [];
    const stack = [];
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const tags = /<\/?[a-zA-Z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
    for (const match of html.matchAll(tags)) {
        const tag = match[0].match(/^<\/?([\w:-]+)/)[1].toLowerCase();
        if (match[0].startsWith('</')) {
            const index = stack.findLastIndex(node => node.tag === tag);
            if (index !== -1) stack.length = index;
            continue;
        }
        const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(attr => [attr[1], attr[2] ?? attr[3]]));
        const node = { tag, attrs, classes: new Set((attrs.class || '').split(/\s+/)), parent: stack.at(-1), index: match.index };
        nodes.push(node);
        if (!voidTags.has(tag) && !match[0].endsWith('/>')) stack.push(node);
    }
    return nodes;
}

function descendantsOf(node, ancestor) {
    for (let current = node.parent; current; current = current.parent) {
        if (current === ancestor) return true;
    }
    return false;
}

const card = (id, title, extra = {}) => ({ id, title, poster_path: `/poster-${id}.jpg`, release_date: '2024-01-01', vote_average: 7.8, ...extra });

function assertRecommendationStructure(html, expectedType) {
    const nodes = elements(html);
    const section = nodes.find(node => node.classes.has('detail-recommendations'));
    const content = nodes.find(node => node.classes.has('detail-content'));
    const sidebar = nodes.find(node => node.classes.has('detail-sidebar'));
    assert.ok(section, 'recommendations render as a separate section');
    assert.equal(section.tag, 'section');
    assert.ok(section.attrs['aria-label'], 'recommendations section has an accessible name');
    assert.ok(content && sidebar, 'detail columns remain present');
    assert.equal(section.parent, content.parent, 'recommendations span the page below the columns');
    assert.ok(section.index > sidebar.index, 'recommendations follow the detail columns');
    assert.ok(!descendantsOf(section, content));
    assert.ok(!nodes.some(node => node.classes.has('reco-card') && descendantsOf(node, sidebar)), 'metadata sidebar contains no recommendation cards');
    assert.ok(nodes.some(node => node.classes.has('details-grid') && descendantsOf(node, sidebar)), 'title metadata stays in the sidebar');
    const rail = nodes.find(node => node.classes.has('recommendations-rail'));
    assert.ok(rail && descendantsOf(rail, section));
    assert.ok(rail.classes.has('reco-grid'), 'rail retains the shared portrait card classes');
    assert.equal(rail.attrs.role, 'region');
    assert.equal(rail.attrs.tabindex, '0', 'the horizontal rail is keyboard focusable');
    assert.ok(nodes.some(node => /^h[1-6]$/.test(node.tag) && node.attrs.id === rail.attrs['aria-labelledby']), 'the rail is named by a visible heading');
    const links = nodes.filter(node => node.classes.has('reco-card'));
    assert.equal(links.length, 1);
    assert.equal(links[0].tag, 'a');
    assert.match(links[0].attrs.href, new RegExp(`^/${expectedType}/\\d+-[a-z0-9-]+$`));
    return section;
}

test('shared recommendation rail caps valid unique titles after filtering and preserves cross-media identities', () => {
    const { buildRecos } = detailFixture();
    const invalid = [
        null, undefined, {},
        card(0, 'Zero'), card(-1, 'Negative'), card(1.5, 'Fraction'),
        card(Number.MAX_SAFE_INTEGER + 1, 'Unsafe integer'),
        card('1-invalid', 'Invalid ID'), card(77, 'Person', { media_type: 'person' }),
        card(78, ''), card(79, '   '), card(80, { title: 'Not text' }),
        ...['https://example.com/poster.jpg', '//example.com/poster.jpg', '/../../poster.jpg', '/poster.jpg?tracking=1', '/poster.jpg#fragment', '/poster.jpg\" onerror=\"alert(1)'].map((poster_path, index) => card(100 + index, 'Unsafe poster', { poster_path }))
    ];
    const eligible = [
        card(1, 'First title'),
        card(1, 'Duplicate default type', { media_type: 'movie' }),
        card(1, 'A TV title', { media_type: 'tv', name: 'A TV title' }),
        ...Array.from({ length: 13 }, (_, index) => card(index + 2, `Title ${index + 2}`))
    ];
    const nodes = elements(buildRecos([...invalid, ...eligible], 'movie'));
    const hrefs = nodes.filter(node => node.classes.has('reco-card')).map(node => node.attrs.href);
    assert.equal(hrefs.length, 12);
    assert.equal(new Set(hrefs.map(href => href.match(/^\/(movie|tv)\/(\d+)-/).slice(1).join(':'))).size, 12);
    assert.ok(hrefs.includes('/movie/1-first-title'));
    assert.ok(hrefs.includes('/tv/1-a-tv-title'), 'the same numeric ID can identify distinct movie and TV titles');
    assert.ok(hrefs.includes('/movie/11-title-11'), 'invalid and duplicate inputs do not consume the limit');
    assert.ok(!hrefs.some(href => href.startsWith('/movie/12-')));
    assert.ok(hrefs.every(href => /^\/(movie|tv)\/[1-9]\d*-[a-z0-9-]+$/.test(href)), 'all cards expose safe, crawlable title routes');
});

test('recommendations escape labels, retain responsive portrait images, and allow missing poster fallback', () => {
    const { buildRecos } = detailFixture();
    const title = '<script>alert("quoted")</script> & Example';
    const html = buildRecos([
        card(20, title),
        { id: 21, name: 'No poster', media_type: 'tv' }
    ], 'movie');
    const nodes = elements(html);
    const links = nodes.filter(node => node.classes.has('reco-card'));
    const images = nodes.filter(node => node.tag === 'img');
    assert.equal(links.length, 2);
    assert.equal(images.length, 2);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp; Example'));
    assert.ok(!nodes.some(node => Object.hasOwn(node.attrs, 'onerror')));
    for (const image of images) {
        assert.equal(Number(image.attrs.width) / Number(image.attrs.height), 2 / 3);
        assert.equal(image.attrs.loading, 'lazy');
        assert.equal(image.attrs.decoding, 'async');
        assert.ok(image.attrs.alt);
    }
    assert.ok(images[0].attrs.srcset.includes('https://image.tmdb.org/t/p/w342/poster-20.jpg'));
    assert.ok(images[0].attrs.sizes);
    assert.ok(!images[1].attrs.srcset, 'a placeholder is not advertised as a TMDB image');
    assert.match(images[1].attrs.src, /^data:image\/svg\+xml,/);
    assert.equal(links[1].attrs.href, '/tv/21-no-poster');
});

test('empty, malformed, and completely filtered recommendations omit the entire rail', () => {
    const { buildRecos } = detailFixture();
    for (const value of [undefined, null, [], {}, 'not a list', [null, card(0, 'Invalid')]]) {
        assert.equal(buildRecos(value, 'movie'), '');
    }
});

for (const type of ['movie', 'tv']) {
    const data = {
        id: type === 'movie' ? 550 : 1396,
        title: type === 'movie' ? 'Fight Club' : undefined,
        name: type === 'tv' ? 'Breaking Bad' : undefined,
        overview: 'A title synopsis.', status: type === 'movie' ? 'Released' : 'Ended',
        release_date: '1999-10-15', first_air_date: '2008-01-20', vote_average: 8.4,
        poster_path: '/title.jpg', runtime: 139,
        number_of_seasons: 1, number_of_episodes: 7,
        seasons: [{ season_number: 1, episode_count: 7 }], genres: [],
        credits: { cast: [], crew: [] }, videos: { results: [] },
        recommendations: { results: [card(680, 'Related title', { media_type: type, name: 'Related title' })] }
    };
    test(`${type} server and browser renderers place the recommendation rail after both detail columns`, async () => {
        const fixture = detailFixture(data);
        if (type === 'movie') await fixture.DetailPage.loadMovie(data.id);
        else await fixture.DetailPage.loadTV(data.id, 1, 2);
        assertRecommendationStructure(fixture.app.innerHTML, type);
        assertRecommendationStructure(renderDetail(data, type, 1, 2), type);
        for (const html of [fixture.app.innerHTML, renderDetail(data, type, 1, 2)]) {
            assert.equal(html.split(data.overview).length - 1, 1, 'the synopsis appears once alongside the player');
        }
    });

    test(`${type} server and browser renderers leave no empty recommendation section`, async () => {
        const empty = { ...data, recommendations: { results: [] } };
        const fixture = detailFixture(empty);
        if (type === 'movie') await fixture.DetailPage.loadMovie(data.id);
        else await fixture.DetailPage.loadTV(data.id, 1, 2);
        for (const html of [fixture.app.innerHTML, renderDetail(empty, type, 1, 2)]) {
            assert.ok(!elements(html).some(node => node.classes.has('detail-recommendations')));
        }
    });
}

test('recommendation styling provides a horizontal rail without a sticky sidebar', () => {
    const styles = ['detail.css', 'design-v2.css', 'cards.css'].map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const railRules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(match => match[1].split(',').some(selector => /(?:^|\s)\.recommendations-rail$/.test(selector.trim())))
        .map(match => match[2]).join('\n');
    assert.match(railRules, /overflow-x\s*:\s*(?:auto|scroll)\b/, 'the full-width rail scrolls horizontally');
    assert.match(railRules, /(?:grid-auto-flow\s*:\s*column\b|display\s*:\s*flex\b)/, 'cards flow along the rail');
    assert.doesNotMatch(styles, /\.detail-sidebar\s*\{[^}]*position\s*:\s*sticky\b/);
    assert.doesNotMatch(railRules, /position\s*:\s*sticky\b/);
});

test('both watch templates invalidate the older cached detail layout assets', () => {
    for (const type of ['movie', 'tv']) {
        const template = read(`server/templates/${type}.html`);
        for (const asset of ['detail.css', 'design-v2.css', 'cards.css', 'detail.js']) {
            assert.ok(template.includes(`/${asset}?v=${asset === 'cards.css' ? 'watch17' : asset === 'detail.js' ? 'discover21' : 'ux20'}`), `${type}: ${asset} uses the updated watch-layout version`);
        }
    }
});

test('recommendation controls reflect overflow and scroll position and honor reduced motion', () => {
    const fixture = detailFixture();
    const classes = new Set();
    const previous = {};
    const next = {};
    const events = new Map();
    const scrolls = [];
    const section = {
        classList: {
            add: name => classes.add(name),
            toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
        },
        querySelector: selector => selector === '.reco-prev' ? previous : next
    };
    const rail = {
        scrollWidth: 1500, clientWidth: 500, scrollLeft: 0,
        closest: () => section,
        addEventListener: (name, handler, options) => events.set(name, { handler, options }),
        scrollBy: options => scrolls.push(options)
    };
    fixture.context.document.getElementById = id => id === 'recommendations-rail' ? rail : null;
    fixture.context.window.matchMedia = () => ({ matches: false });
    fixture.initRecommendationsRail();
    assert.ok(classes.has('rail-ready'));
    assert.ok(classes.has('has-overflow'));
    assert.equal(previous.disabled, true);
    assert.equal(next.disabled, false);
    assert.equal(events.get('scroll').options.passive, true);

    rail.scrollLeft = 500;
    events.get('scroll').handler();
    assert.equal(previous.disabled, false);
    assert.equal(next.disabled, false);
    rail.scrollLeft = 1000;
    fixture.updateRecommendationsRail();
    assert.equal(previous.disabled, false);
    assert.equal(next.disabled, true);

    fixture.scrollRecommendations(1);
    assert.ok(scrolls[0].left > 0);
    assert.ok(scrolls[0].left <= rail.clientWidth);
    assert.equal(scrolls[0].behavior, 'smooth');
    fixture.context.window.matchMedia = () => ({ matches: true });
    fixture.scrollRecommendations(-1);
    assert.ok(scrolls[1].left < 0);
    assert.equal(scrolls[1].behavior, 'auto');

    rail.scrollLeft = 0;
    rail.scrollWidth = rail.clientWidth;
    fixture.updateRecommendationsRail();
    assert.ok(!classes.has('has-overflow'), 'controls are hidden when every card fits');
    assert.equal(previous.disabled, true);
    assert.equal(next.disabled, true);
    fixture.context.document.getElementById = () => null;
    assert.doesNotThrow(() => fixture.initRecommendationsRail());
    assert.doesNotThrow(() => fixture.scrollRecommendations(1));
});
