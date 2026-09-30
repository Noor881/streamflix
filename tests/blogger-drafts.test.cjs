const test = require('node:test');
const assert = require('node:assert/strict');
const {bloggerDraftUrl, postToBlogger, generateFallbackArticle, formatForBlogger} = require('../scripts/auto-blogger.js');

test('Blogger requests are draft-only and reject invalid destinations', () => {
    const url = new URL(bloggerDraftUrl('123456'));
    assert.equal(url.searchParams.get('isDraft'), 'true');
    assert.throws(() => bloggerDraftUrl('../posts/publish'), /Invalid/);
});

test('Blogger helper requires draft confirmation with no real network calls', async () => {
    let requests = 0;
    const request = async (url, options) => {
        requests++;
        assert.equal(new URL(url).searchParams.get('isDraft'), 'true');
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.equal(body.title, 'A factual draft');
        return {status: 201, data: {status: 'DRAFT'}};
    };
    const result = await postToBlogger({id: '123', name: 'Test'}, {title: 'A factual draft', content: '<p>Facts.</p>', labels: []}, 'test-token', request);
    assert.deepEqual(result, {success: true, draft: true, url: undefined});
    assert.equal(requests, 1);
    const unexpected = await postToBlogger({id: '123', name: 'Test'}, {title: 'Draft'}, 'test-token', async () => ({status: 201, data: {status: 'LIVE'}}));
    assert.equal(unexpected.success, false);
});

test('Fallback drafts do not invent reviews, availability or repeated backlinks', () => {
    const data = {title: '<Example>', year: 2026, rating: '7.2', contentType: 'Movie', overview: '<script>bad</script>', movieUrl: 'https://example.test/movie/1', cast: []};
    const article = generateFallbackArticle(data);
    assert.match(article, /not a first-hand review/);
    assert.match(article, /TMDB community score/);
    assert.match(article, /&lt;script&gt;/);
    assert.doesNotMatch(article, /<script>|best releases|garnered praise|free in HD|<a\b/i);
    const post = formatForBlogger(data, article);
    assert.match(post.title, /Editorial Draft/);
    assert.match(post.content, /Human fact-checking/);
    assert.doesNotMatch(post.content, /Watch.*Free in HD/i);
});
