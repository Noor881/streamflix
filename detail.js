/* ==========================================
   HD Watchzone Detail Page Engine
   ========================================== */

const TMDB = {
    KEY: 'd74b73cd4563f614919e6493152fbc1e',
    BASE: 'https://api.themoviedb.org/3',
    IMG: 'https://image.tmdb.org/t/p',
    SITE_URL: 'https://hdwatchzone.com'
};

const SERVERS = [
    { id: 'vidsrc', name: 'VidSrc', description: 'Fastest • HD Quality', movieUrl: (id) => `https://vsembed.su/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vsembed.su/embed/tv/${id}/${s}/${e}` },
    { id: 'vidsrcto', name: 'VidSrc.to', description: 'No Ads • Reliable', movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
    { id: 'vidsrc2', name: 'VidSrc Pro', description: 'Premium Quality • Stable', movieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}` },
    { id: 'vidsrccc', name: 'VidSrc.cc', description: 'Fast Loading • 4K Support', movieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` }
];

let activeServer = 0; // vsembed.su — default as it works well and is fast.

const TV_OVERRIDES = {
    '65942': { // Re:Zero - Starting Life in Another World
        seasons: [
            { season_number: 1, name: 'Season 1', range: [1, 25] },
            { season_number: 2, name: 'Season 2', range: [26, 50] },
            { season_number: 3, name: 'Season 3', range: [51, 66] },
            { season_number: 4, name: 'Season 4', range: [67, 200] }
        ]
    }
};

function getRemappedTV(id, s, e) {
    const tid = String(id).trim();
    const ovr = TV_OVERRIDES[tid];
    if (ovr) {
        const sInfo = ovr.seasons.find(x => x.season_number === s);
        if (sInfo) {
            return { s: 1, e: sInfo.range[0] + (e - 1) };
        }
    }
    return { s, e };
}

