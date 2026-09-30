document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('local-diagnostics');
    const readHistory = () => { try { return JSON.parse(localStorage.getItem('streamflix_continue_watching') || '[]').length; } catch { return 0; } };
    for (const [name,value] of [['Saved titles on this device',window.Watchlist.read().length],['Recently opened titles',readHistory()],['Optional analytics',localStorage.getItem('analytics_consent') === 'true' ? 'Enabled' : 'Disabled'],['Service worker supported','serviceWorker' in navigator ? 'Yes' : 'No']]) {
        const label=document.createElement('dt'), detail=document.createElement('dd');
        label.textContent=name; detail.textContent=String(value); target.append(label,detail);
    }
});
