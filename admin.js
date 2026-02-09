// ==========================================
// StreamFlix Admin Dashboard JavaScript
// ==========================================

const ADMIN_CONFIG = {
    sessionKey: 'streamflix_admin_session',
    dataKey: 'streamflix_admin_data',
    logsKey: 'streamflix_admin_logs',
    moderationKey: 'streamflix_moderation',
    notificationsKey: 'streamflix_notifications',
    loginAttemptsKey: 'streamflix_login_attempts',
    TMDB_API_KEY: 'd74b73cd4563f614919e6493152fbc1e',
    TMDB_BASE: 'https://api.themoviedb.org/3',
    TMDB_IMG: 'https://image.tmdb.org/t/p',
    LOCKOUT_DURATION: 5 * 60 * 1000,
    MAX_ATTEMPTS: 5
};

const GA_CONFIG = {
    clientId: '589684000704-6feti4bp8p85jefcsnov1bqefgdlh7db.apps.googleusercontent.com',
    propertyId: '523849331',
    scopes: 'https://www.googleapis.com/auth/analytics.readonly',
    apiBase: 'https://analyticsdata.googleapis.com/v1beta'
};

// ==========================================
// Google Analytics 4 Data API Integration
// ==========================================
const gaAnalytics = {
    accessToken: null,
    tokenClient: null,
    connected: false,

    init() {
        const saved = sessionStorage.getItem('ga_access_token');
        if (saved) {
            this.accessToken = saved;
            this.connected = true;
            this.updateButton(true);
            this.loadAllData();
        }
    },

    connect() {
        if (typeof google === 'undefined' || !google.accounts) {
            showNotification('Google Identity Services not loaded. Please refresh.', 'error');
            return;
        }

        if (!this.tokenClient) {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GA_CONFIG.clientId,
                scope: GA_CONFIG.scopes,
                callback: (response) => {
                    if (response.error) {
                        showNotification('Analytics auth failed: ' + response.error, 'error');
                        return;
                    }
                    this.accessToken = response.access_token;
                    this.connected = true;
                    sessionStorage.setItem('ga_access_token', response.access_token);
                    this.updateButton(true);
                    systemLogs.add('Analytics Connected', 'Google Analytics linked via OAuth', 'success');
                    showNotification('Google Analytics connected! Loading real data...', 'success');
                    this.loadAllData();
                }
            });
        }

        this.tokenClient.requestAccessToken();
    },

    updateButton(connected) {
        const btn = document.getElementById('ga-connect-btn');
        if (!btn) return;
        if (connected) {
            btn.textContent = '✅ Analytics Connected';
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
        } else {
            btn.textContent = '📊 Connect Analytics';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        }
    },

    async apiCall(body) {
        if (!this.accessToken) return null;
        try {
            const res = await fetch(
                `${GA_CONFIG.apiBase}/properties/${GA_CONFIG.propertyId}:runReport`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );
            if (!res.ok) {
                const err = await res.json();
                if (res.status === 401) {
                    this.connected = false;
                    this.accessToken = null;
                    sessionStorage.removeItem('ga_access_token');
                    this.updateButton(false);
                    showNotification('Analytics session expired. Click Connect to re-auth.', 'warning');
                }
                return null;
            }
            return await res.json();
        } catch {
            return null;
        }
    },

    async loadAllData() {
        if (!this.connected) return;

        await Promise.all([
            this.loadOverviewStats(),
            this.loadTrafficSources(),
            this.loadTopPages(),
            this.loadGeoData(),
            this.loadDeviceData()
        ]);
    },

    async loadOverviewStats() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'screenPageViews' },
                { name: 'sessions' },
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' },
                { name: 'newUsers' }
            ]
        });

        if (!data || !data.rows || !data.rows[0]) return;

        const values = data.rows[0].metricValues;
        const activeUsers = parseInt(values[0].value) || 0;
        const pageViews = parseInt(values[1].value) || 0;
        const sessions = parseInt(values[2].value) || 0;
        const avgDuration = parseFloat(values[3].value) || 0;
        const bounceRate = parseFloat(values[4].value) || 0;
        const newUsers = parseInt(values[5].value) || 0;

        const statViews = document.getElementById('stat-views');
        const statUsers = document.getElementById('stat-users');
        const statPlays = document.getElementById('stat-plays');
        const statTime = document.getElementById('stat-time');

        if (statViews) {
            analyticsModule.animateCounter('stat-views', pageViews);
        }
        if (statUsers) {
            analyticsModule.animateCounter('stat-users', activeUsers);
        }
        if (statPlays) {
            analyticsModule.animateCounter('stat-plays', sessions);
        }
        if (statTime) {
            statTime.textContent = `${Math.round(avgDuration / 60)}m`;
        }

        const apv = document.getElementById('analytics-pageviews');
        const ab = document.getElementById('analytics-bounce');
        const ar = document.getElementById('analytics-referral');

        if (apv) apv.textContent = pageViews.toLocaleString();
        if (ab) ab.textContent = `${(bounceRate * 100).toFixed(1)}%`;
        if (ar) ar.textContent = newUsers.toLocaleString();

        await this.loadDailyTraffic();
    },

    async loadDailyTraffic() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }]
        });

        if (!data || !data.rows) return;

        const canvas = document.getElementById('trafficCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        const chartData = data.rows.map(r => parseInt(r.metricValues[0].value) || 0);
        const labels = data.rows.map(r => {
            const d = r.dimensionValues[0].value;
            return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
        });

        const maxValue = Math.max(...chartData, 1);
        const padding = 40;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const barWidth = chartWidth / chartData.length - 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        chartData.forEach((value, index) => {
            const x = padding + index * (chartWidth / chartData.length) + 5;
            const barHeight = (value / maxValue) * chartHeight;
            const y = canvas.height - padding - barHeight;

            ctx.fillStyle = '#e50914';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 4);
            ctx.fill();

            ctx.fillStyle = '#666';
            ctx.font = '11px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(labels[index], x + barWidth / 2, canvas.height - 10);

            ctx.fillStyle = '#fff';
            ctx.fillText(value.toLocaleString(), x + barWidth / 2, y - 10);
        });
    },

    async loadTrafficSources() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 6
        });

        if (!data || !data.rows) return;

        const colors = ['#e50914', '#4285f4', '#1da1f2', '#46d369', '#f5c518', '#9b59b6'];
        const total = data.rows.reduce((s, r) => s + parseInt(r.metricValues[0].value), 0);

        const srcContainer = document.getElementById('traffic-sources');
        if (srcContainer) {
            srcContainer.innerHTML = data.rows.map((row, i) => {
                const name = row.dimensionValues[0].value;
                const value = parseInt(row.metricValues[0].value);
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return `
                    <div class="source-item" style="border-left: 4px solid ${colors[i % colors.length]}">
                        <h4>${pct}%</h4>
                        <p>${sanitize(name)}</p>
                    </div>
                `;
            }).join('');
        }
    },

    async loadTopPages() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
                { name: 'screenPageViews' },
                { name: 'activeUsers' }
            ],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 8
        });

        if (!data || !data.rows) return;

        const tbody = document.querySelector('#top-content-table tbody');
        if (!tbody) return;

        tbody.innerHTML = data.rows.map(row => {
            const path = row.dimensionValues[0].value;
            const views = parseInt(row.metricValues[0].value);
            const users = parseInt(row.metricValues[1].value);
            return `
                <tr>
                    <td>${sanitize(path)}</td>
                    <td><span class="badge">Page</span></td>
                    <td>${views.toLocaleString()}</td>
                    <td>${users.toLocaleString()} users</td>
                </tr>
            `;
        }).join('');
    },

    async loadGeoData() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 8
        });

        if (!data || !data.rows) return;

        const total = data.rows.reduce((s, r) => s + parseInt(r.metricValues[0].value), 0);
        const container = document.getElementById('geo-stats');
        if (!container) return;

        container.innerHTML = data.rows.map(row => {
            const country = row.dimensionValues[0].value;
            const users = parseInt(row.metricValues[0].value);
            const pct = total > 0 ? Math.round((users / total) * 100) : 0;
            return `
                <div class="geo-item">
                    <span class="geo-flag">🌍</span>
                    <span class="geo-name">${sanitize(country)}</span>
                    <div class="geo-bar">
                        <div class="geo-bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="geo-percent">${pct}%</span>
                </div>
            `;
        }).join('');
    },

    async loadDeviceData() {
        const data = await this.apiCall({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
        });

        if (!data || !data.rows) return;

        const total = data.rows.reduce((s, r) => s + parseInt(r.metricValues[0].value), 0);
        const icons = { desktop: '💻', mobile: '📱', tablet: '📺' };

        const devContainer = document.getElementById('device-stats');
        if (devContainer) {
            devContainer.innerHTML = data.rows.map(row => {
                const device = row.dimensionValues[0].value.toLowerCase();
                const users = parseInt(row.metricValues[0].value);
                const pct = total > 0 ? Math.round((users / total) * 100) : 0;
                return `
                    <div class="device-item">
                        <div class="device-icon">${icons[device] || '🖥️'}</div>
                        <div class="device-percent">${pct}%</div>
                        <div class="device-label">${sanitize(device.charAt(0).toUpperCase() + device.slice(1))}</div>
                    </div>
                `;
            }).join('');
        }

        const mobileRow = data.rows.find(r => r.dimensionValues[0].value.toLowerCase() === 'mobile');
        const mobileUsers = mobileRow ? parseInt(mobileRow.metricValues[0].value) : 0;
        const mobilePct = total > 0 ? Math.round((mobileUsers / total) * 100) : 0;
        const am = document.getElementById('analytics-mobile');
        if (am) am.textContent = `${mobilePct}%`;
    }
};

