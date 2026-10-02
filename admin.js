document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('local-diagnostics');
    const readHistory = () => { try { const history = JSON.parse(localStorage.getItem('streamflix_continue_watching') || '[]'); return Array.isArray(history) ? history.length : 0; } catch { return 0; } };
    const readAnalytics = () => { try { return localStorage.getItem('analytics_consent') === 'true' ? 'Enabled' : 'Disabled'; } catch { return 'Storage unavailable'; } };
    for (const [name,value] of [['Saved titles on this device',window.Watchlist.read().length],['Recently opened titles',readHistory()],['Optional analytics',readAnalytics()],['Service worker supported','serviceWorker' in navigator ? 'Yes' : 'No']]) {
        const label=document.createElement('dt'), detail=document.createElement('dd');
        label.textContent=name; detail.textContent=String(value); target.append(label,detail);
    }
});