/* ---------- TMDB API ---------- */
async function tmdbFetch(endpoint, params = {}) {
    const url = new URL(`${TMDB.BASE}${endpoint}`);
    url.searchParams.set('api_key', TMDB.KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
}

async function fetchWithRetry(endpoint, params = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await tmdbFetch(endpoint, params);
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

function imgUrl(path, size = 'w500') {
    if (!path) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" fill="%23141414"/>';
    return `${TMDB.IMG}/${size}${path}`;
}

function backdropUrl(path) {
    if (!path) return '';
    return `${TMDB.IMG}/w1280${path}`;
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

/* ---------- Continue Watching — localStorage ---------- */
function saveToHistory(data, type, season, episode) {
    try {
        const KEY = 'hdwatchzone_continue_watching';
        const id = data.id;
        const title = data.title || data.name;
        const poster = data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : '';
        const backdrop = data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : '';
        const year = type === 'movie' ? (data.release_date || '').slice(0, 4) : (data.first_air_date || '').slice(0, 4);
        const runtime = data.runtime || (type === 'tv' ? 45 : 120); // minutes
        const slug = title.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

        const item = {
            id, type, title, poster, backdrop,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            year, runtime, slug,
            season: season || null,
            episode: episode || null,
            progress: 0,
            savedAt: Date.now()
        };

        let list = JSON.parse(localStorage.getItem(KEY) || '[]');
        list = list.filter(i => !(i.id === id && i.type === type)); // remove old entry
        list.unshift(item); // add to top
        list = list.slice(0, 20); // keep max 20
        localStorage.setItem(KEY, JSON.stringify(list));

        // Track time-based progress (updates every 30s while user is on page)
        const startTime = Date.now();
        const progressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            const prog = Math.min(90, Math.round((elapsed / (runtime * 60)) * 100));
            try {
                const current = JSON.parse(localStorage.getItem(KEY) || '[]');
                const idx = current.findIndex(i => i.id === id && i.type === type);
                if (idx !== -1) {
                    current[idx].progress = prog;
                    localStorage.setItem(KEY, JSON.stringify(current));
                }
            } catch (e) { /* ignore */ }
        }, 30000);

        window.addEventListener('beforeunload', () => clearInterval(progressInterval));
    } catch (e) { /* localStorage not available */ }
}

function sanitize(text) {
    if (!text) return '';
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return 'TBA';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRuntime(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(num) {
    if (!num || num === 0) return 'N/A';
    return '$' + num.toLocaleString();
}

/* ---------- Meta Updates ---------- */
function generateMetaKeywords(type, title, data = {}) {
    const baseKeywords = [
        'free streaming', 'HD movies', 'watch online free',
        'stream free', 'online cinema', 'latest releases',
        'watch series free', 'free movie streaming'
    ];

    const titleSlug = title.toLowerCase();
    const titleKeywords = [
        `watch ${title} online free`,
        `${title} full ${type === 'movie' ? 'movie' : 'episodes'}`,
        `stream ${title} HD`,
        `${title} free streaming`,
        `watch ${title} india`
    ];

    // Special case for Spartacus: House of Ashur
    if (titleSlug.includes('spartacus') && titleSlug.includes('ashur')) {
        return [
            'spartacus house of ashur', 'watch spartacus house of ashur',
            'spartacus house of ashur watch online free', 'house of ashur full episodes',
            'spartacus house of ashur streaming', 'watch house of ashur',
            'house of ashur watch', 'spartacus house of ashur free',
            'spartacus house of ashur watch in india', 'spartacus house of ashur online',
            'spartacus: house of ashur where to watch', 'spartacus house of ashur episodes'
        ].join(', ');
    }

    // Genre-specific keywords
    const genreKeywords = [];
    if (data.genres && Array.isArray(data.genres)) {
        genreKeywords.push(...data.genres.slice(0, 2).map(g => `${g.name.toLowerCase()} ${type}s`));
    }

    return [...titleKeywords, ...genreKeywords, ...baseKeywords].slice(0, 20).join(', ');
}

function updateMeta(data, type) {
    const title = `Watch ${data.title || data.name} | HD Watchzone`;

    // Build rich meta description (120-300 chars)
    const desc = generateRichDescription(data, type);

    let image = backdropUrl(data.backdrop_path) || imgUrl(data.poster_path, 'w780');
    // Use logo as fallback if image is data URI (placeholder) or empty
    if (!image || image.startsWith('data:')) {
        image = 'https://hdwatchzone.com/logo.png';
    }
    const pageUrl = `${TMDB.SITE_URL}/${type}/${data.id}`;

    document.title = title;

    // Update meta keywords dynamically
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', generateMetaKeywords(type, data.title || data.name, data));

    const metaUpdates = {
        'meta[name="description"]': desc,
        'meta[property="og:title"]': title,
        'meta[property="og:description"]': desc,
        'meta[property="og:image"]': image,
        'meta[property="og:url"]': pageUrl,
        'meta[name="twitter:title"]': title,
        'meta[name="twitter:description"]': desc,
        'meta[name="twitter:image"]': image,
        'link[rel="canonical"]': pageUrl
    };

    Object.entries(metaUpdates).forEach(([sel, value]) => {
        const el = document.querySelector(sel);
        if (!el) return;
        if (el.tagName === 'LINK') {
            el.setAttribute('href', value);
        } else {
            el.setAttribute('content', value);
        }
    });
}

function generateRichDescription(data, type) {
    const mediaTitle = data.title || data.name;
    const parts = [];

    // Start with "Watch [Title] online in HD"
    parts.push(`Watch ${mediaTitle} online in HD`);

    // Add year
    const year = type === 'movie' ? data.release_date : data.first_air_date;
    if (year) {
        const yearNum = new Date(year).getFullYear();
        parts.push(`(${yearNum})`);
    }

    // Add overview snippet or genre context
    if (data.overview && data.overview.length > 50) {
        const snippet = data.overview.substring(0, 80).trim();
        const lastSpace = snippet.lastIndexOf(' ');
        parts.push('- ' + snippet.substring(0, lastSpace > 0 ? lastSpace : snippet.length) + '...');
    } else if (data.genres && data.genres.length > 0) {
        const genreNames = data.genres.slice(0, 2).map(g => g.name).join(', ');
        parts.push(`- ${genreNames} ${type}`);
    }

    // Add cast if available
    if (data.credits?.cast && data.credits.cast.length > 0) {
        const topCast = data.credits.cast.slice(0, 2).map(c => c.name).join(', ');
        parts.push(`Starring ${topCast}`);
    }

    // Add director/creator
    if (type === 'movie' && data.credits?.crew) {
        const director = data.credits.crew.find(c => c.job === 'Director');
        if (director) {
            parts.push(`Directed by ${director.name}`);
        }
    } else if (type === 'tv' && data.created_by && data.created_by.length > 0) {
        parts.push(`Created by ${data.created_by[0].name}`);
    }

    // Add call to action
    parts.push('Free streaming on HD Watchzone');

    // Join and ensure length constraints
    let description = parts.join('. ').replace(/\.\./g, '.');

    // Ensure minimum 120 characters
    if (description.length < 120 && data.overview) {
        description = `Watch ${mediaTitle} online in HD. ${data.overview.substring(0, 200)}. Free streaming on HD Watchzone.`;
    }

    // Ensure maximum 300 characters
    if (description.length > 300) {
        description = description.substring(0, 297) + '...';
    }

    return description;
}

/* ---------- Schema.org ---------- */
async function injectSchema(data, type) {
    try {
        // Build base schema
        let schema = type === 'movie' ? buildMovieSchema(data) : buildTVSchema(data);

        // Fetch reviews before injecting schema (blocking)
        const reviews = await fetchReviews(type, data.id);
        if (reviews && reviews.length) {
            schema = addReviewsToSchema(schema, reviews);
        }

        // Inject complete schema
        const el = document.getElementById('schema-movie');
        if (el) el.textContent = JSON.stringify(schema);

        injectBreadcrumbs(data, type);
    } catch (e) {
        console.error('Schema injection error:', e);
        // Fallback: inject schema without reviews
        const baseSchema = type === 'movie' ? buildMovieSchema(data) : buildTVSchema(data);
        const el = document.getElementById('schema-movie');
        if (el) el.textContent = JSON.stringify(baseSchema);
        injectBreadcrumbs(data, type);
    }
}

async function fetchReviews(type, id) {
    try {
        const res = await fetchWithRetry(`/${type}/${id}/reviews`, { language: 'en-US' });
        return (res.results || []).slice(0, 3);
    } catch (e) {
        return [];
    }
}

// enhance schema with reviews when available
function addReviewsToSchema(baseSchema, reviews) {
    if (!reviews || !reviews.length) return baseSchema;
    const reviewObjs = reviews.map(r => {
        const authorName = r.author || (r.author_details && (r.author_details.username || r.author_details.name)) || 'Anonymous';
        const date = r.created_at ? r.created_at.split('T')[0] : undefined;
        const body = r.content ? (r.content.length > 500 ? r.content.substring(0, 500) + '...' : r.content) : undefined;
        const rating = r.author_details && r.author_details.rating ? String(r.author_details.rating) : undefined;

        const rev = {
            '@type': 'Review',
            'author': { '@type': 'Person', 'name': authorName }
        };
        if (date) rev.datePublished = date;
        if (body) rev.reviewBody = body;
        if (rating) rev.reviewRating = { '@type': 'Rating', 'ratingValue': rating, 'bestRating': '10' };
        return rev;
    });

    const enhanced = JSON.parse(JSON.stringify(baseSchema));
    // Inject reviews into the Movie/TVSeries object inside @graph
    if (enhanced['@graph'] && enhanced['@graph'].length > 0) {
        enhanced['@graph'][0].review = reviewObjs;
    } else {
        enhanced.review = reviewObjs;
    }
    return enhanced;
}

function injectBreadcrumbs(data, type) {
    const title = data.title || data.name;
    const categoryName = type === 'movie' ? 'Movies' : 'TV Shows';
    const categoryPath = type === 'movie' ? '/#/movies' : '/#/tv';

    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: TMDB.SITE_URL
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: categoryName,
                item: `${TMDB.SITE_URL}${categoryPath}`
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: title,
                item: `${TMDB.SITE_URL}/${type}/${data.id}`
            }
        ]
    };

    let el = document.getElementById('schema-breadcrumb');
    if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = 'schema-breadcrumb';
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(breadcrumb);
}

