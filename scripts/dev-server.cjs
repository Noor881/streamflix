const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = require('../vercel.json');
const publicFiles = new Set(require('./build-static.cjs').publicAssets());

function routeForURL(url) {
    const pathname = decodeURIComponent(url.pathname);
    const params = Object.fromEntries(url.searchParams);
    const movie = pathname.match(/^\/movie\/([^/]+)$/);
    const tv = pathname.match(/^\/tv\/([^/]+)(?:\/([^/]+)\/([^/]+))?$/);
    const genre = pathname.match(/^\/genre\/([^/]+)$/);
    if (movie || pathname === '/movie.html' && url.searchParams.has('id')) {
        return {...params, route:'movie', id:movie?.[1] || params.id};
    }
    if (tv || pathname === '/tv.html' && url.searchParams.has('id')) {
        return {...params, route:'show', id:tv?.[1] || params.id, ...(tv?.[2] ? {s:tv[2],e:tv[3]} : {})};
    }
    if (genre) return {...params,route:'genre',id:genre[1]};
    const rewrite = config.rewrites.find(rule => !rule.has && rule.source === pathname && rule.destination.startsWith('/api/render'));
    if (rewrite) return {...params,...Object.fromEntries(new URL(rewrite.destination,'http://localhost').searchParams)};
    if (pathname === '/api/render' || pathname === '/api/render.js') return params;
    return null;
}

function applyIndexingHeaders(pathname, searchParams, res) {
    for (const rule of config.headers) {
        const pattern = rule.source.replace('/:path*','(?:/.*)?');
        if (!new RegExp(`^${pattern}$`).test(pathname)) continue;
        if (rule.missing?.some(condition => condition.type === 'query' && searchParams.has(condition.key))) continue;
        for (const header of rule.headers) {
            // Preview caching intentionally stays disabled. Mirror indexing policy.
            if (header.key.toLowerCase() === 'x-robots-tag') res.setHeader(header.key,header.value);
        }
    }
}

function createPreviewServer(options = {}) {
    // Exercise the exact built browser assets while keeping server rendering on its originals.
    const assetRoot = options.productionAssets ? path.join(root,'public') : root;
    const renderer = options.render || (async (req,res) => {
        // Reload the renderer and its shared policy, while SSR recompiles changed UI.
        for (const filename of ['../api/render.js','../server/ssr.js','../seo-core.js']) {
            delete require.cache[require.resolve(filename)];
        }
        return require('../api/render.js')(req,res);
    });
    return http.createServer(async (req,res) => {
        let url, pathname;
        try { url = new URL(req.url,'http://localhost'); pathname = decodeURIComponent(url.pathname); }
        catch { res.writeHead(400,{'Content-Type':'text/plain'}); res.end('Invalid URL'); return; }
        applyIndexingHeaders(pathname,url.searchParams,res);
        if (pathname === '/api/search-suggestions' || pathname === '/api/search-suggestions.js') {
            req.query = Object.fromEntries(url.searchParams);
            try { await require('../api/search-suggestions.js')(req,res); }
            catch { res.statusCode=503;res.setHeader('Content-Type','application/json');res.end('{"error":"Suggestions unavailable"}'); }
            return;
        }
        if (pathname === '/api/metadata' || pathname === '/api/metadata.js') {
            req.query = Object.fromEntries(url.searchParams);
            try { await require('../api/metadata.js')(req,res); }
            catch { res.statusCode=503;res.end('{"error":"Metadata unavailable"}'); }
            return;
        }
        if (pathname === '/index.html' || config.trailingSlash === false && pathname !== '/' && pathname.endsWith('/')) {
            res.writeHead(308,{'Location':(pathname === '/index.html' ? '/' : pathname.replace(/\/+$/,'')) + url.search,'Cache-Control':'no-store'});
            res.end('Moved permanently');return;
        }
        const query = routeForURL(url);
        if (query) {
            req.query = query;
            try { await renderer(req,res); }
            catch { res.statusCode=500;res.setHeader('X-Robots-Tag','noindex');res.end('Preview rendering failed'); }
            return;
        }
        if (pathname === '/admin') pathname = '/admin.html';
        const file = path.resolve(assetRoot,'.' + pathname);
        const relative = path.relative(assetRoot,file).split(path.sep).join('/');
        if (!file.startsWith(assetRoot + path.sep) || !publicFiles.has(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.writeHead(404,{'Content-Type':'text/plain','X-Robots-Tag':'noindex'});res.end('Not found');return;
        }
        const mime = {'.html':'text/html','.js':'text/javascript','.cjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.xml':'application/xml','.ico':'image/x-icon','.md':'text/markdown'};
        res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'text/plain','Cache-Control':'no-store'});
        fs.createReadStream(file).pipe(res);
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT || 4173);
    const productionAssets = process.argv.includes('--production-assets');
    createPreviewServer({productionAssets}).listen(port,'127.0.0.1',() => console.log(`Preview: http://127.0.0.1:${port}${productionAssets ? ' (built assets)' : ''}`));
}
module.exports = {createPreviewServer,routeForURL};
