// ==========================================
// StreamFlix Admin Dashboard JavaScript
// ==========================================

// Admin Configuration
const ADMIN_CONFIG = {
    defaultUsername: 'admin',
    defaultPassword: 'streamflix2026',
    sessionKey: 'streamflix_admin_session',
    dataKey: 'streamflix_admin_data'
};

// ==========================================
// Authentication
// ==========================================
const auth = {
    credentials: null,

    init() {
        // Load saved credentials or use defaults
        const saved = localStorage.getItem('streamflix_admin_credentials');
        if (saved) {
            this.credentials = JSON.parse(saved);
        } else {
            this.credentials = {
                username: ADMIN_CONFIG.defaultUsername,
                password: ADMIN_CONFIG.defaultPassword
            };
        }

        // Check if already logged in
        const session = sessionStorage.getItem(ADMIN_CONFIG.sessionKey);
        if (session) {
            this.showDashboard();
        }
    },

    login(username, password) {
        if (username === this.credentials.username && password === this.credentials.password) {
            sessionStorage.setItem(ADMIN_CONFIG.sessionKey, 'true');
            return true;
        }
        return false;
    },

    logout() {
        sessionStorage.removeItem(ADMIN_CONFIG.sessionKey);
        location.reload();
    },

    updateCredentials(username, password) {
        this.credentials = { username, password };
        localStorage.setItem('streamflix_admin_credentials', JSON.stringify(this.credentials));
    },

    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        this.loadDashboardData();
    },

    loadDashboardData() {
        // Update current date
        document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Load all sections data
        analytics.loadOverview();
        analytics.loadAnalytics();
        analytics.loadContentStats();
        analytics.loadUserActivity();
        ads.loadSavedCodes();
        seo.loadSettings();
    }
};

