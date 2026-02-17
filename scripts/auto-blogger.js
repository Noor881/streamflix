// ====================================================
// HDWatchZone Auto Blogger - GitHub Actions Edition
// Posts trending movie/TV articles to 10 Blogger sites
// using round-robin rotation (hour-based)
// ====================================================

const https = require('https');

// ── Config from GitHub Secrets ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BLOGGER_REFRESH_TOKEN = process.env.BLOGGER_REFRESH_TOKEN;
const SHEETS_CLIENT_ID = process.env.SHEETS_CLIENT_ID;
const SHEETS_CLIENT_SECRET = process.env.SHEETS_CLIENT_SECRET;
const SHEETS_REFRESH_TOKEN = process.env.SHEETS_REFRESH_TOKEN;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ── 10 Blogger Sites ──
const BLOGGER_SITES = [
    { id: '612541822591334262', name: 'watchmovies2026', url: 'https://watchmovies2026v1.blogspot.com' },
    { id: '3118500733306236808', name: 'tvshowguide2026', url: 'https://tvshowguide2026.blogspot.com' },
    { id: '571042765353215400', name: 'animewatchlist2026', url: 'https://animewatchlist2026v1.blogspot.com' },
    { id: '5643916162050224901', name: 'moviereviewshub2026', url: 'https://moviereviewshub2026.blogspot.com' },
    { id: '2269197240801029901', name: 'streamingalternatives2026', url: 'https://streamingalternatives2026.blogspot.com' },
    { id: '5356589466907299318', name: 'hdmoviesfree2026', url: 'https://hdmoviesfree2026.blogspot.com' },
    { id: '8106738172871165297', name: 'watchseriesfree2026', url: 'https://watchseriesfree2026.blogspot.com' },
    { id: '8487967692841091875', name: 'cinemaguide2026', url: 'https://cinemaguide2026.blogspot.com' },
    { id: '7472108647597086861', name: 'entertainmenthub2026', url: 'https://entertainmenthub2026.blogspot.com' },
    { id: '2402127475508789034', name: 'streamingzone2026', url: 'https://streamingzone2026.blogspot.com' }
];

// ── Premium CSS for blog posts ──
const PREMIUM_CSS = `
<style>
.hdw-article { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 860px; margin: 0 auto; color: #333; line-height: 1.8; }
.hdw-hero { position: relative; width: 100%; border-radius: 12px; overflow: hidden; margin-bottom: 30px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.hdw-hero img { width: 100%; height: auto; display: block; }
.hdw-hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 30px; background: linear-gradient(transparent, rgba(0,0,0,0.85)); color: white; }
.hdw-hero-overlay h1 { margin: 0 0 8px 0; font-size: 28px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }
.hdw-hero-overlay .hdw-meta { font-size: 14px; opacity: 0.9; }
.hdw-meta span { margin-right: 15px; }
.hdw-rating { background: #f5c518; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
.hdw-content-wrap { display: flex; gap: 25px; margin-bottom: 30px; }
.hdw-poster { flex-shrink: 0; }
.hdw-poster img { width: 220px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
.hdw-intro { flex: 1; }
.hdw-article h2 { color: #1a1a2e; border-bottom: 3px solid #e94560; padding-bottom: 8px; margin-top: 35px; font-size: 22px; }
.hdw-cast-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 20px; margin: 20px 0; }
.hdw-cast-card { text-align: center; background: #f8f9fa; border-radius: 10px; padding: 15px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); transition: transform 0.2s; }
.hdw-cast-card:hover { transform: translateY(-3px); }
.hdw-cast-card img { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; border: 3px solid #e94560; }
.hdw-cast-card .hdw-actor-name { font-weight: bold; font-size: 14px; color: #1a1a2e; }
.hdw-cast-card .hdw-character { font-size: 12px; color: #666; margin-top: 3px; }
.hdw-cta { background: linear-gradient(135deg, #e94560, #0f3460); color: white; padding: 20px 30px; border-radius: 10px; text-align: center; margin-top: 30px; box-shadow: 0 4px 15px rgba(233,69,96,0.3); }
.hdw-cta a { color: #fff; font-weight: bold; text-decoration: underline; font-size: 18px; }
.hdw-watch-btn { display: inline-block; background: #e94560; color: white !important; padding: 12px 30px; border-radius: 25px; text-decoration: none !important; font-weight: bold; font-size: 16px; margin: 10px 5px; box-shadow: 0 4px 15px rgba(233,69,96,0.4); transition: all 0.3s; }
.hdw-watch-btn:hover { background: #d63851; transform: translateY(-2px); }
</style>`;

// ── HTTP Helpers ──
function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const opts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(opts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    }).toString();

    const r = await httpsRequest('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        body
    });
    if (r.data.access_token) return r.data.access_token;
    throw new Error('Token refresh failed: ' + JSON.stringify(r.data));
}