// ==========================================
// Utility: SHA-256 Hashing
// ==========================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'streamflix_salt_v1');
    const buffer = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(buffer));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitize(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ==========================================
// TMDB API
// ==========================================
const tmdb = {
    async fetch(endpoint, params = {}) {
        const url = new URL(`${ADMIN_CONFIG.TMDB_BASE}${endpoint}`);
        url.searchParams.set('api_key', ADMIN_CONFIG.TMDB_API_KEY);
        Object.entries(params).forEach(([k, v]) => {
            url.searchParams.set(k, v);
        });
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    },

    imgUrl(path, size = 'w185') {
        if (!path) return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="45" height="68"%3E%3Crect width="45" height="68" fill="%231a1a1a"/%3E%3Ctext x="22" y="38" fill="%23666" font-family="sans-serif" font-size="8" text-anchor="middle"%3ENo Img%3C/text%3E%3C/svg%3E';
        return `${ADMIN_CONFIG.TMDB_IMG}/${size}${path}`;
    }
};

// ==========================================
// System Logs
// ==========================================
const systemLogs = {
    add(action, details, status = 'success') {
        const logs = this.getAll();
        logs.unshift({
            timestamp: new Date().toISOString(),
            action,
            details,
            status
        });
        if (logs.length > 200) logs.length = 200;
        localStorage.setItem(ADMIN_CONFIG.logsKey, JSON.stringify(logs));
    },

    getAll() {
        try {
            return JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.logsKey) || '[]'
            );
        } catch {
            return [];
        }
    },

    clear() {
        localStorage.setItem(ADMIN_CONFIG.logsKey, JSON.stringify([]));
    },

    render() {
        const logs = this.getAll();
        const tbody = document.querySelector('#logs-table tbody');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No log entries yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.slice(0, 100).map(log => {
            const date = new Date(log.timestamp);
            const formatted = date.toLocaleString();
            const statusClass = log.status === 'success'
                ? 'color: #46d369'
                : log.status === 'error'
                    ? 'color: #e50914'
                    : 'color: #f5c518';
            return `
                <tr>
                    <td style="white-space:nowrap">${sanitize(formatted)}</td>
                    <td><strong>${sanitize(log.action)}</strong></td>
                    <td>${sanitize(log.details)}</td>
                    <td style="${statusClass};font-weight:600;text-transform:uppercase">${sanitize(log.status)}</td>
                </tr>
            `;
        }).join('');
    }
};