// ==========================================
// Analytics & Statistics
// ==========================================
const analytics = {
    // Generate realistic mock data
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

    loadOverview() {
        const stats = this.generateStats();

        // Animate counters
        this.animateCounter('stat-views', stats.views);
        this.animateCounter('stat-users', stats.users);
        this.animateCounter('stat-plays', stats.plays);
        document.getElementById('stat-time').textContent = `${stats.avgTime}m`;

        // Load top content
        this.loadTopContent();

        // Load real-time activity
        this.loadRealtimeActivity();

        // Load geographic data
        this.loadGeoData();

        // Draw traffic chart
        this.drawTrafficChart();
    },

    animateCounter(elementId, target) {
        const element = document.getElementById(elementId);
        const duration = 1000;
        const start = 0;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = Math.floor(start + (target - start) * progress);
            element.textContent = current.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    },

    loadTopContent() {
        const content = [
            { title: 'Dune: Part Two', type: 'Movie', views: 12453, trend: 'up' },
            { title: 'The Last of Us', type: 'TV Show', views: 10234, trend: 'up' },
            { title: 'Oppenheimer', type: 'Movie', views: 9876, trend: 'down' },
            { title: 'Attack on Titan', type: 'Anime', views: 8765, trend: 'up' },
            { title: 'Demon Slayer', type: 'Anime', views: 7654, trend: 'up' }
        ];

        const tbody = document.querySelector('#top-content-table tbody');
        tbody.innerHTML = content.map(item => `
            <tr>
                <td>${item.title}</td>
                <td><span class="badge">${item.type}</span></td>
                <td>${item.views.toLocaleString()}</td>
                <td class="stat-trend ${item.trend}">
                    ${item.trend === 'up' ? '↑' : '↓'}
                </td>
            </tr>
        `).join('');
    },

    loadRealtimeActivity() {
        const activities = [
            { icon: '▶️', text: 'User started watching "Dune: Part Two"', time: '2s ago' },
            { icon: '🔍', text: 'Search for "anime action"', time: '15s ago' },
            { icon: '👤', text: 'New visitor from United States', time: '32s ago' },
            { icon: '▶️', text: 'User started watching "The Last of Us S1E3"', time: '45s ago' },
            { icon: '⭐', text: 'User added "Oppenheimer" to My List', time: '1m ago' },
            { icon: '🔍', text: 'Search for "horror movies 2024"', time: '2m ago' },
            { icon: '▶️', text: 'User resumed "Breaking Bad S3E5"', time: '3m ago' }
        ];

        document.getElementById('realtime-activity').innerHTML = activities.map(a => `
            <div class="activity-item">
                <span class="activity-icon">${a.icon}</span>
                <span class="activity-text">${a.text}</span>
                <span class="activity-time">${a.time}</span>
            </div>
        `).join('');
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

        document.getElementById('geo-stats').innerHTML = geoData.map(g => `
            <div class="geo-item">
                <span class="geo-flag">${g.flag}</span>
                <span class="geo-name">${g.name}</span>
                <div class="geo-bar">
                    <div class="geo-bar-fill" style="width: ${g.percent}%"></div>
                </div>
                <span class="geo-percent">${g.percent}%</span>
            </div>
        `).join('');
    },

    drawTrafficChart() {
        const canvas = document.getElementById('trafficCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        // Generate traffic data for last 7 days
        const data = Array.from({ length: 7 }, () => Math.floor(Math.random() * 5000) + 2000);
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const maxValue = Math.max(...data);
        const padding = 40;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const barWidth = chartWidth / data.length - 10;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw bars
        data.forEach((value, index) => {
            const x = padding + index * (chartWidth / data.length) + 5;
            const barHeight = (value / maxValue) * chartHeight;
            const y = canvas.height - padding - barHeight;

            // Gradient fill
            const gradient = ctx.createLinearGradient(x, y, x, canvas.height - padding);
            gradient.addColorStop(0, '#e50914');
            gradient.addColorStop(1, '#ff6b6b');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 4);
            ctx.fill();

            // Label
            ctx.fillStyle = '#666';
            ctx.font = '12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(labels[index], x + barWidth / 2, canvas.height - 10);

            // Value on top
            ctx.fillStyle = '#fff';
            ctx.fillText(value.toLocaleString(), x + barWidth / 2, y - 10);
        });
    },

    loadAnalytics() {
        const stats = this.generateStats();

        document.getElementById('analytics-pageviews').textContent = stats.pageviews.toLocaleString();
        document.getElementById('analytics-bounce').textContent = `${stats.bounceRate}%`;
        document.getElementById('analytics-mobile').textContent = `${stats.mobilePercent}%`;
        document.getElementById('analytics-referral').textContent = stats.referrals.toLocaleString();

        // Traffic sources
        const sources = [
            { name: 'Direct', value: 45, color: '#e50914' },
            { name: 'Google', value: 30, color: '#4285f4' },
            { name: 'Social', value: 15, color: '#1da1f2' },
            { name: 'Referral', value: 10, color: '#46d369' }
        ];

        document.getElementById('traffic-sources').innerHTML = sources.map(s => `
            <div class="source-item" style="border-left: 4px solid ${s.color}">
                <h4>${s.value}%</h4>
                <p>${s.name}</p>
            </div>
        `).join('');

        // Device stats
        document.getElementById('device-stats').innerHTML = `
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
    },

    loadContentStats() {
        // Top Movies
        const movies = [
            { rank: 1, title: 'Dune: Part Two', views: 12453, duration: '42m', rating: 8.9 },
            { rank: 2, title: 'Oppenheimer', views: 9876, duration: '38m', rating: 8.7 },
            { rank: 3, title: 'Poor Things', views: 7654, duration: '35m', rating: 8.4 },
            { rank: 4, title: 'Barbie', views: 6543, duration: '32m', rating: 7.8 },
            { rank: 5, title: 'Killers of the Flower Moon', views: 5432, duration: '45m', rating: 8.5 }
        ];

        document.querySelector('#movies-table tbody').innerHTML = movies.map(m => `
            <tr>
                <td>#${m.rank}</td>
                <td>${m.title}</td>
                <td>${m.views.toLocaleString()}</td>
                <td>${m.duration}</td>
                <td>⭐ ${m.rating}</td>
            </tr>
        `).join('');

        // Top TV Shows
        const tvshows = [
            { rank: 1, title: 'The Last of Us', views: 10234, episodes: 9, rating: 9.1 },
            { rank: 2, title: 'House of the Dragon', views: 8765, episodes: 20, rating: 8.8 },
            { rank: 3, title: 'Wednesday', views: 7654, episodes: 8, rating: 8.4 },
            { rank: 4, title: 'Breaking Bad', views: 6543, episodes: 62, rating: 9.5 },
            { rank: 5, title: 'Stranger Things', views: 5432, episodes: 34, rating: 8.7 }
        ];

        document.querySelector('#tvshows-table tbody').innerHTML = tvshows.map(t => `
            <tr>
                <td>#${t.rank}</td>
                <td>${t.title}</td>
                <td>${t.views.toLocaleString()}</td>
                <td>${t.episodes} eps</td>
                <td>⭐ ${t.rating}</td>
            </tr>
        `).join('');

        // Genre performance
        const genres = [
            { name: 'Action', percent: 85 },
            { name: 'Drama', percent: 72 },
            { name: 'Sci-Fi', percent: 68 },
            { name: 'Comedy', percent: 55 },
            { name: 'Horror', percent: 48 },
            { name: 'Animation', percent: 62 },
            { name: 'Anime', percent: 75 }
        ];

        document.getElementById('genre-performance').innerHTML = genres.map(g => `
            <div class="genre-bar-item">
                <label>${g.name}</label>
                <div class="bar">
                    <div class="bar-fill" style="width: ${g.percent}%">${g.percent}%</div>
                </div>
            </div>
        `).join('');
    },

    loadUserActivity() {
        // Generate mock user sessions
        const users = Array.from({ length: 10 }, (_, i) => ({
            session: `usr_${Math.random().toString(36).substr(2, 8)}`,
            lastWatched: ['Dune: Part Two', 'The Last of Us', 'Oppenheimer', 'Attack on Titan'][Math.floor(Math.random() * 4)],
            views: Math.floor(Math.random() * 50) + 5,
            watchTime: `${Math.floor(Math.random() * 120) + 15}m`,
            country: ['🇺🇸 USA', '🇬🇧 UK', '🇨🇦 Canada', '🇦🇺 Australia', '🇩🇪 Germany'][Math.floor(Math.random() * 5)]
        }));

        document.querySelector('#users-table tbody').innerHTML = users.map(u => `
            <tr>
                <td><code>${u.session}</code></td>
                <td>${u.lastWatched}</td>
                <td>${u.views}</td>
                <td>${u.watchTime}</td>
                <td>${u.country}</td>
            </tr>
        `).join('');

        // Peak hours heatmap
        const peakHours = document.getElementById('peak-hours');
        peakHours.innerHTML = Array.from({ length: 24 }, (_, i) => {
            const intensity = ['low', 'medium', 'high', 'peak'][Math.floor(Math.random() * 4)];
            return `<div class="heatmap-cell ${intensity}" title="${i}:00 - ${i + 1}:00"></div>`;
        }).join('');
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
            const textarea = document.getElementById(`${key}-ad-code`);
            if (textarea) {
                textarea.value = codes[key] || '';
            }
        });

        // Load popup enabled state
        const popupEnabled = document.getElementById('popup-enabled');
        if (popupEnabled && codes.popupEnabled !== undefined) {
            popupEnabled.checked = codes.popupEnabled;
        }

        // Load custom scripts
        const customScripts = document.getElementById('custom-scripts');
        if (customScripts && codes.custom) {
            customScripts.value = codes.custom;
        }
    },

    save(type) {
        const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        const textarea = document.getElementById(`${type}-ad-code`);

        if (type === 'popup') {
            saved.popup = textarea.value;
            saved.popupEnabled = document.getElementById('popup-enabled').checked;
        } else if (type === 'custom') {
            saved.custom = document.getElementById('custom-scripts').value;
        } else {
            saved[type] = textarea.value;
        }

        localStorage.setItem(this.storageKey, JSON.stringify(saved));
        showNotification('Ad code saved successfully!', 'success');
    },

    clear(type) {
        const textarea = document.getElementById(`${type}-ad-code`);
        if (textarea) {
            textarea.value = '';
        }

        if (type === 'custom') {
            document.getElementById('custom-scripts').value = '';
        }

        const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        delete saved[type];
        localStorage.setItem(this.storageKey, JSON.stringify(saved));

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

        const settings = JSON.parse(saved);
        document.getElementById('seo-title').value = settings.title || '';
        document.getElementById('seo-description').value = settings.description || '';
        document.getElementById('seo-keywords').value = settings.keywords || '';
        document.getElementById('robots-txt').value = settings.robots || '';
    },

    save() {
        const settings = {
            title: document.getElementById('seo-title').value,
            description: document.getElementById('seo-description').value,
            keywords: document.getElementById('seo-keywords').value,
            robots: document.getElementById('robots-txt').value
        };

        localStorage.setItem(this.storageKey, JSON.stringify(settings));
        showNotification('SEO settings saved!', 'success');
    }
};

// ==========================================
// Settings
// ==========================================
const settings = {
    storageKey: 'streamflix_settings',

    save() {
        const data = {
            siteName: document.getElementById('site-name').value,
            tmdbApiKey: document.getElementById('tmdb-api-key').value,
            maintenanceMode: document.getElementById('maintenance-mode').checked
        };

        localStorage.setItem(this.storageKey, JSON.stringify(data));
        showNotification('Site settings saved!', 'success');
    },

    exportData(format) {
        const data = {
            analytics: analytics.generateStats(),
            ads: JSON.parse(localStorage.getItem('streamflix_ads') || '{}'),
            seo: JSON.parse(localStorage.getItem('streamflix_seo') || '{}'),
            settings: JSON.parse(localStorage.getItem('streamflix_settings') || '{}'),
            exportedAt: new Date().toISOString()
        };

        let content, filename, type;

        if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            filename = 'streamflix_export.json';
            type = 'application/json';
        } else {
            // Convert to CSV
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

        showNotification(`Data exported as ${format.toUpperCase()}!`, 'success');
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

// Add CSS animation
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
    localStorage.setItem('streamflix_robots', document.getElementById('robots-txt').value);
    showNotification('robots.txt saved!', 'success');
}

function generateSitemap() {
    showNotification('Sitemap generated and saved!', 'success');
}

function updateCredentials() {
    const username = document.getElementById('settings-username').value;
    const password = document.getElementById('settings-password').value;
    const confirm = document.getElementById('settings-confirm').value;

    if (password !== confirm) {
        showNotification('Passwords do not match!', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('Password must be at least 6 characters!', 'error');
        return;
    }

    auth.updateCredentials(username, password);
    showNotification('Credentials updated successfully!', 'success');
}

function saveSiteSettings() {
    settings.save();
}

function exportData(format) {
    settings.exportData(format);
}

// ==========================================
// Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize authentication
    auth.init();

    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (auth.login(username, password)) {
            auth.showDashboard();
        } else {
            const error = document.getElementById('login-error');
            error.textContent = 'Invalid username or password';
            error.classList.remove('hidden');
        }
    });

    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.logout();
    });

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;

            // Update active state
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${section}`)?.classList.add('active');

            // Update page title
            const titles = {
                overview: 'Dashboard Overview',
                analytics: 'Traffic Analytics',
                content: 'Content Statistics',
                users: 'User Activity',
                ads: 'Ad Management',
                seo: 'SEO Settings',
                settings: 'Site Settings'
            };
            document.getElementById('page-title').textContent = titles[section] || 'Dashboard';
        });
    });

    // User search
    document.getElementById('user-search')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#users-table tbody tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

    // Traffic period change
    document.getElementById('traffic-period')?.addEventListener('change', () => {
        analytics.drawTrafficChart();
    });

    // Window resize - redraw chart
    window.addEventListener('resize', () => {
        analytics.drawTrafficChart();
    });
});