// ── Step 1: Fetch Trending from TMDB ──
async function fetchTrending() {
    console.log('Step 1: Fetching trending from TMDB...');
    const r = await httpsRequest(`https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_API_KEY}`);
    const results = r.data.results || [];
    const item = results[Math.floor(Math.random() * results.length)];

    const title = item.title || item.name;
    const year = item.release_date ? new Date(item.release_date).getFullYear() :
        (item.first_air_date ? new Date(item.first_air_date).getFullYear() : '');
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const mediaType = item.media_type || 'movie';

    const movieData = {
        title, year,
        rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
        overview: item.overview || 'No description available.',
        id: item.id,
        mediaType,
        slug,
        contentType: mediaType === 'movie' ? 'Movie' : 'TV Show',
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '',
        movieUrl: `https://hdwatchzone.com/${mediaType}/${item.id}-${slug}`,
        homeUrl: 'https://hdwatchzone.com',
        keywords: [`watch ${title} online free`, `${title} streaming`, `${title} HD`, `where to watch ${title}`].join(', ')
    };
    console.log(`   Selected: ${title} (${year}) - ${mediaType}`);
    return movieData;
}

// ── Step 2: Fetch Cast ──
async function fetchCast(movieData) {
    console.log('Step 2: Fetching cast...');
    const r = await httpsRequest(`https://api.themoviedb.org/3/${movieData.mediaType}/${movieData.id}/credits?api_key=${TMDB_API_KEY}`);
    const castList = (r.data.cast || []).slice(0, 5).map(actor => ({
        name: actor.name,
        character: actor.character || 'Unknown Role',
        photoUrl: actor.profile_path
            ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
            : 'https://via.placeholder.com/185x278?text=No+Photo'
    }));
    console.log(`   Found ${castList.length} cast members`);
    return { ...movieData, cast: castList };
}

// ── Step 3: Generate Article with Groq AI ──
async function generateArticle(movieData) {
    console.log('Step 3: Generating article with Groq AI...');
    const prompt = `Write a 600-word SEO blog article about '${movieData.title}'

MOVIE INFO:
- Title: ${movieData.title}
- Year: ${movieData.year}
- Rating: ${movieData.rating}/10
- Type: ${movieData.contentType}
- Plot: ${movieData.overview}

REQUIRED LINK PLACEMENTS (use exact HTML):
1. After intro paragraph: <a href='${movieData.movieUrl}' target='_blank' class='hdw-watch-btn'>Watch ${movieData.title} Now</a>
2. In 'Why You Should Watch' section: <a href='${movieData.movieUrl}' target='_blank'>Stream ${movieData.title} free in HD</a>
3. In 'Where to Watch' section: <a href='${movieData.homeUrl}' target='_blank'>HDWatchZone</a>
4. In body paragraph: <a href='${movieData.movieUrl}' target='_blank'>${movieData.title} online</a>
5. Call-to-action at end: <a href='${movieData.movieUrl}' target='_blank'>Start watching ${movieData.title} now</a>

ARTICLE STRUCTURE (return ONLY clean HTML, no <style> or images):
<p>Introduction (100 words) [END WITH LINK #1]</p>
<h2>Why You Should Watch ${movieData.title}</h2>
<p>150 words [INCLUDE LINK #2]</p>
<h2>Plot Summary</h2>
<p>150 words [INCLUDE LINK #4]</p>
<h2>Where to Watch ${movieData.title} Online</h2>
<p>100 words [INCLUDE LINK #3]</p>
<p>Conclusion (100 words) [INCLUDE LINK #5]</p>

IMPORTANT: Do NOT include h1, cast section, images, or style tags.
SEO REQUIREMENTS: Use keywords naturally: ${movieData.keywords}
Return ONLY the HTML article body.`;

    const body = JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: 'You are an expert movie blogger writing SEO-optimized articles for HDWatchZone. Write engaging, natural content. Return ONLY HTML article body - no markdown, no h1, no style tags, no images.' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
    });

    const r = await httpsRequest('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Length': Buffer.byteLength(body)
        },
        body
    });

    const article = r.data.choices?.[0]?.message?.content || '';
    console.log(`   Generated ${article.length} chars`);
    return article;
}

