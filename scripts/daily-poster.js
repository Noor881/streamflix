// HD Watchzone — Daily Social Media Auto-Poster
// Posts 2 trending movies daily to Telegram + Reddit
// Runs via GitHub Actions cron job

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────
const TMDB_KEY = process.env.TMDB_API_KEY || 'd74b73cd4563f614919e6493152fbc1e';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL_ID; // e.g. @hdwatchzone
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USER = process.env.REDDIT_USERNAME;
const REDDIT_PASS = process.env.REDDIT_PASSWORD;
const REDDIT_SUB = process.env.REDDIT_SUBREDDIT || 'HDWatchzone';
const SITE_URL = 'https://hdwatchzone.com';
const POSTED_FILE = path.join(__dirname, 'posted_ids.json');

// ─── Helpers ──────────────────────────────────────────────
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function httpsPost(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function createSlug(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatRuntime(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Dedup: Track already-posted movie IDs ────────────────
function loadPostedIds() {
    try {
        if (fs.existsSync(POSTED_FILE)) {
            const data = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
            // Keep only last 100 IDs
            return data.slice(-100);
        }
    } catch {}
    return [];
}

function savePostedIds(ids) {
    fs.writeFileSync(POSTED_FILE, JSON.stringify(ids), 'utf8');
}

// ─── TMDB: Fetch trending movies ──────────────────────────
async function fetchTrendingMovies() {
    console.log('📡 Fetching trending movies from TMDB...');
    const trending = await httpsGet(
        `https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_KEY}`
    );
    return trending.results || [];
}

async function fetchMovieDetails(id) {
    return httpsGet(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&append_to_response=credits`
    );
}

// ─── Pick 2 movies not already posted ────────────────────
function pickMovies(movies, postedIds) {
    return movies
        .filter(m => !postedIds.includes(m.id))
        .slice(0, 2);
}

// ─── Telegram Post ─────────────────────────────────────────
async function postToTelegram(movie, details) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHANNEL) {
        console.log('⚠️  Telegram credentials missing, skipping...');
        return;
    }

    const title = movie.title;
    const year = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
    const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'Not supplied';
    const runtime = details.runtime ? formatRuntime(details.runtime) : '';
    const genres = (details.genres || []).slice(0, 3).map(g => `#${g.name.replace(/\s+/g, '')}`).join(' ');
    const overview = movie.overview
        ? movie.overview.substring(0, 200) + (movie.overview.length > 200 ? '...' : '')
        : '';
    const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || '';
    const cast = (details.credits?.cast || []).slice(0, 3).map(c => c.name).join(', ');
    const slug = createSlug(title);
    const movieUrl = `${SITE_URL}/movie/${movie.id}-${slug}`;
    const posterUrl = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null;

    const caption = [
        `🎬 *${title}* ${year ? `(${year})` : ''}`,
        ``,
        `⭐ *TMDB community score:* ${rating}`,
        runtime ? `⏱ *Runtime:* ${runtime}` : '',
        director ? `🎥 *Director:* ${director}` : '',
        cast ? `👥 *Cast:* ${cast}` : '',
        ``,
        `📖 ${overview}`,
        ``,
        genres,
        ``,
        `🎬 [Explore title information](${movieUrl})`,
        `ℹ️ TMDB metadata. External playback availability varies by provider and region.`,
        ``,
        `🌐 @hdwatchzone`,
    ].filter(Boolean).join('\n');

    const body = JSON.stringify({
        chat_id: TELEGRAM_CHANNEL,
        caption: caption,
        parse_mode: 'Markdown',
        photo: posterUrl,
        reply_markup: {
            inline_keyboard: [[
                { text: '🎬 Title Info', url: movieUrl },
                { text: '🌐 HD Watchzone', url: SITE_URL }
            ]]
        }
    });

    const endpoint = posterUrl ? 'sendPhoto' : 'sendMessage';
    const finalBody = posterUrl ? body : JSON.stringify({
        chat_id: TELEGRAM_CHANNEL,
        text: caption,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
        reply_markup: {
            inline_keyboard: [[
                { text: '🎬 Title Info', url: movieUrl }
            ]]
        }
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_TOKEN}/${endpoint}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(finalBody)
        }
    };

    const res = await httpsPost(options, finalBody);
    if (res.ok) {
        console.log(`✅ Telegram: Posted "${title}"`);
    } else {
        console.error(`❌ Telegram error for "${title}":`, JSON.stringify(res));
    }
}

// ─── Reddit Authentication ─────────────────────────────────
async function getRedditToken() {
    if (!REDDIT_CLIENT_ID || !REDDIT_SECRET || !REDDIT_USER || !REDDIT_PASS) {
        console.log('⚠️  Reddit credentials missing, skipping...');
        return null;
    }

    const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_SECRET}`).toString('base64');
    const body = `grant_type=password&username=${encodeURIComponent(REDDIT_USER)}&password=${encodeURIComponent(REDDIT_PASS)}`;

    const options = {
        hostname: 'www.reddit.com',
        path: '/api/v1/access_token',
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': `HDWatchzone-Bot/1.0 by ${REDDIT_USER}`
        }
    };

    const res = await httpsPost(options, body);
    return res.access_token || null;
}

// ─── Reddit Post ───────────────────────────────────────────
async function postToReddit(movie, details, token) {
    if (!token) return;

    const title = movie.title;
    const year = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
    const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'Not supplied';
    const runtime = details.runtime ? formatRuntime(details.runtime) : '';
    const genres = (details.genres || []).map(g => g.name).join(', ');
    const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || 'N/A';
    const cast = (details.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ') || 'N/A';
    const slug = createSlug(title);
    const movieUrl = `${SITE_URL}/movie/${movie.id}-${slug}`;

    const postTitle = `🎬 ${title} ${year ? `(${year})` : ''} — Movie information`;

    const postText = [
        `## ${title} ${year ? `(${year})` : ''}`,
        ``,
        `| Detail | Info |`,
        `|--------|------|`,
        `| ⭐ TMDB community score | ${rating} |`,
        runtime ? `| ⏱ Runtime | ${runtime} |` : '',
        `| 🎬 Genre | ${genres || 'N/A'} |`,
        `| 🎥 Director | ${director} |`,
        `| 👥 Cast | ${cast} |`,
        ``,
        `### 📖 Overview`,
        movie.overview || 'No overview available.',
        ``,
        `---`,
        ``,
        `### 🎬 [Explore ${title} on HD Watchzone](${movieUrl})`,
        ``,
        `> Title metadata: TMDB. External player availability and quality vary by provider and region.`,
        ``,
        `---`,
        `*Posted by HD Watchzone Bot. Title metadata from TMDB.*`,
    ].filter(line => line !== null && line !== undefined).join('\n');

    const body = new URLSearchParams({
        sr: REDDIT_SUB,
        kind: 'self',
        title: postTitle,
        text: postText,
        resubmit: 'true',
        nsfw: 'false'
    }).toString();

    const options = {
        hostname: 'oauth.reddit.com',
        path: '/api/submit',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': `HDWatchzone-Bot/1.0 by ${REDDIT_USER}`
        }
    };

    const res = await httpsPost(options, body);

    if (res?.json?.data?.url) {
        console.log(`✅ Reddit: Posted "${title}" → ${res.json.data.url}`);
    } else if (res?.json?.errors?.length > 0) {
        console.error(`❌ Reddit error for "${title}":`, res.json.errors);
    } else {
        console.log(`✅ Reddit: "${title}" submitted (response:`, JSON.stringify(res).substring(0, 100), ')');
    }
}