function buildMovieSchema(m) {
    const movieSchema = {
        '@type': 'Movie',
        name: m.title,
        description: m.overview,
        image: imgUrl(m.poster_path, 'w780'),
        datePublished: m.release_date,
        director: m.credits?.crew?.find(c => c.job === 'Director')?.name || undefined,
        actor: m.credits?.cast?.slice(0, 5).map(a => ({ '@type': 'Person', name: a.name })),
        genre: m.genres?.map(g => g.name),
        duration: m.runtime ? `PT${m.runtime}M` : undefined,
        aggregateRating: m.vote_average > 0 ? {
            '@type': 'AggregateRating',
            ratingValue: m.vote_average.toFixed(1),
            bestRating: '10',
            ratingCount: m.vote_count
        } : undefined,
        url: `${TMDB.SITE_URL}/movie/${m.id}`
    };

    const thumbnails = [imgUrl(m.poster_path, 'w780')];
    if (m.backdrop_path) thumbnails.push(backdropUrl(m.backdrop_path));

    const videoSchema = {
        '@type': 'VideoObject',
        name: `Watch ${m.title} Online in HD`,
        description: m.overview || `Stream ${m.title} in HD quality for free on HD Watchzone.`,
        thumbnailUrl: thumbnails,
        uploadDate: m.release_date || undefined,
        duration: m.runtime ? `PT${m.runtime}M` : undefined,
        contentUrl: `${TMDB.SITE_URL}/movie/${m.id}`,
        embedUrl: SERVERS[0].movieUrl(m.id),
        interactionStatistic: m.vote_count > 0 ? {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'WatchAction' },
            userInteractionCount: m.vote_count
        } : undefined
    };

    return {
        '@context': 'https://schema.org',
        '@graph': [movieSchema, videoSchema]
    };
}

function buildTVSchema(tv) {
    const tvSchema = {
        '@type': 'TVSeries',
        name: tv.name,
        description: tv.overview,
        image: imgUrl(tv.poster_path, 'w780'),
        datePublished: tv.first_air_date,
        numberOfSeasons: tv.number_of_seasons,
        numberOfEpisodes: tv.number_of_episodes,
        actor: tv.credits?.cast?.slice(0, 5).map(a => ({ '@type': 'Person', name: a.name })),
        genre: tv.genres?.map(g => g.name),
        aggregateRating: tv.vote_average > 0 ? {
            '@type': 'AggregateRating',
            ratingValue: tv.vote_average.toFixed(1),
            bestRating: '10',
            ratingCount: tv.vote_count
        } : undefined,
        url: `${TMDB.SITE_URL}/tv/${tv.id}`
    };

    const thumbnails = [imgUrl(tv.poster_path, 'w780')];
    if (tv.backdrop_path) thumbnails.push(backdropUrl(tv.backdrop_path));

    const videoSchema = {
        '@type': 'VideoObject',
        name: `Watch ${tv.name} Online in HD`,
        description: tv.overview || `Stream ${tv.name} in HD quality for free on HD Watchzone.`,
        thumbnailUrl: thumbnails,
        uploadDate: tv.first_air_date || undefined,
        contentUrl: `${TMDB.SITE_URL}/tv/${tv.id}`,
        embedUrl: SERVERS[0].tvUrl(tv.id, 1, 1),
        interactionStatistic: tv.vote_count > 0 ? {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'WatchAction' },
            userInteractionCount: tv.vote_count
        } : undefined
    };

    return {
        '@context': 'https://schema.org',
        '@graph': [tvSchema, videoSchema]
    };
}