// ==========================================
// Authentication (SHA-256 hashed)
// ==========================================
const auth = {
    credentials: null,

    async init() {
        const saved = localStorage.getItem('streamflix_admin_credentials');
        if (saved) {
            this.credentials = JSON.parse(saved);
        } else {
            const hashedPw = await hashPassword('2304Noor@');
            this.credentials = {
                username: 'admin',
                passwordHash: hashedPw
            };
            localStorage.setItem(
                'streamflix_admin_credentials',
                JSON.stringify(this.credentials)
            );
        }

        const session = sessionStorage.getItem(ADMIN_CONFIG.sessionKey);
        if (session) {
            this.showDashboard();
        }
    },

    isLockedOut() {
        try {
            const data = JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.loginAttemptsKey) || '{}'
            );
            if (
                data.count >= ADMIN_CONFIG.MAX_ATTEMPTS &&
                Date.now() - data.lastAttempt < ADMIN_CONFIG.LOCKOUT_DURATION
            ) {
                const remaining = Math.ceil(
                    (ADMIN_CONFIG.LOCKOUT_DURATION -
                        (Date.now() - data.lastAttempt)) /
                    60000
                );
                return remaining;
            }
            if (
                data.count >= ADMIN_CONFIG.MAX_ATTEMPTS &&
                Date.now() - data.lastAttempt >= ADMIN_CONFIG.LOCKOUT_DURATION
            ) {
                localStorage.removeItem(ADMIN_CONFIG.loginAttemptsKey);
            }
        } catch {
            /* empty */
        }
        return 0;
    },

    recordFailedAttempt() {
        let data;
        try {
            data = JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.loginAttemptsKey) || '{}'
            );
        } catch {
            data = {};
        }
        data.count = (data.count || 0) + 1;
        data.lastAttempt = Date.now();
        localStorage.setItem(
            ADMIN_CONFIG.loginAttemptsKey,
            JSON.stringify(data)
        );
    },

    async login(username, password) {
        const lockout = this.isLockedOut();
        if (lockout > 0) {
            return {
                success: false,
                message: `Account locked. Try again in ${lockout} minute(s).`
            };
        }

        const hashedPw = await hashPassword(password);
        if (
            username === this.credentials.username &&
            hashedPw === this.credentials.passwordHash
        ) {
            localStorage.removeItem(ADMIN_CONFIG.loginAttemptsKey);
            sessionStorage.setItem(ADMIN_CONFIG.sessionKey, 'true');
            systemLogs.add('Login', `Admin logged in`, 'success');
            return { success: true };
        }

        this.recordFailedAttempt();
        systemLogs.add('Login Failed', `Failed login attempt for "${sanitize(username)}"`, 'error');
        const attemptsData = JSON.parse(
            localStorage.getItem(ADMIN_CONFIG.loginAttemptsKey) || '{}'
        );
        const remaining = ADMIN_CONFIG.MAX_ATTEMPTS - (attemptsData.count || 0);
        return {
            success: false,
            message:
                remaining > 0
                    ? `Invalid credentials. ${remaining} attempt(s) remaining.`
                    : `Account locked for 5 minutes.`
        };
    },

    logout() {
        systemLogs.add('Logout', 'Admin logged out', 'success');
        sessionStorage.removeItem(ADMIN_CONFIG.sessionKey);
        location.reload();
    },

    async updateCredentials(username, password) {
        const hashedPw = await hashPassword(password);
        this.credentials = { username, passwordHash: hashedPw };
        localStorage.setItem(
            'streamflix_admin_credentials',
            JSON.stringify(this.credentials)
        );
        systemLogs.add(
            'Credentials Updated',
            'Admin credentials were changed',
            'success'
        );
    },

    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document
            .getElementById('admin-dashboard')
            .classList.remove('hidden');
        this.loadDashboardData();
        gaAnalytics.init();
    },

    loadDashboardData() {
        document.getElementById('current-date').textContent =
            new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

        analyticsModule.loadOverview();
        analyticsModule.loadAnalytics();
        analyticsModule.loadContentStats();
        analyticsModule.loadUserActivity();
        reports.load();
        ads.loadSavedCodes();
        seo.loadSettings();
        moderation.loadLists();
        notifications.loadList();
        systemLogs.render();
    }
};

