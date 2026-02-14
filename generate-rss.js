/**
 * HD Watchzone — RSS Feed Generator
 * Fetches trending, now playing, and popular movies from TMDB
 * and generates an RSS 2.0 feed (feed.xml) for syndication.
 *
 * Run: node generate-rss.js
 * Auto-runs daily via GitHub Actions to keep the feed fresh.
 */

const fs = require('fs');

const TMDB_KEY = 'd74b73cd4563f614919e6493152fbc1e';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const SITE_URL = 'https://hdwatchzone.com';
const FEED_TITLE = 'HD Watchzone — Free HD Movies & TV Shows';
const FEED_DESC = 'Stream the latest movies and TV shows free in HD. Updated daily with trending, popular, and now playing titles.';
const MAX_ITEMS = 50; // RSS feeds typically have 20-50 items

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

function escapeXml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function createSlug(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function fetchMovies() {
    const endpoints = [
        `${TMDB_BASE}/trending/movie/day?api_key=${TMDB_KEY}&language=en-US`,
        `${TMDB_BASE}/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&page=1`,
        `${TMDB_BASE}/movie/popular?api_key=${TMDB_KEY}&language=en-US&page=1`,
        `${TMDB_BASE}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`,
    ];

    const responses = await Promise.all(endpoints.map(fetchJson));
    const allMovies = responses.flatMap((r) => r.results || []);

    // Deduplicate by movie ID
    const seen = new Set();
    const unique = allMovies.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });

    // Sort by popularity (most popular first)
    unique.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    return unique.slice(0, MAX_ITEMS);
}

function buildRssItem(movie) {
    const title = escapeXml(movie.title);
    const description = escapeXml(movie.overview || 'Watch this movie free in HD on HD Watchzone.');
    const slug = createSlug(movie.title);
    const link = `${SITE_URL}/movie.html?id=${movie.id}`;
    const posterUrl = movie.poster_path ? `${POSTER_BASE}${movie.poster_path}` : '';
    const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : '';
    const releaseDate = movie.release_date || '';
    const year = releaseDate ? releaseDate.split('-')[0] : '';

    // RFC 822 date format for RSS
    const pubDate = releaseDate
        ? new Date(releaseDate).toUTCString()
        : new Date().toUTCString();

    // Genre IDs to names mapping
    const genreMap = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
        80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
        14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
        53: 'Thriller', 10752: 'War', 37: 'Western',
    };

    const genres = (movie.genre_ids || [])
        .map((id) => genreMap[id])
        .filter(Boolean);

    let item = `    <item>
      <title>${title}${year ? ` (${year})` : ''}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description><![CDATA[${movie.overview || 'Watch free in HD.'}${rating ? `\n\n⭐ Rating: ${rating}` : ''}${genres.length ? `\n🎭 Genre: ${genres.join(', ')}` : ''}\n\n🍿 Watch now free on HD Watchzone!]]></description>
      <pubDate>${pubDate}</pubDate>`;

    if (posterUrl) {
        item += `\n      <enclosure url="${escapeXml(posterUrl)}" type="image/jpeg" length="0" />`;
    }

    // Add categories for each genre
    for (const genre of genres) {
        item += `\n      <category>${escapeXml(genre)}</category>`;
    }

    item += `\n    </item>`;
    return item;
}

async function generateRssFeed() {
    console.log('🔄 Fetching movies from TMDB...');
    const movies = await fetchMovies();
    console.log(`📦 Got ${movies.length} unique movies`);

    const now = new Date().toUTCString();

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(FEED_DESC)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>360</ttl>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/logo.png</url>
      <title>${escapeXml(FEED_TITLE)}</title>
      <link>${SITE_URL}</link>
    </image>
    <copyright>© ${new Date().getFullYear()} HD Watchzone. All movie data provided by TMDB.</copyright>
    <webMaster>contact@hdwatchzone.com</webMaster>
    <category>Movies</category>
    <category>Entertainment</category>
    <category>Streaming</category>

${movies.map(buildRssItem).join('\n\n')}

  </channel>
</rss>`;

    fs.writeFileSync('feed.xml', rss, 'utf-8');
    console.log(`✅ RSS feed written to feed.xml (${(rss.length / 1024).toFixed(1)} KB, ${movies.length} items)`);
}

generateRssFeed().catch((err) => {
    console.error('❌ Failed to generate RSS feed:', err.message);
    process.exit(1);
});
