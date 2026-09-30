const fs = require('node:fs');
const path = require('node:path');
const SITE = 'https://hdwatchzone.com';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = value => String(value || '').toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');
const categories = {
    movies: ['Browse Movies | HD Watchzone', 'Explore popular, top-rated and newly released movies by genre.'],
    tv: ['Browse TV Shows | HD Watchzone', 'Discover TV series, seasons and episodes.'],
    anime: ['Anime Series & Movies | HD Watchzone', 'Explore Japanese animation, anime series and animated movies.'],
    new: ['New & Popular | HD Watchzone', 'Discover trending movies and TV series.'],
    faq: ['Frequently Asked Questions | HD Watchzone', 'Answers about playback, devices and privacy.'],
    help: ['Help Center | HD Watchzone', 'Help with search, playback and external servers.'],
    contact: ['Contact HD Watchzone', 'Prepare feedback or a playback report in your email app.'],
    privacy: ['Privacy Policy | HD Watchzone', 'Privacy, local preferences and optional analytics.'],
    cookies: ['Cookie Preferences | HD Watchzone', 'Manage optional analytics consent.'],
    terms: ['Terms of Use | HD Watchzone', 'Terms for using HD Watchzone.'],
    legal: ['Legal Notices | HD Watchzone', 'Copyright and third-party content information.'],
    search: ['Search | HD Watchzone', 'Find movies and TV shows.'],
    account: ['Local Preferences | HD Watchzone', 'Manage this device’s local viewing history.'],
    'my-list': ['My List | HD Watchzone', 'Your locally saved titles.']
};
const genres = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science Fiction',53:'Thriller',10752:'War',37:'Western'};
module.exports = async function render(req, res) {
    const query = req.query || Object.fromEntries(new URL(req.url, SITE).searchParams);
    const route = query.route;
    const detail = route === 'movie' || route === 'show';
    const type = route === 'show' ? 'tv' : 'movie';
    let title, description, canonical, image = SITE + '/logo-v2.png', data;
    if (detail) {
        const id = String(query.id || '').match(/^\d+/)?.[0];
        if (!id) { res.statusCode = 404; return res.end('Title not found'); }
        try {
            const response = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=d74b73cd4563f614919e6493152fbc1e&append_to_response=credits,videos,recommendations`, {signal:AbortSignal.timeout(10000)});
            if (response.status === 404) { res.statusCode = 404; return res.end('Title not found'); }
            if (!response.ok) throw new Error('Metadata unavailable');
            data = await response.json();
        } catch {
            // An upstream outage must not index a generic title or silently become a 404.
            res.statusCode = 503;
            res.setHeader('Retry-After','60');
            return res.end('Title information is temporarily unavailable. Please retry shortly.');
        }
        title = `${data.title || data.name} | HD Watchzone`;
        description = (data.overview || `Explore ${data.title || data.name}, cast and available external players.`).slice(0,180);
        canonical = `${SITE}/${type}/${id}-${slug(data.title || data.name)}`;
        if (data.backdrop_path || data.poster_path) image = 'https://image.tmdb.org/t/p/w1280' + (data.backdrop_path || data.poster_path);
    } else if (route === 'genre') {
        const name = genres[query.id] || 'Genre';
        title = `${name} Movies & TV Shows | HD Watchzone`;
        description = `Explore ${name.toLowerCase()} movies and TV series.`;
        canonical = `${SITE}/genre/${escape(query.id)}`;
    } else {
        if (!categories[route]) { res.statusCode = 404; return res.end('Not found'); }
        [title, description] = categories[route]; canonical = `${SITE}/${route}`;
    }
    let html = fs.readFileSync(path.join(process.cwd(), detail ? `${type}.html` : 'index.html'), 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`);
    const values = {description, 'og:title':title,'og:description':description,'og:url':canonical,'og:image':image,'twitter:title':title,'twitter:description':description,'twitter:image':image};
    for (const [key,value] of Object.entries(values)) {
        const pattern = new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*(")`);
        html = html.replace(pattern, (_,a,b) => a + escape(value) + b);
    }
    html = html.replace(/<link rel="canonical"[^>]*>/g,'').replace('</head>', `<link rel="canonical" href="${escape(canonical)}"></head>`);
    if (['search','my-list','account'].includes(route)) html = html.replace(/(<meta name="robots" content=")[^"]*/, '$1noindex, follow');
    if (data) {
        html = html.replace('</head>', '<script id="initial-title-data" type="application/json">' + JSON.stringify(data).replace(/</g,'\\u003c') + '</script></head>');
        const schema = {'@context':'https://schema.org','@type':type==='movie'?'Movie':'TVSeries',name:data.title||data.name,description:data.overview,url:canonical,image,datePublished:data.release_date||data.first_air_date};
        html = html.replace(/(<script id="schema-movie" type="application\/ld\+json">)[\s\S]*?(<\/script>)/, (_,a,b) => a + JSON.stringify(schema).replace(/</g,'\\u003c') + b);
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control', ['search','my-list','account'].includes(route) ? 'private, no-store' : 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
    res.end(html);
};
