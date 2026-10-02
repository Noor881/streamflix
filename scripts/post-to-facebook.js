/**
 * Automated Social Media Poster — GitHub Actions Version
 * Replicates the n8n "HDW - Auto Social Media (7 Posts/Day)" workflow.
 *
 * Flow:
 *  1. Fetch movies from 3 TMDB endpoints (Now Playing, Trending, Popular)
 *  2. Deduplicate by movie ID
 *  3. Pick a random movie (bias toward newer releases in morning hours)
 *  4. Build a caption from randomized templates
 *  5. Post as a photo (TMDB poster) to all 5 Facebook pages
 *  6. Post a tweet with movie poster to Twitter/X
 */

const crypto = require('crypto');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const FB_GRAPH = 'https://graph.facebook.com/v18.0';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const SITE_URL = 'https://hdwatchzone.com';

const FACEBOOK_PAGES = [
    { name: 'HD Watchzone', id: '1009075248958069', tokenEnv: 'FB_HD_WATCHZONE_TOKEN' },
    { name: 'Free HD Movies', id: '907846982423210', tokenEnv: 'FB_FREE_HD_MOVIES_TOKEN' },
    { name: 'Movie Hub HD', id: '978687151995440', tokenEnv: 'FB_MOVIE_HUB_HD_TOKEN' },
    { name: 'Cinema Stream HD', id: '1059529833900929', tokenEnv: 'FB_CINEMA_STREAM_HD_TOKEN' },
    { name: 'Watchzone Movies', id: '1029715943551974', tokenEnv: 'FB_WATCHZONE_MOVIES_TOKEN' },
];

const POST_TEMPLATES = [
    (m, r, y, link) =>
        `🔗 ${link}\n\n🎬 ${m.title}${y ? ` (${y})` : ''}\n\n${m.overview}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n🍿 Explore title information on HD Watchzone.`,
    (m, r, _y, link) =>
        `🔗 ${link}\n\n🎬 Discover: ${m.title}\n\n${m.overview}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n👉 Browse cast, genres and title information.`,
    (m, r, _y, link) =>
        `🔗 ${link}\n\n🎥 Explore ${m.title}\n\n${m.overview}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n🍿 Find title information on HD Watchzone.`,
    (m, r, y, link) =>
        `🔗 ${link}\n\n📺 Featured title: ${m.title}${y ? ` (${y})` : ''}\n\n${m.overview}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n🎬 Explore the overview and cast.`,
    (m, r, _y, link) =>
        `🔗 ${link}\n\n🌟 Discover ${m.title}\n\n${m.overview}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n🎬 Browse title information and related movies.`,
];

const TWEET_TEMPLATES = [
    (m, r, link, desc) =>
        `🔗 ${link}\n\n🎬 ${m.title}\n\n${desc}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n#Movies #MovieDiscovery`,
    (m, r, link, desc) =>
        `🔗 ${link}\n\n🎬 Discover: ${m.title}\n\n${desc}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n#Movies #FilmInfo`,
    (m, r, link, desc) =>
        `🔗 ${link}\n\n🎥 ${m.title}\n\n${desc}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n#MovieNight #FilmDiscovery`,
    (m, r, link, desc) =>
        `🔗 ${link}\n\n📺 ${m.title}\n\n${desc}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n#Movies #HDWatchzone`,
    (m, r, link, desc) =>
        `🔗 ${link}\n\n🌟 Explore ${m.title}\n\n${desc}\n\n${r ? `⭐ TMDB community score: ${r}` : ''}\n\n#MovieTime #FilmInfo`,
];

