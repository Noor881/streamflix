import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';

const supabaseUrl = 'https://jblfhbnpruhnxbaxzdzl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibGZoYm5wcnVobnhiYXh6ZHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTc1MTIsImV4cCI6MjA4NjE5MzUxMn0.7jSDxbNIGERCBJf7MT7JzYCnmTMqXreap19aOdiEZ5A';
const supabase = createClient(supabaseUrl, supabaseKey);

async function initVisitorCounter() {
    const liveEl = document.getElementById('live-visitors');
    const totalEl = document.getElementById('total-visitors');

    // Prevent double counting if SPA re-renders
    if (window._visitorCountInProgress) return;
    window._visitorCountInProgress = true;

    // Increment and fetch total
    try {
        await supabase.rpc('increment_streamflix_visitor');
        const { data, error } = await supabase
            .from('streamflix_visitors')
            .select('total')
            .eq('id', 1)
            .single();
        if (data && totalEl) {
            totalEl.textContent = data.total.toLocaleString();
        }
    } catch (err) {
        console.error('Visitor tracking error:', err);
    }

    // Real-time current visitors using Presence
    const channel = supabase.channel('streamflix_global_presence', {
        config: {
            presence: {
                key: 'user_' + Math.random().toString(36).substring(2, 9),
            },
        },
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            let count = 0;
            for (let key in newState) {
                count += newState[key].length;
            }
            if (liveEl) {
                // Ensure at least 1 (the current user) is shown
                liveEl.textContent = Math.max(1, count).toLocaleString();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    online_at: new Date().toISOString(),
                });
            }
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisitorCounter);
} else {
    initVisitorCounter();
}
