/* ==========================================
   StreamFlix - Main Application
   ========================================== */

// Configuration
const CONFIG = {
    // TMDB API - Get your free API key at https://www.themoviedb.org/settings/api
    TMDB_API_KEY: 'd74b73cd4563f614919e6493152fbc1e',
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',

    // Vidking Embed
    VIDKING_BASE_URL: 'https://www.vidking.net/embed',
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

    // Search multi
    async search(query) {
        return this.fetch('/search/multi', { query });
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
        id: 'vidsrc',
        name: 'VidSrc',
        getMovieUrl: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'vidsrc2',
        name: 'VidSrc Pro',
        getMovieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'embedsu',
        name: 'Embed.su',
        getMovieUrl: (id) => `https://embed.su/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'multiembed',
        name: 'MultiEmbed',
        getMovieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
        getTVUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
    },
    {
        id: 'autoembed',
        name: 'AutoEmbed',
        getMovieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
        getTVUrl: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`
    },
    {
        id: 'vidking',
        name: 'VidKing',
        getMovieUrl: (id) => `${CONFIG.VIDKING_BASE_URL}/movie/${id}?color=${CONFIG.PLAYER_COLOR}&autoPlay=true`,
        getTVUrl: (id, s, e) => `${CONFIG.VIDKING_BASE_URL}/tv/${id}/${s}/${e}?color=${CONFIG.PLAYER_COLOR}&autoPlay=true&nextEpisode=true&episodeSelector=true`
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
                ${server.name}
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
        // Ensure message is from Vidking
        if (!event.origin.includes('vidking.net')) return;

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
        const route = mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
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
        const backdropUrl = utils.getImageUrl(item.backdrop_path, 'small', 'backdrop');
        const route = item.media_type === 'movie'
            ? `#/movie/${item.id}`
            : `#/tv/${item.id}/${item.season || 1}/${item.episode || 1}`;
        const progressPercent = item.progress || 0;

        return `
            <a href="${route}" class="card card-continue" data-id="${item.id}">
                <img 
                    src="${backdropUrl}" 
                    alt="${title}" 
                    class="card-poster"
                    loading="lazy"
                >
                <div class="card-overlay">
                    <h3 class="card-title">${title}</h3>
                    <div class="card-meta">
                        ${item.season ? `<span>S${item.season} E${item.episode}</span>` : ''}
                    </div>
                </div>
                <div class="card-progress">
                    <div class="card-progress-bar" style="width: ${progressPercent}%"></div>
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
            const overview = utils.truncate(item.overview, 200);
            const backdropUrl = utils.getImageUrl(item.backdrop_path, 'large', 'backdrop');
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const date = item.release_date || item.first_air_date;
            const mediaType = item.media_type || 'movie';
            const route = mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
            const year = date ? new Date(date).getFullYear() : '';

            return `
                <div class="hero-slide ${index === 0 ? 'active' : ''}" data-index="${index}" style="background-image: url('${backdropUrl}')">
                    <div class="hero-content">
                        <span class="hero-badge">
                            <span>★</span> #${index + 1} Trending
                        </span>
                        <h1 class="hero-title">${title}</h1>
                        <p class="hero-description">${overview}</p>
                        <div class="hero-meta">
                            <span class="hero-meta-item hero-rating">★ ${rating}</span>
                            <span class="hero-meta-item">${year}</span>
                            <span class="hero-meta-item">${mediaType === 'movie' ? '🎬 Movie' : '📺 TV Series'}</span>
                        </div>
                        <div class="hero-buttons">
                            <a href="${route}" class="btn btn-primary btn-lg">
                                <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                                Watch Now
                            </a>
                            <a href="${route}" class="btn btn-secondary btn-lg">
                                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="M12 16v-4M12 8h.01"/>
                                </svg>
                                More Info
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const dots = carouselItems.map((_, index) =>
            `<button class="hero-dot ${index === 0 ? 'active' : ''}" data-index="${index}" onclick="goToSlide(${index})"></button>`
        ).join('');

        return `
            <section class="hero-carousel" id="hero-carousel">
                <div class="hero-slides">
                    ${slides}
                </div>
                <button class="hero-arrow hero-arrow--left" onclick="prevSlide()">‹</button>
                <button class="hero-arrow hero-arrow--right" onclick="nextSlide()">›</button>
                <div class="hero-dots">
                    ${dots}
                </div>
                <div class="hero-progress">
                    <div class="hero-progress-bar"></div>
                </div>
            </section>
        `;
    },

    // Top 10 Content Today section with large numbered cards
    top10Section(items, title = 'TOP 10 CONTENT TODAY') {
        if (!items || items.length === 0) return '';

        const top10Items = items.slice(0, 10);
        const rowId = 'row-top10';

        const cards = top10Items.map((item, index) => {
            const mediaType = item.media_type || 'movie';
            const itemTitle = item.title || item.name;
            const posterUrl = utils.getImageUrl(item.poster_path, 'medium');
            const route = mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
            const ranking = index + 1;

            return `
                <div class="top10-card">
                    <a href="${route}" class="top10-card-link">
                        <div class="top10-card-number">${ranking}</div>
                        <div class="top10-card-poster">
                            <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
                        </div>
                    </a>
                </div>`;
        }).join('');

        return `
            <section class="section top10-section">
                <div class="top10-header">
                    <h2 class="top10-title">${title}</h2>
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
        const route = mediaType === 'movie' ? `#/movie/${item.id}` : `#/tv/${item.id}`;

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
            const [trending, popularMovies, popularTV, topRatedMovies, topRatedTV, animationMovies, animeTVShows] = await Promise.all([
                tmdbAPI.getTrending('all', 'day'),
                tmdbAPI.getPopularMovies(),
                tmdbAPI.getPopularTV(),
                tmdbAPI.getTopRatedMovies(),
                tmdbAPI.getTopRatedTV(),
                tmdbAPI.getAnimationMovies(),
                tmdbAPI.getAnimeTVShows()
            ]);

            // Continue watching section
            let continueWatchingHtml = '';
            if (state.continueWatching.length > 0) {
                continueWatchingHtml = components.section(
                    'Continue Watching',
                    `<div class="content-row">
                        ${state.continueWatching.slice(0, 5).map(item =>
                        components.continueCard(item)
                    ).join('')}
                    </div>`
                );
            }

            const trendingTabs = `
                <button class="section-tab active" onclick="switchTrendingTab('all', this)">All</button>
                <button class="section-tab" onclick="switchTrendingTab('movie', this)">Movies</button>
                <button class="section-tab" onclick="switchTrendingTab('tv', this)">Series</button>
            `;

            app.innerHTML = `
                ${components.heroCarousel(trending?.results)}
                ${components.top10Section(trending?.results, 'TOP 10 CONTENT TODAY')}
                ${continueWatchingHtml}
                ${components.section('Trending Today', components.contentRow(trending?.results?.slice(10), 'all', 'row-trending'), null, trendingTabs)}
                ${components.section('🎬 Popular Movies', components.contentRow(popularMovies?.results, 'movie', 'row-movies'), '#/movies')}
                ${components.section('📺 Popular TV Shows', components.contentRow(popularTV?.results, 'tv', 'row-tv'), '#/tv')}
                ${components.section('🎨 Animation Movies', components.contentRow(animationMovies?.results, 'movie', 'row-animation'))}
                ${components.section('⚔️ Anime Series', components.contentRow(animeTVShows?.results, 'tv', 'row-anime'), '#/anime')}
                ${components.section('🏆 Top Rated Movies', components.contentRow(topRatedMovies?.results, 'movie', 'row-top-movies'))}
                ${components.section('🌟 Top Rated TV Shows', components.contentRow(topRatedTV?.results, 'tv', 'row-top-tv'))}
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
            { id: 'popular', name: '🔥 Popular', fetch: () => tmdbAPI.getPopularMovies(5) },
            { id: 'top_rated', name: '🏆 Top Rated', fetch: () => tmdbAPI.getTopRatedMovies(5) },
            { id: 'now_playing', name: '🎬 Now Playing', fetch: () => tmdbAPI.getNowPlayingMovies(5) },
            { id: 'upcoming', name: '🗓️ Coming Soon', fetch: () => tmdbAPI.getUpcomingMovies(5) },
            { id: '28', name: '💥 Action', fetch: () => tmdbAPI.getMoviesByGenre(28, 5) },
            { id: '35', name: '😂 Comedy', fetch: () => tmdbAPI.getMoviesByGenre(35, 5) },
            { id: '18', name: '🎭 Drama', fetch: () => tmdbAPI.getMoviesByGenre(18, 5) },
            { id: '27', name: '😱 Horror', fetch: () => tmdbAPI.getMoviesByGenre(27, 5) },
            { id: '10749', name: '💕 Romance', fetch: () => tmdbAPI.getMoviesByGenre(10749, 5) },
            { id: '878', name: '🚀 Sci-Fi', fetch: () => tmdbAPI.getMoviesByGenre(878, 5) },
            { id: '53', name: '🔪 Thriller', fetch: () => tmdbAPI.getMoviesByGenre(53, 5) },
            { id: '10752', name: '⚔️ War', fetch: () => tmdbAPI.getMoviesByGenre(10752, 5) },
            { id: '80', name: '🔫 Crime', fetch: () => tmdbAPI.getMoviesByGenre(80, 5) },
            { id: '16', name: '🎨 Animation', fetch: () => tmdbAPI.getMoviesByGenre(16, 5) },
            { id: '99', name: '📹 Documentary', fetch: () => tmdbAPI.getMoviesByGenre(99, 5) },
            { id: '14', name: '🧙 Fantasy', fetch: () => tmdbAPI.getMoviesByGenre(14, 5) },
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
    async search(query) {
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

        try {
            const results = await tmdbAPI.search(query);
            const items = results?.results?.filter(item =>
                item.media_type === 'movie' || item.media_type === 'tv'
            ) || [];

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

            app.innerHTML = `
                <div class="search-page">
                    <div class="search-header">
                        <h1 class="search-query">Results for <span>"${query}"</span></h1>
                        <p class="search-count">${items.length} results found</p>
                    </div>
                    <div class="content-grid">
                        ${items.map(item => components.card(item, item.media_type)).join('')}
                    </div>
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
        const hash = window.location.hash || '#/';
        const path = hash.slice(1); // Remove #

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
            const id = path.split('/')[2];
            pages.movie(id);
        } else if (path.startsWith('/tv/')) {
            const parts = path.split('/');
            const id = parts[2].split('?')[0];
            const season = parts[3] || 1;
            const episode = parts[4] || 1;
            pages.tvShow(id, season, episode);
        } else if (path.startsWith('/search')) {
            const query = new URLSearchParams(path.split('?')[1]).get('q') || '';
            pages.search(query);
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