// ─── Main ─────────────────────────────────────────────────
function readDryRun(value) {
    if (value === undefined || value === '') return false;
    if (String(value).trim().toLowerCase() === 'true') return true;
    if (String(value).trim().toLowerCase() === 'false') return false;
    throw new Error('DRY_RUN must be true or false; no publishing was attempted.');
}

async function main(options = {}) {
    const environmentDryRun = readDryRun(process.env.DRY_RUN);
    const dryRun = options.dryRun ?? (process.argv.includes('--dry-run') || environmentDryRun);
    if (typeof dryRun !== 'boolean') throw new Error('dryRun must be a boolean; no publishing was attempted.');
    console.log('🚀 HD Watchzone Daily Poster — Starting...\n');
    if (dryRun) console.log('🧪 DRY RUN — metadata reads only; no social authentication, publishing or history writes.\n');

    // 1. Load posted IDs to avoid duplicates
    const postedIds = loadPostedIds();
    console.log(`📋 Already posted ${postedIds.length} movies (dedup active)\n`);

    // 2. Fetch trending movies
    const trending = await fetchTrendingMovies();
    if (!trending.length) {
        console.error('❌ No trending movies found. Exiting.');
        process.exit(1);
    }

    // 3. Pick 2 unposted movies
    const toPost = pickMovies(trending, postedIds);
    if (!toPost.length) {
        console.log(dryRun ? 'ℹ️  All trending movies already posted. Dry run preserves history.' : 'ℹ️  All trending movies already posted. Clearing history...');
        if (!dryRun) savePostedIds([]);
        return;
    }

    console.log(`📽️  Picked ${toPost.length} movies to post today:\n`);
    toPost.forEach(m => console.log(`  - ${m.title} (${m.release_date?.split('-')[0] || '?'})`));
    console.log('');

    // 4. Get Reddit token once
    const redditToken = dryRun ? null : await getRedditToken();

    // 5. Post each movie
    for (const movie of toPost) {
        console.log(`\n📤 Posting: ${movie.title}`);
        console.log('─'.repeat(40));

        try {
            const details = await fetchMovieDetails(movie.id);

            if (dryRun) {
                console.log(`🧪 Would prepare a title-information post for Telegram and Reddit: ${SITE_URL}/movie/${movie.id}-${createSlug(movie.title)}. No message sent.`);
                continue;
            }

            // Post to Telegram
            await postToTelegram(movie, details);
            await sleep(1000);

            // Post to Reddit
            await postToReddit(movie, details, redditToken);
            await sleep(2000);

            // Mark as posted
            postedIds.push(movie.id);
        } catch (err) {
            console.error(`❌ Error posting ${movie.title}:`, err.message);
        }
    }

    // 6. Save updated posted IDs
    if (!dryRun) savePostedIds(postedIds);

    console.log(dryRun ? '\n✅ Dry run complete. No social messages or history changes.' : '\n✅ All done! See you tomorrow. 🎬');
}

if (require.main === module) main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
module.exports = { main, readDryRun };