/* ---------- Share ---------- */
function buildShareButtons(title, url) {
    const encoded = encodeURIComponent(url);
    const text = encodeURIComponent(`Watch ${title} on HD Watchzone`);
    return `
        <div class="share-buttons">
            <button class="share-btn twitter" onclick="window.open('https://twitter.com/intent/tweet?text=${text}&url=${encoded}','_blank','width=600,height=400')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Share on X
            </button>
            <button class="share-btn facebook" onclick="window.open('https://www.facebook.com/sharer/sharer.php?u=${encoded}','_blank','width=600,height=400')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
            </button>
            <button class="share-btn whatsapp" onclick="window.open('https://wa.me/?text=${text}%20${encoded}','_blank')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
            </button>
            <button class="share-btn copy-link" onclick="DetailPage.copyLink('${url}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Copy Link
            </button>
        </div>`;
}

/* ---------- Internal Linking Sections ---------- */
function buildBreadcrumbs(data, type) {
    const title = data.title || data.name;
    const categoryName = type === 'movie' ? 'Movies' : 'TV Shows';
    const categoryPath = type === 'movie' ? '/#/movies' : '/#/tv';

    return `
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/" class="breadcrumb-link">Home</a>
            <span class="breadcrumb-separator">›</span>
            <a href="${categoryPath}" class="breadcrumb-link">${categoryName}</a>
            <span class="breadcrumb-separator">›</span>
            <span class="breadcrumb-current">${sanitize(title)}</span>
        </nav>`;
}

function buildGenreSection(genres, type) {
    if (!genres || genres.length === 0) return '';

    const genreLinks = genres.map(g =>
        `<a href="/#/genre/${g.id}" class="genre-link-card">
            <span class="genre-icon">🎬</span>
            <span class="genre-name">${g.name}</span>
            <span class="genre-arrow">→</span>
        </a>`
    ).join('');

    return `
        <div class="detail-section">
            <h2 class="section-title">Browse by Genre</h2>
            <div class="genre-links-grid">${genreLinks}</div>
        </div>`;
}

function buildYearSection(releaseDate, type) {
    if (!releaseDate) return '';

    const year = new Date(releaseDate).getFullYear();
    const mediaType = type === 'movie' ? 'Movies' : 'TV Shows';

    return `
        <div class="detail-section">
            <h2 class="section-title">More from ${year}</h2>
            <p class="year-description">
                Explore more ${mediaType.toLowerCase()} released in ${year}. 
                Discover trending titles, critically acclaimed releases, and hidden gems from this year.
            </p>
            <a href="/#/${type}?year=${year}" class="btn-browse-year">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Browse ${year} ${mediaType}
            </a>
        </div>`;
}

async function buildTrendingSection(type) {
    try {
        const trending = await fetchWithRetry(`/trending/${type}/week`);
        const items = trending.results?.slice(0, 8);

        if (!items || items.length === 0) return '';

        const cards = items.map(item => {
            const title = item.title || item.name;
            const year = item.release_date || item.first_air_date;
            const yearNum = year ? new Date(year).getFullYear() : '';
            const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
            const slug = createSlug(title);
            const href = `/${type}/${item.id}-${slug}`;

            return `
                <a href="${href}" class="trending-card">
                    <img src="${imgUrl(item.poster_path, 'w342')}" alt="${sanitize(title)}" loading="lazy">
                    <div class="trending-card-info">
                        <div class="trending-card-title">${sanitize(title)}</div>
                        <div class="trending-card-meta">
                            ${rating ? `<span>★ ${rating}</span>` : ''}
                            ${yearNum ? `<span>${yearNum}</span>` : ''}
                        </div>
                    </div>
                </a>`;
        }).join('');

        return `
            <div class="detail-section">
                <h2 class="section-title">Trending Now</h2>
                <div class="trending-grid">${cards}</div>
            </div>`;
    } catch (err) {
        return '';
    }
}

function buildDetailFooter() {
    return `
        <footer class="detail-footer">
            <div class="footer-content">
                <div class="footer-section">
                    <h4 class="footer-heading">Browse</h4>
                    <ul class="footer-links">
                        <li><a href="/">Home</a></li>
                        <li><a href="/#/movies">Movies</a></li>
                        <li><a href="/#/tv">TV Shows</a></li>
                        <li><a href="/#/trending">Trending</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4 class="footer-heading">Genres</h4>
                    <ul class="footer-links">
                        <li><a href="/#/genre/28">Action</a></li>
                        <li><a href="/#/genre/35">Comedy</a></li>
                        <li><a href="/#/genre/18">Drama</a></li>
                        <li><a href="/#/genre/878">Sci-Fi</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4 class="footer-heading">Support</h4>
                    <ul class="footer-links">
                        <li><a href="/#/help">Help Center</a></li>
                        <li><a href="/#/contact">Contact Us</a></li>
                        <li><a href="/#/faq">FAQ</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h4 class="footer-heading">Legal</h4>
                    <ul class="footer-links">
                        <li><a href="/#/privacy">Privacy Policy</a></li>
                        <li><a href="/#/terms">Terms of Use</a></li>
                        <li><a href="/#/legal">Legal Notices</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${new Date().getFullYear()} HD Watchzone. All content sourced from The Movie Database (TMDB). HD Watchzone is not responsible for third-party content.</p>
            </div>
        </footer>`;
}

/* ---------- Toast ---------- */
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast success show';
    setTimeout(() => { toast.className = 'toast'; }, 2500);
}

