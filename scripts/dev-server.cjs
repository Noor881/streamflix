const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = require('../vercel.json');
http.createServer(async (req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const url = new URL(req.url, 'http://localhost');
    const movie = pathname.match(/^\/movie\/([^/]+)$/);
    const tv = pathname.match(/^\/tv\/([^/]+)(?:\/(\d+)\/(\d+))?$/);
    const genre = pathname.match(/^\/genre\/(\d+)$/);
    let query;
    if (movie || pathname === '/movie.html' && url.searchParams.has('id')) query = {route:'movie',id:movie?.[1] || url.searchParams.get('id')};
    else if (tv || pathname === '/tv.html' && url.searchParams.has('id')) query = {route:'show',id:tv?.[1] || url.searchParams.get('id')};
    else if (genre) query = {route:'genre',id:genre[1]};
    else if (config.rewrites.some(rule => rule.source === pathname && rule.destination.startsWith('/api/render'))) query = {route:pathname.slice(1)};
    if (query) {
        req.query = query;
        try { delete require.cache[require.resolve('../api/render.js')]; await require('../api/render.js')(req,res); } catch (error) { res.statusCode=500; res.end(error.message); }
        return;
    }
    if (/^\/movie\/\d/.test(pathname)) pathname = '/movie.html';
    else if (/^\/tv\/\d/.test(pathname)) pathname = '/tv.html';
    else if (pathname === '/') pathname = '/index.html';
    else if (config.rewrites.some(rule => rule.source === pathname || rule.source === '/genre/:id' && /^\/genre\/\d+$/.test(pathname))) pathname = pathname === '/admin' ? '/admin.html' : '/index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.xml':'application/xml', '.ico':'image/x-icon' };
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'text/plain', 'Cache-Control':'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
