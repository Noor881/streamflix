/**
 * StreamFlix Sitemap Generator
 * Fetches popular, top-rated, and trending content from TMDB
 * and generates a comprehensive sitemap.xml with SEO-friendly URLs
 */

const TMDB_KEY = 'd74b73cd4563f614919e6493152fbc1e';
const BASE = 'https://api.themoviedb.org/3';
const SITE = 'https://streamflix-six-amber.vercel.app';
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    
    <!-- Homepage -->
    <url>
        <loc>${SITE}/</loc>
        <lastmod>${TODAY}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>

    <!-- Movie Detail Pages (${movies.size} movies) -->
`;

    for (const [id, slug] of movies) {
        xml += `    <url><loc>${SITE}/movie/${id}-${slug}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    }

    xml += `\n    <!-- TV Show Detail Pages (${tvShows.size} shows) -->\n`;

    for (const [id, slug] of tvShows) {
        xml += `    <url><loc>${SITE}/tv/${id}-${slug}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    }

    xml += `
    <!-- Genre Pages -->
    <url><loc>${SITE}/#/genre/28</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/35</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/18</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/27</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/878</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/16</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/10749</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/53</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/99</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/10751</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/12</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/14</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/36</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/10402</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/9648</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/10752</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
    <url><loc>${SITE}/#/genre/37</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>

    <!-- Legal & Help Pages -->
    <url><loc>${SITE}/#/faq</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
    <url><loc>${SITE}/#/help</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
    <url><loc>${SITE}/#/contact</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
    <url><loc>${SITE}/#/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
    <url><loc>${SITE}/#/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>

</urlset>`;

    const fs = require('fs');
    fs.writeFileSync('sitemap.xml', xml, 'utf-8');
    console.log(`\nSitemap written to sitemap.xml (${(xml.length / 1024).toFixed(1)} KB)`);
}

generateSitemap().catch(console.error);

