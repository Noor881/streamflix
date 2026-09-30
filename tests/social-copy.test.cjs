const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SITE_URL = 'https://hdwatchzone.com';
const movie = { id: 550, title: 'Example Movie', overview: 'A supplied TMDB synopsis.', release_date: '1999-10-15', vote_average: 8.4, poster_path: '/poster.jpg' };
const details = { runtime: 139, genres: [{ name: 'Drama' }], credits: { crew: [{ job: 'Director', name: 'Example Director' }], cast: [{ name: 'Example Performer' }] } };
const unsupported = /\b(?:IMDb|free|now streaming|now available|available now in HD|HD quality)\b/i;

function between(source, start, end, offset = 0) {
    const first = source.indexOf(start, offset);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, 'Expected a bounded, pure template section');
    return source.slice(first, last);
}

// Evaluate only pure copy sections. Neither publishing script, its main function,
// transport methods, credentials nor external services are executed by these tests.
const facebook = fs.readFileSync('scripts/post-to-facebook.js', 'utf8');
const fbContext = {};
vm.runInNewContext(between(facebook, 'const POST_TEMPLATES', 'async function fetchJson') + '\nthis.templates = { POST_TEMPLATES, TWEET_TEMPLATES };', fbContext);

const daily = fs.readFileSync('scripts/daily-poster.js', 'utf8');
const helpers = between(daily, 'function createSlug', 'function loadPostedIds');
const telegram = between(daily, '    const title = movie.title;', '    const body = JSON.stringify', daily.indexOf('async function postToTelegram'));
const reddit = between(daily, '    const title = movie.title;', '    const body = new URLSearchParams', daily.indexOf('async function postToReddit'));
assert.ok(!/httpsPost|httpsGet|fetch\(/.test(telegram + reddit));
const dailyContext = { SITE_URL };
vm.runInNewContext(helpers + '\nthis.telegramCopy = function(movie, details) {' + telegram + '\nreturn { caption, movieUrl }; };\nthis.redditCopy = function(movie, details) {' + reddit + '\nreturn { postTitle, postText, movieUrl }; };', dailyContext);

test('every Facebook and X template attributes TMDB scores and promotes discovery without playback claims', () => {
    const link = SITE_URL + '/movie/550-example-movie';
    for (const template of fbContext.templates.POST_TEMPLATES) {
        const copy = template(movie, '8.4/10', '1999', link);
        assert.ok(copy.includes('TMDB community score: 8.4/10'));
        assert.ok(copy.includes(movie.title) && copy.includes(link));
        assert.ok(!unsupported.test(copy), copy);
        assert.ok(!template(movie, '', '1999', link).includes('TMDB community score:'));
    }
    for (const template of fbContext.templates.TWEET_TEMPLATES) {
        const copy = template(movie, '8.4/10', link, movie.overview);
        assert.ok(copy.includes('TMDB community score: 8.4/10'));
        assert.ok(copy.includes(movie.title) && copy.includes(link));
        assert.ok(!unsupported.test(copy), copy);
        assert.ok(!template(movie, '', link, movie.overview).includes('TMDB community score:'));
    }
});

test('Telegram and Reddit copy use supplied metadata with a title-info link and truthful availability limits', () => {
    const telegram = dailyContext.telegramCopy(movie, details);
    const reddit = dailyContext.redditCopy(movie, details);
    for (const copy of [telegram.caption, reddit.postTitle + '\n' + reddit.postText]) {
        assert.ok(copy.includes(movie.title));
        assert.ok(copy.includes('TMDB community score') && copy.includes('8.4/10'));
        assert.ok(copy.includes('availability') && copy.includes('provider and region'));
        assert.ok(copy.includes(SITE_URL + '/movie/550-example-movie'));
        assert.ok(!unsupported.test(copy), copy);
    }
    assert.ok(telegram.caption.includes('Example Director'));
    assert.ok(reddit.postText.includes('Example Performer'));
});

test('daily social copy reports an absent community score without inventing a numeric rating', () => {
    for (const vote_average of [0, undefined, null]) {
        const unrated = { ...movie, vote_average };
        for (const copy of [dailyContext.telegramCopy(unrated, details).caption, dailyContext.redditCopy(unrated, details).postText]) {
            assert.ok(copy.includes('Not supplied'));
            assert.ok(!copy.includes('N/A/10'));
            assert.ok(!/\b\d+(?:\.\d+)?\/10\b/.test(copy));
        }
    }
});