async function fetchJson(url) {
    const res = await fetch(url, {signal:AbortSignal.timeout(15000)});
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${require('../server/tmdb.js').redact(url)}`);
    }
    return res.json();
}

async function fetchMovies(tmdbKey) {
    const endpoints = [
        `${TMDB_BASE}/movie/now_playing?api_key=${tmdbKey}&language=en-US&page=1`,
        `${TMDB_BASE}/trending/movie/day?api_key=${tmdbKey}&language=en-US`,
        `${TMDB_BASE}/movie/popular?api_key=${tmdbKey}&language=en-US&page=1`,
    ];

    const responses = await Promise.all(endpoints.map(fetchJson));
    const allMovies = responses.flatMap((r) => r.results || []);

    const seen = new Set();
    const unique = allMovies.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

    return unique.sort((a, b) => {
        const dateA = new Date(a.release_date || '2000-01-01');
        const dateB = new Date(b.release_date || '2000-01-01');
        return dateB.getTime() - dateA.getTime();
    });
}

function pickMovie(movies) {
    if (movies.length === 0) {
        throw new Error('No movies available from TMDB');
    }

    const hour = new Date().getUTCHours();

    if (hour <= 8 && movies.length > 5) {
        return movies[Math.floor(Math.random() * 5)];
    }

    return movies[Math.floor(Math.random() * movies.length)];
}

function buildPost(movie) {
    const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : '';
    const year = movie.release_date ? movie.release_date.split('-')[0] : '';
    const posterUrl = movie.poster_path ? `${POSTER_BASE}${movie.poster_path}` : '';
    const movieLink = `${SITE_URL}/movie.html?id=${movie.id}`;

    const fbTemplate = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];
    const fbText = fbTemplate(movie, rating, year, movieLink);

    // Truncate overview for Twitter (280 char limit)
    const maxDescLen = 100;
    const desc = movie.overview
        ? (movie.overview.length > maxDescLen ? movie.overview.slice(0, maxDescLen) + '...' : movie.overview)
        : '';
    const tweetTemplate = TWEET_TEMPLATES[Math.floor(Math.random() * TWEET_TEMPLATES.length)];
    const tweetText = tweetTemplate(movie, rating, movieLink, desc);

    return { fbText, tweetText, movieLink, posterUrl, movieTitle: movie.title, movieId: movie.id };
}

async function postToFacebook(page, postData) {
    const token = process.env[page.tokenEnv];
    if (!token) {
        throw new Error(`Missing env var: ${page.tokenEnv}`);
    }

    const params = new URLSearchParams({
        message: postData.fbText,
        url: postData.posterUrl,
        access_token: token,
    });

    const url = `${FB_GRAPH}/${page.id}/photos?${params.toString()}`;
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json();

    if (!res.ok || body.error) {
        const errMsg = body.error ? body.error.message : JSON.stringify(body);
        throw new Error(`FB ${page.name}: ${errMsg}`);
    }

    return body;
}

/* ─── Twitter/X OAuth 1.0a Signing ─── */

function percentEncode(str) {
    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/\*/g, '%2A')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

function generateNonce() {
    return crypto.randomBytes(16).toString('hex');
}

function buildOAuthSignature(method, baseUrl, params, consumerSecret, tokenSecret) {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');

    const signatureBase = [
        method.toUpperCase(),
        percentEncode(baseUrl),
        percentEncode(paramString),
    ].join('&');

    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
    const hmac = crypto.createHmac('sha1', signingKey);
    hmac.update(signatureBase);
    return hmac.digest('base64');
}

function buildOAuthHeader(method, url, consumerKey, consumerSecret, accessToken, tokenSecret, extraParams = {}) {
    const oauthParams = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: accessToken,
        oauth_version: '1.0',
    };

    // For v1.1, body params must be included in the signature base string
    const allParams = { ...oauthParams, ...extraParams };
    const signature = buildOAuthSignature(method, url, allParams, consumerSecret, tokenSecret);
    oauthParams.oauth_signature = signature;

    const headerParts = Object.keys(oauthParams)
        .sort()
        .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
        .join(', ');

    return `OAuth ${headerParts}`;
}

async function uploadTwitterMedia(imageUrl, apiKey, apiSecret, accessToken, accessSecret) {
    // Download the image from TMDB
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
        throw new Error(`Failed to download poster: HTTP ${imgRes.status}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const base64Image = imgBuffer.toString('base64');

    // Upload to Twitter media endpoint (v1.1 — available on Free tier)
    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const bodyParams = { media_data: base64Image };

    const authHeader = buildOAuthHeader('POST', uploadUrl, apiKey, apiSecret, accessToken, accessSecret, bodyParams);

    const formBody = Object.keys(bodyParams)
        .map((k) => `${percentEncode(k)}=${percentEncode(bodyParams[k])}`)
        .join('&');

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
    });

    const body = await res.json();

    if (!res.ok) {
        const errMsg = body.errors ? body.errors.map((e) => e.message).join(', ') : JSON.stringify(body);
        throw new Error(`Media upload: ${errMsg}`);
    }

    return body.media_id_string;
}