/* ---------- Navigation ---------- */
function renderNav() {
    return `
        <nav class="detail-nav" id="detail-nav">
            <div class="dnav-inner">
                <a href="/" class="dnav-logo" aria-label="HD Watchzone Home">
                    <img src="/logo.png" alt="HD Watchzone" onerror="this.style.display='none'">
                    <span class="dnav-logo-text">HD<span class="dnav-red">Watchzone</span></span>
                </a>
                <div class="dnav-links">
                    <a href="/#/movies" class="dnav-link">Movies</a>
                    <a href="/#/tv" class="dnav-link">TV Shows</a>
                    <a href="/#/genre/28" class="dnav-link">Genres</a>
                    <a href="/#/new" class="dnav-link">New Releases</a>
                </div>
                <div class="dnav-right">
                    <button class="dnav-search-btn" onclick="window.location.href='/'" aria-label="Search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                    </button>
                </div>
            </div>
        </nav>`;
}

/* ---------- Player ---------- */
function buildPlayer(type, id, season, episode) {
    const url = type === 'movie'
        ? SERVERS[activeServer].movieUrl(id)
        : SERVERS[activeServer].tvUrl(id, season, episode);

    const serverBtns = SERVERS.map((s, i) => `
        <button class="server-btn ${i === activeServer ? 'active' : ''}"
                onclick="DetailPage.switchServer(${i}, '${type}', '${id}', ${season || 'null'}, ${episode || 'null'})">
            <span class="server-name">${s.name}</span>
            <span class="server-desc">${s.description}</span>
        </button>`).join('');

    return `
        <div class="player-section">
            <div class="player-wrapper">
                <iframe src="${url}" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" id="video-player"></iframe>
            </div>
            <div class="server-selector">${serverBtns}</div>
            <div class="player-tip">
                <span class="player-tip-icon">⚡</span>
                <span><strong>Video not loading or showing "Media Not Available"?</strong> — Click the <strong>Server 1</strong> button 2–3 times. It fixes it instantly. If still broken, try Server 2 or 3.</span>
            </div>
        </div>`;
}

/* ---------- Cast Section ---------- */
function buildCast(credits) {
    const cast = credits?.cast?.slice(0, 12);
    if (!cast || cast.length === 0) return '';

    const cards = cast.map(person => {
        const photo = person.profile_path
            ? imgUrl(person.profile_path, 'w185')
            : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278"><rect width="185" height="278" fill="%231a1a1a"/><text x="92" y="139" text-anchor="middle" fill="%23555" font-size="42">?</text></svg>';
        return `
            <div class="cast-card">
                <div class="cast-photo"><img src="${photo}" alt="${sanitize(person.name)}" loading="lazy"></div>
                <div class="cast-name">${sanitize(person.name)}</div>
                <div class="cast-character">${sanitize(person.character)}</div>
            </div>`;
    }).join('');

    return `
        <div class="detail-section">
            <h2 class="section-title">Cast</h2>
            <div class="cast-grid">${cards}</div>
        </div>`;
}