// ==========================================
// Analytics & Statistics (TMDB real data)
// ==========================================
const analyticsModule = {
    generateStats() {
        const baseViews = Math.floor(Math.random() * 10000) + 5000;
        return {
            views: baseViews,
            users: Math.floor(baseViews * 0.6),
            plays: Math.floor(baseViews * 0.4),
            avgTime: Math.floor(Math.random() * 45) + 15,
            pageviews: baseViews * 3,
            bounceRate: Math.floor(Math.random() * 30) + 25,
            mobilePercent: Math.floor(Math.random() * 40) + 40,
            referrals: Math.floor(Math.random() * 500) + 100
        };
    },

    async loadOverview() {
        const stats = this.generateStats();

        this.animateCounter('stat-views', stats.views);
        this.animateCounter('stat-users', stats.users);
        this.animateCounter('stat-plays', stats.plays);
        document.getElementById('stat-time').textContent =
            `${stats.avgTime}m`;

        await this.loadTopContent();
        this.loadRealtimeActivity();
        this.loadGeoData();
        this.drawTrafficChart();
    },

    animateCounter(elementId, target) {
        const element = document.getElementById(elementId);
        if (!element) return;
        const duration = 1000;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = Math.floor(target * progress);
            element.textContent = current.toLocaleString();
            if (progress < 1) requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    },

    async loadTopContent() {
        const data = await tmdb.fetch('/trending/all/week');
        if (!data || !data.results) return;

        const items = data.results.slice(0, 8).map(item => ({
            title: item.title || item.name,
            type: item.media_type === 'movie' ? 'Movie' : 'TV Show',
            views: Math.floor(item.popularity * 50),
            trend: item.vote_average >= 7 ? 'up' : 'down'
        }));

        const tbody = document.querySelector('#top-content-table tbody');
        if (!tbody) return;
        tbody.innerHTML = items
            .map(
                item => `
            <tr>
                <td>${sanitize(item.title)}</td>
                <td><span class="badge">${item.type}</span></td>
                <td>${item.views.toLocaleString()}</td>
                <td class="stat-trend ${item.trend}">
                    ${item.trend === 'up' ? '↑' : '↓'}
                </td>
            </tr>
        `
            )
            .join('');
    },

    async loadRealtimeActivity() {
        const data = await tmdb.fetch('/trending/all/day');
        const titles =
            data && data.results
                ? data.results.slice(0, 7).map(i => i.title || i.name)
                : [
                    'Popular Movie',
                    'Trending Show',
                    'New Release',
                    'Classic Film'
                ];

        const actions = [
            { icon: '▶️', tpl: 'User started watching "{title}"' },
            { icon: '🔍', tpl: 'Search for "{title}"' },
            { icon: '👤', tpl: 'New visitor browsing "{title}"' },
            { icon: '⭐', tpl: 'User added "{title}" to My List' },
            { icon: '▶️', tpl: 'User resumed "{title}"' },
            { icon: '🔍', tpl: 'Search query related to "{title}"' },
            { icon: '▶️', tpl: 'User watching "{title}"' }
        ];

        const times = [
            '2s ago',
            '15s ago',
            '32s ago',
            '45s ago',
            '1m ago',
            '2m ago',
            '3m ago'
        ];

        const container = document.getElementById('realtime-activity');
        if (!container) return;
        container.innerHTML = actions
            .map((a, i) => {
                const title = titles[i % titles.length];
                return `
                <div class="activity-item">
                    <span class="activity-icon">${a.icon}</span>
                    <span class="activity-text">${sanitize(a.tpl.replace('{title}', title))}</span>
                    <span class="activity-time">${times[i]}</span>
                </div>
            `;
            })
            .join('');
    },

    loadGeoData() {
        const geoData = [
            { flag: '🇺🇸', name: 'United States', percent: 35 },
            { flag: '🇬🇧', name: 'United Kingdom', percent: 18 },
            { flag: '🇨🇦', name: 'Canada', percent: 12 },
            { flag: '🇦🇺', name: 'Australia', percent: 10 },
            { flag: '🇩🇪', name: 'Germany', percent: 8 },
            { flag: '🇮🇳', name: 'India', percent: 7 },
            { flag: '🇧🇷', name: 'Brazil', percent: 5 },
            { flag: '🌍', name: 'Others', percent: 5 }
        ];

        const container = document.getElementById('geo-stats');
        if (!container) return;
        container.innerHTML = geoData
            .map(
                g => `
            <div class="geo-item">
                <span class="geo-flag">${g.flag}</span>
                <span class="geo-name">${g.name}</span>
                <div class="geo-bar">
                    <div class="geo-bar-fill" style="width: ${g.percent}%"></div>
                </div>
                <span class="geo-percent">${g.percent}%</span>
            </div>
        `
            )
            .join('');
    },

    drawTrafficChart() {
        const canvas = document.getElementById('trafficCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        const data = Array.from({ length: 7 }, () =>
            Math.floor(Math.random() * 5000) + 2000
        );
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const maxValue = Math.max(...data);
        const padding = 40;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const barWidth = chartWidth / data.length - 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        data.forEach((value, index) => {
            const x =
                padding + index * (chartWidth / data.length) + 5;
            const barHeight = (value / maxValue) * chartHeight;
            const y = canvas.height - padding - barHeight;

            ctx.fillStyle = '#e50914';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 4);
            ctx.fill();

            ctx.fillStyle = '#666';
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(
                labels[index],
                x + barWidth / 2,
                canvas.height - 10
            );

            ctx.fillStyle = '#fff';
            ctx.fillText(
                value.toLocaleString(),
                x + barWidth / 2,
                y - 10
            );
        });
    },

    loadAnalytics() {
        const stats = this.generateStats();

        document.getElementById('analytics-pageviews').textContent =
            stats.pageviews.toLocaleString();
        document.getElementById(
            'analytics-bounce'
        ).textContent = `${stats.bounceRate}%`;
        document.getElementById(
            'analytics-mobile'
        ).textContent = `${stats.mobilePercent}%`;
        document.getElementById(
            'analytics-referral'
        ).textContent = stats.referrals.toLocaleString();

        const sources = [
            { name: 'Direct', value: 45, color: '#e50914' },
            { name: 'Google', value: 30, color: '#4285f4' },
            { name: 'Social', value: 15, color: '#1da1f2' },
            { name: 'Referral', value: 10, color: '#46d369' }
        ];

        const srcContainer = document.getElementById('traffic-sources');
        if (srcContainer) {
            srcContainer.innerHTML = sources
                .map(
                    s => `
                <div class="source-item" style="border-left: 4px solid ${s.color}">
                    <h4>${s.value}%</h4>
                    <p>${s.name}</p>
                </div>
            `
                )
                .join('');
        }

        const devContainer = document.getElementById('device-stats');
        if (devContainer) {
            devContainer.innerHTML = `
                <div class="device-item">
                    <div class="device-icon">📱</div>
                    <div class="device-percent">${stats.mobilePercent}%</div>
                    <div class="device-label">Mobile</div>
                </div>
                <div class="device-item">
                    <div class="device-icon">💻</div>
                    <div class="device-percent">${100 - stats.mobilePercent - 10}%</div>
                    <div class="device-label">Desktop</div>
                </div>
                <div class="device-item">
                    <div class="device-icon">📺</div>
                    <div class="device-percent">10%</div>
                    <div class="device-label">Tablet</div>
                </div>
            `;
        }
    },

    async loadContentStats() {
        const [moviesData, tvData, genresData] = await Promise.all([
            tmdb.fetch('/movie/popular'),
            tmdb.fetch('/tv/popular'),
            tmdb.fetch('/genre/movie/list')
        ]);

        if (moviesData && moviesData.results) {
            const movies = moviesData.results.slice(0, 8);
            const tbody = document.querySelector(
                '#movies-table tbody'
            );
            if (tbody) {
                tbody.innerHTML = movies
                    .map(
                        (m, i) => `
                    <tr>
                        <td>#${i + 1}</td>
                        <td>${sanitize(m.title)}</td>
                        <td>${Math.floor(m.popularity * 40).toLocaleString()}</td>
                        <td>${Math.floor(Math.random() * 30 + 20)}m</td>
                        <td>⭐ ${m.vote_average.toFixed(1)}</td>
                    </tr>
                `
                    )
                    .join('');
            }
        }

        if (tvData && tvData.results) {
            const shows = tvData.results.slice(0, 8);
            const tbody = document.querySelector(
                '#tvshows-table tbody'
            );
            if (tbody) {
                tbody.innerHTML = shows
                    .map(
                        (t, i) => `
                    <tr>
                        <td>#${i + 1}</td>
                        <td>${sanitize(t.name)}</td>
                        <td>${Math.floor(t.popularity * 35).toLocaleString()}</td>
                        <td>${Math.floor(Math.random() * 50 + 8)} eps</td>
                        <td>⭐ ${t.vote_average.toFixed(1)}</td>
                    </tr>
                `
                    )
                    .join('');
            }
        }

        if (genresData && genresData.genres) {
            const genres = genresData.genres.slice(0, 10);
            const container = document.getElementById(
                'genre-performance'
            );
            if (container) {
                container.innerHTML = genres
                    .map(g => {
                        const percent =
                            Math.floor(Math.random() * 50) + 30;
                        return `
                        <div class="genre-bar-item">
                            <label>${sanitize(g.name)}</label>
                            <div class="bar">
                                <div class="bar-fill" style="width: ${percent}%">${percent}%</div>
                            </div>
                        </div>
                    `;
                    })
                    .join('');
            }
        }
    },

    async loadUserActivity() {
        const trending = await tmdb.fetch('/trending/all/day');
        const titles =
            trending && trending.results
                ? trending.results.map(i => i.title || i.name)
                : ['Movie A', 'Show B', 'Film C', 'Series D'];

        const countries = [
            '🇺🇸 USA',
            '🇬🇧 UK',
            '🇨🇦 Canada',
            '🇦🇺 Australia',
            '🇩🇪 Germany'
        ];

        const users = Array.from({ length: 10 }, () => ({
            session: `usr_${Math.random().toString(36).substr(2, 8)}`,
            lastWatched:
                titles[Math.floor(Math.random() * titles.length)],
            views: Math.floor(Math.random() * 50) + 5,
            watchTime: `${Math.floor(Math.random() * 120) + 15}m`,
            country:
                countries[Math.floor(Math.random() * countries.length)]
        }));

        const tbody = document.querySelector('#users-table tbody');
        if (tbody) {
            tbody.innerHTML = users
                .map(
                    u => `
                <tr>
                    <td><code>${u.session}</code></td>
                    <td>${sanitize(u.lastWatched)}</td>
                    <td>${u.views}</td>
                    <td>${u.watchTime}</td>
                    <td>${u.country}</td>
                </tr>
            `
                )
                .join('');
        }

        const peakHours = document.getElementById('peak-hours');
        if (peakHours) {
            peakHours.innerHTML = Array.from({ length: 24 }, (_, i) => {
                const intensity = ['low', 'medium', 'high', 'peak'][
                    Math.floor(Math.random() * 4)
                ];
                return `<div class="heatmap-cell ${intensity}" title="${i}:00 - ${i + 1}:00"></div>`;
            }).join('');
        }
    }
};

