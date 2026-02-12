// Simple client-side search (filtering). For scale, replace with Fuse.js or server search.
(function(){
  // Fuse.js based client-side search; fallback to simple filter if Fuse not loaded
  let fuse = null;
  let items = [];
  async function init(){
    try{
      const resp = await fetch('/data/movies.sample.json');
      items = await resp.json();
    }catch(e){ items = []; }
    if (window.Fuse){
      fuse = new Fuse(items, {keys:['title','overview'], threshold:0.35});
    }
  }

  window.Search = {
    async initData(data){ items = data || items; if (window.Fuse) fuse = new Fuse(items, {keys:['title','overview'], threshold:0.35}); },
    search(q){
      q = (q||'').trim();
      if (!q) return items.slice(0,50);
      if (fuse) return fuse.search(q).map(r=>r.item).slice(0,50);
      return items.filter(it=> (it.title && it.title.toLowerCase().includes(q.toLowerCase())) || (it.overview && it.overview.toLowerCase().includes(q.toLowerCase())) ).slice(0,50);
    }
  };

  document.addEventListener('DOMContentLoaded', init);

  // UI hook
  document.addEventListener('input', (e)=>{
    const inp = e.target.closest('[data-search-input]');
    if (!inp) return;
    const q = inp.value;
    const resultsEl = document.querySelector(inp.getAttribute('data-search-results'));
    if (!resultsEl) return;
    const results = window.Search.search(q);
    resultsEl.innerHTML = results.map(r=>`<div class="search-item">${r.title||'Untitled'}</div>`).join('');
  });

})();