/* ---------- Trailer ---------- */
function buildTrailer(videos) {
    const trailer = videos?.results?.find(v =>
        v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    if (!trailer) return '';

    return `
        <div class="detail-section">
            <h2 class="section-title">Trailer</h2>
            <div class="trailer-wrapper">
                <iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" allow="autoplay; encrypted-media; fullscreen"></iframe>
            </div>
        </div>`;
}

/* ---------- Recommendations ---------- */
function buildRecos(items, type) {
    if (!items || items.length === 0) return '';

    const cards = items.slice(0, 12).map(item => {
        const mediaType = item.media_type || type;
        const title = item.title || item.name;
        const date = item.release_date || item.first_air_date;
        const year = date ? new Date(date).getFullYear() : '';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
        const slug = createSlug(title);
        const href = `/${mediaType}/${item.id}-${slug}`;

        return `
            <a href="${href}" class="reco-card">
                <img src="${imgUrl(item.poster_path, 'w342')}" alt="${sanitize(title)}" loading="lazy">
                <div class="reco-card-info">
                    <div class="reco-card-title">${sanitize(title)}</div>
                    <div class="reco-card-meta">
                        ${rating ? `<span>★ ${rating}</span>` : ''}
                        ${year ? `<span>${year}</span>` : ''}
                    </div>
                </div>
            </a>`;
    }).join('');

    return `
        <div class="detail-section">
            <h2 class="section-title">You May Also Like</h2>
            <div class="reco-grid">${cards}</div>
        </div>`;
}

/* ---------- Details Grid ---------- */
function buildDetailsGrid(data, type) {
    const items = [];

    if (type === 'movie') {
        if (data.status) items.push(['Status', data.status]);
        if (data.runtime) items.push(['Runtime', formatRuntime(data.runtime)]);
        if (data.budget) items.push(['Budget', formatMoney(data.budget)]);
        if (data.revenue) items.push(['Revenue', formatMoney(data.revenue)]);
        if (data.original_language) items.push(['Language', data.original_language.toUpperCase()]);
        if (data.production_companies?.length) {
            items.push(['Studio', data.production_companies[0].name]);
        }
        const director = data.credits?.crew?.find(c => c.job === 'Director');
        if (director) items.push(['Director', director.name]);
    } else {
        if (data.status) items.push(['Status', data.status]);
        if (data.number_of_seasons) items.push(['Seasons', data.number_of_seasons]);
        if (data.number_of_episodes) items.push(['Episodes', data.number_of_episodes]);
        if (data.original_language) items.push(['Language', data.original_language.toUpperCase()]);
        if (data.networks?.length) items.push(['Network', data.networks[0].name]);
        if (data.created_by?.length) {
            items.push(['Creator', data.created_by.map(c => c.name).join(', ')]);
        }
    }

    if (items.length === 0) return '';

    return `
        <div class="detail-section">
            <h2 class="section-title">Details</h2>
            <div class="details-grid">
                ${items.map(([label, value]) => `
                    <div class="detail-item">
                        <span class="detail-label">${label}</span>
                        <span class="detail-value">${sanitize(String(value))}</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

/* ---------- Episode Selector ---------- */
function buildEpisodes(tvData, currentSeason, currentEpisode, tvId) {
    if (!tvData.seasons || tvData.seasons.length === 0) return '';

    let realSeasons = tvData.seasons.filter(s => s.season_number > 0);
    
    // Override logic
    const tid = String(tvId).trim();
    const ovr = TV_OVERRIDES[tid];
    if (ovr) {
        realSeasons = ovr.seasons.map(s => ({
            season_number: s.season_number,
            name: s.name,
            episode_count: s.range[1] - s.range[0] + 1
        }));
    }

    if (realSeasons.length === 0) return '';

    const seasonBtns = realSeasons.map(s => `
        <button class="season-btn ${s.season_number === currentSeason ? 'active' : ''}"
                onclick="DetailPage.changeSeason(${tvId}, ${s.season_number})">
            Season ${s.season_number}
        </button>`).join('');

    return `
        <div class="detail-section" id="episodes-section">
            <h2 class="section-title">Episodes</h2>
            <div class="season-selector">${seasonBtns}</div>
            <div class="episodes-grid" id="episodes-grid">
                <div class="detail-loading"><div class="loader"></div></div>
            </div>
        </div>`;
}

async function loadEpisodes(tvId, seasonNum, currentEpisode) {
    const grid = document.getElementById('episodes-grid');
    if (!grid) return;

    try {
        const tid = String(tvId).trim();
        const ovr = TV_OVERRIDES[tid];
        let episodes = [];
        
        if (ovr) {
            const seasonInfo = ovr.seasons.find(s => s.season_number === seasonNum);
            const rawSeason = await fetchWithRetry(`/tv/${tvId}/season/1`);
            const allEps = rawSeason.episodes || [];
            if (seasonInfo) {
                episodes = allEps.filter(ep => ep.episode_number >= seasonInfo.range[0] && ep.episode_number <= seasonInfo.range[1]);
                // Re-index episode numbers for UI
                episodes = episodes.map((ep, idx) => ({ ...ep, virtual_number: idx + 1, real_number: ep.episode_number }));
            }
        } else {
            const season = await fetchWithRetry(`/tv/${tvId}/season/${seasonNum}`);
            episodes = (season.episodes || []).map(ep => ({ ...ep, virtual_number: ep.episode_number, real_number: ep.episode_number }));
        }

        grid.innerHTML = episodes.map(ep => {
            const still = ep.still_path
                ? imgUrl(ep.still_path, 'w300')
                : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170"><rect width="300" height="170" fill="%231a1a1a"/></svg>';
            const isActive = ep.virtual_number === currentEpisode;

            return `
                <div class="episode-card ${isActive ? 'active' : ''}"
                     onclick="DetailPage.playEpisode(${tvId}, ${seasonNum}, ${ep.virtual_number})">
                    <div class="episode-still">
                        <img src="${still}" alt="Episode ${ep.virtual_number}" loading="lazy">
                    </div>
                    <div class="episode-info">
                        <div class="episode-number">Episode ${ep.virtual_number}</div>
                        <div class="episode-name">${sanitize(ep.name)}</div>
                        <div class="episode-overview">${sanitize(ep.overview)}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (err) {
        grid.innerHTML = '<p style="color:#777">Failed to load episodes</p>';
    }
}

/* ==========================================
   Main Page Renderers
   ========================================== */

const DetailPage = {
    currentData: null,
    currentType: null,
    currentSeason: 1,
    currentEpisode: 1,

    async loadMovie(id) {
        const app = document.getElementById('detail-app');

        try {
            const movie = await fetchWithRetry(`/movie/${id}`, {
                append_to_response: 'credits,videos,recommendations'
            });
            this.currentData = movie;
            this.currentType = 'movie';

            updateMeta(movie, 'movie');
            await injectSchema(movie, 'movie');

            const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
            const year = movie.release_date ? new Date(movie.release_date).getFullYear() : '';
            const pageUrl = `${TMDB.SITE_URL}/movie/${id}`;

            // Fetch trending content asynchronously (non-blocking)
            const trendingPromise = buildTrendingSection('movie');

            app.innerHTML = `
                ${renderNav()}

                <div class="detail-hero">
                    <div class="hero-backdrop">
                        <img src="${backdropUrl(movie.backdrop_path)}" alt="${sanitize(movie.title)}">
                    </div>
                    <div class="hero-content">
                        <div class="hero-info">
                            <div class="hero-tags">
                                ${(movie.genres || []).slice(0,3).map(g => `<span class="hero-tag">${g.name}</span>`).join('')}
                                ${year ? `<span class="hero-tag year">${year}</span>` : ''}
                                ${movie.runtime ? `<span class="hero-tag">${formatRuntime(movie.runtime)}</span>` : ''}
                            </div>
                            <h1 class="hero-title">${sanitize(movie.title)}</h1>
                            ${movie.tagline ? `<p class="hero-tagline">"${sanitize(movie.tagline)}"</p>` : ''}
                            <div class="hero-meta">
                                <span class="meta-badge rating">★ ${rating}</span>
                                ${year ? `<span class="meta-badge year">${year}</span>` : ''}
                                ${movie.runtime ? `<span class="meta-badge runtime">${formatRuntime(movie.runtime)}</span>` : ''}
                            </div>
                            <p class="hero-overview">${sanitize(movie.overview)}</p>
                            <div class="hero-buttons">
                                <button class="btn-play" onclick="document.getElementById('video-player')?.scrollIntoView({behavior:'smooth'})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    Play Now
                                </button>
                                <button class="btn-secondary" id="watchlist-btn" onclick="DetailPage.toggleWatchlist(${id}, '${sanitize(movie.title)}', '${imgUrl(movie.poster_path,'w342')}', 'movie')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                                    Watchlist
                                </button>
                            </div>
                        </div>
                        <div class="hero-poster">
                            <img src="${imgUrl(movie.poster_path, 'w500')}" alt="${sanitize(movie.title)} poster">
                        </div>
                    </div>
                </div>

                <div class="detail-content">
                    <div class="detail-main">
                        <div class="detail-section">
                            <h2 class="section-title">Player</h2>
                            ${buildPlayer('movie', id)}
                        </div>
                        
                        ${movie.overview ? `
                        <div class="detail-section">
                            <h2 class="section-title">Overview</h2>
                            <p class="about-text">${sanitize(movie.overview)}</p>
                            ${movie.tagline ? `<p class="about-tagline"><em>"${sanitize(movie.tagline)}"</em></p>` : ''}
                        </div>` : ''}
                        
                        ${buildCast(movie.credits)}
                        ${buildTrailer(movie.videos)}
                        
                        <div id="trending-placeholder"></div>
                        
                        ${buildGenreSection(movie.genres, 'movie')}
                        ${buildYearSection(movie.release_date, 'movie')}

                        <div class="detail-section">
                            <h2 class="section-title">Share</h2>
                            ${buildShareButtons(movie.title, pageUrl)}
                        </div>
                    </div>

                    <div class="detail-sidebar">
                        ${buildDetailsGrid(movie, 'movie')}
                        ${buildRecos(movie.recommendations?.results, 'movie')}
                    </div>
                </div>
                
                ${buildDetailFooter()}`;

            // Load trending content after page renders
            trendingPromise.then(trendingHTML => {
                const placeholder = document.getElementById('trending-placeholder');
                if (placeholder && trendingHTML) {
                    placeholder.outerHTML = trendingHTML;
                }
            });

            // Save to Continue Watching
            saveToHistory(movie, 'movie', null, null);

            this.initNavScroll();

        } catch (err) {
            app.innerHTML = `
                <div class="detail-error">
                    <h2>Movie Not Found</h2>
                    <p>Could not load this movie. It may have been removed.</p>
                    <a href="/" class="btn-play">Go Home</a>
                </div>`;
        }
    },

    async loadTV(id, season = 1, episode = 1) {
        const app = document.getElementById('detail-app');
        this.currentSeason = season;
        this.currentEpisode = episode;

        try {
            const tv = await fetchWithRetry(`/tv/${id}`, {
                append_to_response: 'credits,videos,recommendations'
            });
            this.currentData = tv;
            this.currentType = 'tv';

            updateMeta(tv, 'tv');
            await injectSchema(tv, 'tv');

            const rating = tv.vote_average ? tv.vote_average.toFixed(1) : 'N/A';
            const year = tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : '';
            const endYear = tv.status === 'Ended' && tv.last_air_date ? new Date(tv.last_air_date).getFullYear() : '';
            const yearRange = endYear && endYear !== year ? `${year}–${endYear}` : year;
            const pageUrl = `${TMDB.SITE_URL}/tv/${id}`;

            // Fetch trending content asynchronously (non-blocking)
            const trendingPromise = buildTrendingSection('tv');

            app.innerHTML = `
                ${renderNav()}

                <div class="detail-hero">
                    <div class="hero-backdrop">
                        <img src="${backdropUrl(tv.backdrop_path)}" alt="${sanitize(tv.name)}">
                    </div>
                    <div class="hero-content">
                        <div class="hero-info">
                            <div class="hero-tags">
                                ${(tv.genres || []).slice(0,3).map(g => `<span class="hero-tag">${g.name}</span>`).join('')}
                                ${yearRange ? `<span class="hero-tag year">${yearRange}</span>` : ''}
                                <span class="hero-tag status-tag">${tv.status || ''}</span>
                            </div>
                            <h1 class="hero-title">${sanitize(tv.name)}</h1>
                            ${tv.tagline ? `<p class="hero-tagline">"${sanitize(tv.tagline)}"</p>` : ''}
                            <div class="hero-meta">
                                <span class="meta-badge rating">★ ${rating}</span>
                                ${yearRange ? `<span class="meta-badge year">${yearRange}</span>` : ''}
                                <span class="meta-badge status">${tv.status || 'Unknown'}</span>
                                ${(() => {
                                    const tid = String(id).trim();
                                    return TV_OVERRIDES[tid] ? `<span class="meta-badge">${TV_OVERRIDES[tid].seasons.length} Seasons</span>` : (tv.number_of_seasons ? `<span class="meta-badge">${tv.number_of_seasons} Seasons</span>` : '');
                                })()}
                            </div>
                            <p class="hero-overview">${sanitize(tv.overview)}</p>
                            <div class="hero-buttons">
                                <button class="btn-play" onclick="document.getElementById('video-player')?.scrollIntoView({behavior:'smooth'})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    Watch S${season} E${episode}
                                </button>
                                <button class="btn-secondary" onclick="document.getElementById('episodes-section')?.scrollIntoView({behavior:'smooth'})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                                    Episodes
                                </button>
                            </div>
                        </div>
                        <div class="hero-poster">
                            <img src="${imgUrl(tv.poster_path, 'w500')}" alt="${sanitize(tv.name)} poster">
                        </div>
                    </div>
                </div>

                <div class="detail-content">
                    <div class="detail-main">
                        <div class="detail-section">
                            <h2 class="section-title">Player</h2>
                            ${(() => {
                                const remap = getRemappedTV(id, season, episode);
                                return buildPlayer('tv', id, remap.s, remap.e);
                            })()}
                        </div>

                        ${tv.overview ? `
                        <div class="detail-section">
                            <h2 class="section-title">Overview</h2>
                            <p class="about-text">${sanitize(tv.overview)}</p>
                            ${tv.tagline ? `<p class="about-tagline"><em>"${sanitize(tv.tagline)}"</em></p>` : ''}
                            ${tv.number_of_seasons ? `<p class="about-info">This series has ${tv.number_of_seasons} season${tv.number_of_seasons > 1 ? 's' : ''} with ${tv.number_of_episodes || 'multiple'} episodes.</p>` : ''}
                        </div>` : ''}

                        ${buildEpisodes(tv, season, episode, id)}
                        ${buildCast(tv.credits)}
                        ${buildTrailer(tv.videos)}

                        <div id="trending-placeholder"></div>

                        ${buildGenreSection(tv.genres, 'tv')}
                        ${buildYearSection(tv.first_air_date, 'tv')}

                        <div class="detail-section">
                            <h2 class="section-title">Share</h2>
                            ${buildShareButtons(tv.name, pageUrl)}
                        </div>
                    </div>

                    <div class="detail-sidebar">
                        ${buildDetailsGrid(tv, 'tv')}
                        ${buildRecos(tv.recommendations?.results, 'tv')}
                    </div>
                </div>

                ${buildDetailFooter()}`;

            // Load trending content after page renders
            trendingPromise.then(trendingHTML => {
                const placeholder = document.getElementById('trending-placeholder');
                if (placeholder && trendingHTML) {
                    placeholder.outerHTML = trendingHTML;
                }
            });

            // Save to Continue Watching
            saveToHistory(tv, 'tv', season, episode);

            this.initNavScroll();
            loadEpisodes(id, season, episode);

        } catch (err) {
            app.innerHTML = `
                <div class="detail-error">
                    <h2>TV Show Not Found</h2>
                    <p>Could not load this show. It may have been removed.</p>
                    <a href="/" class="btn-play">Go Home</a>
                </div>`;
        }
    },

    switchServer(index, type, id, season, episode) {
        activeServer = index;
        const player = document.getElementById('video-player');
        if (!player) return;

        let url;
        if (type === 'movie') {
            url = SERVERS[index].movieUrl(id);
        } else {
            const remap = getRemappedTV(id, season, episode);
            url = SERVERS[index].tvUrl(id, remap.s, remap.e);
        }
        player.src = url;

        document.querySelectorAll('.server-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    },

    changeSeason(tvId, seasonNum) {
        this.currentSeason = seasonNum;
        this.currentEpisode = 1;

        // Update player
        const player = document.getElementById('video-player');
        if (player) {
            const remap = getRemappedTV(tvId, seasonNum, 1);
            player.src = SERVERS[activeServer].tvUrl(tvId, remap.s, remap.e);
        }

        // Update season buttons
        document.querySelectorAll('.season-btn').forEach(btn => {
            const num = parseInt(btn.textContent.replace('Season ', ''));
            btn.classList.toggle('active', num === seasonNum);
        });

        // Reload episodes
        loadEpisodes(tvId, seasonNum, 1);
    },

    playEpisode(tvId, season, episode) {
        this.currentSeason = season;
        this.currentEpisode = episode;

        const player = document.getElementById('video-player');
        if (player) {
            const remap = getRemappedTV(tvId, season, episode);
            player.src = SERVERS[activeServer].tvUrl(tvId, remap.s, remap.e);
            player.scrollIntoView({ behavior: 'smooth' });
        }

        // Update active state
        document.querySelectorAll('.episode-card').forEach(card => {
            card.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
    },

    copyLink(url) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link copied to clipboard!');
        }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Link copied to clipboard!');
        });
    },

    initNavScroll() {
        const nav = document.getElementById('detail-nav');
        if (!nav) return;

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    nav.classList.toggle('scrolled', window.scrollY > 60);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    },

    toggleWatchlist(id, title, poster, type) {

        const key = 'watchlist';
        let list = JSON.parse(localStorage.getItem(key) || '[]');
        const exists = list.find(i => i.id === id);
        if (exists) {
            list = list.filter(i => i.id !== id);
            showToast('Removed from Watchlist');
        } else {
            list.push({ id, title, poster, type });
            showToast('Added to Watchlist!');
        }
        localStorage.setItem(key, JSON.stringify(list));
        const btn = document.getElementById('watchlist-btn');
        if (btn) btn.classList.toggle('active', !exists);
    }
};