async function postToTwitter(postData) {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        throw new Error('Missing Twitter API credentials in environment');
    }

    // Step 1: Upload movie poster image
    let mediaId = null;
    if (postData.posterUrl) {
        try {
            mediaId = await uploadTwitterMedia(postData.posterUrl, apiKey, apiSecret, accessToken, accessSecret);
            console.log(`   📸 Poster uploaded: media_id=${mediaId}`);
        } catch (err) {
            console.warn(`   ⚠️ Poster upload failed (posting text only): ${err.message}`);
        }
    }

    // Step 2: Post tweet with optional media attachment
    const tweetUrl = 'https://api.twitter.com/2/tweets';
    const authHeader = buildOAuthHeader('POST', tweetUrl, apiKey, apiSecret, accessToken, accessSecret);

    const tweetBody = { text: postData.tweetText };
    if (mediaId) {
        tweetBody.media = { media_ids: [mediaId] };
    }

    const res = await fetch(tweetUrl, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetBody),
    });

    const body = await res.json();

    if (!res.ok) {
        const errMsg = body.detail || body.title || (body.errors ? body.errors.map((e) => e.message).join(', ') : JSON.stringify(body));
        throw new Error(`Twitter: ${errMsg}`);
    }

    return body;
}

async function main() {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        throw new Error('Missing TMDB_API_KEY environment variable');
    }

    console.log('📡 Fetching movies from TMDB...');
    const movies = await fetchMovies(tmdbKey);
    console.log(`   Found ${movies.length} unique movies`);

    const movie = pickMovie(movies);
    const post = buildPost(movie);
    console.log(`🎬 Selected: "${post.movieTitle}" (ID: ${post.movieId})`);
    console.log(`🖼️  Poster: ${post.posterUrl}`);

    const allResults = [];

    /* ── Facebook ── */
    console.log(`\n📤 Posting to ${FACEBOOK_PAGES.length} Facebook pages...`);
    for (const page of FACEBOOK_PAGES) {
        try {
            const result = await postToFacebook(page, post);
            console.log(`   ✅ ${page.name}: post_id=${result.post_id || result.id}`);
            allResults.push({ platform: 'Facebook', target: page.name, success: true });
        } catch (err) {
            console.error(`   ❌ ${page.name}: ${err.message}`);
            allResults.push({ platform: 'Facebook', target: page.name, success: false });
        }
    }

    /* ── Twitter/X (rate-limited: 3/day to stay under 100/month Free tier) ── */
    const twitterHours = [6, 10, 14]; // Only tweet at these UTC hours
    const currentHour = new Date().getUTCHours();
    const shouldTweet = twitterHours.includes(currentHour);

    if (shouldTweet) {
        console.log('\n🐦 Posting to Twitter/X...');
        try {
            const result = await postToTwitter(post);
            const tweetId = result.data ? result.data.id : 'unknown';
            console.log(`   ✅ Twitter: tweet_id=${tweetId}`);
            allResults.push({ platform: 'Twitter', target: '@NoorUlH54887369', success: true });
        } catch (err) {
            console.error(`   ❌ Twitter: ${err.message}`);
            allResults.push({ platform: 'Twitter', target: '@NoorUlH54887369', success: false });
        }
    } else {
        console.log(`\n🐦 Twitter/X: skipped (hour ${currentHour} UTC — tweets at ${twitterHours.join(',')} UTC only, ~90/month)`);
    }

    /* ── Summary ── */
    const succeeded = allResults.filter((r) => r.success).length;
    const failed = allResults.filter((r) => !r.success).length;
    console.log(`\n📊 Results: ${succeeded}/${allResults.length} succeeded, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
