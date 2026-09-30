/* ==========================================
   HD Watchzone - Main Application
   ========================================== */

// Configuration
const CONFIG = {
    // TMDB API - Get your free API key at https://www.themoviedb.org/settings/api
    TMDB_API_KEY: 'd74b73cd4563f614919e6493152fbc1e',
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',

    // Vidking Embed
    PLAYER_COLOR: 'e50914', // Red color matching our theme

    // Local Storage Keys
    STORAGE_KEYS: {
        WATCH_HISTORY: 'streamflix_watch_history',
        CONTINUE_WATCHING: 'streamflix_continue_watching'
    }
};

// Image Sizes
const IMAGE_SIZES = {
    poster: {
        small: 'w185',
        medium: 'w342',
        large: 'w500',
        original: 'original'
    },
    backdrop: {
        small: 'w780',
        large: 'w1280',
        original: 'original'
    }
};
const POSTER_SIZES = '(max-width: 560px) calc((100vw - 34px) / 2), (max-width: 1283px) 154px, (max-width: 1583px) 12vw, 190px';

// ==========================================
// State Management
// ==========================================
const state = {
    currentPage: 'home',
    searchQuery: '',
    continueWatching: [],
    isLoading: false
};

// ==========================================
// Utility Functions
// ==========================================
const utils = {
    // Get image URL from TMDB
    getImageUrl(path, size = 'medium', type = 'poster') {
        if (!path) return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22%3E%3Crect width=%22300%22 height=%22450%22 fill=%22%231a1a1a%22/%3E%3Ctext x=%22150%22 y=%22225%22 fill=%22%23666%22 font-family=%22sans-serif%22 font-size=%2214%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E';
        const sizeKey = IMAGE_SIZES[type][size] || IMAGE_SIZES[type].medium;
        return `${CONFIG.TMDB_IMAGE_BASE}/${sizeKey}${path}`;
    },

    // Use TMDB's configured widths so browsers can choose without downloading every variant.
    imageAttrs(path, sizes = POSTER_SIZES, type = 'poster') {
        const dimensions = type === 'backdrop' ? 'width="1280" height="720"' : 'width="300" height="450"';
        const normalized = String(path || '').replace(/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)/, '');
        if (!normalized.startsWith('/') || normalized.startsWith('//')) return `${dimensions} decoding="async"`;
        const widths = type === 'backdrop' ? [300, 780, 1280] : [185, 342, 500, 780];
        const srcset = widths.map(width => `${CONFIG.TMDB_IMAGE_BASE}/w${width}${normalized} ${width}w`).join(', ');
        return `${dimensions} decoding="async" srcset="${utils.sanitize(srcset)}" sizes="${utils.sanitize(sizes)}"`;
    },

    // Format date
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).getFullYear();
    },

    // Format runtime
    formatRuntime(minutes) {
        if (!minutes) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    },

    // Truncate text
    truncate(text, length = 150) {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    },

    // Sanitize text to prevent XSS
    sanitize(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Save to local storage
    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving to localStorage:', e);
        }
    },

    // Load from local storage
    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error loading from localStorage:', e);
            return null;
        }
    },

    // Create URL friendly slug
    createSlug(text) {
        return window.SiteSEO.slug(text);
    }
};

// ==========================================
// API Response Cache
// ==========================================
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;
const initialCatalog = document.getElementById('initial-catalog-data');
if (initialCatalog) {
    try {
        for (const entry of JSON.parse(initialCatalog.textContent).responses || []) {
            const url = new URL(CONFIG.TMDB_BASE_URL + entry.endpoint);
            url.searchParams.set('api_key', CONFIG.TMDB_API_KEY);
            Object.entries(entry.params).forEach(([key,value]) => url.searchParams.set(key,value));
            url.searchParams.sort();
            apiCache.set(url.toString(), {data:entry.data,timestamp:Date.now()});
        }
    } catch { /* Invalid initial data falls back to bounded API requests. */ }
}

// Image error fallback
const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22%3E%3Crect width=%22300%22 height=%22450%22 fill=%22%231a1a1a%22/%3E%3Ctext x=%22150%22 y=%22225%22 fill=%22%23666%22 font-family=%22sans-serif%22 font-size=%2214%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E';
window.imgErr = function (el) { el.src = FALLBACK_IMG; el.onerror = null; };

