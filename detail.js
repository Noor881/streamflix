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
    { id: 'vidsrc', name: 'VidSrc', movieUrl: (id) => `https://vidsrc.xyz/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}` },
    { id: 'vidsrc2', name: 'VidSrc Pro', movieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`, tvUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}` },
    { id: 'multiembed', name: 'MultiEmbed', movieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`, tvUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` }
];

let activeServer = 0;

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
    const desc = data.overview ? data.overview.substring(0, 160) : 'Watch on HD Watchzone';
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

    const enhanced = Object.assign({}, baseSchema);
    enhanced.review = reviewObjs;
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
    return {
        '@context': 'https://schema.org',
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
}

function buildTVSchema(tv) {
    return {
        '@context': 'https://schema.org',
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
            <div class="nav-left">
                <a href="/" class="nav-logo">
                    <img src="/logo.jpeg" alt="HD Watchzone" style="height: 50px; vertical-align: middle; margin-right: 10px; mix-blend-mode: screen; filter: invert(1);">
                    HD Watchzone
                </a>
                <button class="nav-back" onclick="history.back()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back
                </button>
            </div>
            <div class="nav-actions">
                <a href="/#/movies" class="nav-btn">Movies</a>
                <a href="/#/tv" class="nav-btn">TV Shows</a>
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
            ${s.name}
        </button>`).join('');

    return `
        <div class="player-section">
            <div class="player-wrapper">
                <iframe src="${url}" allowfullscreen allow="autoplay; fullscreen; encrypted-media" id="video-player"></iframe>
            </div>
            <div class="server-selector">${serverBtns}</div>
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
                <iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
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

    const realSeasons = tvData.seasons.filter(s => s.season_number > 0);
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
        const season = await fetchWithRetry(`/tv/${tvId}/season/${seasonNum}`);
        const episodes = season.episodes || [];

        grid.innerHTML = episodes.map(ep => {
            const still = ep.still_path
                ? imgUrl(ep.still_path, 'w300')
                : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170"><rect width="300" height="170" fill="%231a1a1a"/></svg>';
            const isActive = ep.episode_number === currentEpisode;

            return `
                <div class="episode-card ${isActive ? 'active' : ''}"
                     onclick="DetailPage.playEpisode(${tvId}, ${seasonNum}, ${ep.episode_number})">
                    <div class="episode-still">
                        <img src="${still}" alt="Episode ${ep.episode_number}" loading="lazy">
                    </div>
                    <div class="episode-info">
                        <div class="episode-number">Episode ${ep.episode_number}</div>
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

            app.innerHTML = `
                ${renderNav()}

                <div class="detail-hero">
                    <div class="hero-backdrop">
                        <img src="${backdropUrl(movie.backdrop_path)}" alt="${sanitize(movie.title)}">
                    </div>
                    <div class="hero-content">
                        <div class="hero-poster">
                            <img src="${imgUrl(movie.poster_path, 'w500')}" alt="${sanitize(movie.title)}">
                        </div>
                        <div class="hero-info">
                            <h1 class="hero-title">${sanitize(movie.title)}</h1>
                            ${movie.tagline ? `<p class="hero-tagline">"${sanitize(movie.tagline)}"</p>` : ''}
                            <div class="hero-meta">
                                <span class="meta-badge rating">★ ${rating}</span>
                                ${year ? `<span class="meta-badge year">${year}</span>` : ''}
                                ${movie.runtime ? `<span class="meta-badge runtime">${formatRuntime(movie.runtime)}</span>` : ''}
                            </div>
                            <div class="hero-genres">
                                ${(movie.genres || []).map(g => `<a href="/#/genre/${g.id}" class="genre-chip">${g.name}</a>`).join('')}
                            </div>
                            <p class="hero-overview">${sanitize(movie.overview)}</p>
                            <div class="hero-buttons">
                                <button class="btn-play" onclick="document.getElementById('video-player')?.scrollIntoView({behavior:'smooth'})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    Watch Now
                                </button>
                                <button class="btn-secondary" onclick="document.querySelector('.detail-section')?.scrollIntoView({behavior:'smooth'})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                    More Info
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="detail-content">
                    ${buildPlayer('movie', id)}
                    ${buildCast(movie.credits)}
                    ${buildTrailer(movie.videos)}
                    ${buildDetailsGrid(movie, 'movie')}
                    ${buildRecos(movie.recommendations?.results, 'movie')}

                    <div class="detail-section">
                        <h2 class="section-title">Share</h2>
                        ${buildShareButtons(movie.title, pageUrl)}
                    </div>
                </div>`;

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

            app.innerHTML = `
                ${renderNav()}

                <div class="detail-hero">
                    <div class="hero-backdrop">
                        <img src="${backdropUrl(tv.backdrop_path)}" alt="${sanitize(tv.name)}">
                    </div>
                    <div class="hero-content">
                        <div class="hero-poster">
                            <img src="${imgUrl(tv.poster_path, 'w500')}" alt="${sanitize(tv.name)}">
                        </div>
                        <div class="hero-info">
                            <h1 class="hero-title">${sanitize(tv.name)}</h1>
                            ${tv.tagline ? `<p class="hero-tagline">"${sanitize(tv.tagline)}"</p>` : ''}
                            <div class="hero-meta">
                                <span class="meta-badge rating">★ ${rating}</span>
                                ${yearRange ? `<span class="meta-badge year">${yearRange}</span>` : ''}
                                <span class="meta-badge status">${tv.status || 'Unknown'}</span>
                            </div>
                            <div class="hero-genres">
                                ${(tv.genres || []).map(g => `<a href="/#/genre/${g.id}" class="genre-chip">${g.name}</a>`).join('')}
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
                    </div>
                </div>

                <div class="detail-content">
                    ${buildPlayer('tv', id, season, episode)}
                    ${buildEpisodes(tv, season, episode, id)}
                    ${buildCast(tv.credits)}
                    ${buildTrailer(tv.videos)}
                    ${buildDetailsGrid(tv, 'tv')}
                    ${buildRecos(tv.recommendations?.results, 'tv')}

                    <div class="detail-section">
                        <h2 class="section-title">Share</h2>
                        ${buildShareButtons(tv.name, pageUrl)}
                    </div>
                </div>`;

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

        const url = type === 'movie'
            ? SERVERS[index].movieUrl(id)
            : SERVERS[index].tvUrl(id, season, episode);
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
            player.src = SERVERS[activeServer].tvUrl(tvId, seasonNum, 1);
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
            player.src = SERVERS[activeServer].tvUrl(tvId, season, episode);
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
    }
};
