/**
 * StreamFlix Sitemap Generator
 * Fetches popular, top-rated, and trending content from TMDB
 * and generates a comprehensive sitemap.xml with SEO-friendly URLs
 */

const TMDB_KEY = 'd74b73cd4563f614919e6493152fbc1e';
const BASE = 'https://api.themoviedb.org/3';
const SITE = 'https://hdwatchzone.com';
const TODAY = new Date().toISOString().split('T')[0];

function createSlug(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

async function tmdbFetch(endpoint, page = 1) {
    const url = `${BASE}${endpoint}?api_key=${TMDB_KEY}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) return { results: [] };
    return res.json();
}

async function fetchAllPages(endpoint, maxPages = 5, type = 'movie') {
    const items = new Map(); // Use Map to avoid duplicates, key=id, value=slug
    for (let p = 1; p <= maxPages; p++) {
        const data = await tmdbFetch(endpoint, p);
        if (!data.results || data.results.length === 0) break;

        data.results.forEach(item => {
            const title = type === 'movie' ? item.title : item.name;
            const slug = createSlug(title);
            items.set(item.id, slug);
        });
    }
    return items;
}

async function generateSitemap() {
    console.log('Fetching movies...');

    const movieEndpoints = [
        '/movie/popular',
        '/movie/top_rated',
        '/movie/now_playing',
        '/movie/upcoming',
        '/trending/movie/week'
    ];

    const tvEndpoints = [
        '/tv/popular',
        '/tv/top_rated',
        '/tv/on_the_air',
        '/tv/airing_today',
        '/trending/tv/week'
    ];

    const movies = new Map();
    const tvShows = new Map();

    for (const ep of movieEndpoints) {
        const items = await fetchAllPages(ep, 10, 'movie');
        items.forEach((slug, id) => movies.set(id, slug));
        console.log(`  ${ep}: fetched batch`);
    }

    console.log(`\nFetching TV shows...`);
    for (const ep of tvEndpoints) {
        const items = await fetchAllPages(ep, 10, 'tv');
        items.forEach((slug, id) => tvShows.set(id, slug));
        console.log(`  ${ep}: fetched batch`);
    }

    console.log(`\nTotal unique movies: ${movies.size}`);
    console.log(`Total unique TV shows: ${tvShows.size}`);
    console.log(`Total content URLs: ${movies.size + tvShows.size}`);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
    
    <!-- Homepage -->
    <url>
        <loc>${SITE}/</loc>
        <lastmod>${TODAY}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>

    <!-- Movie Detail Pages (${movies.size} movies) -->
`;

    let movieCount = 0;
    for (const [id, slug] of movies) {
        xml += `    <url><loc>${SITE}/movie/${id}-${slug}</loc><lastmod>${TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority>`;
        if (movieCount < 100) {
            const title = slug.replace(/-/g, ' ');
            xml += `\n        <video:video>`;
            xml += `\n            <video:thumbnail_loc>${SITE}/logo.png</video:thumbnail_loc>`;
            xml += `\n            <video:title>Watch ${title} Online in HD</video:title>`;
            xml += `\n            <video:description>Stream ${title} in HD quality for free on HD Watchzone.</video:description>`;
            xml += `\n            <video:content_loc>${SITE}/movie/${id}-${slug}</video:content_loc>`;
            xml += `\n        </video:video>`;
        }
        xml += `</url>\n`;
        movieCount++;
    }

    xml += `\n    <!-- TV Show Detail Pages (${tvShows.size} shows) -->\n`;

    let tvCount = 0;
    for (const [id, slug] of tvShows) {
        xml += `    <url><loc>${SITE}/tv/${id}-${slug}</loc><lastmod>${TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority>`;
        if (tvCount < 100) {
            const title = slug.replace(/-/g, ' ');
            xml += `\n        <video:video>`;
            xml += `\n            <video:thumbnail_loc>${SITE}/logo.png</video:thumbnail_loc>`;
            xml += `\n            <video:title>Watch ${title} Online in HD</video:title>`;
            xml += `\n            <video:description>Stream ${title} in HD quality for free on HD Watchzone.</video:description>`;
            xml += `\n            <video:content_loc>${SITE}/tv/${id}-${slug}</video:content_loc>`;
            xml += `\n        </video:video>`;
        }
        xml += `</url>\n`;
        tvCount++;
    }

    xml += `
</urlset>`;

    const fs = require('fs');
    fs.writeFileSync('sitemap.xml', xml, 'utf-8');
    console.log(`\nSitemap written to sitemap.xml (${(xml.length / 1024).toFixed(1)} KB)`);
    console.log(`Video tags added for top ${Math.min(movieCount, 100)} movies and ${Math.min(tvCount, 100)} TV shows`);

    // Submit top URLs to IndexNow for instant indexing (Bing, Yandex, etc.)
    await pingIndexNow(movies, tvShows);
}

const INDEXNOW_KEY = '540bb093e1ba44239f8dc4bb75201b7d';

async function pingIndexNow(movies, tvShows) {
    console.log('\nPinging IndexNow...');

    // Collect top 100 movie + 100 TV URLs + homepage
    const urlList = [`${SITE}/`];
    let count = 0;
    for (const [id, slug] of movies) {
        if (count >= 100) break;
        urlList.push(`${SITE}/movie/${id}-${slug}`);
        count++;
    }
    count = 0;
    for (const [id, slug] of tvShows) {
        if (count >= 100) break;
        urlList.push(`${SITE}/tv/${id}-${slug}`);
        count++;
    }

    const payload = {
        host: 'hdwatchzone.com',
        key: INDEXNOW_KEY,
        keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
        urlList
    };

    try {
        const res = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload)
        });
        console.log(`IndexNow response: ${res.status} ${res.statusText}`);
        console.log(`Submitted ${urlList.length} URLs for instant indexing`);
    } catch (err) {
        console.warn('IndexNow ping failed (non-blocking):', err.message);
    }
}

generateSitemap().catch(console.error);

