const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SiteSEO = require('../seo-core.js');
const context = { window: { SiteSEO }, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('detail.js', 'utf8') + '\nthis.schemas = { buildMovieSchema, buildTVSchema };', context);

test('movie and TV schema retain genuine absolute TMDB poster URLs without imported ratings', () => {
    for (const [build, data, type] of [
        [context.schemas.buildMovieSchema, { id: 550, title: 'Fight Club', poster_path: '/genuine-poster_42.jpg', vote_average: 8.4 }, 'Movie'],
        [context.schemas.buildTVSchema, { id: 1396, name: 'Breaking Bad', poster_path: '/genuine-poster_42.png', vote_average: 8.9 }, 'TVSeries']
    ]) {
        const schema = JSON.parse(JSON.stringify(build(data)))['@graph'][0];
        assert.equal(schema['@type'], type);
        assert.equal(schema.image, 'https://image.tmdb.org/t/p/w780' + data.poster_path);
        assert.ok(schema.url.startsWith(SiteSEO.SITE + '/'));
        assert.ok(!schema.aggregateRating);
    }
});

test('missing or malformed poster paths omit schema image rather than publishing blank or unrelated images', () => {
    for (const poster_path of [undefined, null, '', 'poster.jpg', 'https://example.com/poster.jpg', '//example.com/poster.jpg', '/../../poster.jpg', '/poster.jpg?tracking=1', '/poster.jpg#fragment', '/blank.svg']) {
        for (const build of [context.schemas.buildMovieSchema, context.schemas.buildTVSchema]) {
            const schema = JSON.parse(JSON.stringify(build({ id: 1, title: 'Example', name: 'Example', poster_path })))['@graph'][0];
            assert.ok(!Object.hasOwn(schema, 'image'), String(poster_path));
            assert.ok(!JSON.stringify(schema).includes('data:image/'));
        }
    }
});