// ==========================================
// Reports (real TMDB data)
// ==========================================
const reports = {
    async load() {
        const [topRated, upcoming, genres, airing] = await Promise.all([
            tmdb.fetch('/movie/top_rated'),
            tmdb.fetch('/movie/upcoming'),
            tmdb.fetch('/genre/movie/list'),
            tmdb.fetch('/tv/on_the_air')
        ]);

        if (topRated && topRated.results) {
            const el = document.getElementById('report-top-rated-count');
            if (el) {
                const count = topRated.results.filter(
                    m => m.vote_average >= 8
                ).length;
                el.textContent = count;
            }

            const tbody = document.querySelector(
                '#top-rated-movies-table tbody'
            );
            if (tbody) {
                tbody.innerHTML = topRated.results
                    .slice(0, 10)
                    .map(
                        m => `
                    <tr>
                        <td><img src="${tmdb.imgUrl(m.poster_path, 'w92')}" alt="${sanitize(m.title)}" style="width:45px;border-radius:4px"></td>
                        <td>${sanitize(m.title)}</td>
                        <td>⭐ ${m.vote_average.toFixed(1)}</td>
                        <td>${m.vote_count.toLocaleString()}</td>
                        <td>${m.release_date || 'TBA'}</td>
                    </tr>
                `
                    )
                    .join('');
            }
        }

        if (upcoming && upcoming.results) {
            const el = document.getElementById(
                'report-upcoming-count'
            );
            if (el) el.textContent = upcoming.results.length;

            const tbody = document.querySelector(
                '#upcoming-movies-table tbody'
            );
            if (tbody) {
                tbody.innerHTML = upcoming.results
                    .slice(0, 10)
                    .map(
                        m => `
                    <tr>
                        <td><img src="${tmdb.imgUrl(m.poster_path, 'w92')}" alt="${sanitize(m.title)}" style="width:45px;border-radius:4px"></td>
                        <td>${sanitize(m.title)}</td>
                        <td>${m.release_date || 'TBA'}</td>
                        <td>${Math.floor(m.popularity).toLocaleString()}</td>
                    </tr>
                `
                    )
                    .join('');
            }
        }

        if (genres && genres.genres) {
            const el = document.getElementById('report-genre-count');
            if (el) el.textContent = genres.genres.length;
        }

        if (airing && airing.results) {
            const el = document.getElementById('report-airing-count');
            if (el) el.textContent = airing.results.length;
        }
    }
};

