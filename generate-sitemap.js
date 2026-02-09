/**
 * StreamFlix Sitemap Generator
 * Fetches popular, top-rated, and trending content from TMDB
 * and generates a comprehensive sitemap.xml
 */

const TMDB_KEY = 'd74b73cd4563f614919e6493152fbc1e';
const BASE = 'https://api.themoviedb.org/3';
const SITE = 'https://streamflix-six-amber.vercel.app';
const TODAY = new Date().toISOString().split('T')[0];

async function tmdbFetch(endpoint, page = 1) {
    const url = `${BASE}${endpoint}?api_key=${TMDB_KEY}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) return { results: [] };
    return res.json();
}

async function fetchAllPages(endpoint, maxPages = 5) {
    const ids = new Set();
    for (let p = 1; p <= maxPages; p++) {
        const data = await tmdbFetch(endpoint, p);
        if (!data.results || data.results.length === 0) break;
        data.results.forEach(item => ids.add(item.id));
    }
    return [...ids];
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

    const movieIds = new Set();
    const tvIds = new Set();

    for (const ep of movieEndpoints) {
        const ids = await fetchAllPages(ep, 10);
        ids.forEach(id => movieIds.add(id));
        console.log(`  ${ep}: ${ids.length} movies`);
    }

    console.log(`\nFetching TV shows...`);
    for (const ep of tvEndpoints) {
        const ids = await fetchAllPages(ep, 10);
        ids.forEach(id => tvIds.add(id));
        console.log(`  ${ep}: ${ids.length} shows`);
    }

    console.log(`\nTotal unique movies: ${movieIds.size}`);
    console.log(`Total unique TV shows: ${tvIds.size}`);
    console.log(`Total content URLs: ${movieIds.size + tvIds.size}`);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    
    <!-- Homepage -->
    <url>
        <loc>${SITE}/</loc>
        <lastmod>${TODAY}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>

    <!-- Movie Detail Pages (${movieIds.size} movies) -->
`;

    for (const id of movieIds) {
        xml += `    <url><loc>${SITE}/movie/${id}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    }

    xml += `\n    <!-- TV Show Detail Pages (${tvIds.size} shows) -->\n`;

    for (const id of tvIds) {
        xml += `    <url><loc>${SITE}/tv/${id}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
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
