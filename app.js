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
        WATCH_HISTORY: 'hdwatchzone_watch_history',
        CONTINUE_WATCHING: 'hdwatchzone_continue_watching'
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
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')           // Replace spaces with -
            .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
            .replace(/\-\-+/g, '-')         // Replace multiple - with single -
            .replace(/^-+/, '')             // Trim - from start of text
            .replace(/-+$/, '');            // Trim - from end of text
    }
};

// ==========================================
// API Response Cache
// ==========================================
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

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

        const cacheKey = url.toString();
        const cached = apiCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();
            apiCache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            return null;
        }
    },

    // Get trending content (multiple pages)
    async getTrending(mediaType = 'all', timeWindow = 'week', pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch(`/trending/${mediaType}/${timeWindow}`, { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get popular movies (multiple pages)
    async getPopularMovies(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/movie/popular', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get popular TV shows (multiple pages)
    async getPopularTV(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/tv/popular', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
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
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/search/multi', { query, page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get top rated movies (multiple pages)
    async getTopRatedMovies(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/movie/top_rated', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get top rated TV (multiple pages)
    async getTopRatedTV(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/tv/top_rated', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get Animation movies (genre id: 16)
    async getAnimationMovies(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/discover/movie', { with_genres: 16, page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get Anime TV shows (genre id: 16 Animation for TV)
    async getAnimeTVShows(pages = 50) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/discover/tv', { with_genres: 16, with_origin_country: 'JP', page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get movies by genre
    async getMoviesByGenre(genreId, pages = 3) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/discover/movie', { with_genres: genreId, page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get TV shows by genre
    async getTVByGenre(genreId, pages = 3) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/discover/tv', { with_genres: genreId, page, sort_by: 'popularity.desc' }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
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
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/movie/now_playing', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get upcoming movies
    async getUpcomingMovies(pages = 3) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/movie/upcoming', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    },

    // Get on the air TV shows
    async getOnTheAirTV(pages = 3) {
        const requests = [];
        for (let page = 1; page <= pages; page++) {
            requests.push(this.fetch('/tv/on_the_air', { page }));
        }
        const responses = await Promise.all(requests);
        const allResults = responses.flatMap(r => r?.results || []);
        return { results: allResults };
    }
};

// ==========================================
// Multi-Server Video Player Integration
// ==========================================
const videoServers = [
    {
        id: 'vidsrccc',
        name: 'VidSrc.cc',
        description: 'Fast Loading • 4K Support',
        getMovieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'vidsrc',
        name: 'VidSrc',
        description: 'Fastest • HD Quality',
        getMovieUrl: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'vidsrcto',
        name: 'VidSrc.to',
        description: 'No Ads • Reliable',
        getMovieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'vidsrc2',
        name: 'VidSrc Pro',
        description: 'Premium Quality • Stable',
        getMovieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
    }
];

// Track current server (stored in memory, not localStorage)
let currentServerIndex = 0;

const videoPlayer = {
    // Get movie embed URL with current server
    getMovieUrl(tmdbId) {
        return videoServers[currentServerIndex].getMovieUrl(tmdbId);
    },

    // Get TV episode embed URL with current server
    getTVUrl(tmdbId, season, episode) {
        return videoServers[currentServerIndex].getTVUrl(tmdbId, season, episode);
    },

    // Create player with server selector
    createPlayer(mediaType, tmdbId, season = null, episode = null) {
        const serverButtons = videoServers.map((server, index) => `
            <button class="server-btn ${index === currentServerIndex ? 'active' : ''}" 
                    onclick="switchServer(${index}, '${mediaType}', '${tmdbId}', ${season}, ${episode})">
                <span class="server-name">${server.name}</span>
                <span class="server-desc">${server.description}</span>
            </button>
        `).join('');

        const currentUrl = mediaType === 'movie'
            ? this.getMovieUrl(tmdbId)
            : this.getTVUrl(tmdbId, season, episode);

        return `
            <div class="player-section">
                <div class="server-selector">
                    <span class="server-label">🎬 Select Server:</span>
                    <div class="server-buttons">
                        ${serverButtons}
                    </div>
                </div>
                <div class="player-wrapper">
                    <iframe 
                        id="video-player"
                        src="${currentUrl}" 
                        allowfullscreen 
                        allow="autoplay; fullscreen; picture-in-picture"
                        loading="lazy"
                    ></iframe>
                </div>
                <p class="server-hint">💡 If video doesn't load, try a different server above</p>
            </div>
        `;
    }
};

// Global function to switch servers
window.switchServer = function (serverIndex, mediaType, tmdbId, season, episode) {
    currentServerIndex = serverIndex;
    const server = videoServers[serverIndex];
    const newUrl = mediaType === 'movie'
        ? server.getMovieUrl(tmdbId)
        : server.getTVUrl(tmdbId, season, episode);

    // Update iframe source
    const iframe = document.getElementById('video-player');
    if (iframe) {
        iframe.src = newUrl;
    }

    // Update active button
    document.querySelectorAll('.server-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === serverIndex);
    });
};

// Keep vidkingPlayer as alias for backward compatibility
const vidkingPlayer = {
    getMovieUrl: (id) => videoPlayer.getMovieUrl(id),
    getTVUrl: (id, s, e) => videoPlayer.getTVUrl(id, s, e),
    createPlayer: (url) => `
        <div class="player-wrapper">
            <iframe 
                src="${url}" 
                allowfullscreen 
                allow="autoplay; fullscreen; picture-in-picture"
                loading="lazy"
            ></iframe>
        </div>
    `
};

// ==========================================
// Watch Progress Tracking
// ==========================================
const watchProgress = {
    init() {
        // Load continue watching from storage
        state.continueWatching = utils.loadFromStorage(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING) || [];

        // Listen for messages from Vidking player
        window.addEventListener('message', this.handlePlayerMessage.bind(this));
    },

    handlePlayerMessage(event) {
        // Accept messages from embedded players (origin check removed to support multiple providers)
        if (!event.data) return;

        try {
            const data = event.data;
            if (data && data.id && data.progress !== undefined) {
                this.updateProgress(data);
            }
        } catch (e) {
            console.error('Error handling player message:', e);
        }
    },

    updateProgress(data) {
        const { id, type, progress, timestamp, duration, season, episode } = data;

        const existingIndex = state.continueWatching.findIndex(item =>
            item.id === id && item.type === type
        );

        const watchItem = {
            id,
            type,
            progress,
            timestamp,
            duration,
            season,
            episode,
            updatedAt: Date.now()
        };

        if (existingIndex !== -1) {
            state.continueWatching[existingIndex] = watchItem;
        } else {
            state.continueWatching.unshift(watchItem);
        }

        // Keep only last 20 items
        state.continueWatching = state.continueWatching.slice(0, 20);

        // Save to storage
        utils.saveToStorage(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING, state.continueWatching);
    },

    getProgress(id, type) {
        return state.continueWatching.find(item => item.id === id && item.type === type);
    }
};

// ==========================================
// Component Renderers
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
        const overview = utils.truncate(item.overview, 80);

        return `
            <a href="${route}" class="card-wrapper" data-id="${item.id}" data-type="${mediaType}">
                <div class="card">
                    <img 
                        src="${posterUrl}" 
                        alt="${utils.sanitize(title)}" 
                        class="card-poster"
                        loading="lazy"
                        onerror="imgErr(this)"
                    >
                    <div class="card-overlay">
                        <div class="card-meta">
                            <span class="card-rating">★ ${rating}</span>
                            <span>${utils.formatDate(date)}</span>
                        </div>
                    </div>
                    <div class="card-play"></div>
                </div>
                <div class="card-info">
                    <h3 class="card-info-title">${title}</h3>
                    <p class="card-info-desc">${overview || 'No description available.'}</p>
                </div>
            </a>
        `;
    },

    // Continue watching card
    continueCard(item) {
        const title = item.title || item.name;
        const posterUrl = item.poster || (item.poster_path ? utils.getImageUrl(item.poster_path, 'medium') : utils.getImageUrl(null));
        const slug = item.slug || utils.createSlug(title);
        const route = item.type === 'movie'
            ? `/movie/${item.id}-${slug}`
            : `/tv/${item.id}-${slug}${item.season ? `/${item.season}/${item.episode || 1}` : ''}`;
        const progressPercent = Math.min(100, item.progress || 0);
        // Estimate time left
        const runtime = item.runtime || 120;
        const watchedMin = Math.round((progressPercent / 100) * runtime);
        const leftMin = Math.max(1, runtime - watchedMin);
        const leftLabel = progressPercent > 0 ? `${leftMin}m left` : 'Not started';
        const episodeLabel = item.season ? `S${item.season} E${item.episode || 1}` : '';

        return `
            <a href="${route}" class="continue-card">
                <div class="continue-card-thumb">
                    <img src="${posterUrl}" alt="${utils.sanitize(title)}" loading="lazy" onerror="imgErr(this)">
                    <div class="continue-card-play">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <div class="continue-progress-bar">
                        <div class="continue-progress-fill" style="width:${progressPercent}%"></div>
                    </div>
                </div>
                <div class="continue-card-info">
                    <div class="continue-card-title">${utils.sanitize(title)}</div>
                    <div class="continue-card-meta">
                        ${episodeLabel ? `<span class="continue-ep">${episodeLabel}</span>` : ''}
                        <span class="continue-left">${leftLabel}</span>
                    </div>
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
        return `
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">${title}</h2>
                    <div class="section-header-right">
                        ${tabs ? `<div class="section-tabs">${tabs}</div>` : ''}
                        ${link ? `<a href="${link}" class="section-link">See All →</a>` : ''}
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
                <div class="hero-slide ${index === 0 ? 'active' : ''}" data-index="${index}" style="background-image: url('${backdropUrl}')">
                    <div class="hero-gradient-overlay"></div>
                    <div class="hero-content hero-content-split">
                        <div class="hero-text-col">
                            <span class="hero-badge">
                                <span>★</span> #${index + 1} Trending
                            </span>
                            ${genrePills ? `<div class="hero-genre-pills">${genrePills}</div>` : ''}
                            <h1 class="hero-title">${title}</h1>
                            <div class="hero-meta">
                                <span class="hero-meta-item hero-rating">★ ${rating}</span>
                                ${year ? `<span class="hero-meta-item">${year}</span>` : ''}
                                <span class="hero-meta-item">${mediaType === 'movie' ? '🎬 Movie' : '📺 TV'}</span>
                            </div>
                            <p class="hero-description">${overview}</p>
                            <div class="hero-buttons">
                                <a href="${route}" class="btn-cineby btn-cineby-primary">
                                    <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                    Watch Now
                                </a>
                                <a href="${route}" class="btn-cineby btn-cineby-glass">
                                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                    View Info
                                </a>
                            </div>
                        </div>
                        <div class="hero-poster-col">
                            <img src="${posterUrl}" alt="${utils.sanitize(title)}" class="hero-poster-img" loading="lazy">
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
                <button class="hero-arrow hero-arrow--left" onclick="prevSlide()">‹</button>
                <button class="hero-arrow hero-arrow--right" onclick="nextSlide()">›</button>
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
                <div class="hero-dots">
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
                <div class="row-wrapper">
                    <button class="scroll-arrow scroll-arrow--left" onclick="scrollRow('${rowId}', -1)" aria-label="Scroll left">‹</button>
                    <div class="content-row" id="${rowId}">
                        ${content}
                    </div>
                    <button class="scroll-arrow scroll-arrow--right" onclick="scrollRow('${rowId}', 1)" aria-label="Scroll right">›</button>
                </div>
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
                            More Info
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

        const navFunc = pageType === 'movies' ? 'navigateMovies' :
            pageType === 'tv' ? 'navigateTV' :
                pageType === 'anime' ? 'navigateAnime' :
                    pageType === 'genre' ? 'navigateGenre' : 'navigateNew';

        if (currentPage > 1) {
            pages.push(`<button class="page-btn" onclick="${navFunc}('${category}', ${currentPage - 1})">‹ Prev</button>`);
        }

        if (start > 1) {
            pages.push(`<button class="page-btn" onclick="${navFunc}('${category}', 1)">1</button>`);
            if (start > 2) pages.push('<span class="page-dots">...</span>');
        }

        for (let i = start; i <= end; i++) {
            pages.push(`<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${navFunc}('${category}', ${i})">${i}</button>`);
        }

        if (end < totalPages) {
            if (end < totalPages - 1) pages.push('<span class="page-dots">...</span>');
            pages.push(`<button class="page-btn" onclick="${navFunc}('${category}', ${totalPages})">${totalPages}</button>`);
        }

        if (currentPage < totalPages) {
            pages.push(`<button class="page-btn" onclick="${navFunc}('${category}', ${currentPage + 1})">Next ›</button>`);
        }

        return `<div class="pagination">${pages.join('')}</div>`;
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
        row.innerHTML = components.contentRow(items, type, 'row-trending');
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
const pages = {
    // Home page
    async home() {
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        try {
            // Fetch all data in parallel
            const [trending, popularMovies, popularTV, topRatedMovies, topRatedTV, animationMovies, animeTVShows, netflixSeries, actionContent] = await Promise.all([
                tmdbAPI.getTrending('all', 'day', 2),
                tmdbAPI.getPopularMovies(2),
                tmdbAPI.getPopularTV(2),
                tmdbAPI.getTopRatedMovies(2),
                tmdbAPI.getTopRatedTV(2),
                tmdbAPI.getAnimationMovies(2),
                tmdbAPI.getAnimeTVShows(2),
                // Fetch Netflix TV SHOWS for series platform section
                tmdbAPI.fetch('/discover/tv', { with_watch_providers: 8, watch_region: 'US', sort_by: 'popularity.desc' })
                    .then(tv => (tv?.results || []).map(t => ({ ...t, media_type: 'tv' }))),
                // Fetch Action content for genre section
                tmdbAPI.fetch('/discover/movie', { with_genres: 28, sort_by: 'popularity.desc' })
                    .then(async movies => {
                        const tv = await tmdbAPI.fetch('/discover/tv', { with_genres: 10759, sort_by: 'popularity.desc' });
                        return [...(movies?.results || []).map(m => ({ ...m, media_type: 'movie' })),
                        ...(tv?.results || []).map(t => ({ ...t, media_type: 'tv' }))].sort(() => Math.random() - 0.5).slice(0, 20);
                    })
            ]);

            let continueWatchingHtml = '';
            if (state.continueWatching.length > 0) {
                const cwCards = state.continueWatching.slice(0, 8).map(item => components.continueCard(item)).join('');
                continueWatchingHtml = `
                    <section class="section">
                        <div class="section-header">
                            <h2 class="section-title">⏯ Continue Watching</h2>
                        </div>
                        <div class="continue-row">${cwCards}</div>
                    </section>`;
            }

            // Tab definitions - matching competitor design
            const trendingTabs = `
                <button class="section-tab active" onclick="switchTrendingTab('all', this)">Movies</button>
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
                <button class="section-tab" onclick="switchGenreTab('16', 'Animation', this)">Animation</button>
            `;

            app.innerHTML = `
                ${components.heroCarousel(trending?.results)}
                ${components.top10Section(trending?.results, 'TOP 10 CONTENT TODAY')}
                ${continueWatchingHtml}
                ${components.sectionWithRightTabs('Trending Today', components.contentRow(trending?.results?.slice(10), 'all', 'row-trending'), 'row-trending', trendingTabs)}
                ${components.sectionWithRightTabs('Series on Netflix', components.contentRow(netflixSeries, 'tv', 'row-series-platform'), 'row-series-platform', seriesPlatformTabs)}
                ${components.sectionWithRightTabs('Top rated', components.contentRow(topRatedMovies?.results, 'movie', 'row-toprated'), 'row-toprated', topRatedTabs)}
                ${components.sectionWithRightTabs('Genres', components.contentRow(actionContent, 'all', 'row-genres'), 'row-genres', genreTabs)}
                ${components.section('🎬 Popular Movies', components.contentRow(popularMovies?.results, 'movie', 'row-movies'), '#/movies')}
                ${components.section('📺 Popular TV Shows', components.contentRow(popularTV?.results, 'tv', 'row-tv'), '#/tv')}
                ${components.section('🎨 Animation Movies', components.contentRow(animationMovies?.results, 'movie', 'row-animation'))}
                ${components.section('⚔️ Anime Series', components.contentRow(animeTVShows?.results, 'tv', 'row-anime'), '#/anime')}
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
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'popular', name: '🔥 Popular', fetch: () => tmdbAPI.getPopularMovies(10) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedMovies(10) },
            { id: 'now_playing', name: '🎬 Now Playing', fetch: () => tmdbAPI.getNowPlayingMovies(10) },
            { id: 'upcoming', name: '🗓️ Coming Soon', fetch: () => tmdbAPI.getUpcomingMovies(10) },
            { id: '28', name: '💥 Action', fetch: () => tmdbAPI.getMoviesByGenre(28, 10) },
            { id: '35', name: '😂 Comedy', fetch: () => tmdbAPI.getMoviesByGenre(35, 10) },
            { id: '18', name: '🎭 Drama', fetch: () => tmdbAPI.getMoviesByGenre(18, 10) },
            { id: '27', name: '😱 Horror', fetch: () => tmdbAPI.getMoviesByGenre(27, 10) },
            { id: '10749', name: '💕 Romance', fetch: () => tmdbAPI.getMoviesByGenre(10749, 10) },
            { id: '878', name: '🚀 Sci-Fi', fetch: () => tmdbAPI.getMoviesByGenre(878, 10) },
            { id: '53', name: '🔪 Thriller', fetch: () => tmdbAPI.getMoviesByGenre(53, 10) },
            { id: '10752', name: '⚔️ War', fetch: () => tmdbAPI.getMoviesByGenre(10752, 10) },
            { id: '80', name: '🔫 Crime', fetch: () => tmdbAPI.getMoviesByGenre(80, 10) },
            { id: '16', name: '🎨 Animation', fetch: () => tmdbAPI.getMoviesByGenre(16, 10) },
            { id: '99', name: '📹 Documentary', fetch: () => tmdbAPI.getMoviesByGenre(99, 10) },
            { id: '14', name: '🧙 Fantasy', fetch: () => tmdbAPI.getMoviesByGenre(14, 10) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            const categoryTabs = categories.map(c =>
                `<button class="category-tab ${c.id === category ? 'active' : ''}" onclick="navigateMovies('${c.id}', 1)">${c.name}</button>`
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
                            <span>Showing ${pageItems.length} of ${allItems.length} movies</span>
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
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'popular', name: '🔥 Popular', fetch: () => tmdbAPI.getPopularTV(5) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedTV(5) },
            { id: 'on_air', name: '📡 On The Air', fetch: () => tmdbAPI.getOnTheAirTV(5) },
            { id: '10759', name: '💥 Action & Adventure', fetch: () => tmdbAPI.getTVByGenre(10759, 5) },
            { id: '35', name: '😂 Comedy', fetch: () => tmdbAPI.getTVByGenre(35, 5) },
            { id: '80', name: '🔫 Crime', fetch: () => tmdbAPI.getTVByGenre(80, 5) },
            { id: '18', name: '🎭 Drama', fetch: () => tmdbAPI.getTVByGenre(18, 5) },
            { id: '10765', name: '🚀 Sci-Fi & Fantasy', fetch: () => tmdbAPI.getTVByGenre(10765, 5) },
            { id: '9648', name: '🔍 Mystery', fetch: () => tmdbAPI.getTVByGenre(9648, 5) },
            { id: '10768', name: '⚔️ War & Politics', fetch: () => tmdbAPI.getTVByGenre(10768, 5) },
            { id: '16', name: '🎨 Animation', fetch: () => tmdbAPI.getTVByGenre(16, 5) },
            { id: '99', name: '📹 Documentary', fetch: () => tmdbAPI.getTVByGenre(99, 5) },
            { id: '10751', name: '👨‍👩‍👧 Family', fetch: () => tmdbAPI.getTVByGenre(10751, 5) },
            { id: '10764', name: '🎤 Reality', fetch: () => tmdbAPI.getTVByGenre(10764, 5) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            const categoryTabs = categories.map(c =>
                `<button class="category-tab ${c.id === category ? 'active' : ''}" onclick="navigateTV('${c.id}', 1)">${c.name}</button>`
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
                            <span>Showing ${pageItems.length} of ${allItems.length} shows</span>
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
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        const ITEMS_PER_PAGE = 24;

        // Anime-specific categories
        const categories = [
            { id: 'popular', name: '🔥 Popular Anime', fetch: () => tmdbAPI.getAnimeTVShows(5) },
            { id: 'movies', name: '🎬 Anime Movies', fetch: () => tmdbAPI.getAnimationMovies(5) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedTV(5) }, // General top rated for now, ideally filtered
        ];

        try {
            // Default to Anime TV Shows
            let data;
            if (category === 'movies') {
                data = await tmdbAPI.getAnimationMovies(5);
            } else if (category === 'top_rated') {
                // For Top Rated, we'll just use general top rated TV for now as TMDB doesn't have easy "Top Rated Anime" endpoint without complex discovery
                // actually, let's use discover with genre 16 and JP
                const response = await tmdbAPI.fetch('/discover/tv', {
                    with_genres: 16,
                    with_origin_country: 'JP',
                    page: 1,
                    sort_by: 'vote_average.desc',
                    'vote_count.gte': 100
                });
                data = { results: response.results };
                // Fetch more pages if needed to match structure, but for now 1 page is enough for demo or handle 5 pages loop here
            } else {
                data = await tmdbAPI.getAnimeTVShows(5);
            }

            // Standardize data structure if needed
            const allItems = data?.results || [];
            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            const categoryTabs = categories.map(c =>
                `<button class="category-tab ${c.id === category ? 'active' : ''}" onclick="router.navigate('#/anime?category=${c.id}')">${c.name}</button>`
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
                            <span>Showing ${pageItems.length} of ${allItems.length} titles</span>
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
    async movie(id) {
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        try {
            const movie = await tmdbAPI.getMovieDetails(id);
            if (!movie) throw new Error('Movie not found');

            const posterUrl = utils.getImageUrl(movie.poster_path, 'large');
            const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

            app.innerHTML = `
                <div class="watch-page">
                    <div class="player-container">
                        ${videoPlayer.createPlayer('movie', id)}
                    </div>
                    
                    <div class="watch-info">
                        <div class="watch-header">
                            <div class="watch-poster">
                                <img src="${posterUrl}" alt="${movie.title}">
                            </div>
                            <div class="watch-details">
                                <h1 class="watch-title">${movie.title}</h1>
                                <div class="watch-meta">
                                    <span class="watch-meta-item">★ ${rating}</span>
                                    <span class="watch-meta-item">${utils.formatDate(movie.release_date)}</span>
                                    <span class="watch-meta-item">${utils.formatRuntime(movie.runtime)}</span>
                                </div>
                                <div class="watch-genres">
                                    ${movie.genres?.map(g => components.genreTag(g)).join('')}
                                </div>
                                <p class="watch-overview">${movie.overview}</p>
                            </div>
                        </div>
                    </div>
                    
                    ${movie.recommendations?.results?.length > 0 ?
                    components.section('You May Also Like', components.contentRow(movie.recommendations.results.slice(0, 10), 'movie'))
                    : ''
                }
                </div>
            `;
        } catch (error) {
            console.error('Error loading movie:', error);
            app.innerHTML = '<div class="section"><p>Error loading movie</p></div>';
        }
    },

    // TV watch page
    async tvShow(id, season = 1, episode = 1) {
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        try {
            const [tvDetails, seasonDetails] = await Promise.all([
                tmdbAPI.getTVDetails(id),
                tmdbAPI.getSeasonDetails(id, season)
            ]);

            if (!tvDetails) throw new Error('TV show not found');

            const posterUrl = utils.getImageUrl(tvDetails.poster_path, 'large');
            const rating = tvDetails.vote_average ? tvDetails.vote_average.toFixed(1) : 'N/A';

            // Generate season buttons
            const seasonButtons = tvDetails.seasons
                ?.filter(s => s.season_number > 0)
                .map(s => `
                    <button class="season-btn ${s.season_number === parseInt(season) ? 'active' : ''}" 
                            onclick="router.navigate('#/tv/${id}/${s.season_number}/1')">
                        Season ${s.season_number}
                    </button>
                `).join('');

            // Generate episode cards
            const episodeCards = seasonDetails?.episodes?.map(ep =>
                components.episodeCard(ep, id, season, ep.episode_number === parseInt(episode))
            ).join('');

            app.innerHTML = `
                <div class="watch-page">
                    <div class="player-container">
                        ${videoPlayer.createPlayer('tv', id, season, episode)}
                    </div>
                    
                    <div class="watch-info">
                        <div class="watch-header">
                            <div class="watch-poster">
                                <img src="${posterUrl}" alt="${tvDetails.name}">
                            </div>
                            <div class="watch-details">
                                <h1 class="watch-title">${tvDetails.name}</h1>
                                <div class="watch-meta">
                                    <span class="watch-meta-item">★ ${rating}</span>
                                    <span class="watch-meta-item">${utils.formatDate(tvDetails.first_air_date)}</span>
                                    <span class="watch-meta-item">${tvDetails.number_of_seasons} Seasons</span>
                                    <span class="watch-meta-item">Now Playing: S${season} E${episode}</span>
                                </div>
                                <div class="watch-genres">
                                    ${tvDetails.genres?.map(g => components.genreTag(g)).join('')}
                                </div>
                                <p class="watch-overview">${tvDetails.overview}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="episode-section">
                        <h2 class="section-title mb-3">Episodes</h2>
                        <div class="season-selector">
                            ${seasonButtons}
                        </div>
                        <div class="episodes-grid">
                            ${episodeCards || '<p class="text-muted">No episodes available</p>'}
                        </div>
                    </div>
                    
                    ${tvDetails.recommendations?.results?.length > 0 ?
                    components.section('Similar Shows', components.contentRow(tvDetails.recommendations.results.slice(0, 10), 'tv'))
                    : ''
                }
                </div>
            `;
        } catch (error) {
            console.error('Error loading TV show:', error);
            app.innerHTML = '<div class="section"><p>Error loading TV show</p></div>';
        }
    },

    // Search results page
    async search(query, page = 1) {
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

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
            const results = await tmdbAPI.search(query, 5);
            const allItems = results?.results?.filter(item =>
                (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
            ) || [];

            // Deduplicate by id
            const seen = new Set();
            const items = allItems.filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
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

            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            // Build search pagination
            const pagination = components.pagination(page, totalPages, 'search', encodeURIComponent(query));

            app.innerHTML = `
                <div class="search-page">
                    <div class="search-header">
                        <h1 class="search-query">Results for <span>"${utils.sanitize(query)}"</span></h1>
                        <p class="search-count">${items.length} results found</p>
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
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

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

        try {
            // Fetch both movies and TV shows for this genre
            const [movies, tvShows] = await Promise.all([
                tmdbAPI.getMoviesByGenre(genreId, 5),
                tmdbAPI.getTVByGenre(genreId, 5)
            ]);

            const allItems = [
                ...(movies?.results?.map(m => ({ ...m, media_type: 'movie' })) || []),
                ...(tvShows?.results?.map(t => ({ ...t, media_type: 'tv' })) || [])
            ].sort((a, b) => b.popularity - a.popularity);

            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            const pagination = components.pagination(page, totalPages, 'genre', genreId);

            app.innerHTML = `
                <div class="browse-page">
                    <div class="browse-header">
                        <h1>${genreName}</h1>
                        <p class="browse-subtitle">Explore movies and TV shows in ${genreName}</p>
                    </div>
                    <div class="browse-results">
                        <div class="results-info">
                            <span>Showing ${pageItems.length} of ${allItems.length} titles</span>
                        </div>
                        <div class="content-grid">
                            ${pageItems.map(item => components.card(item, item.media_type)).join('')}
                        </div>
                        ${pagination}
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
        const app = document.getElementById('app');
        app.innerHTML = components.loading();

        const ITEMS_PER_PAGE = 24;
        const categories = [
            { id: 'trending', name: '🔥 Trending Now', fetch: () => tmdbAPI.getTrending('all', 'day', 5) },
            { id: 'popular_movies', name: '🎬 Popular Movies', fetch: () => tmdbAPI.getPopularMovies(5) },
            { id: 'popular_tv', name: '📺 Popular TV', fetch: () => tmdbAPI.getPopularTV(5) },
            { id: 'now_playing', name: '🎥 Now Playing', fetch: () => tmdbAPI.getNowPlayingMovies(5) },
            { id: 'upcoming', name: '🗓️ Coming Soon', fetch: () => tmdbAPI.getUpcomingMovies(5) },
            { id: 'on_air', name: '📡 On The Air', fetch: () => tmdbAPI.getOnTheAirTV(5) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedMovies(5) },
        ];

        try {
            const selectedCategory = categories.find(c => c.id === category) || categories[0];
            const data = await selectedCategory.fetch();
            const allItems = data?.results || [];
            const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
            const startIdx = (page - 1) * ITEMS_PER_PAGE;
            const pageItems = allItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            const categoryTabs = categories.map(c =>
                `<button class="category-tab ${c.id === category ? 'active' : ''}" onclick="navigateNew('${c.id}', 1)">${c.name}</button>`
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
                            <span>Showing ${pageItems.length} of ${allItems.length} titles</span>
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
        const app = document.getElementById('app');
        const myListItems = utils.loadFromStorage('streamflix_my_list') || [];

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
                        <a href="#/" class="btn btn-primary">Browse Content</a>
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
        const app = document.getElementById('app');
        const faqItems = [
            { q: 'What is Streamflix?', a: 'Streamflix is a free streaming aggregator that helps you discover and watch movies, TV shows, and anime. We do not host any content ourselves — all media is provided by third-party streaming services.' },
            { q: 'Is Streamflix free to use?', a: 'Yes, Streamflix is completely free. We aggregate content from various third-party providers so you can find and stream entertainment without any subscription or sign-up.' },
            { q: 'Do I need to create an account?', a: 'No account is required. You can browse and watch content immediately. However, features like My List use your browser\'s local storage to save your preferences.' },
            { q: 'What devices are supported?', a: 'Streamflix works on any device with a modern web browser including desktop computers, laptops, tablets, and smartphones. We recommend Chrome, Firefox, Safari, or Edge for the best experience.' },
            { q: 'Why is a video not playing?', a: 'If a video is not playing, try switching to a different server using the server selector above the player. Different servers may have different availability for certain titles.' },
            { q: 'Where does the content come from?', a: 'All content metadata (titles, descriptions, posters, ratings) is provided by The Movie Database (TMDB). Video streams are provided by third-party embed services. Streamflix does not host, store, or own any media content.' },
            { q: 'How do I report a broken link?', a: 'You can report issues through our Contact Us page. Please include the title of the content and which server you were using so we can investigate.' },
            { q: 'Can I download content for offline viewing?', a: 'No, Streamflix is a streaming-only platform. We do not offer downloads as we do not host any content directly.' },
            { q: 'How often is new content added?', a: 'Our catalog updates automatically as new titles become available on TMDB and our third-party providers. Trending and popular sections refresh daily.' },
            { q: 'Is my data safe?', a: 'We take privacy seriously. We only store your preferences (like your watchlist) locally in your browser. We do not collect personal information or require registration. See our Privacy Policy for full details.' }
        ];

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Frequently Asked Questions</h1>
                    <p>Find answers to common questions about Streamflix</p>
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
                    <a href="#/contact" class="btn btn-primary">Contact Us</a>
                </div>
            </div>
        `;
    },

    // Help Center page
    help() {
        const app = document.getElementById('app');
        const helpCategories = [
            { icon: '\ud83c\udfac', title: 'Getting Started', desc: 'Learn how to browse and stream content on Streamflix.', links: [{ text: 'How to search for content', href: '#/faq' }, { text: 'Understanding the interface', href: '#/faq' }] },
            { icon: '\ud83d\udda5\ufe0f', title: 'Playback Issues', desc: 'Troubleshoot video playback and streaming problems.', links: [{ text: 'Video not loading', href: '#/faq' }, { text: 'Switch streaming servers', href: '#/faq' }] },
            { icon: '\ud83d\udccb', title: 'My List & Preferences', desc: 'Manage your watchlist and personalize your experience.', links: [{ text: 'Adding to My List', href: '#/my-list' }, { text: 'Managing saved content', href: '#/my-list' }] },
            { icon: '\ud83d\udd12', title: 'Privacy & Security', desc: 'Understand how your data is handled and protected.', links: [{ text: 'Privacy Policy', href: '#/privacy' }, { text: 'Cookie Preferences', href: '#/cookies' }] },
            { icon: '\ud83d\udcdc', title: 'Legal Information', desc: 'Review our terms of service and legal notices.', links: [{ text: 'Terms of Use', href: '#/terms' }, { text: 'Legal Notices', href: '#/legal' }] },
            { icon: '\ud83d\udcac', title: 'Contact Support', desc: 'Get in touch with us for any other issues or feedback.', links: [{ text: 'Contact Us', href: '#/contact' }, { text: 'Report a Problem', href: '#/contact' }] }
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
        const app = document.getElementById('app');
        const myListItems = utils.loadFromStorage('streamflix_my_list') || [];
        const watchHistoryRaw = utils.loadFromStorage('streamflix_watch_progress') || {};
        const watchHistoryCount = Object.keys(watchHistoryRaw).length;

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Your Account</h1>
                    <p>Manage your preferences and viewing data</p>
                </div>
                <div class="account-grid">
                    <div class="account-card">
                        <div class="account-card-icon">\ud83d\udccb</div>
                        <h3>My List</h3>
                        <p class="account-stat">${myListItems.length} saved titles</p>
                        <a href="#/my-list" class="btn btn-primary btn-sm">View My List</a>
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
                        <a href="#/privacy" class="btn btn-secondary btn-sm">Privacy Policy</a>
                    </div>
                    <div class="account-card">
                        <div class="account-card-icon">\ud83c\udf6a</div>
                        <h3>Cookie Settings</h3>
                        <p class="account-stat">Manage preferences</p>
                        <a href="#/cookies" class="btn btn-secondary btn-sm">Cookie Preferences</a>
                    </div>
                </div>
                <div class="disclaimer-banner">
                    <p><strong>Note:</strong> Streamflix does not require an account. All your data (watchlist, history) is stored locally in your browser and never sent to any server.</p>
                </div>
            </div>
        `;
    },

    // Contact Us page
    contact() {
        const app = document.getElementById('app');
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
                        <button type="submit" class="btn btn-primary btn-block">Send Message</button>
                    </form>
                    <div class="contact-info">
                        <div class="contact-info-card">
                            <h3>\ud83d\udce7 Email</h3>
                            <p>support@streamflix.com</p>
                        </div>
                        <div class="contact-info-card">
                            <h3>\u23f1\ufe0f Response Time</h3>
                            <p>We typically respond within 24-48 hours</p>
                        </div>
                        <div class="contact-info-card">
                            <h3>\ud83d\udccb FAQ</h3>
                            <p>Check our <a href="#/faq">FAQ page</a> for instant answers</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Terms of Use page
    terms() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Terms of Use</h1>
                    <p>Last updated: February 14, 2026</p>
                </div>
                <div class="legal-content">
                    <div class="disclaimer-banner">
                        <p><strong>Third-Party Content Disclaimer:</strong> Streamflix does not host, store, or own any of the content displayed on this site. All movies, TV shows, anime, and other media are provided by third-party services and embed providers. All trademarks, service marks, trade names, and content belong to their respective owners.</p>
                    </div>

                    <section class="legal-section">
                        <h2>1. Acceptance of Terms</h2>
                        <p>By accessing and using Streamflix, you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, you must not use this website.</p>
                    </section>

                    <section class="legal-section">
                        <h2>2. Description of Service</h2>
                        <p>Streamflix is a content discovery and aggregation platform. We provide an interface to browse movie and TV show metadata sourced from The Movie Database (TMDB) API. Video playback is facilitated through third-party embed services. We do not upload, host, or store any video content on our servers.</p>
                    </section>

                    <section class="legal-section">
                        <h2>3. Third-Party Content</h2>
                        <p>All video streams accessible through Streamflix are hosted by independent third-party providers. We have no control over the content, availability, or quality of these streams. We are not responsible for any content provided by third parties.</p>
                    </section>

                    <section class="legal-section">
                        <h2>4. Intellectual Property</h2>
                        <p>All movie and TV show metadata, including titles, descriptions, posters, and ratings, is provided by TMDB under their API terms of use. All trademarks and copyrights for the media content belong to their respective owners. Streamflix claims no ownership over any third-party content.</p>
                    </section>

                    <section class="legal-section">
                        <h2>5. User Conduct</h2>
                        <p>You agree to use Streamflix only for lawful purposes. You must not attempt to disrupt, overload, or interfere with the proper functioning of the website. Automated scraping, crawling, or data extraction is prohibited without express permission.</p>
                    </section>

                    <section class="legal-section">
                        <h2>6. Disclaimer of Warranties</h2>
                        <p>Streamflix is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that any content will always be available. Use the service at your own risk.</p>
                    </section>

                    <section class="legal-section">
                        <h2>7. Limitation of Liability</h2>
                        <p>Streamflix shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of or inability to use the service, including any issues with third-party content or streams.</p>
                    </section>

                    <section class="legal-section">
                        <h2>8. Changes to Terms</h2>
                        <p>We reserve the right to modify these Terms of Use at any time. Changes will be effective immediately upon posting. Your continued use of Streamflix after changes constitutes acceptance of the updated terms.</p>
                    </section>

                    <section class="legal-section">
                        <h2>9. Contact</h2>
                        <p>If you have any questions about these Terms of Use, please <a href="#/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Privacy Policy page
    privacy() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Privacy Policy</h1>
                    <p>Last updated: February 14, 2026</p>
                </div>
                <div class="legal-content">
                    <section class="legal-section">
                        <h2>1. Overview</h2>
                        <p>Streamflix is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your data.</p>
                    </section>

                    <section class="legal-section">
                        <h2>2. Information We Collect</h2>
                        <p><strong>We do not collect personal information.</strong> Streamflix does not require registration, login, or any personal data to use the service. The following data is stored locally in your browser only:</p>
                        <ul>
                            <li><strong>Watchlist:</strong> Titles you add to "My List" are saved in your browser's localStorage.</li>
                            <li><strong>Watch Progress:</strong> Your viewing progress is tracked locally so you can resume where you left off.</li>
                            <li><strong>Preferences:</strong> Theme and language preferences are stored in your browser.</li>
                        </ul>
                        <p>This data never leaves your device and is not transmitted to our servers or any third party.</p>
                    </section>

                    <section class="legal-section">
                        <h2>3. Third-Party Services</h2>
                        <p>Streamflix uses the following third-party services:</p>
                        <ul>
                            <li><strong>TMDB API:</strong> We fetch movie and TV show metadata (titles, descriptions, images, ratings) from The Movie Database. TMDB's privacy policy applies to their data handling.</li>
                            <li><strong>Video Embed Providers:</strong> Video streams are loaded via third-party embed services. These providers may set their own cookies and collect data according to their own privacy policies.</li>
                            <li><strong>Google Analytics:</strong> If you have consented to analytics cookies, we use Google Analytics to understand site usage patterns. No personally identifiable information is collected.</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>4. Cookies</h2>
                        <p>Streamflix uses minimal cookies. Essential cookies are required for basic site functionality. Analytics cookies are only enabled with your explicit consent. You can manage your cookie preferences on our <a href="#/cookies">Cookie Preferences</a> page.</p>
                    </section>

                    <section class="legal-section">
                        <h2>5. Data Security</h2>
                        <p>Since all user data is stored locally in your browser, you have full control over it. You can clear your data at any time by clearing your browser's localStorage or using the clear options on the <a href="#/account">Account</a> page.</p>
                    </section>

                    <section class="legal-section">
                        <h2>6. Children's Privacy</h2>
                        <p>Streamflix is not directed at children under 13. We do not knowingly collect any information from children.</p>
                    </section>

                    <section class="legal-section">
                        <h2>7. Changes to This Policy</h2>
                        <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.</p>
                    </section>

                    <section class="legal-section">
                        <h2>8. Contact</h2>
                        <p>For privacy-related questions, please <a href="#/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Cookie Preferences page
    cookies() {
        const app = document.getElementById('app');
        const analyticsConsent = localStorage.getItem('analytics_consent') === 'true';

        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Cookie Preferences</h1>
                    <p>Manage how cookies are used on Streamflix</p>
                </div>
                <div class="legal-content">
                    <section class="legal-section">
                        <h2>What Are Cookies?</h2>
                        <p>Cookies are small text files stored on your device by websites you visit. They help websites remember your preferences and improve your browsing experience.</p>
                    </section>

                    <div class="cookie-settings">
                        <div class="cookie-option">
                            <div class="cookie-option-info">
                                <h3>Essential Cookies</h3>
                                <p>Required for basic site functionality including navigation, localStorage for your watchlist, and video playback. These cannot be disabled.</p>
                            </div>
                            <div class="cookie-toggle">
                                <label class="toggle-switch">
                                    <input type="checkbox" checked disabled>
                                    <span class="toggle-slider"></span>
                                </label>
                                <span class="cookie-status">Always Active</span>
                            </div>
                        </div>

                        <div class="cookie-option">
                            <div class="cookie-option-info">
                                <h3>Analytics Cookies</h3>
                                <p>Help us understand how visitors interact with the site by collecting anonymous usage data through Google Analytics. No personal information is collected.</p>
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
                        <p>For more details about how we handle your data, please read our <a href="#/privacy">Privacy Policy</a>. If you have any questions, <a href="#/contact">contact us</a>.</p>
                    </section>
                </div>
            </div>
        `;
    },

    // Legal Notices page
    legal() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="static-page">
                <div class="static-page-header">
                    <h1>Legal Notices</h1>
                    <p>Important legal information about Streamflix</p>
                </div>
                <div class="legal-content">
                    <div class="disclaimer-banner disclaimer-banner--prominent">
                        <h2>\u26a0\ufe0f Third-Party Content Disclaimer</h2>
                        <p>Streamflix <strong>does not host, store, or own</strong> any of the content displayed on this site. All movies, TV shows, anime, and other media are provided by third-party services and embed providers. Streamflix acts solely as a content discovery and aggregation interface.</p>
                        <p>All trademarks, service marks, trade names, logos, and content belong to their respective owners. If you believe that any content accessible through Streamflix infringes your copyright, please contact us immediately through our <a href="#/contact">Contact page</a>.</p>
                    </div>

                    <section class="legal-section">
                        <h2>Content Attribution</h2>
                        <p>Movie and TV show metadata \u2014 including titles, descriptions, posters, ratings, and cast information \u2014 is provided by <strong>The Movie Database (TMDB)</strong> under their API terms of service. Streamflix is not endorsed or certified by TMDB.</p>
                        <p>This product uses the TMDB API but is not endorsed or certified by TMDB. All movie and show data is courtesy of TMDB contributors.</p>
                    </section>

                    <section class="legal-section">
                        <h2>Video Streaming</h2>
                        <p>All video streams are provided by independent third-party embed services. Streamflix does not host, upload, or transcode any video files. We have no control over the availability, quality, or legality of content provided by these services.</p>
                    </section>

                    <section class="legal-section">
                        <h2>DMCA / Copyright Claims</h2>
                        <p>If you are a copyright owner and believe that content accessible through Streamflix infringes your rights, please <a href="#/contact">contact us</a> with the following information:</p>
                        <ul>
                            <li>A description of the copyrighted work you claim has been infringed</li>
                            <li>The URL on Streamflix where the infringing content is accessible</li>
                            <li>Your contact information (name, email, phone)</li>
                            <li>A statement that you have a good faith belief that the use is not authorized</li>
                            <li>A statement under penalty of perjury that the information is accurate and you are authorized to act on behalf of the copyright owner</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>Open Source</h2>
                        <p>Streamflix is built with open web technologies. We use the following open-source and free resources:</p>
                        <ul>
                            <li><strong>Inter Font:</strong> Licensed under the SIL Open Font License</li>
                            <li><strong>TMDB API:</strong> Used under TMDB API terms of service</li>
                        </ul>
                    </section>

                    <section class="legal-section">
                        <h2>Governing Law</h2>
                        <p>These legal notices and any disputes related to Streamflix shall be governed by applicable international laws. By using Streamflix, you agree to resolve any disputes through appropriate legal channels.</p>
                    </section>

                    <section class="legal-section">
                        <h2>Related Pages</h2>
                        <p>
                            <a href="#/terms">Terms of Use</a> \u00b7
                            <a href="#/privacy">Privacy Policy</a> \u00b7
                            <a href="#/cookies">Cookie Preferences</a> \u00b7
                            <a href="#/contact">Contact Us</a>
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
        this.handleRoute();
    },

    navigate(hash) {
        window.location.hash = hash;
    },

    handleRoute() {
        const hash = window.location.hash;
        // Use hash if present, otherwise use pathname as fallback for clean URLs
        let path = hash ? hash.slice(1) : window.location.pathname;

        // Remove trailing slash and handle empty path
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
        if (!path || path === '') path = '/';

        // Scroll to top on navigation
        window.scrollTo(0, 0);

        // Stop hero carousel when leaving home
        stopHeroCarousel();

        // Close mobile menu if open
        document.getElementById('mobile-nav')?.classList.remove('open');
        document.getElementById('mobile-nav-overlay')?.classList.remove('open');
        document.getElementById('hamburger-btn')?.classList.remove('open');

        // Update active nav link
        document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', href === hash || (href === '#/' && path === '/'));
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
            const app = document.getElementById('app');
            app.innerHTML = components.loading();
            pages.movie(id);
        } else if (path.startsWith('/tv/')) {
            const parts = path.split('/');
            const idSegment = parts[2];
            const id = parseInt(idSegment.split('-')[0], 10);
            const season = parts[3] || 1;
            const episode = parts[4] || 1;
            const app = document.getElementById('app');
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

    const performSearch = () => {
        const query = searchInput.value.trim();
        if (query) {
            router.navigate(`#/search?q=${encodeURIComponent(query)}`);
            searchInput.value = '';
        }
    };

    searchBtn?.addEventListener('click', performSearch);
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

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
let heroCarouselInterval = null;
let currentSlide = 0;
const SLIDE_DURATION = 5000; // 5 seconds

function startHeroCarousel() {
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
    });

    // Update dots
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });

    // Reset progress bar
    resetProgressBar();

    // Restart timer (clear old first to avoid duplicates)
    stopHeroCarousel();
    heroCarouselInterval = setInterval(() => {
        nextSlide();
    }, SLIDE_DURATION);
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
            `<a href="#/genre/${genre.id}">${genre.name}</a>`
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
    if (!heroCarousel) return;

    let touchStartX = 0;
    let touchEndX = 0;

    heroCarousel.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    heroCarousel.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) nextSlide();
            else prevSlide();
        }
    }, { passive: true });
}

// ==========================================
// Initialize App
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    watchProgress.init();
    initEventListeners();
    router.init();
    loadGenres();

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
    form.innerHTML = `
        <div class="contact-success">
            <div class="contact-success-icon">✓</div>
            <h2>Message Sent</h2>
            <p>Thank you for contacting us. We will get back to you within 24-48 hours.</p>
            <a href="#/" class="btn btn-primary">Back to Home</a>
        </div>
    `;
}

function clearWatchHistory() {
    if (confirm('Are you sure you want to clear your watch history? This cannot be undone.')) {
        localStorage.removeItem('streamflix_watch_progress');
        pages.account();
    }
}

function toggleAnalyticsCookies(enabled) {
    localStorage.setItem('analytics_consent', enabled.toString());
    const statusEl = document.getElementById('analytics-status');
    if (statusEl) {
        statusEl.textContent = enabled ? 'Enabled' : 'Disabled';
    }
}

window.toggleFaq = toggleFaq;
window.handleContactSubmit = handleContactSubmit;
window.clearWatchHistory = clearWatchHistory;
window.toggleAnalyticsCookies = toggleAnalyticsCookies;