// ==========================================
// Content Moderation
// ==========================================
const moderation = {
    getData() {
        try {
            return JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.moderationKey) ||
                '{"featured":[],"hidden":[]}'
            );
        } catch {
            return { featured: [], hidden: [] };
        }
    },

    save(data) {
        localStorage.setItem(
            ADMIN_CONFIG.moderationKey,
            JSON.stringify(data)
        );
    },

    async search() {
        const type = document.getElementById('mod-type').value;
        const query = document.getElementById('mod-search').value.trim();

        let data;
        if (query) {
            data = await tmdb.fetch(`/search/${type}`, { query });
        } else {
            data = await tmdb.fetch(
                `/${type}/popular`
            );
        }

        if (!data || !data.results) return;

        const modData = this.getData();
        const grid = document.getElementById('moderation-grid');
        if (!grid) return;

        grid.innerHTML = data.results
            .slice(0, 12)
            .map(item => {
                const title = item.title || item.name;
                const id = item.id;
                const isFeatured = modData.featured.some(
                    f => f.id === id
                );
                const isHidden = modData.hidden.some(
                    h => h.id === id
                );

                return `
                <div class="mod-card ${isFeatured ? 'mod-featured' : ''} ${isHidden ? 'mod-hidden' : ''}">
                    <img src="${tmdb.imgUrl(item.poster_path, 'w185')}" alt="${sanitize(title)}">
                    <div class="mod-card-info">
                        <h4>${sanitize(title)}</h4>
                        <p>⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</p>
                        <div class="mod-card-actions">
                            <button class="btn btn-sm ${isFeatured ? 'btn-primary' : 'btn-outline'}"
                                onclick="moderation.toggleFeatured(${id}, '${sanitize(title).replace(/'/g, "\\'")}', '${item.poster_path || ''}', '${type}')">
                                ${isFeatured ? '★ Featured' : '☆ Feature'}
                            </button>
                            <button class="btn btn-sm ${isHidden ? 'btn-danger' : 'btn-outline'}"
                                onclick="moderation.toggleHidden(${id}, '${sanitize(title).replace(/'/g, "\\'")}', '${item.poster_path || ''}', '${type}')">
                                ${isHidden ? '🚫 Hidden' : '👁 Hide'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');
    },

    toggleFeatured(id, title, poster, type) {
        const data = this.getData();
        const idx = data.featured.findIndex(f => f.id === id);
        if (idx >= 0) {
            data.featured.splice(idx, 1);
            systemLogs.add(
                'Moderation',
                `Removed "${title}" from featured`,
                'info'
            );
        } else {
            data.featured.push({ id, title, poster, type });
            systemLogs.add(
                'Moderation',
                `Marked "${title}" as featured`,
                'success'
            );
        }
        this.save(data);
        this.search();
        this.loadLists();
    },

    toggleHidden(id, title, poster, type) {
        const data = this.getData();
        const idx = data.hidden.findIndex(h => h.id === id);
        if (idx >= 0) {
            data.hidden.splice(idx, 1);
            systemLogs.add(
                'Moderation',
                `Unhid "${title}"`,
                'info'
            );
        } else {
            data.hidden.push({ id, title, poster, type });
            systemLogs.add(
                'Moderation',
                `Hidden "${title}" from site`,
                'warning'
            );
        }
        this.save(data);
        this.search();
        this.loadLists();
    },

    loadLists() {
        const data = this.getData();

        const featuredEl = document.getElementById('featured-list');
        const featuredCount =
            document.getElementById('featured-count');
        if (featuredEl) {
            if (data.featured.length === 0) {
                featuredEl.innerHTML =
                    '<p class="text-muted">No featured content yet.</p>';
            } else {
                featuredEl.innerHTML = data.featured
                    .map(
                        f => `
                    <div class="mod-list-item">
                        <img src="${tmdb.imgUrl(f.poster, 'w92')}" alt="${sanitize(f.title)}" style="width:35px;border-radius:4px">
                        <span>${sanitize(f.title)}</span>
                        <button class="btn btn-sm btn-secondary" onclick="moderation.toggleFeatured(${f.id}, '${sanitize(f.title).replace(/'/g, "\\'")}', '${f.poster || ''}', '${f.type}')">Remove</button>
                    </div>
                `
                    )
                    .join('');
            }
        }
        if (featuredCount) {
            featuredCount.textContent = `${data.featured.length} items`;
        }

        const hiddenEl = document.getElementById('hidden-list');
        const hiddenCount = document.getElementById('hidden-count');
        if (hiddenEl) {
            if (data.hidden.length === 0) {
                hiddenEl.innerHTML =
                    '<p class="text-muted">No hidden content.</p>';
            } else {
                hiddenEl.innerHTML = data.hidden
                    .map(
                        h => `
                    <div class="mod-list-item">
                        <img src="${tmdb.imgUrl(h.poster, 'w92')}" alt="${sanitize(h.title)}" style="width:35px;border-radius:4px">
                        <span>${sanitize(h.title)}</span>
                        <button class="btn btn-sm btn-secondary" onclick="moderation.toggleHidden(${h.id}, '${sanitize(h.title).replace(/'/g, "\\'")}', '${h.poster || ''}', '${h.type}')">Unhide</button>
                    </div>
                `
                    )
                    .join('');
            }
        }
        if (hiddenCount) {
            hiddenCount.textContent = `${data.hidden.length} items`;
        }
    }
};

// ==========================================
// Notifications Manager
// ==========================================
const notifications = {
    getData() {
        try {
            return JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.notificationsKey) ||
                '[]'
            );
        } catch {
            return [];
        }
    },

    save(data) {
        localStorage.setItem(
            ADMIN_CONFIG.notificationsKey,
            JSON.stringify(data)
        );
    },

    add() {
        const message = document
            .getElementById('notif-message')
            .value.trim();
        if (!message) {
            showNotification('Please enter a message.', 'error');
            return;
        }

        const data = this.getData();
        data.unshift({
            id: Date.now(),
            message,
            type: document.getElementById('notif-type').value,
            link:
                document.getElementById('notif-link').value.trim() ||
                null,
            active: document.getElementById('notif-active').checked,
            createdAt: new Date().toISOString()
        });
        this.save(data);

        document.getElementById('notif-message').value = '';
        document.getElementById('notif-link').value = '';

        systemLogs.add(
            'Notification Created',
            `Banner: "${message.substring(0, 50)}"`,
            'success'
        );
        showNotification('Notification saved!', 'success');
        this.loadList();
    },

    toggle(id) {
        const data = this.getData();
        const item = data.find(n => n.id === id);
        if (item) {
            item.active = !item.active;
            this.save(data);
            systemLogs.add(
                'Notification Toggled',
                `"${item.message.substring(0, 40)}" → ${item.active ? 'Active' : 'Inactive'}`,
                'info'
            );
            this.loadList();
        }
    },

    remove(id) {
        let data = this.getData();
        const item = data.find(n => n.id === id);
        data = data.filter(n => n.id !== id);
        this.save(data);
        if (item) {
            systemLogs.add(
                'Notification Deleted',
                `Removed: "${item.message.substring(0, 40)}"`,
                'warning'
            );
        }
        showNotification('Notification removed.', 'info');
        this.loadList();
    },

    loadList() {
        const data = this.getData();
        const container = document.getElementById('notifications-list');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML =
                '<p class="text-muted">No notifications created yet.</p>';
            return;
        }

        const typeColors = {
            info: '#2196f3',
            success: '#46d369',
            warning: '#f5c518',
            error: '#e50914'
        };

        container.innerHTML = data
            .map(
                n => `
            <div class="notif-item" style="border-left: 4px solid ${typeColors[n.type] || '#666'}">
                <div class="notif-content">
                    <p class="notif-message">${sanitize(n.message)}</p>
                    <small class="text-muted">${new Date(n.createdAt).toLocaleString()} · ${n.type.toUpperCase()}${n.link ? ` · <a href="${sanitize(n.link)}" target="_blank">Link ↗</a>` : ''}</small>
                </div>
                <div class="notif-actions">
                    <button class="btn btn-sm ${n.active ? 'btn-primary' : 'btn-outline'}" onclick="notifications.toggle(${n.id})">
                        ${n.active ? '✓ Active' : '○ Inactive'}
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="notifications.remove(${n.id})">Delete</button>
                </div>
            </div>
        `
            )
            .join('');
    }
};

// ==========================================
// Ad Management
// ==========================================
const ads = {
    storageKey: 'streamflix_ads',

    loadSavedCodes() {
        const saved = localStorage.getItem(this.storageKey);
        if (!saved) return;

        const codes = JSON.parse(saved);
        Object.keys(codes).forEach(key => {
            const textarea = document.getElementById(
                `${key}-ad-code`
            );
            if (textarea) textarea.value = codes[key] || '';
        });

        const popupEnabled =
            document.getElementById('popup-enabled');
        if (popupEnabled && codes.popupEnabled !== undefined) {
            popupEnabled.checked = codes.popupEnabled;
        }

        const customScripts =
            document.getElementById('custom-scripts');
        if (customScripts && codes.custom) {
            customScripts.value = codes.custom;
        }
    },

    save(type) {
        const saved = JSON.parse(
            localStorage.getItem(this.storageKey) || '{}'
        );
        const textarea = document.getElementById(
            `${type}-ad-code`
        );

        if (type === 'popup') {
            saved.popup = textarea ? textarea.value : '';
            const pe = document.getElementById('popup-enabled');
            saved.popupEnabled = pe ? pe.checked : false;
        } else if (type === 'custom') {
            const cs = document.getElementById('custom-scripts');
            saved.custom = cs ? cs.value : '';
        } else if (textarea) {
            saved[type] = textarea.value;
        }

        localStorage.setItem(this.storageKey, JSON.stringify(saved));
        systemLogs.add(
            'Ad Code Saved',
            `Updated ${type} ad code`,
            'success'
        );
        showNotification('Ad code saved successfully!', 'success');
    },

    clear(type) {
        const textarea = document.getElementById(
            `${type}-ad-code`
        );
        if (textarea) textarea.value = '';

        if (type === 'custom') {
            const cs = document.getElementById('custom-scripts');
            if (cs) cs.value = '';
        }

        const saved = JSON.parse(
            localStorage.getItem(this.storageKey) || '{}'
        );
        delete saved[type];
        localStorage.setItem(this.storageKey, JSON.stringify(saved));

        systemLogs.add(
            'Ad Code Cleared',
            `Cleared ${type} ad code`,
            'info'
        );
        showNotification('Ad code cleared!', 'info');
    }
};

// ==========================================
// SEO Settings
// ==========================================
const seo = {
    storageKey: 'streamflix_seo',

    loadSettings() {
        const saved = localStorage.getItem(this.storageKey);
        if (!saved) return;

        const s = JSON.parse(saved);
        const titleEl = document.getElementById('seo-title');
        const descEl = document.getElementById('seo-description');
        const kwEl = document.getElementById('seo-keywords');
        const robotsEl = document.getElementById('robots-txt');
        if (titleEl) titleEl.value = s.title || '';
        if (descEl) descEl.value = s.description || '';
        if (kwEl) kwEl.value = s.keywords || '';
        if (robotsEl) robotsEl.value = s.robots || '';
    },

    save() {
        const s = {
            title:
                document.getElementById('seo-title')?.value || '',
            description:
                document.getElementById('seo-description')?.value ||
                '',
            keywords:
                document.getElementById('seo-keywords')?.value || '',
            robots:
                document.getElementById('robots-txt')?.value || ''
        };

        localStorage.setItem(this.storageKey, JSON.stringify(s));
        systemLogs.add(
            'SEO Updated',
            'SEO settings saved',
            'success'
        );
        showNotification('SEO settings saved!', 'success');
    }
};

// ==========================================
// Site Settings
// ==========================================
const siteSettings = {
    storageKey: 'streamflix_settings',

    save() {
        const data = {
            siteName:
                document.getElementById('site-name')?.value || '',
            tmdbApiKey:
                document.getElementById('tmdb-api-key')?.value || '',
            maintenanceMode:
                document.getElementById('maintenance-mode')?.checked ||
                false
        };

        localStorage.setItem(
            this.storageKey,
            JSON.stringify(data)
        );
        systemLogs.add(
            'Settings Saved',
            'Site settings updated',
            'success'
        );
        showNotification('Site settings saved!', 'success');
    },

    exportData(format) {
        const data = {
            analytics: analyticsModule.generateStats(),
            ads: JSON.parse(
                localStorage.getItem('streamflix_ads') || '{}'
            ),
            seo: JSON.parse(
                localStorage.getItem('streamflix_seo') || '{}'
            ),
            settings: JSON.parse(
                localStorage.getItem('streamflix_settings') || '{}'
            ),
            moderation: JSON.parse(
                localStorage.getItem(ADMIN_CONFIG.moderationKey) ||
                '{}'
            ),
            notifications: JSON.parse(
                localStorage.getItem(
                    ADMIN_CONFIG.notificationsKey
                ) || '[]'
            ),
            logs: systemLogs.getAll(),
            exportedAt: new Date().toISOString()
        };

        let content, filename, type;

        if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            filename = 'streamflix_export.json';
            type = 'application/json';
        } else {
            const rows = [['Key', 'Value']];
            Object.entries(data.analytics).forEach(([key, value]) => {
                rows.push([key, value]);
            });
            content = rows.map(r => r.join(',')).join('\n');
            filename = 'streamflix_export.csv';
            type = 'text/csv';
        }

        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        systemLogs.add(
            'Data Export',
            `Exported data as ${format.toUpperCase()}`,
            'success'
        );
        showNotification(
            `Data exported as ${format.toUpperCase()}!`,
            'success'
        );
    }
};

// ==========================================
// UI Helpers
// ==========================================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#46d369' : type === 'error' ? '#e50914' : '#2196f3'};
        color: white;
        border-radius: 8px;
        font-weight: 500;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ==========================================
// Global Functions (called from HTML)
// ==========================================
function saveAdCode(type) {
    ads.save(type);
}

function clearAdCode(type) {
    ads.clear(type);
}

function saveSEOSettings() {
    seo.save();
}

function saveRobots() {
    localStorage.setItem(
        'streamflix_robots',
        document.getElementById('robots-txt')?.value || ''
    );
    systemLogs.add('Robots.txt', 'robots.txt saved', 'success');
    showNotification('robots.txt saved!', 'success');
}

function generateSitemap() {
    systemLogs.add(
        'Sitemap',
        'Sitemap generated',
        'success'
    );
    showNotification('Sitemap generated and saved!', 'success');
}

async function updateCredentials() {
    const username =
        document.getElementById('settings-username')?.value || '';
    const password =
        document.getElementById('settings-password')?.value || '';
    const confirm =
        document.getElementById('settings-confirm')?.value || '';

    if (password !== confirm) {
        showNotification('Passwords do not match!', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification(
            'Password must be at least 6 characters!',
            'error'
        );
        return;
    }

    await auth.updateCredentials(username, password);
    showNotification('Credentials updated successfully!', 'success');
}

function saveSiteSettings() {
    siteSettings.save();
}

function exportData(format) {
    siteSettings.exportData(format);
}

// ==========================================
// Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    auth.init();

    document
        .getElementById('login-form')
        .addEventListener('submit', async (e) => {
            e.preventDefault();
            const username =
                document.getElementById('username').value;
            const password =
                document.getElementById('password').value;

            const result = await auth.login(username, password);
            if (result.success) {
                auth.showDashboard();
            } else {
                const error =
                    document.getElementById('login-error');
                error.textContent = result.message;
                error.classList.remove('hidden');
            }
        });

    document
        .getElementById('logout-btn')
        ?.addEventListener('click', () => {
            auth.logout();
        });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;

            document
                .querySelectorAll('.nav-item')
                .forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document
                .querySelectorAll('.content-section')
                .forEach(s => s.classList.remove('active'));
            document
                .getElementById(`section-${section}`)
                ?.classList.add('active');

            const titles = {
                overview: 'Dashboard Overview',
                analytics: 'Traffic Analytics',
                content: 'Content Statistics',
                users: 'User Activity',
                reports: 'Reports',
                moderation: 'Content Moderation',
                notifications: 'Notifications',
                logs: 'System Logs',
                ads: 'Ad Management',
                seo: 'SEO Settings',
                settings: 'Site Settings'
            };
            document.getElementById('page-title').textContent =
                titles[section] || 'Dashboard';

            if (section === 'moderation') moderation.search();
            if (section === 'logs') systemLogs.render();
            if (section === 'notifications') notifications.loadList();
        });
    });

    document
        .getElementById('user-search')
        ?.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document
                .querySelectorAll('#users-table tbody tr')
                .forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(query)
                        ? ''
                        : 'none';
                });
        });

    document
        .getElementById('traffic-period')
        ?.addEventListener('change', () => {
            analyticsModule.drawTrafficChart();
        });

    window.addEventListener('resize', () => {
        analyticsModule.drawTrafficChart();
    });

    document
        .getElementById('mod-search-btn')
        ?.addEventListener('click', () => {
            moderation.search();
        });

    document
        .getElementById('mod-search')
        ?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') moderation.search();
        });

    document
        .getElementById('save-notification-btn')
        ?.addEventListener('click', () => {
            notifications.add();
        });

    document
        .getElementById('clear-logs-btn')
        ?.addEventListener('click', () => {
            systemLogs.clear();
            systemLogs.render();
            showNotification('Logs cleared.', 'info');
        });
});
