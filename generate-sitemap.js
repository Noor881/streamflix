/* Bounded sitemap build. No automatic external indexing submission. */
const fs = require('node:fs');
const SITE = 'https://hdwatchzone.com';
const SEO = require('./seo-core.js');
const slug = SEO.slug;
const staticRoutes = ['/', '/movies','/tv','/anime','/new','/faq','/help','/contact','/privacy','/terms','/legal', ...Object.keys(SEO.genres).map(id=>'/genre/'+id)];
async function generateSitemap() {
    const urls = new Set(staticRoutes.map(route => SITE + route));
    const jobs = ['movie/popular','movie/top_rated','movie/now_playing','movie/upcoming','trending/movie/week','tv/popular','tv/top_rated','tv/on_the_air','tv/airing_today','trending/tv/week'].flatMap(endpoint => Array.from({length:10},(_,i)=>({endpoint,page:i+1})));
    // Four concurrent requests, bounded timeouts. Failure preserves the last valid sitemap.
    async function worker() {
        while (jobs.length) {
            const {endpoint,page} = jobs.shift();
            const response = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=d74b73cd4563f614919e6493152fbc1e&page=${page}`, {signal:AbortSignal.timeout(12000)});
            if (!response.ok) throw new Error(`Sitemap metadata failed: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data.results) || !data.results.length) throw new Error('Empty sitemap metadata');
            const type = endpoint.startsWith('movie/') || endpoint.includes('/movie/') ? 'movie' : 'tv';
            for (const item of data.results) {
                if (type === 'movie' && item.id === 928480) continue;
                urls.add(`${SITE}/${type}/${item.id}-${slug(item.title || item.name)}`);
            }
        }
    }
    await Promise.all(Array.from({length:4}, worker));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...urls].map(url => `  <url><loc>${url.replace(/&/g,'&amp;')}</loc></url>`).join('\n') + '\n</urlset>\n';
    fs.writeFileSync('sitemap.xml',xml);
    console.log(`Sitemap generated: ${urls.size} URLs, including categories and public information pages.`);
}
if (require.main === module) generateSitemap().catch(error=>{console.error(error.message); process.exitCode=1;});
module.exports = {generateSitemap,staticRoutes};
