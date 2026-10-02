/* Shared, accessible title suggestions. Search terms stay out of persistent storage. */
(function(root) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const titleOf = item => item.media_type === 'tv' ? item.name : item.title;
    const titleURL = item => '/' + item.media_type + '/' + item.id + '-' + (root.SiteSEO?.slug(titleOf(item)) || String(titleOf(item)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'title');
    function validResults(data) {
        const seen = new Set();
        return (Array.isArray(data?.results) ? data.results : []).filter(item => {
            if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || !['movie','tv'].includes(item.media_type) || item.adult === true || typeof titleOf(item) !== 'string' || !titleOf(item).trim()) return false;
            const identity = item.media_type + ':' + item.id;
            if (seen.has(identity)) return false;
            seen.add(identity); return true;
        }).slice(0,8);
    }
    function resultMarkup(items) {
        return items.map((item,index) => {
            const title = titleOf(item), year = String(item.release_date || item.first_air_date || '').match(/^\d{4}/)?.[0] || '';
            const poster = typeof item.poster_path === 'string' && /^\/[\w./-]+$/.test(item.poster_path) ? `<img src="https://image.tmdb.org/t/p/w92${escape(item.poster_path)}" width="38" height="57" alt="" loading="lazy">` : '<span class="search-suggestion-placeholder" aria-hidden="true">▶</span>';
            return `<a id="search-option-${index}" class="search-suggestion" role="option" aria-selected="false" tabindex="-1" href="${escape(titleURL(item))}" data-search-option="${index}">${poster}<span class="search-suggestion-info"><span class="search-suggestion-title">${escape(title)}</span><span class="search-suggestion-meta">${item.media_type === 'tv' ? 'TV series' : 'Movie'}${year ? ' · ' + year : ''}</span></span><span class="search-suggestion-arrow" aria-hidden="true">↗</span></a>`;
        }).join('');
    }
    async function lookup(query, signal) {
        const url = '/api/search-suggestions?q=' + encodeURIComponent(query.trim().slice(0,100));
        const response = await root.fetch(url, {signal, credentials:'same-origin'});
        if (!response.ok) throw new Error('Search suggestions are temporarily unavailable');
        return response.json();
    }
    function init(options = {}) {
        const document = root.document, input = document?.getElementById('search-input'), wrap = document?.getElementById('search-container');
        if (!input || !wrap || input.dataset.suggestionsReady) return;
        input.dataset.suggestionsReady = 'true';
        const button = document.getElementById('search-btn'), closeButton = document.getElementById('search-close-btn');
        const panel = document.createElement('div');
        panel.id = 'search-suggestions'; panel.className = 'search-suggestions'; panel.hidden = true;
        panel.innerHTML = '<p class="search-suggestions-status" role="status" aria-live="polite"></p><div class="search-suggestions-list" id="search-options" role="listbox" aria-label="Suggested movies and TV shows"></div><a class="search-suggestions-all" href="/search">View all results</a>';
        wrap.appendChild(panel);
        const status = panel.querySelector('.search-suggestions-status'), list = panel.querySelector('.search-suggestions-list'), all = panel.querySelector('.search-suggestions-all');
        input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list'); input.setAttribute('aria-controls','search-options'); input.setAttribute('aria-expanded','false'); input.setAttribute('aria-haspopup','listbox');
        input.setAttribute('maxlength','100'); input.setAttribute('spellcheck','false');
        let debounce, deadline, controller, generation = 0, active = -1, composing = false, items = [], correction = '', compact = root.matchMedia('(max-width: 900px)').matches;
        const cache = new Map();
        const navigate = options.navigate || (target => root.location.assign(target));
        const isCompact = () => root.matchMedia('(max-width: 900px)').matches;
        const cancel = () => { generation++; root.clearTimeout(debounce); root.clearTimeout(deadline); controller?.abort(); input.setAttribute('aria-busy','false'); };
        const hide = () => { cancel(); panel.hidden = true; active = -1; input.removeAttribute('aria-activedescendant'); input.setAttribute('aria-expanded','false'); };
        const fitViewport = () => {
            const height=root.visualViewport?.height || root.innerHeight;
            if(height)panel.style.maxHeight=Math.max(120,Math.min(640,height-wrap.getBoundingClientRect().bottom-26))+'px';
        };
        const show = () => { panel.hidden = false; fitViewport(); input.setAttribute('aria-expanded','true'); };
        const setOpen = open => {
            wrap.classList.toggle('search-open',open); button?.setAttribute('aria-expanded',String(open)); button?.setAttribute('aria-label',open?'Submit search':'Open search');
            if(open) input.focus(); else { hide(); input.blur(); }
        };
        const submit = query => { const value=(query || input.value).trim(); if (!value) {input.focus();return;} hide(); if(isCompact())setOpen(false);navigate('/search?q='+encodeURIComponent(value)); };
        const setActive = index => {
            const rows = [...list.querySelectorAll('[data-search-option]')];
            active = rows.length ? Math.max(0,Math.min(index,rows.length-1)) : -1;
            rows.forEach((row,i) => row.setAttribute('aria-selected',String(i===active)));
            if(active>=0) { input.setAttribute('aria-activedescendant',rows[active].id);rows[active].scrollIntoView({block:'nearest'}); } else input.removeAttribute('aria-activedescendant');
        };
        const render = data => {
            items=validResults(data); correction=typeof data.correctedQuery==='string' ? data.correctedQuery : '';
            active=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-busy','false');
            status.textContent = correction && items.length ? 'Showing matches for “'+correction+'”' : items.length ? 'Suggested titles' : 'No matching titles. Try a different title or spelling.';
            list.innerHTML=resultMarkup(items);all.textContent='View all results for “'+(correction || input.value.trim())+'”';all.href='/search?q='+encodeURIComponent(correction || input.value.trim());show();
        };
        const schedule = () => {
            cancel(); if(composing)return;
            const query=input.value.trim().slice(0,100);correction='';items=[];active=-1;list.innerHTML='';input.removeAttribute('aria-activedescendant');
            if(query.length<2){hide();return;}
            const version=generation;
            debounce=root.setTimeout(async()=>{
                if(version!==generation)return;
                status.textContent='Searching titles…';all.href='/search?q='+encodeURIComponent(query);all.textContent='Search all titles';input.setAttribute('aria-busy','true');show();
                const cached=cache.get(query.toLowerCase());
                if(cached && Date.now()-cached.time<60000){render(cached.data);return;}
                controller=typeof root.AbortController==='function'?new root.AbortController():null;
                deadline=root.setTimeout(()=>controller?.abort(),26000);
                try {
                    const data=await (options.lookup || lookup)(query,controller?.signal);
                    if(version!==generation)return;
                    cache.set(query.toLowerCase(),{data,time:Date.now()});while(cache.size>20)cache.delete(cache.keys().next().value);render(data);
                } catch {
                    if(version!==generation)return;
                    input.setAttribute('aria-busy','false');status.textContent='Suggestions are unavailable. Press Enter to search, or try again.';list.innerHTML='';show();
                } finally { if(version===generation)root.clearTimeout(deadline); }
            },250);
        };
        input.addEventListener('input',schedule);
        input.addEventListener('focus',()=>{if(input.value.trim().length>=2)schedule();});
        input.addEventListener('compositionstart',()=>{composing=true;hide();});
        input.addEventListener('compositionend',()=>{composing=false;schedule();});
        input.addEventListener('keydown',event=>{
            if(composing || event.isComposing)return;
            if(event.key==='ArrowDown' || event.key==='ArrowUp'){
                if(!panel.hidden && items.length){event.preventDefault();setActive(active<0 ? (event.key==='ArrowDown'?0:items.length-1) : active+(event.key==='ArrowDown'?1:-1));}
                else if(panel.hidden && input.value.trim().length>=2)schedule();
            }else if(event.key==='Enter'){
                event.preventDefault();if(active>=0 && items[active]){const target=titleURL(items[active]);hide();if(isCompact())setOpen(false);navigate(target);}else submit();
            }else if(event.key==='Escape'){
                event.preventDefault();if(!panel.hidden)hide();else if(isCompact()){setOpen(false);button?.focus();}
            }
        });
        button?.addEventListener('click',event=>{event.preventDefault();if(isCompact() && !wrap.classList.contains('search-open')){setOpen(true);return;}submit();});
        closeButton?.addEventListener('click',()=>{setOpen(false);button?.focus();});
        wrap.addEventListener('submit',event=>{event.preventDefault();submit();});
        panel.addEventListener('click',event=>{const link=event.target.closest('a');if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;event.preventDefault();const target=link.getAttribute('href');hide();if(isCompact())setOpen(false);navigate(target);});
        document.addEventListener('pointerdown',event=>{if(!wrap.contains(event.target))hide();});
        wrap.addEventListener('focusout',()=>{root.setTimeout(()=>{if(!wrap.contains(document.activeElement))hide();},0);});
        root.addEventListener('resize',()=>{const next=isCompact();if(next!==compact){hide();wrap.classList.remove('search-open');button?.setAttribute('aria-expanded','false');compact=next;}},{passive:true});
        root.visualViewport?.addEventListener('resize',fitViewport,{passive:true});
        return {hide,schedule,setOpen};
    }
    const api={init,lookup,validResults,resultMarkup,titleURL};
    if(typeof module==='object' && module.exports)module.exports=api;else root.SearchUI=api;
})(typeof window==='object'?window:globalThis);
