// Simple client-side recommendations: popularity + local collaborative signals
(function(){
  const VIEW_KEY = 'sf_views_v1';
  function read(){ try{ return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); }catch(e){return {}} }
  function write(obj){ localStorage.setItem(VIEW_KEY, JSON.stringify(obj)); }

  window.Recommend = {
    // record a view (call when user opens/plays an item)
    recordView(id){ const o = read(); o[id] = (o[id]||0) + 1; write(o); },
    // top N popular by local counts
    top(n=10){ const o = read(); return Object.keys(o).sort((a,b)=>o[b]-o[a]).slice(0,n); }
  };

})();
