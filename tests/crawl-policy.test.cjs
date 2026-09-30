const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const config = require('../vercel.json');

function robotGroups(source) {
    const groups = [];
    let group;
    for (const raw of source.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        if (!line) continue;
        const index = line.indexOf(':');
        if (index < 0) continue;
        const field = line.slice(0,index).trim().toLowerCase();
        const value = line.slice(index+1).trim();
        if (field === 'user-agent') {
            if (!group || group.rules.length) groups.push(group = {agents:[],rules:[]});
            group.agents.push(value.toLowerCase());
        } else if (group && ['allow','disallow'].includes(field)) {
            group.rules.push({field,value});
        }
    }
    return groups;
}

function rulesFor(agent) {
    const groups = robotGroups(fs.readFileSync('robots.txt','utf8'));
    const matches = groups.filter(group => group.agents.some(value => value !== '*' && agent.toLowerCase().includes(value)));
    const selected = matches.length ? matches : groups.filter(group => group.agents.includes('*'));
    return selected.flatMap(group => group.rules);
}

function robotsHeaders(pathname, query = {}) {
    return config.headers.filter(rule => {
        const pattern = rule.source.replace('/:path*', '(?:/.*)?');
        const pathMatches = new RegExp(`^${pattern}$`).test(pathname);
        return pathMatches && (!rule.missing || rule.missing.every(condition => condition.type === 'query' && !(condition.key in query)));
    }).flatMap(rule => rule.headers).filter(header => header.key.toLowerCase() === 'x-robots-tag').map(header => header.value);
}

test('permitted named crawlers share wildcard API restrictions, not stale unrestricted groups', () => {
    for (const agent of ['Googlebot','Bingbot','GPTBot','PerplexityBot','UnknownCrawler']) {
        const rules = rulesFor(agent);
        assert.ok(rules.some(rule => rule.field === 'disallow' && rule.value === '/api/'),agent);
        assert.ok(!rules.some(rule => rule.field === 'disallow' && /admin|928480/.test(rule.value)),agent);
    }
});

test('the existing opted-out crawler groups remain blocked', () => {
    for (const agent of ['Bytespider','CCBot','Amazonbot']) {
        assert.ok(rulesFor(agent).some(rule => rule.field === 'disallow' && rule.value === '/'),agent);
    }
});

test('public HTML rewrites and title aliases do not receive forced indexing or utility noindex headers', () => {
    for (const path of ['/','/movies','/tv','/anime','/new','/genre/28','/movie/550-fight-club','/tv/1396-breaking-bad/2/3','/api/render']) {
        assert.deepEqual(robotsHeaders(path),[],path);
    }
    assert.deepEqual(robotsHeaders('/movies',{page:'2',category:'top_rated'}),[]);
    assert.deepEqual(robotsHeaders('/movie.html',{id:'550'}),[]);
    assert.deepEqual(robotsHeaders('/tv.html',{id:'1396'}),[]);
    assert.ok(!config.headers.some(rule => rule.headers.some(header => header.key === 'X-Robots-Tag' && /^index/.test(header.value))));
});

test('utility pages and non-content artifacts are noindex without blocking rendering assets', () => {
    for (const path of ['/offline.html','/404.html','/admin.html','/account','/my-list','/search','/movie.html','/tv.html','/docs/audit.md','/seo-results/combined.json','/tests/core.test.cjs','/data/movies.sample.json','/app.js','/cards.css','/manifest.json']) {
        assert.ok(robotsHeaders(path).some(value => value.includes('noindex')),path);
    }
    const rules = rulesFor('Googlebot');
    assert.ok(!rules.some(rule => rule.field === 'disallow' && /(?:\.js|\.css|scripts|images)/.test(rule.value)));
});

test('homepage SSR, permanent index alias, and slash policy agree with canonical URLs', () => {
    assert.ok(config.rewrites.some(rule => rule.source === '/' && rule.destination === '/api/render?route=home'));
    assert.ok(config.redirects.some(rule => rule.source === '/index.html' && rule.destination === '/' && rule.permanent === true));
    assert.equal(config.trailingSlash,false);
    assert.ok(!config.redirects.some(rule => rule.source.includes('928480')),'renderer emits a real removal response');
    assert.ok(config.functions['api/render.js'].includeFiles.includes('app.js'));
    assert.ok(config.functions['api/render.js'].includeFiles.includes('detail.js'));
    assert.ok(config.functions['api/render.js'].includeFiles.includes('seo-core.js'));
    assert.ok(config.functions['api/render.js'].includeFiles.includes('server/templates/*.html'));
});

test('the www host canonical redirect is permanent and cannot redirect the apex to itself', () => {
    const rule = config.redirects.find(rule => rule.has?.some(condition => condition.type === 'host' && condition.value === 'www.hdwatchzone.com'));
    assert.ok(rule);
    assert.equal(rule.source,'/:path*');
    assert.equal(rule.destination,'https://hdwatchzone.com/:path*');
    assert.equal(rule.permanent,true);
    assert.ok(!rule.has.some(condition => condition.value === 'hdwatchzone.com'));
});