// ==========================================
// TMDB API Service
// ==========================================
const tmdbAPI = {
    async fetch(endpoint, params = {}) {
        const url = new URL(`${CONFIG.TMDB_BASE_URL}${endpoint}`);
        url.searchParams.append('api_key', CONFIG.TMDB_API_KEY);

        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        url.searchParams.sort();
        const cacheKey = url.toString();
        const cached = apiCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();
            apiCache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            return null;
        }
    },

    // Get trending content (multiple pages)
    async getTrending(mediaType = 'all', timeWindow = 'week', pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch(`/trending/${mediaType}/${timeWindow}`, { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []).filter(item => item.media_type !== 'person' && (item.title || item.name));
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get popular movies (multiple pages)
    async getPopularMovies(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/movie/popular', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get popular TV shows (multiple pages)
    async getPopularTV(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/tv/popular', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get movie details
    async getMovieDetails(id) {
        return this.fetch(`/movie/${id}`, { append_to_response: 'credits,recommendations' });
    },

    // Get TV details
    async getTVDetails(id) {
        return this.fetch(`/tv/${id}`, { append_to_response: 'credits,recommendations' });
    },

    // Get TV season details
    async getSeasonDetails(tvId, seasonNumber) {
        return this.fetch(`/tv/${tvId}/season/${seasonNumber}`);
    },

    // Search multi - fetch multiple pages for broad results
    async search(query, pages = 5) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/search/multi', { query, page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get top rated movies (multiple pages)
    async getTopRatedMovies(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/movie/top_rated', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get top rated TV (multiple pages)
    async getTopRatedTV(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/tv/top_rated', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get Anime/Animation movies (genre id: 16)
    async getAnimationMovies(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            // Added JP origin to focus on Anime
            requests.push(this.fetch('/discover/movie', { with_genres: 16, with_origin_country: 'JP', page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get Anime TV shows (genre id: 16 Animation for TV)
    async getAnimeTVShows(pages = 1) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/discover/tv', { with_genres: 16, with_origin_country: 'JP', page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get movies by genre
    async getMoviesByGenre(genreId, pages = 3) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/discover/movie', { with_genres: genreId, page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get TV shows by genre
    async getTVByGenre(genreId, pages = 3) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/discover/tv', { with_genres: genreId, page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get movie genres list
    async getMovieGenres() {
        return this.fetch('/genre/movie/list');
    },

    // Get TV genres list
    async getTVGenres() {
        return this.fetch('/genre/tv/list');
    },

    // Get now playing movies
    async getNowPlayingMovies(pages = 3) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/movie/now_playing', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get upcoming movies
    async getUpcomingMovies(pages = 3) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/movie/upcoming', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    },

    // Get on the air TV shows
    async getOnTheAirTV(pages = 3) {
        const requests = [];
        for (let page = typeof pages === "object" ? pages.page : 1; page <= (typeof pages === "object" ? pages.page : Math.min(pages, 5)); page++) {
            requests.push(this.fetch('/tv/on_the_air', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults, total_pages: responses[0]?.total_pages || 1, total_results: responses[0]?.total_results || allResults.length };
    }
};

// ==========================================
// Multi-Server Video Player Integration
// ==========================================
const components = {
    // Loading spinner
    loading() {
        return `
            <div class="skeleton-container">
                <div class="skeleton-hero shimmer"></div>
                <div class="skeleton-section">
                    <div class="skeleton-title shimmer"></div>
                    <div class="skeleton-row">
                        ${Array(8).fill('<div class="skeleton-card shimmer"></div>').join('')}
                    </div>
                </div>
                <div class="skeleton-section">
                    <div class="skeleton-title shimmer"></div>
                    <div class="skeleton-row">
                        ${Array(8).fill('<div class="skeleton-card shimmer"></div>').join('')}
                    </div>
                </div>
            </div>
        `;
    },

    // Content card
    card(item, type = 'movie') {
        const mediaType = item.media_type || type;
        const title = item.title || item.name;
        const date = item.release_date || item.first_air_date;
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const posterUrl = utils.getImageUrl(item.poster_path, 'medium');
        const slug = utils.createSlug(title);
        const route = mediaType === 'movie' ? `/movie/${item.id}-${slug}` : `/tv/${item.id}-${slug}`;
        const year = date ? new Date(date).getFullYear() : '';

        return `
            <a href="${route}" class="card-wrapper" data-id="${item.id}" data-type="${mediaType}">
                <div class="card">
                    <img 
                        src="${posterUrl}" 
                        alt="${utils.sanitize(title)}" 
                        class="card-poster"
                        ${utils.imageAttrs(item.poster_path)}
                        loading="lazy"
                        onerror="imgErr(this)"
                    >
                    <div class="card-overlay">
                        <div class="card-meta">
                            <span class="card-rating">★ ${rating}</span>
                            <span class="card-type">${mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                        </div>
                    </div>
                    <div class="card-play"></div>
                </div>
                <div class="card-info">
                    <h3 class="card-info-title">${utils.sanitize(title)}</h3>
                    <p class="card-info-desc">${year || 'Recently added'} <span>•</span> ${mediaType === 'movie' ? 'Movie' : 'TV Series'} </p>
                </div>
            </a>
        `;
    },

    // Recently viewed cards use the same portrait shell as the catalog.
    continueCard(item) {
        const title = item.title || item.name;
        const mediaType = item.media_type || item.type || 'movie';
        const posterUrl = item.poster || (item.poster_path ? utils.getImageUrl(item.poster_path, 'medium') : utils.getImageUrl(null));
        const slug = utils.createSlug(title);
        const season = Math.max(0, parseInt(item.season, 10) || 0);
        const episode = Math.max(1, parseInt(item.episode, 10) || 1);
        const route = mediaType === 'movie'
            ? `/movie/${item.id}-${slug}`
            : `/tv/${item.id}-${slug}${season ? `/${season}/${episode}` : ''}`;
        const progressPercent = item.progressVerified ? Math.max(0, Math.min(100, Number(item.progress) || 0)) : 0;
        // Estimate time left
        const runtime = item.runtime || 120;
        const watchedMin = Math.round((progressPercent / 100) * runtime);
        const leftMin = Math.max(1, runtime - watchedMin);
        const leftLabel = progressPercent > 0 ? `${leftMin}m left` : 'Recently opened';
        const episodeLabel = mediaType === 'tv' && season ? `S${season} E${episode}` : '';

        return `
            <a href="${route}" class="card-wrapper recent-card" data-id="${item.id}" data-type="${mediaType}">
                <div class="card">
                    <img src="${utils.sanitize(posterUrl)}" alt="${utils.sanitize(title)}" class="card-poster" ${utils.imageAttrs(item.poster_path || item.poster)} loading="lazy" onerror="imgErr(this)">
                    <div class="card-overlay">
                        <div class="card-meta"><span class="card-type">${mediaType === 'movie' ? 'Movie' : 'TV'}</span></div>
                    </div>
                    <div class="card-play"></div>
                    ${progressPercent > 0 ? `<div class="recent-progress-bar"><div class="recent-progress-fill" style="width:${progressPercent}%"></div></div>` : ''}
                </div>
                <div class="card-info">
                    <h3 class="card-info-title">${utils.sanitize(title)}</h3>
                    <p class="card-info-desc">${episodeLabel ? `${episodeLabel} <span>•</span> ` : ''}${leftLabel}</p>
                </div>
            </a>
        `;
    },

    // Content row with scroll arrows
    contentRow(items, type = 'movie', rowId = null) {
        if (!items || items.length === 0) {
            return '<p class="text-muted">No content available</p>';
        }
        const id = rowId || `row-${Math.random().toString(36).substr(2, 9)}`;
        return `
            <div class="row-wrapper">
                <button class="scroll-arrow scroll-arrow--left" onclick="scrollRow('${id}', -1)" aria-label="Scroll left">‹</button>
                <div class="content-row" id="${id}">
                    ${items.map(item => this.card(item, type)).join('')}
                </div>
                <button class="scroll-arrow scroll-arrow--right" onclick="scrollRow('${id}', 1)" aria-label="Scroll right">›</button>
            </div>
        `;
    },

    // Section
    section(title, content, link = null, tabs = null) {
        if (link) link = link.replace(/^#/, '');
        const linkLabel = ({'/movies':'Browse movies','/tv':'Browse TV','/anime':'Browse anime'})[link] || `Browse ${title}`;
        return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">${title}</h2>
                    <div class="section-header-right">
                        ${tabs ? `<div class="section-tabs">${tabs}</div>` : ''}
                        ${link ? `<a href="${link}" class="section-link">${utils.sanitize(linkLabel)} →</a>` : ''}
                    </div>
                </div>
                ${content}
            </section>
        `;
    },

    // Hero carousel with multiple items
    heroCarousel(items) {
        if (!items || items.length === 0) return '';

        // Take first 5 items for carousel
        const carouselItems = items.slice(0, 5);

        const slides = carouselItems.map((item, index) => {
            const title = item.title || item.name;
            const overview = utils.truncate(item.overview, 180);
            const backdropUrl = utils.getImageUrl(item.backdrop_path, 'large', 'backdrop');
            const posterUrl = utils.getImageUrl(item.poster_path, 'medium');
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const date = item.release_date || item.first_air_date;
            const mediaType = item.media_type || 'movie';
            const slug = utils.createSlug(title);
            const route = mediaType === 'movie' ? `/movie/${item.id}-${slug}` : `/tv/${item.id}-${slug}`;
            const year = date ? new Date(date).getFullYear() : '';
            // Genre pills — use genre_ids mapped to names (top 3)
            const genreMap = { 28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',10759:'Action & Adv',10762:'Kids',10763:'News',10764:'Reality',10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics' };
            const genrePills = (item.genre_ids || []).slice(0, 3).map(id => genreMap[id] || '').filter(Boolean).map(g => `<span class="hero-genre-pill">${g}</span>`).join('');

            return `
                <div ${index === 0 ? '' : 'inert aria-hidden="true"'} class="hero-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                    ${item.backdrop_path ? `<img src="${utils.sanitize(backdropUrl)}" alt="" class="hero-backdrop-image" ${utils.imageAttrs(item.backdrop_path, '100vw', 'backdrop')} loading="${index === 0 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'low'}">` : ''}
                    <div class="hero-gradient-overlay"></div>
                    <div class="hero-content hero-content-split">
                        <div class="hero-text-col">
                            <span class="hero-badge">
                                <span>★</span> #${index + 1} Trending
                            </span>
                            ${genrePills ? `<div class="hero-genre-pills">${genrePills}</div>` : ''}
                            <h1 class="hero-title">${utils.sanitize(title)}</h1>
                            <div class="hero-meta">
                                <span class="hero-meta-item hero-rating">★ ${rating}</span>
                                ${year ? `<span class="hero-meta-item">${year}</span>` : ''}
                                <span class="hero-meta-item">${mediaType === 'movie' ? '🎬 Movie' : '📺 TV'}</span>
                            </div>
                            <p class="hero-description">${utils.sanitize(overview)}</p>
                            <div class="hero-buttons">
                                <a href="${route}" class="btn-cineby btn-cineby-primary" aria-label="Open player for ${utils.sanitize(title)}">
                                    <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    Play Now
                                </a>
                                <a href="${route}" class="btn-cineby btn-cineby-glass">
                                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                    Title details<span class="sr-only"> for ${utils.sanitize(title)}</span>
                                </a>
                            </div>
                        </div>
                        <div class="hero-poster-col">
                            <img src="${posterUrl}" alt="${utils.sanitize(title)}" class="hero-poster-img" ${utils.imageAttrs(item.poster_path, '180px')} loading="lazy" fetchpriority="low">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const dots = carouselItems.map((_, index) =>
            `<button class="hero-dot ${index === 0 ? 'active' : ''}" data-index="${index}" onclick="goToSlide(${index})" aria-label="Go to slide ${index + 1}"></button>`
        ).join('');

        return `
            <section class="hero-carousel" id="hero-carousel">
                <div class="hero-slides">
                    ${slides}
                </div>
                <button class="hero-arrow hero-arrow--left" onclick="prevSlide()" aria-label="Previous featured title">‹</button>
                <button class="hero-arrow hero-arrow--right" onclick="nextSlide()" aria-label="Next featured title">›</button>
                <div class="hero-floating-cards">
                    <div class="hero-floating-header">Next Up</div>
                    ${carouselItems.slice(1, 4).map(item => {
            const title = item.title || item.name;
            const posterUrl = utils.getImageUrl(item.poster_path, 'small');
            return `<div class="hero-floating-card">
                            <img src="${posterUrl}" alt="${title}" loading="lazy">
                        </div>`;
        }).join('')}
                </div>
                <button class="hero-pause" type="button" onclick="toggleHeroRotation(this)" aria-pressed="false">Pause slideshow</button><div class="hero-dots">
                    ${dots}
                </div>
                <div class="hero-progress">
                    <div class="hero-progress-bar"></div>
                </div>
            </section>
        `;
    },

    // Section with RIGHT-aligned tabs (competitor style)
    sectionWithRightTabs(title, content, rowId, tabs = null) {
        const tabsHtml = tabs ? `<div class="section-tabs">${tabs}</div>` : '';

        return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">${title}</h2>
                    ${tabsHtml}
                </div>
                ${content}
                <a class="section-link" href="/new">See all trending titles →</a>
            </section>
        `;
    },

    // Top 10 Content Today section with GIANT numbered cards (Netflix style)
    top10Section(items, title = 'TOP 10 CONTENT TODAY') {
        if (!items || items.length === 0) return '';

        const top10Items = items.slice(0, 10);
        const rowId = 'row-top10';

        const cards = top10Items.map((item, index) => {
            const mediaType = item.media_type || 'movie';
            const itemTitle = item.title || item.name;
            const posterUrl = utils.getImageUrl(item.poster_path, 'medium');
            const slug = utils.createSlug(itemTitle);
            const route = mediaType === 'movie' ? `/movie/${item.id}-${slug}` : `/tv/${item.id}-${slug}`;
            const ranking = index + 1;

            return `
                <div class="top10-card-cineby">
                    <div class="top10-number-outline">${ranking}</div>
                    <a href="${route}" class="top10-poster-link-cineby">
                        <img src="${posterUrl}" alt="${itemTitle}" class="top10-poster-cineby" loading="lazy" onerror="imgErr(this)">
                    </a>
                </div>`;
        }).join('');

        return `
            <section class="section top10-section">
                <div class="section-header">
                    <h2 class="section-title">${title}</h2>
                </div>
                <div class="row-wrapper">
                    <button class="scroll-arrow scroll-arrow--left" onclick="scrollRow('${rowId}', -1)" aria-label="Scroll left">‹</button>
                    <div class="top10-row" id="${rowId}">
                        ${cards}
                    </div>
                    <button class="scroll-arrow scroll-arrow--right" onclick="scrollRow('${rowId}', 1)" aria-label="Scroll right">›</button>
                </div>
            </section>
        `;
    },

    // Single hero (for detail pages)
    hero(item) {
        if (!item) return '';

        const title = item.title || item.name;
        const overview = utils.truncate(item.overview, 200);
        const backdropUrl = utils.getImageUrl(item.backdrop_path, 'large', 'backdrop');
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const date = item.release_date || item.first_air_date;
        const mediaType = item.media_type || 'movie';
        const slug = utils.createSlug(title);
        const route = mediaType === 'movie' ? `/movie/${item.id}-${slug}` : `/tv/${item.id}-${slug}`;

        return `
            <section class="hero" style="background-image: url('${backdropUrl}')">
                <div class="hero-content">
                    <span class="hero-badge">
                        <span>★</span> Featured
                    </span>
                    <h1 class="hero-title">${title}</h1>
                    <p class="hero-description">${overview}</p>
                    <div class="hero-meta">
                        <span class="hero-meta-item hero-rating">★ ${rating}</span>
                        <span class="hero-meta-item">${utils.formatDate(date)}</span>
                        <span class="hero-meta-item">${mediaType === 'movie' ? 'Movie' : 'TV Series'}</span>
                    </div>
                    <div class="hero-buttons">
                        <a href="${route}" class="btn btn-primary">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            Watch Now
                        </a>
                        <button class="btn btn-secondary">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            Title details<span class="sr-only"> for ${utils.sanitize(title)}</span>
                        </button>
                    </div>
                </div>
            </section>
        `;
    },

    // Episode card
    episodeCard(episode, tvId, seasonNumber, isActive = false) {
        const stillUrl = utils.getImageUrl(episode.still_path, 'small', 'backdrop');
        const overview = utils.truncate(episode.overview, 100);

        return `
            <div class="episode-card ${isActive ? 'active' : ''}" 
                 data-season="${seasonNumber}" 
                 data-episode="${episode.episode_number}"
                 onclick="router.navigate('#/tv/${tvId}/${seasonNumber}/${episode.episode_number}')">
                <div class="episode-thumb">
                    <img src="${stillUrl}" alt="Episode ${episode.episode_number}" loading="lazy" onerror="imgErr(this)">
                    <span class="episode-number">E${episode.episode_number}</span>
                </div>
                <div class="episode-info">
                    <h4 class="episode-title">${episode.name || `Episode ${episode.episode_number}`}</h4>
                    <p class="episode-overview">${overview || 'No description available.'}</p>
                </div>
            </div>
        `;
    },

    // Genre tag
    genreTag(genre) {
        return `<span class="genre-tag">${genre.name}</span>`;
    },

    // Pagination component
    pagination(currentPage, totalPages, pageType, category = '') {
        if (totalPages <= 1) return '';

        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start < maxVisible - 1) {
            start = Math.max(1, end - maxVisible + 1);
        }

        const pageLink = (number, label, active = false) => `<a class="page-btn ${active ? 'active' : ''}" href="${utils.sanitize(window.SiteSEO.pageURL(pageType,category,number))}" ${active ? 'aria-current="page"' : ''}>${label}</a>`;

        if (currentPage > 1) {
            pages.push(pageLink(currentPage - 1, '‹ Prev'));
        }

        if (start > 1) {
            pages.push(pageLink(1, '1'));
            if (start > 2) pages.push('<span class="page-dots">...</span>');
        }

        for (let i = start; i <= end; i++) {
            pages.push(pageLink(i, i, i === currentPage));
        }

        if (end < totalPages) {
            if (end < totalPages - 1) pages.push('<span class="page-dots">...</span>');
            pages.push(pageLink(totalPages, totalPages));
        }

        if (currentPage < totalPages) {
            pages.push(pageLink(currentPage + 1, 'Next ›'));
        }

        return `<nav class="pagination" aria-label="Pagination">${pages.join('')}</nav>`;
    }
};

// Global navigation functions
window.navigateMovies = (category, page) => router.navigate(`#/movies?category=${category}&page=${page}`);
window.navigateTV = (category, page) => router.navigate(`#/tv?category=${category}&page=${page}`);
window.navigateAnime = (category, page) => router.navigate(`#/anime?category=${category}&page=${page}`);
window.navigateGenre = (genreId, page) => router.navigate(`#/genre/${genreId}?page=${page}`);
window.navigateNew = (category, page) => router.navigate(`#/new?category=${category}&page=${page}`);
window.navigateSearch = (query, page) => router.navigate(`#/search?q=${query}&page=${page}`);

window.switchTrendingTab = async (type, btn) => {
    // Update active state of buttons
    const row = document.getElementById('row-trending');
    const tabs = btn.parentElement.querySelectorAll('.section-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    // Show loading state in row
    row.style.opacity = '0.5';

    try {
        const trending = await tmdbAPI.getTrending(type, 'day');
        // If 'all', we usually slice from 10 if we used first 10 for Top 10, but let's be consistent
        // For simplicity, let's just show top trending for that type
        const items = trending?.results || [];
        if (!row.isConnected || !btn.classList.contains('active')) return;
        row.innerHTML = items.slice(0, 8).map(item => components.card(item, type)).join('');
        row.style.opacity = '1';
    } catch (error) {
        console.error('Error switching trending tab:', error);
        row.style.opacity = '1';
    }
};

// Switch "Series on [Platform]" tab - TV shows ONLY
window.switchSeriesPlatform = async (provider, btn) => {
    const row = document.getElementById('row-series-platform');
    const tabs = btn.parentElement.querySelectorAll('.section-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    row.style.opacity = '0.5';

    try {
        const providerMap = {
            'netflix': 8,
            'prime': 9,
            'max': 384,
            'disney': 337,
            'hulu': 15,
            'apple': 350,
            'paramount': 531
        };

        const providerId = providerMap[provider];
        if (providerId) {
            // Fetch TV SHOWS only
            const tv = await tmdbAPI.fetch('/discover/tv', {
                with_watch_providers: providerId,
                watch_region: 'US',
                sort_by: 'popularity.desc'
            });
            const items = (tv?.results || []).map(t => ({ ...t, media_type: 'tv' }));
            row.innerHTML = components.contentRow(items, 'tv', 'row-series-platform');
        }
        row.style.opacity = '1';
    } catch (error) {
        console.error('Error switching series platform:', error);
        row.style.opacity = '1';
    }
};

// Switch "Top Rated" tab - Movies or Series
window.switchTopRated = async (type, btn) => {
    const row = document.getElementById('row-toprated');
    const tabs = btn.parentElement.querySelectorAll('.section-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    row.style.opacity = '0.5';

    try {
        const endpoint = type === 'movie' ? '/movie/top_rated' : '/tv/top_rated';
        const data = await tmdbAPI.fetch(endpoint);
        const items = (data?.results || []).map(item => ({
            ...item,
            media_type: type
        }));
        row.innerHTML = components.contentRow(items, type, 'row-toprated');
        row.style.opacity = '1';
    } catch (error) {
        console.error('Error switching top rated:', error);
        row.style.opacity = '1';
    }
};

// Switch platform tab function
window.switchPlatformTab = async (provider, btn) => {
    const row = document.getElementById('row-platforms');
    const tabs = btn.parentElement.querySelectorAll('.section-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    row.style.opacity = '0.5';

    try {
        let items = [];
        // Map platform names to provider IDs (TMDB watch provider IDs)
        const providerMap = {
            'netflix': 8,
            'prime': 9,
            'disney': 337,
            'max': 384,
            'hulu': 15,
            'apple': 350
        };

        const providerId = providerMap[provider];
        if (providerId) {
            // Fetch content available on this platform
            const [movies, tv] = await Promise.all([
                tmdbAPI.fetch('/discover/movie', { with_watch_providers: providerId, watch_region: 'US', sort_by: 'popularity.desc' }),
                tmdbAPI.fetch('/discover/tv', { with_watch_providers: providerId, watch_region: 'US', sort_by: 'popularity.desc' })
            ]);
            // Combine and shuffle
            items = [...(movies?.results || []).map(m => ({ ...m, media_type: 'movie' })),
            ...(tv?.results || []).map(t => ({ ...t, media_type: 'tv' }))];
            items = items.sort(() => Math.random() - 0.5).slice(0, 20);
        }

        row.innerHTML = components.contentRow(items, 'all', 'row-platforms');
        row.style.opacity = '1';
    } catch (error) {
        console.error('Error switching platform tab:', error);
        row.style.opacity = '1';
    }
};

// Switch genre tab function
window.switchGenreTab = async (genreId, genreName, btn) => {
    const row = document.getElementById('row-genres');
    const tabs = btn.parentElement.querySelectorAll('.section-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    row.style.opacity = '0.5';

    try {
        // Fetch both movies and TV shows for this genre
        const [movies, tv] = await Promise.all([
            tmdbAPI.fetch('/discover/movie', { with_genres: genreId, sort_by: 'popularity.desc' }),
            tmdbAPI.fetch('/discover/tv', { with_genres: genreId, sort_by: 'popularity.desc' })
        ]);

        // Combine and mix them
        const items = [...(movies?.results || []).map(m => ({ ...m, media_type: 'movie' })),
        ...(tv?.results || []).map(t => ({ ...t, media_type: 'tv' }))];
        const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 20);

        row.innerHTML = components.contentRow(shuffled, 'all', 'row-genres');
        row.style.opacity = '1';
    } catch (error) {
        console.error('Error switching genre tab:', error);
        row.style.opacity = '1';
    }
};

// ==========================================
// Page Renderers
// ==========================================
const PUBLIC_CONTACT = Object.freeze({ operator: 'Noor', email: 'noor2304f@gmail.com' });
const SUPPORT_MAILTO = 'mailto:' + encodeURIComponent(PUBLIC_CONTACT.email).replace(/%40/g, '@');

const pages = {
    // Home page
    async home() {
        const app = routeTarget();
        showRouteLoading(app);

        try {
            // Fetch all data in parallel
            const [trending, popularMovies, popularTV, animeTVShows] = await Promise.all([
                tmdbAPI.getTrending('all', 'day', 1), tmdbAPI.getPopularMovies(1),
                tmdbAPI.getPopularTV(1), tmdbAPI.getAnimeTVShows(1)
            ]);

            let continueWatchingHtml = '';
            if (state.continueWatching.length > 0) {
                const cwCards = state.continueWatching.slice(0, 8).map(item => components.continueCard(item)).join('');
                continueWatchingHtml = `
                    <section class="section">
                        <div class="section-header">
                            <h2 class="section-title">Recently Viewed</h2>
                        </div>
                        <div class="content-row recent-row">${cwCards}</div>
                    </section>`;
            }

            // Tab definitions - matching competitor design
            const trendingTabs = `
                <button class="section-tab active" onclick="switchTrendingTab('all', this)">All Titles</button>
                <button class="section-tab" onclick="switchTrendingTab('tv', this)">Series</button>
            `;

            const seriesPlatformTabs = `
                <button class="section-tab active" onclick="switchSeriesPlatform('netflix', this)">Netflix</button>
                <button class="section-tab" onclick="switchSeriesPlatform('prime', this)">Prime</button>
                <button class="section-tab" onclick="switchSeriesPlatform('max', this)">Max</button>
                <button class="section-tab" onclick="switchSeriesPlatform('disney', this)">Disney+</button>
                <button class="section-tab" onclick="switchSeriesPlatform('apple', this)">AppleTV</button>
                <button class="section-tab" onclick="switchSeriesPlatform('paramount', this)">Paramount</button>
            `;

            const topRatedTabs = `
                <button class="section-tab active" onclick="switchTopRated('movie', this)">Movies</button>
                <button class="section-tab" onclick="switchTopRated('tv', this)">Series</button>
            `;

            const genreTabs = `
                <button class="section-tab active" onclick="switchGenreTab('35', 'Comedy', this)">Comedy</button>
                <button class="section-tab" onclick="switchGenreTab('28', 'Action', this)">Action</button>
                <button class="section-tab" onclick="switchGenreTab('27', 'Horror', this)">Horror</button>
                <button class="section-tab" onclick="switchGenreTab('10749', 'Romance', this)">Romance</button>
                <button class="section-tab" onclick="switchGenreTab('878', 'Sci-fi', this)">Sci-fi</button>
                <button class="section-tab" onclick="switchGenreTab('18', 'Drama', this)">Drama</button>
                <button class="section-tab" onclick="switchGenreTab('16', 'Anime', this)">Anime</button>
            `;

            app.innerHTML = `
                ${components.heroCarousel(trending?.results)}
                ${continueWatchingHtml}
                ${components.sectionWithRightTabs('Trending Now', components.contentRow(trending?.results?.slice(5, 13), 'all', 'row-trending'), 'row-trending', trendingTabs)}
                ${components.section('Popular Movies', components.contentRow(popularMovies?.results?.slice(0, 8), 'movie', 'row-movies'), '#/movies')}
                ${components.section('Popular TV', components.contentRow(popularTV?.results?.slice(0, 8), 'tv', 'row-tv'), '#/tv')}
                ${components.section('Anime Spotlight', components.contentRow(animeTVShows?.results?.slice(0, 8), 'tv', 'row-anime'), '#/anime')}
            `;

            // Start hero carousel auto-rotation
            startHeroCarousel();
        } catch (error) {
            console.error('Error loading home page:', error);
            app.innerHTML = `
                <div class="section text-center">
                    <h2>Error loading content</h2>
                    <p class="text-muted">Please check your API key configuration and try again.</p>
                    <p class="text-muted" style="margin-top: 1rem;">
                        Get a free API key at <a href="https://www.themoviedb.org/settings/api" target="_blank" style="color: var(--color-primary);">TMDB</a>
                    </p>
                </div>
            `;
        }
    },

    // Movies page with categories and pagination
    async movies(category = 'popular', page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'popular', name: '🔥 Popular', fetch: () => tmdbAPI.getPopularMovies({ page }) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedMovies({ page }) },
            { id: 'now_playing', name: '🎬 Now Playing', fetch: () => tmdbAPI.getNowPlayingMovies({ page }) },
            { id: 'upcoming', name: '🗓️ Coming Soon', fetch: () => tmdbAPI.getUpcomingMovies({ page }) },
            { id: '28', name: '💥 Action', fetch: () => tmdbAPI.getMoviesByGenre(28, { page }) },
            { id: '35', name: '😂 Comedy', fetch: () => tmdbAPI.getMoviesByGenre(35, { page }) },
            { id: '18', name: '🎭 Drama', fetch: () => tmdbAPI.getMoviesByGenre(18, { page }) },
            { id: '27', name: '😱 Horror', fetch: () => tmdbAPI.getMoviesByGenre(27, { page }) },
            { id: '10749', name: '💕 Romance', fetch: () => tmdbAPI.getMoviesByGenre(10749, { page }) },
            { id: '878', name: '🚀 Sci-Fi', fetch: () => tmdbAPI.getMoviesByGenre(878, { page }) },
            { id: '53', name: '🔪 Thriller', fetch: () => tmdbAPI.getMoviesByGenre(53, { page }) },
            { id: '10752', name: '⚔️ War', fetch: () => tmdbAPI.getMoviesByGenre(10752, { page }) },
            { id: '80', name: '🔫 Crime', fetch: () => tmdbAPI.getMoviesByGenre(80, { page }) },
            { id: '16', name: '🎨 Animation', fetch: () => tmdbAPI.getMoviesByGenre(16, { page }) },
            { id: '99', name: '📹 Documentary', fetch: () => tmdbAPI.getMoviesByGenre(99, { page }) },
            { id: '14', name: '🧙 Fantasy', fetch: () => tmdbAPI.getMoviesByGenre(14, { page }) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.min(data?.total_pages || 1, 500);
            const pageItems = allItems;

            const categoryTabs = categories.map(c =>
                `<a class="category-tab ${c.id === category ? 'active' : ''}" href="${window.SiteSEO.pageURL('movies',c.id,1)}">${c.name}</a>`
            ).join('');

            const pagination = components.pagination(page, totalPages, 'movies', category);

            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>🎬 Movies</h1>
                        <p class="browse-subtitle">Explore our collection of movies by category</p>
                    </div>
                    <div class="category-tabs">
                        ${categoryTabs}
                    </div>
                    <div class="browse-results">
                        <div class="results-info">
                            <span>Page ${page} · ${pageItems.length} shown · ${data?.total_results || allItems.length} movies</span>
                        </div>
                        <div class="content-grid">
                            ${pageItems.map(m => components.card(m, 'movie')).join('')}
                        </div>
                        ${pagination}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading movies page:', error);
            app.innerHTML = '<div class="section"><p>Error loading movies</p></div>';
        }
    },

    // TV Shows page with categories and pagination
    async tv(category = 'popular', page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'popular', name: '🔥 Popular', fetch: () => tmdbAPI.getPopularTV({ page }) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedTV({ page }) },
            { id: 'on_air', name: '📡 On The Air', fetch: () => tmdbAPI.getOnTheAirTV({ page }) },
            { id: '10759', name: '💥 Action & Adventure', fetch: () => tmdbAPI.getTVByGenre(10759, { page }) },
            { id: '35', name: '😂 Comedy', fetch: () => tmdbAPI.getTVByGenre(35, { page }) },
            { id: '80', name: '🔫 Crime', fetch: () => tmdbAPI.getTVByGenre(80, { page }) },
            { id: '18', name: '🎭 Drama', fetch: () => tmdbAPI.getTVByGenre(18, { page }) },
            { id: '10765', name: '🚀 Sci-Fi & Fantasy', fetch: () => tmdbAPI.getTVByGenre(10765, { page }) },
            { id: '9648', name: '🔍 Mystery', fetch: () => tmdbAPI.getTVByGenre(9648, { page }) },
            { id: '10768', name: '⚔️ War & Politics', fetch: () => tmdbAPI.getTVByGenre(10768, { page }) },
            { id: '16', name: '🎨 Animation', fetch: () => tmdbAPI.getTVByGenre(16, { page }) },
            { id: '99', name: '📹 Documentary', fetch: () => tmdbAPI.getTVByGenre(99, { page }) },
            { id: '10751', name: '👨‍👩‍👧 Family', fetch: () => tmdbAPI.getTVByGenre(10751, { page }) },
            { id: '10764', name: '🎤 Reality', fetch: () => tmdbAPI.getTVByGenre(10764, { page }) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.min(data?.total_pages || 1, 500);
            const pageItems = allItems;

            const categoryTabs = categories.map(c =>
                `<a class="category-tab ${c.id === category ? 'active' : ''}" href="${window.SiteSEO.pageURL('tv',c.id,1)}">${c.name}</a>`
            ).join('');

            const pagination = components.pagination(page, totalPages, 'tv', category);

            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>📺 TV Shows</h1>
                        <p class="browse-subtitle">Explore our collection of TV series by category</p>
                    </div>
                    <div class="category-tabs">
                        ${categoryTabs}
                    </div>
                    <div class="browse-results">
                        <div class="results-info">
                            <span>Page ${page} · ${pageItems.length} shown · ${data?.total_results || allItems.length} shows</span>
                        </div>
                        <div class="content-grid">
                            ${pageItems.map(s => components.card(s, 'tv')).join('')}
                        </div>
                        ${pagination}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading TV page:', error);
            app.innerHTML = '<div class="section"><p>Error loading TV shows</p></div>';
        }
    },

    // Anime page
    async anime(category = 'popular', page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        const ITEMS_PER_PAGE = 24;

        // Anime-specific categories — fetching 125 pages to get 2500+ titles
        const categories = [
            { id: 'popular', name: '🔥 Popular Anime', fetch: () => tmdbAPI.getAnimeTVShows({ page }) },
            { id: 'movies', name: '🎬 Anime Movies', fetch: () => tmdbAPI.getAnimationMovies({ page }) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedTV(50) },
        ];

        try {
            // Default to Anime TV Shows
            let data;
            if (category === 'movies') {
                data = await tmdbAPI.getAnimationMovies({ page });
            } else if (category === 'top_rated') {
                data = await tmdbAPI.fetch('/discover/tv', { with_genres: 16, with_origin_country: 'JP', page, sort_by: 'vote_average.desc', 'vote_count.gte': 50 });
            } else {
                data = await tmdbAPI.getAnimeTVShows({ page });
            }

            // Standardize data structure if needed
            const allItems = data?.results || [];
            const totalPages = Math.min(data?.total_pages || 1, 500);
            const pageItems = allItems;

            const categoryTabs = categories.map(c =>
                `<a class="category-tab ${c.id === category ? 'active' : ''}" href="${window.SiteSEO.pageURL('anime',c.id,1)}">${c.name}</a>`
            ).join('');

            // Custom pagination navigation function
            // We need to add navigateAnime to window or use router directly in pagination
            // For now, let's reuse pagination but we need to ensure it calls router.navigate
            // The existing pagination uses onclick="navigateMovies" etc.
            // I'll create navigateAnime in global scope below.

            const pagination = components.pagination(page, totalPages, 'anime', category);

            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>⚔️ Anime Series & Movies</h1>
                        <p class="browse-subtitle">Stream the best anime from Japan and beyond</p>
                    </div>
                    <div class="category-tabs">
                        ${categoryTabs}
                    </div>
                    <div class="browse-results">
                        <div class="results-info">
                            <span>Page ${page} · ${pageItems.length} titles shown</span>
                        </div>
                        <div class="content-grid">
                            ${pageItems.map(item => components.card(item, category === 'movies' ? 'movie' : 'tv')).join('')}
                        </div>
                        ${pagination}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading Anime page:', error);
            app.innerHTML = '<div class="section"><p>Error loading Anime content</p></div>';
        }
    },

    // Movie watch page
    async movie(id) { window.location.assign('/movie/' + id); },
    async tvShow(id, season = 1, episode = 1) { window.location.assign('/tv/' + id + '/' + season + '/' + episode); },

    // Search results page
    async search(query, page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        if (!query) {
            app.innerHTML = `
                <div class="search-page">
                    <div class="no-results">
                        <div class="no-results-icon">🔍</div>
                        <h2>Start Searching</h2>
                        <p>Type something in the search box to find movies and TV shows</p>
                    </div>
                </div>
            `;
            return;
        }

        const ITEMS_PER_PAGE = 24;

        try {
            // Fetch 5 pages of results for a broader library
            const results = await tmdbAPI.search(query, { page });
            const allItems = results?.results?.filter(item =>
                (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
            ) || [];

            // Deduplicate by id
            const seen = new Set();
            const items = allItems.filter(item => {
                const key = item.media_type + ":" + item.id;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            if (items.length === 0) {
                app.innerHTML = `
                    <div class="search-page">
                        <div class="search-header">
                            <h1 class="search-query">Results for <span>"${utils.sanitize(query)}"</span></h1>
                        </div>
                        <div class="no-results">
                            <div class="no-results-icon">😔</div>
                            <h2>No Results Found</h2>
                            <p>Try searching for something else</p>
                        </div>
                    </div>
                `;
                return;
            }

            const totalPages = Math.min(results?.total_pages || 1, 500);
            const pageItems = items;

            // Build search pagination
            const pagination = components.pagination(page, totalPages, 'search', encodeURIComponent(query));

            app.innerHTML = `
                <div class="search-page">
                    <div class="search-header">
                        <h1 class="search-query">Results for <span>"${utils.sanitize(query)}"</span></h1>
                        <p class="search-count">${items.length} results on page ${page}</p>
                    </div>
                    <div class="content-grid">
                        ${pageItems.map(item => components.card(item, item.media_type)).join('')}
                    </div>
                    ${pagination}
                </div>
            `;
        } catch (error) {
            console.error('Error searching:', error);
            app.innerHTML = '<div class="section"><p>Error searching</p></div>';
        }
    },

    // Genre page
    async genre(genreId, page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        const ITEMS_PER_PAGE = 24;
        const genreNames = {
            '28': 'Action', '12': 'Adventure', '16': 'Animation', '35': 'Comedy',
            '80': 'Crime', '99': 'Documentary', '18': 'Drama', '10751': 'Family',
            '14': 'Fantasy', '36': 'History', '27': 'Horror', '10402': 'Music',
            '9648': 'Mystery', '10749': 'Romance', '878': 'Sci-Fi', '10770': 'TV Movie',
            '53': 'Thriller', '10752': 'War', '37': 'Western', '10759': 'Action & Adventure',
            '10762': 'Kids', '10763': 'News', '10764': 'Reality', '10765': 'Sci-Fi & Fantasy',
            '10766': 'Soap', '10767': 'Talk', '10768': 'War & Politics'
        };

        const genreName = genreNames[genreId] || 'Genre';

        // Genre List for sidebar
        const genreList = Object.entries(genreNames).map(([id, name]) => 
            `<a href="/genre/${id}" class="genre-sidebar-link ${id === genreId ? 'active' : ''}">${name}</a>`
        ).join('');

        try {
            // Fetch both movies and TV shows for this genre — 50 pages for massive catalog
            const [movies, tvShows] = await Promise.all([
                tmdbAPI.getMoviesByGenre(genreId, { page }),
                tmdbAPI.getTVByGenre(genreId, { page })
            ]);

            const allItems = [
                ...(movies?.results?.map(m => ({ ...m, media_type: 'movie' })) || []),
                ...(tvShows?.results?.map(t => ({ ...t, media_type: 'tv' })) || [])
            ].sort((a, b) => b.popularity - a.popularity);

            const totalPages = Math.min(Math.max(movies?.total_pages || 1, tvShows?.total_pages || 1) || 1, 500);
            const pageItems = allItems;

            const pagination = components.pagination(page, totalPages, 'genre', genreId);

            app.innerHTML = `
                <div class="browse-page genre-page-layout">
                    <aside class="genre-sidebar">
                        <h3>📁 All Genres</h3>
                        <div class="genre-sidebar-list">
                            ${genreList}
                        </div>
                    </aside>
                    <div class="genre-main-content">
                        <div class="browse-header">
                            <h1>${genreName}</h1>
                            <p class="browse-subtitle">Explore movies and TV shows in ${genreName}</p>
                        </div>
                        <div class="browse-results">
                            <div class="results-info">
                                <span>Page ${page} · ${pageItems.length} titles in ${genreName}</span>
                            </div>
                            <div class="content-grid">
                                ${pageItems.map(item => components.card(item, item.media_type)).join('')}
                            </div>
                            ${pagination}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading genre page:', error);
            app.innerHTML = '<div class="section"><p>Error loading genre</p></div>';
        }
    },

    // New & Popular page
    async newPopular(category = 'trending', page = 1) {
        const app = routeTarget();
        showRouteLoading(app);

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'trending', name: '🔥 Trending Now', fetch: () => tmdbAPI.getTrending('all', 'day', { page }) },
            { id: 'popular_movies', name: '🎬 Popular Movies', fetch: () => tmdbAPI.getPopularMovies({ page }) },
            { id: 'popular_tv', name: '📺 Popular TV', fetch: () => tmdbAPI.getPopularTV({ page }) },
            { id: 'now_playing', name: '🎥 Now Playing', fetch: () => tmdbAPI.getNowPlayingMovies({ page }) },
            { id: 'upcoming', name: '🗓️ Coming Soon', fetch: () => tmdbAPI.getUpcomingMovies({ page }) },
            { id: 'on_air', name: '📡 On The Air', fetch: () => tmdbAPI.getOnTheAirTV({ page }) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedMovies({ page }) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.min(data?.total_pages || 1, 500);
            const pageItems = allItems;

            const categoryTabs = categories.map(c =>
                `<a class="category-tab ${c.id === category ? 'active' : ''}" href="${window.SiteSEO.pageURL('new',c.id,1)}">${c.name}</a>`
            ).join('');

            const pagination = components.pagination(page, totalPages, 'new', category);

            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>🌟 New & Popular</h1>
                        <p class="browse-subtitle">Discover the latest and most popular content</p>
                    </div>
                    <div class="category-tabs">
                        ${categoryTabs}
                    </div>
                    <div class="browse-results">
                        <div class="results-info">
                            <span>Page ${page} · ${pageItems.length} titles shown</span>
                        </div>
                        <div class="content-grid">
                            ${pageItems.map(item => components.card(item, item.media_type || 'movie')).join('')}
                        </div>
                        ${pagination}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading new & popular page:', error);
            app.innerHTML = '<div class="section"><p>Error loading content</p></div>';
        }
    },

    // My List page
    async myList() {
        const app = routeTarget();
        const myListItems = window.Watchlist.read();

        if (myListItems.length === 0) {
            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>📋 My List</h1>
                        <p class="browse-subtitle">Your saved movies and TV shows</p>
                    </div>
                    <div class="no-results">
                        <div class="no-results-icon">📋</div>
                        <h2>Your list is empty</h2>
                        <p>Add movies and TV shows to your list by clicking the + button</p>
                        <a href="/" class="btn btn-primary">Browse Content</a>
                    </div>
                </div>
            `;
            return;
        }

        app.innerHTML = `
            <div class="browse-page">
                <div class="browse-header">
                    <h1>📋 My List</h1>
                    <p class="browse-subtitle">${myListItems.length} saved titles</p>
                </div>
                <div class="content-grid">
                    ${myListItems.map(item => components.card(item, item.media_type || 'movie')).join('')}
                </div>
            </div>
        `;
    },

    // FAQ page
    faq() {
        const app = routeTarget();
        const faqItems = [
            { q: 'What is HD Watchzone?', a: 'HD Watchzone is a free streaming aggregator that helps you discover and watch movies, TV shows, and anime. We do not host any content ourselves — all media is provided by third-party streaming services.' },
            { q: 'Is HD Watchzone free to use?', a: 'HD Watchzone does not charge for browsing titles or saving a local watchlist. Playback is supplied by independent providers, which control their own availability, ads and terms. Only access content you are authorized to watch.' },
            { q: 'Do I need to create an account?', a: 'No account is required. You can browse and watch content immediately. However, features like My List use your browser\'s local storage to save your preferences.' },
            { q: 'What devices are supported?', a: 'The website has responsive layouts for phones, tablets and desktop browsers. External players have separate browser and device requirements; playback, fullscreen support and picture quality are not guaranteed on every device.' },
            { q: 'Why is a video not playing?', a: 'If a video is not playing, try switching to a different server using the server selector above the player. Different servers may have different availability for certain titles.' },
            { q: 'Where does the content come from?', a: 'All content metadata (titles, descriptions, posters, ratings) is provided by The Movie Database (TMDB). Video streams are provided by third-party embed services. HD Watchzone does not host, store, or own any media content.' },
            { q: 'How do I report a broken link?', a: 'You can report issues through our Contact Us page. Please include the title of the content and which server you were using so we can investigate.' },
            { q: 'Can I download content for offline viewing?', a: 'No, HD Watchzone is a streaming-only platform. We do not offer downloads as we do not host any content directly.' },
            { q: 'How is the catalog updated?', a: 'Catalog information is fetched from TMDB when you browse, with caching to reduce repeated requests. A title appearing in TMDB does not confirm that an external player has it available.' },
            { q: 'Is HD Watchzone an alternative to Cineby or Net77?', a: 'People comparing Cineby, Net77.cc, Net77 and similar discovery sites can use HD Watchzone to search movies, TV shows and anime in a responsive interface. HD Watchzone is independent and is not affiliated with those services.' },
            { q: 'How is my data handled?', a: 'Watchlists, recently viewed titles and consent choices are stored in this browser. Loading the website, metadata, images or external players sends requests to hosting and third-party services. Optional Google Analytics runs only after consent. Read the Privacy Policy for the limits of these local settings.' }
        ];

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Frequently Asked Questions</h1>
                    <p>Find answers to common questions about HD Watchzone</p>
                </div>
                <div class="faq-list">
                    ${faqItems.map((item, i) => `
                        <div class="faq-item" id="faq-item-${i}">
                            <button class="faq-question" onclick="toggleFaq(${i})" aria-expanded="false" aria-controls="faq-answer-${i}">
                                <span>${item.q}</span>
                                <svg class="faq-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            <div class="faq-answer" id="faq-answer-${i}" role="region">
                                <p>${item.a}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="static-page-cta">
                    <p>Still have questions?</p>
                    <a href="/contact" class="btn btn-primary">Contact Us</a>
                </div>
            </div>
        `;
    },

    // Help Center page
    help() {
        const app = routeTarget();
        const helpCategories = [
            { icon: '\ud83c\udfac', title: 'Getting Started', desc: 'Learn how to browse and stream content on HD Watchzone.', links: [{ text: 'How to search for content', href: '/faq' }, { text: 'Understanding the interface', href: '/faq' }] },
            { icon: '\ud83d\udda5\ufe0f', title: 'Playback Issues', desc: 'Troubleshoot video playback and streaming problems.', links: [{ text: 'Video not loading', href: '/faq' }, { text: 'Switch streaming servers', href: '/faq' }] },
            { icon: '\ud83d\udccb', title: 'My List & Preferences', desc: 'Manage your watchlist and personalize your experience.', links: [{ text: 'Adding to My List', href: '/my-list' }, { text: 'Managing saved content', href: '/my-list' }] },
            { icon: '\ud83d\udd12', title: 'Privacy & Security', desc: 'Understand how your data is handled and protected.', links: [{ text: 'Privacy Policy', href: '/privacy' }, { text: 'Cookie Preferences', href: '/cookies' }] },
            { icon: '\ud83d\udcdc', title: 'Legal Information', desc: 'Review our terms of service and legal notices.', links: [{ text: 'Terms of Use', href: '/terms' }, { text: 'Legal Notices', href: '/legal' }] },
            { icon: '\ud83d\udcac', title: 'Contact Support', desc: 'Get in touch with us for any other issues or feedback.', links: [{ text: 'Contact Us', href: '/contact' }, { text: 'Report a Problem', href: '/contact' }] }
        ];

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Help Center</h1>
                    <p>How can we help you today?</p>
                </div>
                <div class="help-grid">
                    ${helpCategories.map(cat => `
                        <div class="help-card">
                            <div class="help-card-icon">${cat.icon}</div>
                            <h3>${cat.title}</h3>
                            <p>${cat.desc}</p>
                            <div class="help-card-links">
                                ${cat.links.map(link => `<a href="${link.href}">${link.text}</a>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // Account page
    account() {
        const app = routeTarget();
        const myListItems = window.Watchlist.read();
        const watchHistoryRaw = utils.loadFromStorage(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING) || [];
        const watchHistoryCount = Object.keys(watchHistoryRaw).length;

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Local Preferences</h1>
                    <p>Manage saved titles and recently viewed items on this device</p>
                </div>
                <div class="account-grid">
                    <div class="account-card">
                        <div class="account-card-icon">\ud83d\udccb</div>
                        <h3>My List</h3>
                        <p class="account-stat">${myListItems.length} saved titles</p>
                        <a href="/my-list" class="btn btn-primary btn-sm">View My List</a>
                    </div>
                    <div class="account-card">
                        <div class="account-card-icon">\u25b6\ufe0f</div>
                        <h3>Watch History</h3>
                        <p class="account-stat">${watchHistoryCount} titles tracked</p>
                        <button class="btn btn-secondary btn-sm" onclick="clearWatchHistory()">Clear History</button>
                    </div>
                    <div class="account-card">
                        <div class="account-card-icon">\ud83d\udd12</div>
                        <h3>Privacy</h3>
                        <p class="account-stat">Local storage only</p>
                        <a href="/privacy" class="btn btn-secondary btn-sm">Privacy Policy</a>
                    </div>
                    <div class="account-card">
                        <div class="account-card-icon">\ud83c\udf6a</div>
                        <h3>Cookie Settings</h3>
                        <p class="account-stat">Manage preferences</p>
                        <a href="/cookies" class="btn btn-secondary btn-sm">Cookie Preferences</a>
                    </div>
                </div>
                <div class="disclaimer-banner">
                    <p><strong>Note:</strong> HD Watchzone does not require an account. Watchlist and history records are stored in this browser and do not sync between devices. Visiting pages and loading third-party services still sends network requests; see the Privacy Policy.</p>
                </div>
            </div>
        `;
    },

    // Contact Us page
    contact() {
        const app = routeTarget();
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Contact Us</h1>
                    <p>Have a question, suggestion, or need to report an issue? We would love to hear from you.</p>
                </div>
                <div class="contact-container">
                    <form class="contact-form" onsubmit="handleContactSubmit(event)">
                        <div class="form-group">
                            <label for="contact-name">Your Name</label>
                            <input type="text" id="contact-name" placeholder="Enter your name" required autocomplete="name">
                        </div>
                        <div class="form-group">
                            <label for="contact-email">Email Address</label>
                            <input type="email" id="contact-email" placeholder="you@example.com" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="contact-subject">Subject</label>
                            <select id="contact-subject" required>
                                <option value="">Select a topic</option>
                                <option value="bug">Report a Bug</option>
                                <option value="content">Content Issue</option>
                                <option value="feature">Feature Request</option>
                                <option value="legal">Legal / DMCA</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="contact-message">Message</label>
                            <textarea id="contact-message" rows="5" placeholder="Describe your issue or suggestion in detail..." required></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">Open Email App</button>
                    </form>
                    <div class="contact-info">
                        <div class="contact-info-card">
                            <h3>Site Operator</h3>
                            <p>${utils.sanitize(PUBLIC_CONTACT.operator)}</p>
                        </div>
                        <div class="contact-info-card">
                            <h3>\ud83d\udce7 Email</h3>
                            <p><a href="${SUPPORT_MAILTO}">${utils.sanitize(PUBLIC_CONTACT.email)}</a></p>
                        </div>
                        <div class="contact-info-card">
                            <h3>\u23f1\ufe0f Response Time</h3>
                            <p>This form opens your email app. Delivery and response times are not guaranteed.</p>
                        </div>
                        <div class="contact-info-card">
                            <h3>\ud83d\udccb FAQ</h3>
                            <p>Check our <a href="/faq">FAQ page</a> for instant answers</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Terms of Use page
    terms() {
        const app = routeTarget();
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Terms of Use</h1>
                    <p>Last updated: February 14, 2026</p>
                </div>
                <div class="legal-content">
                    <div class="disclaimer-banner">
                        <p><strong>Third-Party Content Disclaimer:</strong> HD Watchzone does not host, store, or own any of the content displayed on this site. All movies, TV shows, anime, and other media are provided by third-party services and embed providers. All trademarks, service marks, trade names, and content belong to their respective owners.</p>
                    </div>

                    <section class="legal-section">
                        <h2>1. Acceptance of Terms</h2>
                        <p>By accessing and using HD Watchzone, you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, you must not use this website.</p>
                    </section>

                    <section class="legal-section">
                        <h2>2. Description of Service</h2>
                        <p>HD Watchzone is a content discovery and aggregation platform. We provide an interface to browse movie and TV show metadata sourced from The Movie Database (TMDB) API. Video playback is facilitated through third-party embed services. We do not upload, host, or store any video content on our servers.</p>
                    </section>

                    <section class="legal-section">
                        <h2>3. Third-Party Content</h2>
                        <p>All video streams accessible through HD Watchzone are hosted by independent third-party providers. We have no control over the content, availability, or quality of these streams. We are not responsible for any content provided by third parties.</p>
                    </section>

                    <section class="legal-section">
                        <h2>4. Intellectual Property</h2>
                        <p>All movie and TV show metadata, including titles, descriptions, posters, and ratings, is provided by TMDB under their API terms of use. All trademarks and copyrights for the media content belong to their respective owners. HD Watchzone claims no ownership over any third-party content.</p>
                    </section>

                    <section class="legal-section">
                        <h2>5. User Conduct</h2>
                        <p>You agree to use HD Watchzone only for lawful purposes. You must not attempt to disrupt, overload, or interfere with the proper functioning of the website. Automated scraping, crawling, or data extraction is prohibited without express permission.</p>
                    </section>

                    <section class="legal-section">
                        <h2>6. Disclaimer of Warranties</h2>
                        <p>HD Watchzone is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that any content will always be available. Use the service at your own risk.</p>
                    </section>

                    <section class="legal-section">
                        <h2>7. Limitation of Liability</h2>
                        <p>HD Watchzone shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the service, including any issues with third-party content or streams.</p>
                    </section>

                    <section class="legal-section">
                        <h2>8. Changes to Terms</h2>
                        <p>We reserve the right to modify these Terms of Use at any time. Changes will be effective immediately upon posting. Your continued use of HD Watchzone after changes constitutes acceptance of the updated terms.</p>
                    </section>

                    <section class="legal-section">
                        <h2>9. Contact</h2>
                        <p>If you have any questions about these Terms of Use, please <a href="/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Privacy Policy page
    privacy() {
        const app = routeTarget();
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Privacy Policy</h1>
                    <p>Last updated: September 30, 2026</p>
                </div>
                <div class="legal-content">
                    <section class="legal-section">
                        <h2>1. Overview</h2>
                        <p>HD Watchzone is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your data.</p>
                    </section>

                    <section class="legal-section">
                        <h2>2. Information We Collect</h2>
                        <p>No registration or login is required. The following feature records are stored in this browser:</p>
                        <ul>
                            <li><strong>Watchlist:</strong> Titles you add to "My List" are saved in your browser's localStorage.</li>
                            <li><strong>Recently Viewed:</strong> Recently opened titles and selected TV episodes are stored locally. This is not verified playback progress.</li>
                            <li><strong>Consent choices:</strong> Your analytics preference is saved in your browser.</li>
                        </ul>
                        <p>These saved feature records are not an online account and are not synced to another device. Requests to the website and its third-party services can still expose technical information such as IP address, browser details and requested URLs. A contact email includes the name, email address and message you choose to send from your email app.</p>
                    </section>

                    <section class="legal-section">
                        <h2>3. Third-Party Services</h2>
                        <p>HD Watchzone uses the following third-party services:</p>
                        <ul>
                            <li><strong>TMDB API:</strong> We fetch movie and TV show metadata (titles, descriptions, images, ratings) from The Movie Database. TMDB's privacy policy applies to their data handling.</li>
                            <li><strong>Video Embed Providers:</strong> Video streams are loaded via third-party embed services. These providers may set their own cookies and collect data according to their own privacy policies.</li>
                            <li><strong>Google Analytics:</strong> Analytics loads only after you opt in. Google processes usage events and technical information under its own policies. You can disable optional analytics on the Cookie Preferences page.</li>
                            <li><strong>Hosting and fonts:</strong> Delivering pages, scripts and Google Fonts requires network requests to their service providers. We cannot use local storage settings to prevent the technical processing needed to deliver those requests.</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>4. Cookies</h2>
                        <p>Local storage remembers watchlists, recently viewed titles and consent choices. Optional analytics cookies are enabled only after consent. External players can use their own cookies or storage; this website's analytics preference does not control those providers. Manage optional analytics on the <a href="/cookies">Cookie Preferences</a> page.</p>
                    </section>

                    <section class="legal-section">
                        <h2>5. Data Security</h2>
                        <p>You can remove saved feature records by clearing this site's browser data or using the local history controls on the <a href="/account">Local Preferences</a> page. This does not erase records independently held by hosting, email, analytics or external player services.</p>
                    </section>

                    <section class="legal-section">
                        <h2>6. Children's Privacy</h2>
                        <p>HD Watchzone is not directed at children under 13. We do not knowingly collect any information from children.</p>
                    </section>

                    <section class="legal-section">
                        <h2>7. Changes to This Policy</h2>
                        <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.</p>
                    </section>

                    <section class="legal-section">
                        <h2>8. Contact</h2>
                        <p>For privacy-related questions, please <a href="/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Cookie Preferences page
    cookies() {
        const app = routeTarget();
        const analyticsConsent = localStorage.getItem('analytics_consent') === 'true';

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Cookie Preferences</h1>
                    <p>Manage how cookies are used on HD Watchzone</p>
                </div>
                <div class="legal-content">
                    <section class="legal-section">
                        <h2>What Are Cookies?</h2>
                        <p>Cookies are small text files stored on your device by websites you visit. They help websites remember your preferences and improve your browsing experience.</p>
                    </section>

                    <div class="cookie-settings">
                        <div class="cookie-option">
                            <div class="cookie-option-info">
                                <h3>Local Feature Storage</h3>
                                <p>Stores your watchlist, recently viewed titles and consent choice in this browser. You can clear or block it through browser settings; saving these features may then stop working. This is distinct from third-party player cookies.</p>
                            </div>
                            <div class="cookie-toggle">
                                <label class="toggle-switch">
                                    <input type="checkbox" checked disabled>
                                    <span class="toggle-slider"></span>
                                </label>
                                <span class="cookie-status">Managed in your browser</span>
                            </div>
                        </div>

                        <div class="cookie-option">
                            <div class="cookie-option-info">
                                <h3>Analytics Cookies</h3>
                                <p>Optional Google Analytics measures usage events and technical information after you opt in. Turning it off stops this site's optional analytics; it does not control external players or their tracking.</p>
                            </div>
                            <div class="cookie-toggle">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="analytics-toggle" ${analyticsConsent ? 'checked' : ''} onchange="toggleAnalyticsCookies(this.checked)">
                                    <span class="toggle-slider"></span>
                                </label>
                                <span class="cookie-status" id="analytics-status">${analyticsConsent ? 'Enabled' : 'Disabled'}</span>
                            </div>
                        </div>

                        <div class="cookie-option">
                            <div class="cookie-option-info">
                                <h3>Third-Party Cookies</h3>
                                <p>Video embed providers may set their own cookies when you play content. These are controlled by the respective third-party services and are subject to their privacy policies.</p>
                            </div>
                            <div class="cookie-toggle">
                                <span class="cookie-status">Managed by third parties</span>
                            </div>
                        </div>
                    </div>

                    <section class="legal-section">
                        <h2>More Information</h2>
                        <p>For more details about how we handle your data, please read our <a href="/privacy">Privacy Policy</a>. If you have any questions, <a href="/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Legal Notices page
    legal() {
        const app = routeTarget();
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Legal Notices</h1>
                    <p>Important legal information about HD Watchzone</p>
                </div>
                <div class="legal-content">
                    <section class="legal-section">
                        <h2>Website Operator and Contact</h2>
                        <p>HD Watchzone is operated by <strong>${utils.sanitize(PUBLIC_CONTACT.operator)}</strong>.</p>
                        <p>For website feedback, content concerns or copyright reports, email <a href="${SUPPORT_MAILTO}">${utils.sanitize(PUBLIC_CONTACT.email)}</a>.</p>
                    </section>

                    <div class="disclaimer-banner disclaimer-banner--prominent">
                        <h2>\u26a0\ufe0f Third-Party Content Disclaimer</h2>
                        <p>HD Watchzone <strong>does not host, store, or own</strong> any of the content displayed on this site. All movies, TV shows, anime, and other media are provided by third-party services and embed providers. HD Watchzone acts solely as a content discovery and aggregation interface.</p>
                        <p>All trademarks, service marks, trade names, logos, and content belong to their respective owners. If you believe that any content accessible through HD Watchzone infringes your copyright, please contact us immediately through our <a href="/contact">Contact page</a>.</p>
                    </div>

                    <section class="legal-section">
                        <h2>Content Attribution</h2>
                        <p>Movie and TV show metadata \u2014 including titles, descriptions, posters, ratings, and cast information \u2014 is provided by <strong>The Movie Database (TMDB)</strong> under their API terms of service. HD Watchzone is not endorsed or certified by TMDB.</p>
                        <p>This product uses the TMDB API but is not endorsed or certified by TMDB. All movie and show data is courtesy of TMDB contributors.</p>
                    </section>

                    <section class="legal-section">
                        <h2>Video Streaming</h2>
                        <p>All video streams are provided by independent third-party embed services. HD Watchzone does not host, upload, or transcode any video files. We have no control over the availability, quality, or legality of content provided by these services.</p>
                    </section>

                    <section class="legal-section">
                        <h2>DMCA / Copyright Claims</h2>
                        <p>If you are a copyright owner and believe that content accessible through HD Watchzone infringes your rights, please <a href="/contact">contact us</a> with the following information:</p>
                        <ul>
                            <li>A description of the copyrighted work you claim has been infringed</li>
                            <li>The URL on HD Watchzone where the infringing content is accessible</li>
                            <li>Your contact information (name, email, phone)</li>
                            <li>A statement that you have a good faith belief that the use is not authorized</li>
                            <li>A statement under penalty of perjury that the information is accurate and you are authorized to act on behalf of the copyright owner</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>Open Source</h2>
                        <p>HD Watchzone is built with open web technologies. We use the following open-source and free resources:</p>
                        <ul>
                            <li><strong>Inter Font:</strong> Licensed under the SIL Open Font License</li>
                            <li><strong>TMDB API:</strong> Used under TMDB API terms of service</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>Governing Law</h2>
                        <p>These legal notices and any disputes related to HD Watchzone shall be governed by applicable international laws. By using HD Watchzone, you agree to resolve any disputes through appropriate legal channels.</p>
                    </section>

                    <section class="legal-section">
                        <h2>Related Pages</h2>
                        <p>
                            <a href="/terms">Terms of Use</a> \u00b7
                            <a href="/privacy">Privacy Policy</a> \u00b7
                            <a href="/cookies">Cookie Preferences</a> \u00b7
                            <a href="/contact">Contact Us</a>
                        </p>
                    </section>
                </div>
            </div>
        `;
    }
};

// ==========================================
// Router
// ==========================================
function updateRouteMetadata(path) {
    const meta = window.SiteSEO.describe(path);
    if (meta.status !== 200) return;
    document.title = meta.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = meta.description;
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.content = meta.robots;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = meta.canonical;
    ['og:url','twitter:url'].forEach(name => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.setAttribute('content',meta.canonical));
    ['og:title', 'twitter:title'].forEach(name => {
        const element = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        if (element) element.content = meta.title;
    });
    ['og:description', 'twitter:description'].forEach(name => {
        const element = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        if (element) element.content = meta.description;
    });
    // Keep matching SSR data during hydration; discard it when the route changes.
    const schema = document.getElementById('page-schema');
    if (schema) {
        let schemaURL;
        try { schemaURL = JSON.parse(schema.textContent).url; } catch { /* Invalid data is replaced after rendering. */ }
        if (meta.noindex || schemaURL !== meta.canonical) schema.remove();
    }
}

function updateCollectionSchema(app) {
    // The server render has no browser DOM. Its collection data is supplied by the renderer.
    if (!document.head || !document.createElement || !app.querySelectorAll) return;
    const meta = window.SiteSEO.describe(window.location.pathname + window.location.search);
    const existing = document.getElementById('page-schema');
    if (meta.status !== 200 || meta.noindex || !(['/movies', '/tv', '/anime', '/new'].includes(meta.path) || meta.genreId)) {
        existing?.remove();
        return;
    }
    const seen = new Set();
    const items = [];
    for (const card of app.querySelectorAll('.content-grid > a.card-wrapper')) {
        const name = card.querySelector('.card-info-title')?.textContent.trim();
        let url;
        try { url = new URL(card.getAttribute('href'), window.SiteSEO.SITE); } catch { continue; }
        if (!name || url.origin !== window.SiteSEO.SITE || !/^\/(movie|tv)\/\d+-[^/]+$/.test(url.pathname) || url.search || url.hash || seen.has(url.href)) continue;
        seen.add(url.href);
        items.push({ '@type': 'ListItem', position: items.length + 1, url: url.href, name });
    }
    if (!items.length) { existing?.remove(); return; }
    const schema = existing || document.createElement('script');
    schema.id = 'page-schema';
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: meta.title, url: meta.canonical, mainEntity: { '@type': 'ItemList', itemListElement: items } });
    if (!existing) document.head.appendChild(schema);
}

let routeGeneration = 0;
function routeTarget() {
    const generation = routeGeneration;
    const element = document.getElementById('app');
    return new Proxy(element, {
        set(target, key, value) {
            if (generation === routeGeneration) {
                target[key] = value;
                if (key === 'innerHTML') updateCollectionSchema(target);
            }
            return true;
        },
        get(target, key) { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    });
}
function showRouteLoading(app) {
    // Keep crawlable initial content visible until its cached data is hydrated.
    if (app.dataset?.serverRendered === 'true') {
        delete app.dataset.serverRendered;
        return;
    }
    app.innerHTML = components.loading();
}
const router = {
    routes: {
        '/': pages.home,
        '/movies': pages.movies,
        '/tv': pages.tv,
        '/movie/:id': pages.movie,
        '/tv/:id': pages.tvShow,
        '/tv/:id/:season/:episode': pages.tvShow,
        '/search': pages.search,
        '/genre/:id': pages.genre,
        '/new': pages.newPopular,
        '/my-list': pages.myList
    },

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('popstate', () => this.handleRoute());
        document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target.closest('a[href]');
            if (!link || link.target || link.hasAttribute('download')) return;
            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin || url.hash || window.SiteSEO.describe(url).status !== 200) return;
            event.preventDefault();
            this.navigate(url.pathname + url.search);
        });
        this.handleRoute();
    },

    navigate(hash) {
        const path = hash.replace(/^#/, '');
        window.history.pushState(null, '', path);
        this.handleRoute();
    },

    handleRoute() {
        routeGeneration++;
        const hash = window.location.hash;
        // Use hash if present, otherwise use pathname as fallback for clean URLs
        let path = hash ? hash.slice(1) : window.location.pathname + window.location.search;
        if (path.startsWith('/index.html')) path = '/' + window.location.search;
        if (hash.startsWith('#/')) window.history.replaceState(null, '', path);

        // Remove trailing slash and handle empty path
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
        if (!path || path === '') path = '/';

        const routeMeta = window.SiteSEO.describe(path);
        const detailRoute = /^\/(movie|tv)\/\d+(?:-[^/?]+)?(?:\/\d+\/\d+)?(?:\?.*)?$/.test(path);
        if (routeMeta.status !== 200 && !detailRoute) {
            document.title = 'Page not found | HD Watchzone';
            document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
            document.getElementById('page-schema')?.remove();
            routeTarget().innerHTML = '<section class="section"><h1>Page not found</h1><p><a href="/">Return home</a></p></section>';
            return;
        }
        updateRouteMetadata(path);

        // Scroll to top on navigation
        window.scrollTo(0, 0);

        // Stop hero carousel when leaving home
        stopHeroCarousel();

        // Close mobile menu if open
        document.getElementById('mobile-nav')?.classList.remove('open');
        document.getElementById('mobile-nav-overlay')?.classList.remove('open');
        document.getElementById('hamburger-btn')?.classList.remove('open');
        document.getElementById('hamburger-btn')?.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';

        // Update active nav link
        document.querySelectorAll('.nav-link, .mobile-nav-link, .dnav-link').forEach(link => {
            const href = link.getAttribute('href');
            const active = href?.replace(/^#/, '') === path.split('?')[0];
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });

        document.querySelectorAll('.mobile-bottom-link').forEach(link => {
            const href = link.getAttribute('href');
            const target = href?.replace(/^#/, '');
            const active = target === '/' ? path === '/' : target && path.startsWith(target);
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        // Parse route
        if (path === '/' || path === '') {
            pages.home();
        } else if (path.startsWith('/movies')) {
            // Parse query params for category and page
            const [, queryString] = path.split('?');
            const params = new URLSearchParams(queryString || '');
            const category = params.get('category') || 'popular';
            const page = parseInt(params.get('page')) || 1;
            pages.movies(category, page);
        } else if (path.startsWith('/tv') && !path.match(/^\/tv\/\d/)) {
            // Parse query params for category and page
            const [, queryString] = path.split('?');
            const params = new URLSearchParams(queryString || '');
            const category = params.get('category') || 'popular';
            const page = parseInt(params.get('page')) || 1;
            pages.tv(category, page);
        } else if (path.startsWith('/anime')) {
            const [, queryString] = path.split('?');
            const params = new URLSearchParams(queryString || '');
            const category = params.get('category') || 'popular';
            const page = parseInt(params.get('page')) || 1;
            pages.anime(category, page);
        } else if (path.startsWith('/movie/')) {
            const segment = path.split('/')[2];
            const id = parseInt(segment.split('-')[0], 10);
            const app = routeTarget();
            app.innerHTML = components.loading();
            pages.movie(id);
        } else if (path.startsWith('/tv/')) {
            const parts = path.split('/');
            const idSegment = parts[2];
            const id = parseInt(idSegment.split('-')[0], 10);
            const season = parts[3] || 1;
            const episode = parts[4] || 1;
            const app = routeTarget();
            app.innerHTML = components.loading();
            pages.tvShow(id, season, episode);
        } else if (path.startsWith('/search')) {
            const searchParams = new URLSearchParams(path.split('?')[1]);
            const query = searchParams.get('q') || '';
            const page = parseInt(searchParams.get('page')) || 1;
            pages.search(query, page);
        } else if (path.startsWith('/genre/')) {
            const [genrePath, queryString] = path.split('?');
            const genreId = genrePath.split('/')[2];
            const params = new URLSearchParams(queryString || '');
            const page = parseInt(params.get('page')) || 1;
            pages.genre(genreId, page);
        } else if (path.startsWith('/new')) {
            const [, queryString] = path.split('?');
            const params = new URLSearchParams(queryString || '');
            const category = params.get('category') || 'trending';
            const page = parseInt(params.get('page')) || 1;
            pages.newPopular(category, page);
        } else if (path === '/my-list') {
            pages.myList();
        } else if (path === '/faq') {
            pages.faq();
        } else if (path === '/help') {
            pages.help();
        } else if (path === '/account') {
            pages.account();
        } else if (path === '/contact') {
            pages.contact();
        } else if (path === '/terms') {
            pages.terms();
        } else if (path === '/privacy') {
            pages.privacy();
        } else if (path === '/cookies') {
            pages.cookies();
        } else if (path === '/legal') {
            pages.legal();
        } else {
            // 404 - redirect to home
            this.navigate('#/');
        }
    }
};

// ==========================================
// Event Listeners
// ==========================================
function initEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchContainer = document.getElementById('search-container');
    const searchCloseBtn = document.getElementById('search-close-btn');

    const isCompactSearch = () => window.matchMedia('(max-width: 900px)').matches;

    const setSearchOpen = (open) => {
        if (!searchContainer || !searchBtn) return;
        searchContainer.classList.toggle('search-open', open);
        searchBtn.setAttribute('aria-expanded', String(open));
        searchBtn.setAttribute('aria-label', open ? 'Search' : 'Open search');
        if (open) {
            requestAnimationFrame(() => searchInput?.focus());
        } else {
            searchInput?.blur();
        }
    };

    const performSearch = () => {
        const query = searchInput?.value.trim();
        if (query) {
            router.navigate(`#/search?q=${encodeURIComponent(query)}`);
            setSearchOpen(false);
        }
    };

    searchBtn?.addEventListener('click', () => {
        const isOpen = searchContainer?.classList.contains('search-open');
        if (isCompactSearch() && !isOpen) {
            setSearchOpen(true);
            return;
        }
        if (searchInput?.value.trim()) performSearch();
        else searchInput?.focus();
    });

    searchCloseBtn?.addEventListener('click', () => setSearchOpen(false));

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        } else if (e.key === 'Escape') {
            setSearchOpen(false);
        }
    });

    window.addEventListener('resize', () => {
        if (!isCompactSearch()) setSearchOpen(false);
    }, { passive: true });

    // Mobile hamburger menu
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileOverlay = document.getElementById('mobile-nav-overlay');

    hamburgerBtn?.addEventListener('click', () => {
        const isOpen = mobileNav?.classList.toggle('open');
        mobileOverlay?.classList.toggle('open');
        hamburgerBtn.classList.toggle('open');
        hamburgerBtn.setAttribute('aria-expanded', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    mobileOverlay?.addEventListener('click', () => {
        mobileNav?.classList.remove('open');
        mobileOverlay?.classList.remove('open');
        hamburgerBtn?.classList.remove('open');
        hamburgerBtn?.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    });

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileNav?.classList.remove('open');
            mobileOverlay?.classList.remove('open');
            hamburgerBtn?.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    // Genre dropdown click support for touch
    const dropdownBtn = document.querySelector('.nav-dropdown-btn');
    const dropdownContent = document.querySelector('.nav-dropdown-content');
    dropdownBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent?.classList.toggle('show');
    });
    document.addEventListener('click', () => {
        dropdownContent?.classList.remove('show');
    });

    // Keyboard navigation for hero carousel
    document.addEventListener('keydown', (e) => {
        const heroCarousel = document.getElementById('hero-carousel');
        if (!heroCarousel) return;
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'ArrowRight') nextSlide();
    });

    // Header scroll effect + back-to-top
    const backToTopBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        const currentScroll = window.scrollY;

        if (currentScroll > 50) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }

        // Show/hide back-to-top button
        if (currentScroll > 600) {
            backToTopBtn?.classList.add('visible');
        } else {
            backToTopBtn?.classList.remove('visible');
        }
    });

    backToTopBtn?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ==========================================
// Scroll Row Function
// ==========================================
function scrollRow(rowId, direction) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const scrollAmount = row.clientWidth * 0.8;
    row.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
    });

    // Update arrow visibility after scroll completes
    setTimeout(() => updateArrowVisibility(row), 400);
}

function updateArrowVisibility(row) {
    const wrapper = row.closest('.row-wrapper');
    if (!wrapper) return;
    const leftArrow = wrapper.querySelector('.scroll-arrow--left');
    const rightArrow = wrapper.querySelector('.scroll-arrow--right');
    if (leftArrow) leftArrow.style.opacity = row.scrollLeft <= 10 ? '0' : '';
    if (rightArrow) rightArrow.style.opacity = row.scrollLeft + row.clientWidth >= row.scrollWidth - 10 ? '0' : '';
}

// Initialize all row arrow visibility
function initRowArrows() {
    document.querySelectorAll('.content-row, .top10-row').forEach(row => {
        updateArrowVisibility(row);
        row.addEventListener('scroll', utils.debounce(() => updateArrowVisibility(row), 100));
    });
}

// ==========================================
// Hero Carousel Controls
// ==========================================
let heroPaused = false;
window.toggleHeroRotation = button => { heroPaused = !heroPaused; button.textContent = heroPaused ? 'Resume slideshow' : 'Pause slideshow'; button.setAttribute('aria-pressed', String(heroPaused)); if (heroPaused) stopHeroCarousel(); else startHeroCarousel(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopHeroCarousel(); else if (document.querySelector('.hero-carousel')) startHeroCarousel(); });
let heroCarouselInterval = null;
let currentSlide = 0;
const SLIDE_DURATION = 5000; // 5 seconds

function startHeroCarousel() {
    const carousel = document.getElementById('hero-carousel');
    if (!carousel) return;
    if (carousel && !carousel.dataset.rotationBound) {
        carousel.dataset.rotationBound = 'true';
        currentSlide = Math.max(0, [...carousel.querySelectorAll('.hero-slide')].findIndex(slide => slide.classList.contains('active')));
        const pauseButton = carousel.querySelector('.hero-pause');
        if (pauseButton) {
            pauseButton.textContent = heroPaused ? 'Resume slideshow' : 'Pause slideshow';
            pauseButton.setAttribute('aria-pressed', String(heroPaused));
        }
        carousel.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { carousel.dataset.pointerPaused = 'true'; stopHeroCarousel(); } });
        carousel.addEventListener('pointerleave', () => { delete carousel.dataset.pointerPaused; startHeroCarousel(); });
        carousel.addEventListener('focusin', stopHeroCarousel);
        carousel.addEventListener('focusout', event => { if (!carousel.contains(event.relatedTarget)) startHeroCarousel(); });
    }
    if (heroPaused || document.hidden || carousel.dataset.pointerPaused || carousel.contains(document.activeElement) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Clear any existing interval
    if (heroCarouselInterval) {
        clearInterval(heroCarouselInterval);
    }

    // Reset progress bar animation
    resetProgressBar();

    // Start auto-rotation
    heroCarouselInterval = setInterval(() => {
        nextSlide();
    }, SLIDE_DURATION);
}

function stopHeroCarousel() {
    if (heroCarouselInterval) {
        clearInterval(heroCarouselInterval);
        heroCarouselInterval = null;
    }
}

function resetProgressBar() {
    const progressBar = document.querySelector('.hero-progress-bar');
    if (progressBar) {
        progressBar.style.animation = 'none';
        progressBar.offsetHeight; // Trigger reflow
        progressBar.style.animation = `progressFill ${SLIDE_DURATION}ms linear`;
    }
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');

    if (slides.length === 0) return;

    // Ensure index is within bounds
    currentSlide = ((index % slides.length) + slides.length) % slides.length;

    // Update slides
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === currentSlide);
        slide.inert = i !== currentSlide;
        slide.setAttribute('aria-hidden', String(i !== currentSlide));
    });

    // Update dots
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
        dot.setAttribute('aria-pressed', String(i === currentSlide));
    });

    // Reset progress bar
    resetProgressBar();

    // Restart timer (clear old first to avoid duplicates)
    stopHeroCarousel();
    startHeroCarousel();
}

function nextSlide() {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;
    goToSlide(currentSlide + 1);
}

function prevSlide() {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;
    goToSlide(currentSlide - 1);
}

// ==========================================
// Load Genres into Dropdown
// ==========================================
async function loadGenres() {
    try {
        const [movieGenres, tvGenres] = await Promise.all([
            tmdbAPI.getMovieGenres(),
            tmdbAPI.getTVGenres()
        ]);

        const dropdown = document.getElementById('genre-dropdown');
        if (!dropdown) return;

        // Combine and dedupe genres
        const allGenres = [...(movieGenres?.genres || []), ...(tvGenres?.genres || [])];
        const uniqueGenres = [...new Map(allGenres.map(g => [g.id, g])).values()];

        // Sort alphabetically
        uniqueGenres.sort((a, b) => a.name.localeCompare(b.name));

        dropdown.innerHTML = uniqueGenres.map(genre =>
            `<a href="/genre/${genre.id}">${genre.name}</a>`
        ).join('');
    } catch (error) {
        // Silently fail for genres
    }
}

// ==========================================
// Hero Touch Swipe Support
// ==========================================
function initHeroSwipe() {
    const heroCarousel = document.getElementById('hero-carousel');
    if (!heroCarousel || heroCarousel.dataset.swipeBound) return;
    heroCarousel.dataset.swipeBound = 'true';

    let touchStartX = 0;
    let touchStartY = 0;
    let swipeStarted = false;

    heroCarousel.addEventListener('touchstart', (e) => {
        swipeStarted = e.touches.length === 1 && !e.target.closest('a, button, input');
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    heroCarousel.addEventListener('touchend', (e) => {
        if (!swipeStarted) return;
        swipeStarted = false;
        const diff = touchStartX - e.changedTouches[0].screenX;
        const verticalDiff = touchStartY - e.changedTouches[0].screenY;
        if (Math.abs(diff) > 50 && Math.abs(diff) > Math.abs(verticalDiff) * 1.25) {
            if (diff > 0) nextSlide();
            else prevSlide();
        }
    }, { passive: true });
    heroCarousel.addEventListener('touchcancel', () => { swipeStarted = false; }, { passive: true });
}

// ==========================================
// Initialize App
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await window.Watchlist.ready;
    state.continueWatching = utils.loadFromStorage(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING) || [];
    initEventListeners();
    router.init();
    // Navigation genres are already present in the static accessible menu.

    // Observe for dynamically loaded content
    const appEl = document.getElementById('app');
    const observer = new MutationObserver(() => {
        initRowArrows();
        initHeroSwipe();
    });
    observer.observe(appEl, { childList: true, subtree: false });
});

// Make functions globally accessible
window.router = router;
window.scrollRow = scrollRow;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.goToSlide = goToSlide;
window.startHeroCarousel = startHeroCarousel;

// Navigation helper functions for pagination and categories
function navigateMovies(category, page) {
    router.navigate(`#/movies?category=${category}&page=${page}`);
}

function navigateTV(category, page) {
    router.navigate(`#/tv?category=${category}&page=${page}`);
}

function navigateGenre(genreId, page) {
    router.navigate(`#/genre/${genreId}?page=${page}`);
}

function navigateNew(category, page) {
    router.navigate(`#/new?category=${category}&page=${page}`);
}

// Expose navigation functions globally
window.navigateMovies = navigateMovies;
window.navigateTV = navigateTV;
window.navigateGenre = navigateGenre;
window.navigateNew = navigateNew;

// Static page helper functions
function toggleFaq(index) {
    const item = document.getElementById(`faq-item-${index}`);
    const btn = item.querySelector('.faq-question');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
}

function handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const subject = document.getElementById('contact-subject')?.value || 'Website feedback';
    const message = 'From: ' + document.getElementById('contact-name').value + '\nReply email: ' + document.getElementById('contact-email').value + '\n\n' + document.getElementById('contact-message').value;
    window.location.href = SUPPORT_MAILTO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
    let notice = form.querySelector('.contact-status');
    if (!notice) { notice = document.createElement('p'); notice.className = 'contact-status'; notice.setAttribute('role', 'status'); form.appendChild(notice); }
    notice.textContent = 'Your email app should open with this message. Nothing has been sent by this website; send it from your email app.';
}

function clearWatchHistory() {
    if (confirm('Are you sure you want to clear your watch history? This cannot be undone.')) {
        localStorage.removeItem('streamflix_watch_progress');
        localStorage.removeItem(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING);
        state.continueWatching = [];
        pages.account();
    }
}

function toggleAnalyticsCookies(enabled) {
    window.AnalyticsConsent.set(enabled);
    const statusEl = document.getElementById('analytics-status');
    if (statusEl) {
        statusEl.textContent = enabled ? 'Enabled' : 'Disabled';
    }
}

window.toggleFaq = toggleFaq;
window.handleContactSubmit = handleContactSubmit;
window.clearWatchHistory = clearWatchHistory;
window.toggleAnalyticsCookies = toggleAnalyticsCookies;
