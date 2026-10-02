/* Bounded sitemap build. No automatic external indexing submission. */
const fs = require('node:fs');
const SITE = 'https://hdwatchzone.com';
const SEO = require('./seo-core.js');
const TMDB = require('./server/tmdb.js');
const slug = SEO.slug;
const staticRoutes = ['/', '/movies','/tv','/anime','/new','/faq','/help','/contact','/privacy','/terms','/legal', ...Object.keys(SEO.genres).map(id=>'/genre/'+id)];
function titleURL(item, type) {
    if (type !== 'movie' && type !== 'tv') throw new Error('Unsupported sitemap title type');
    if (!item || typeof item !== 'object' || Array.isArray(item) || !Number.isSafeInteger(item.id) || item.id < 1) {
        throw new Error('Invalid sitemap title identifier');
    }
    if (type === 'movie' && item.id === 928480) return null;
    if (item.media_type !== undefined && item.media_type !== type) throw new Error('Unexpected sitemap media type');
    const name = type === 'movie' ? item.title : item.name;
    if (typeof name !== 'string' || !name.trim()) throw new Error('Missing sitemap title name');
    return `${SITE}/${type}/${item.id}-${slug(name)}`;
}
async function generateSitemap() {
    const urls = new Set(staticRoutes.map(route => SITE + route));
    if (typeof fs.existsSync==='function' && fs.existsSync('sitemap.xml')) {
        const previous = fs.readFileSync('sitemap.xml','utf8');
        validateSnapshot(previous);
        for (const match of previous.matchAll(/<loc>([^<]+)<\/loc>/g)) if (!/\/movie\/928480(?:-|$)/.test(match[1])) urls.add(match[1]);
    }
    const jobs = ['movie/popular','movie/top_rated','movie/now_playing','movie/upcoming','trending/movie/week','tv/popular','tv/top_rated','tv/on_the_air','tv/airing_today','trending/tv/week','discover/movie','discover/tv'].flatMap(endpoint => Array.from({length:10},(_,i)=>({endpoint,page:i+1})));
    // Four concurrent requests, bounded timeouts. Failure preserves the last valid sitemap.
    async function worker() {
        while (jobs.length) {
            const {endpoint,page} = jobs.shift();
            let response;
            for(let attempt=0;attempt<3;attempt++) {
                try {
                    response = await TMDB.request('/'+endpoint,{page,...(endpoint.startsWith('discover/')?{with_origin_country:'IN'}:{})});
                    if(response.ok || response.status<500 && response.status!==429) break;
                } catch(error) { if(attempt===2) throw error; }
            }
            if (!response.ok) throw new Error(`Sitemap metadata failed: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data.results) || !data.results.length) throw new Error('Empty sitemap metadata');
            const type = endpoint.startsWith('movie/') || endpoint.includes('/movie/') || endpoint==='discover/movie' ? 'movie' : 'tv';
            for (const item of data.results) {
                const url = titleURL(item, type);
                if (url) {
                    for (const previous of urls) if (previous.startsWith(`${SITE}/${type}/${item.id}-`) && previous!==url) urls.delete(previous);
                    urls.add(url);
                }
            }
        }
    }
    await Promise.all(Array.from({length:4}, worker));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...urls].map(url => `  <url><loc>${url.replace(/&/g,'&amp;')}</loc></url>`).join('\n') + '\n</urlset>\n';
    fs.writeFileSync('sitemap.xml',xml);
    console.log(`Sitemap generated: ${urls.size} URLs, including categories and public information pages.`);
}
function validateSnapshot(xml) {
    const urls=[...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
    if (!String(xml).includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') || !String(xml).trim().endsWith('</urlset>') || urls.length<staticRoutes.length || urls.length>50000 || new Set(urls).size!==urls.length) throw new Error('Invalid sitemap snapshot');
    for (const url of urls) if (!staticRoutes.includes(url.slice(SITE.length)) && !/^https:\/\/hdwatchzone\.com\/(movie|tv)\/[1-9]\d*-[\w-]+$/.test(url) || !url.startsWith(SITE+'/')) throw new Error('Invalid sitemap canonical URL');
    for (const route of staticRoutes) if (!urls.includes(SITE+route)) throw new Error('Sitemap snapshot is missing a public route');
    return urls;
}
if (require.main === module) generateSitemap().catch(error=>{console.error(error.message); process.exitCode=1;});
module.exports = {generateSitemap,staticRoutes,titleURL,validateSnapshot};
