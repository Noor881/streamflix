/* Shared URL and metadata policy: identical before and after JavaScript. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SiteSEO = api;
})(typeof window === 'object' ? window : globalThis, function () {
    const SITE = 'https://hdwatchzone.com';
    const genres = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science Fiction',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',10759:'Action & Adventure',10762:'Kids',10763:'News',10764:'Reality',10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics'};
    const entries = {
        '/':['HD Watchzone — Movies, TV Shows & Anime','Explore movie and TV information, discover anime, browse genres and keep a local watchlist on HD Watchzone.'],
        '/movies':['Browse Movies | HD Watchzone','Explore popular movies, release dates, cast and genres. Browse the catalog or search for a title.'],
        '/tv':['Browse TV Shows | HD Watchzone','Discover TV series, cast, seasons and episode information. Browse popular shows or search by title.'],
        '/anime':['Anime Series & Movies | HD Watchzone','Discover anime series and animated movies, with title information, genres and local watchlists.'],
        '/new':['New & Popular | HD Watchzone','Explore trending titles, popular movies and TV series using metadata from The Movie Database.'],
        '/faq':['Frequently Asked Questions | HD Watchzone','Answers about finding titles, external playback, supported browsers and local watchlists.'],
        '/help':['Help Center | HD Watchzone','Troubleshoot search, external players, episode selection and browser storage.'],
        '/contact':['Contact HD Watchzone','Prepare a playback report or feedback message in your email app.'],
        '/privacy':['Privacy Policy | HD Watchzone','Understand local storage, optional analytics and third-party services on HD Watchzone.'],
        '/terms':['Terms of Use | HD Watchzone','Read the terms for using HD Watchzone and external services.'],
        '/legal':['Legal Notices | HD Watchzone','Information about metadata attribution, third-party content and copyright reports.'],
        '/cookies':['Cookie Preferences | HD Watchzone','Manage optional analytics and understand local storage and external-player cookies.'],
        '/account':['Local Preferences | HD Watchzone','Manage history and preferences stored on this browser.'],
        '/my-list':['My List | HD Watchzone','View titles saved locally in this browser.'],
        '/search':['Search | HD Watchzone','Search movie, TV and anime titles.']
    };
    const categories = {
        movies:['popular','top_rated','now_playing','upcoming','28','35','18','27','10749','878','53','10752','80','16','99','14'],
        tv:['popular','top_rated','on_air','10759','35','80','18','10765','9648','10768','16','99','10751','10764'],
        anime:['popular','movies','top_rated'],
        new:['trending','popular_movies','popular_tv','now_playing','upcoming','on_air','top_rated']
    };
    const labels = {popular:'Popular',top_rated:'Top Rated',now_playing:'Now Playing',upcoming:'Upcoming',on_air:'On the Air',trending:'Trending',popular_movies:'Popular Movies',popular_tv:'Popular TV',movies:'Anime Movies'};
    const slug = value => String(value || '').toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'') || 'title';
    function titleMeta(data, type) {
        const name = data.title || data.name;
        const date = data.release_date || data.first_air_date;
        const year = /^\d{4}/.test(date || '') ? ` (${date.slice(0,4)})` : '';
        return {title:`${name}${year} — ${type === 'movie' ? 'Movie' : 'TV Series'} | HD Watchzone`,description:(data.overview || `Explore ${name}, cast, genres and ${type==='movie'?'movie':'series'} information on HD Watchzone.`).slice(0,180),canonical:`${SITE}/${type}/${data.id}-${slug(name)}`};
    }
    function describe(input) {
        const url = new URL(input, SITE), path = url.pathname.replace(/\/$/,'') || '/';
        const genre = path.match(/^\/genre\/(\d+)$/);
        if (!entries[path] && !(genre && genres[genre[1]])) return {status:404};
        const params = url.searchParams, section = path.slice(1), paginated = Boolean(categories[section] || genre);
        const rawPage = params.get('page') || '1';
        if (!/^\d+$/.test(rawPage) || +rawPage<1 || +rawPage>500) return {status:404};
        const page = +rawPage, category = params.get('category') || (section==='new'?'trending':'popular');
        if (categories[section] && !categories[section].includes(category)) return {status:404};
        const pair = genre ? [`${genres[genre[1]]} Movies & TV Shows | HD Watchzone`,`Explore ${genres[genre[1]].toLowerCase()} titles with movie and TV information.`] : entries[path];
        let [title,description] = pair;
        const canonicalParams = new URLSearchParams();
        const alternate = categories[section] && category !== (section==='new'?'trending':'popular');
        if (alternate) { canonicalParams.set('category',category); title = `${labels[category] || genres[category] || category} — ${title}`; }
        if (paginated && page>1) { canonicalParams.set('page',String(page)); title = title.replace(' | HD Watchzone',` — Page ${page} | HD Watchzone`); }
        if (path==='/search' && params.get('q')) { canonicalParams.set('q',params.get('q')); if(page>1) canonicalParams.set('page',String(page)); title=`Search for ${params.get('q').slice(0,80)} | HD Watchzone`; }
        const query = canonicalParams.toString();
        const noindex = ['/search','/account','/my-list','/cookies'].includes(path) || Boolean(alternate);
        return {status:200,path,page,category,genreId:genre?.[1],title,description,canonical:SITE+path+(query?'?'+query:''),robots:noindex?'noindex, follow':'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',noindex};
    }
    function pageURL(type, category, page) {
        const query = new URLSearchParams();
        const path = type==='genre'?`/genre/${category}`:`/${type}`;
        if(type==='search') query.set('q',decodeURIComponent(category));
        else if(type!=='genre' && category && category !== (type==='new'?'trending':'popular')) query.set('category',category);
        if(page>1) query.set('page',String(page));
        return path+(query.size?'?'+query.toString():'');
    }
    return {SITE,genres,entries,categories,slug,titleMeta,describe,pageURL};
});