// ── Step 4: Format Premium HTML ──
function formatForBlogger(movieData, articleBody) {
    console.log('Step 4: Formatting with premium CSS...');

    const heroHTML = movieData.backdropUrl ? `
<div class="hdw-hero">
  <img src="${movieData.backdropUrl}" alt="${movieData.title} banner" />
  <div class="hdw-hero-overlay">
    <h1>${movieData.title}</h1>
    <div class="hdw-meta">
      <span class="hdw-rating">⭐ ${movieData.rating}/10</span>
      <span>${movieData.year}</span>
      <span>${movieData.contentType}</span>
    </div>
  </div>
</div>` : '';

    const castGridHTML = movieData.cast?.length ? `
<h2>Cast and Performances</h2>
<div class="hdw-cast-grid">
  ${movieData.cast.map(c => `
  <div class="hdw-cast-card">
    <img src="${c.photoUrl}" alt="${c.name}" />
    <div class="hdw-actor-name">${c.name}</div>
    <div class="hdw-character">as ${c.character}</div>
  </div>`).join('')}
</div>` : '';

    const ctaHTML = `
<div class="hdw-cta">
  <p>Ready to watch? Stream now in full HD!</p>
  <a href="${movieData.movieUrl}" target="_blank" class="hdw-watch-btn">▶ Watch ${movieData.title} Free in HD</a>
</div>`;

    const fullContent = PREMIUM_CSS + '<div class="hdw-article">' + heroHTML + articleBody + castGridHTML + ctaHTML + '</div>';

    return {
        title: `${movieData.title}: Watch Free Online in HD (${movieData.year})`,
        content: fullContent,
        labels: [movieData.title, String(movieData.year), movieData.contentType, 'Free Streaming', 'HD Movies', 'Watch Online']
    };
}

// ── Step 5: Select Blog (Round-Robin) ──
function selectBlog() {
    const hour = new Date().getUTCHours();
    const idx = hour % 10;
    const blog = BLOGGER_SITES[idx];
    console.log(`Step 5: Selected blog #${idx + 1}: ${blog.name}`);
    return { ...blog, blogIndex: idx + 1 };
}

// ── Step 6: Post to Blogger ──
async function postToBlogger(blog, post, accessToken) {
    console.log(`Step 6: Posting to ${blog.name}...`);
    const body = JSON.stringify({
        kind: 'blogger#post',
        blog: { id: blog.id },
        title: post.title,
        content: post.content,
        labels: post.labels
    });

    const r = await httpsRequest(`https://www.googleapis.com/blogger/v3/blogs/${blog.id}/posts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Content-Length': Buffer.byteLength(body)
        },
        body
    });

    if (r.status === 200 || r.status === 201) {
        console.log('   Posted successfully! URL:', r.data?.url || 'N/A');
        return { success: true, url: r.data?.url };
    } else {
        console.error('   Post failed:', r.status, JSON.stringify(r.data).substring(0, 300));
        return { success: false, error: r.data };
    }
}

// ── Step 7: Log to Google Sheets ──
async function logToSheets(movieData, blog, postResult, sheetsToken) {
    console.log('Step 7: Logging to Google Sheets...');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' });

    const values = [[
        dateStr,
        timeStr,
        blog.blogIndex,
        blog.name,
        blog.url,
        movieData.title,
        `${movieData.title}: Watch Free Online in HD (${movieData.year})`,
        movieData.contentType,
        postResult.success ? 'Posted' : 'Failed'
    ]];

    const body = JSON.stringify({ values });
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Rotation!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const r = await httpsRequest(sheetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sheetsToken}`,
            'Content-Length': Buffer.byteLength(body)
        },
        body
    });

    if (r.status === 200) {
        console.log('   Logged to sheet successfully');
    } else {
        console.error('   Sheet logging failed:', r.status, JSON.stringify(r.data).substring(0, 200));
    }
}

// ── Main ──
async function main() {
    console.log('=== HDWatchZone Auto Blogger ===');
    console.log(`Time: ${new Date().toISOString()}\n`);

    // Validate secrets
    const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BLOGGER_REFRESH_TOKEN',
        'SHEETS_CLIENT_ID', 'SHEETS_CLIENT_SECRET', 'SHEETS_REFRESH_TOKEN',
        'TMDB_API_KEY', 'GROQ_API_KEY', 'GOOGLE_SHEET_ID'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error('Missing secrets:', missing.join(', '));
        process.exit(1);
    }

    try {
        // Get access tokens
        console.log('Authenticating...');
        const bloggerToken = await getAccessToken(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN);
        const sheetsToken = await getAccessToken(SHEETS_CLIENT_ID, SHEETS_CLIENT_SECRET, SHEETS_REFRESH_TOKEN);
        console.log('   Authenticated!\n');

        // Run pipeline
        const movieData = await fetchTrending();
        const withCast = await fetchCast(movieData);
        const articleBody = await generateArticle(withCast);
        const post = formatForBlogger(withCast, articleBody);
        const blog = selectBlog();
        const result = await postToBlogger(blog, post, bloggerToken);
        await logToSheets(withCast, blog, result, sheetsToken);

        console.log('\n=== DONE ===');
        console.log(`Blog: ${blog.name} (#${blog.blogIndex})`);
        console.log(`Movie: ${movieData.title} (${movieData.year})`);
        console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);

        if (!result.success) process.exit(1);
    } catch (err) {
        console.error('Fatal error:', err.message);
        process.exit(1);
    }
}

main();
