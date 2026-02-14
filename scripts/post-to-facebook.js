/**
 * Automated Facebook Poster — GitHub Actions Version
 * Replicates the n8n "HDW - Auto Social Media (7 Posts/Day)" workflow.
 *
 * Flow:
 *  1. Fetch movies from 3 TMDB endpoints (Now Playing, Trending, Popular)
 *  2. Deduplicate by movie ID
 *  3. Pick a random movie (bias toward newer releases in morning hours)
 *  4. Build a caption from randomized templates
 *  5. Post as a photo (TMDB poster) to all 5 Facebook pages
 */

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
        `🎬 ${m.title}${y ? ` (${y})` : ''}\n\n${m.overview}\n\n${r ? `⭐ ${r}` : ''}\n\n🍿 Watch now on HD Watchzone!\n🔗 ${link}`,
    (m, r, _y, link) =>
        `🔥 NOW STREAMING: ${m.title}\n\n${m.overview}\n\n${r ? `Rating: ⭐ ${r}` : ''}\n\n👉 ${link}`,
    (m, r, _y, link) =>
        `🎥 Don't miss ${m.title}!\n\n${m.overview}\n\n${r ? `⭐ IMDb: ${r}` : ''}\n\n🍿 Stream free: ${link}`,
    (m, r, y, link) =>
        `📺 Featured: ${m.title}${y ? ` (${y})` : ''}\n\n${m.overview}\n\n${r ? `⭐ ${r}` : ''}\n\n🎬 ${link}`,
    (m, r, _y, link) =>
        `🌟 ${m.title} is now available!\n\n${m.overview}\n\n${r ? `⭐ ${r}` : ''}\n\n▶️ Watch: ${link}`,
];

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
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

    const template = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];
    const postText = template(movie, rating, year, movieLink);

    return { postText, movieLink, posterUrl, movieTitle: movie.title, movieId: movie.id };
}

async function postToFacebook(page, postData) {
    const token = process.env[page.tokenEnv];
    if (!token) {
        throw new Error(`Missing env var: ${page.tokenEnv}`);
    }

    const params = new URLSearchParams({
        message: `${postData.postText}\n\n🔗 Watch now: ${postData.movieLink}`,
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

    console.log(`\n📤 Posting to ${FACEBOOK_PAGES.length} Facebook pages...`);

    const results = [];
    for (const page of FACEBOOK_PAGES) {
        try {
            const result = await postToFacebook(page, post);
            console.log(`   ✅ ${page.name}: post_id=${result.post_id || result.id}`);
            results.push({ page: page.name, success: true, postId: result.post_id || result.id });
        } catch (err) {
            console.error(`   ❌ ${page.name}: ${err.message}`);
            results.push({ page: page.name, success: false, error: err.message });
        }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`\n📊 Results: ${succeeded} succeeded, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
